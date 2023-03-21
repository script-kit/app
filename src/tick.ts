/* eslint-disable import/prefer-default-export */
import { clipboard, NativeImage } from 'electron';
import clipboardEventListener from '@crosscopy/clipboard';
import { Observable, Subscription } from 'rxjs';
import {
  debounceTime,
  delay,
  distinctUntilChanged,
  filter,
  map,
  share,
  switchMap,
} from 'rxjs/operators';
import log from 'electron-log';
import { subscribeKey } from 'valtio/utils';
import { format } from 'date-fns';
import { writeFile } from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import {
  UiohookKeyboardEvent,
  UiohookKey,
  UiohookMouseEvent,
  uIOhook,
} from 'uiohook-napi';
import { tmpClipboardDir } from '@johnlindquist/kit/cjs/utils';
import { Choice, Script } from '@johnlindquist/kit/types/core';
import { remove } from 'lodash';

import { emitter, KitEvent } from './events';
import {
  appDb,
  checkAccessibility,
  kitConfig,
  kitState,
  subs,
  updateAppDb,
} from './state';
import { isFocused } from './prompt';
import { deleteText } from './keyboard';
import { Trigger } from './enums';
import { chars } from './chars';

const UiohookToName = Object.fromEntries(
  Object.entries(UiohookKey).map(([k, v]) => [v, k])
);

UiohookToName[UiohookKey.Comma] = ',';
UiohookToName[UiohookKey.Period] = '.';
UiohookToName[UiohookKey.Slash] = '/';
UiohookToName[UiohookKey.Backslash] = '\\';
UiohookToName[UiohookKey.Semicolon] = ';';
UiohookToName[UiohookKey.Equal] = '=';
UiohookToName[UiohookKey.Minus] = '-';
UiohookToName[UiohookKey.Quote] = "'";

const ShiftMap = {
  '`': '~',
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
  '0': ')',
  '-': '_',
  '=': '+',
  '[': '{',
  ']': '}',
  '\\': '|',
  ';': ':',
  "'": '"',
  ',': '<',
  '.': '>',
  '/': '?',
};
type KeyCodes = keyof typeof ShiftMap;

const toKey = (keycode: number, shift = false) => {
  try {
    let key: string = UiohookToName[keycode] || '';
    if (kitState.keymap) {
      const char = chars[keycode];
      if (char) {
        const keymapChar = kitState.keymap?.[char];
        if (keymapChar) {
          key = keymapChar?.value;
        }
      }
    }

    if (shift) {
      return ShiftMap[key as KeyCodes] || key;
    }
    return key.toLowerCase();
  } catch (error) {
    log.error(error);
    return '';
  }
};

type FrontmostApp = {
  localizedName: string;
  bundleId: string;
  bundlePath: string;
  executablePath: string;
  isLaunched: boolean;
  pid: number;
};

type ClipboardApp = {
  text: string;
  app: FrontmostApp;
};

interface ClipboardItem extends Choice {
  type: string;
  timestamp: string;
  maybeSecret: boolean;
  value: any;
}

let clipboardHistory: ClipboardItem[] = [];
let frontmost: any = null;
export const getClipboardHistory = () => {
  if (kitState.authorized) {
    return clipboardHistory;
  }

  const choice = {
    name: `Clipboard history requires accessibility access`,
    description: `Unable to read clipboard history`,
  };
  log.info(choice);

  kitState.notifyAuthFail = true;

  return [choice];
};

export const removeFromClipboardHistory = (itemId: string) => {
  const index = clipboardHistory.findIndex(({ id }) => itemId === id);
  if (index > -1) {
    clipboardHistory.splice(index, 1);
  } else {
    log.info(`😅 Could not find ${itemId} in clipboard history`);
  }
};

export const clearClipboardHistory = () => {
  clipboardHistory = [];
};

const SPACE = '_';

let prevKey = '';
const backspace = 'backspace';
const ioEvent = async (event: UiohookKeyboardEvent | UiohookMouseEvent) => {
  try {
    if ((event as UiohookMouseEvent).button) {
      log.silly('Clicked. Clearing snippet.');
      kitState.snippet = '';
      return;
    }

    const e = event as UiohookKeyboardEvent;

    if (e.keycode === UiohookKey.Escape) {
      if (kitState.isTyping) {
        log.info(`✋ Cancel typing`);
        kitState.cancelTyping = true;
      }
    }

    if (kitState.isTyping) {
      kitState.snippet = '';
      log.silly(`Ignoring snippet while Kit.app typing`);
      return;
    }

    kitState.isShiftDown = e.shiftKey;

    let key = '';
    try {
      key = toKey(e?.keycode || 0, e.shiftKey);
      log.silly(`key: ${key} code: ${e?.keycode}`);
    } catch (error) {
      log.error(error);
      kitState.snippet = '';
      return;
    }

    // 42 is shift
    if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) {
      log.silly(`Ignoring shift key`);
      return;
    }

    // Clear on modifier key
    if (e.metaKey || e.ctrlKey || e.altKey) {
      log.silly(`Ignoring modifier key and clearing snippet`);
      kitState.snippet = '';
      return;
    }

    if (key === backspace) {
      log.silly(`Backspace: Removing last character from snippet`);
      kitState.snippet = kitState.snippet.slice(0, -1);
      // 57 is the space key
    } else if (e?.keycode === UiohookKey.Space) {
      log.silly(`Space: Adding space to snippet`);
      if (prevKey === backspace || kitState.snippet.length === 0) {
        kitState.snippet = '';
      } else {
        kitState.snippet += SPACE;
      }
    } else if (
      e?.keycode === UiohookKey.Quote ||
      key.length > 1 ||
      key === ''
    ) {
      kitState.snippet = ``;
    } else {
      kitState.snippet = `${kitState.snippet}${key}`;
      log.silly(`kitState.snippet = `, kitState.snippet);
    }
    prevKey = key;
  } catch (error) {
    log.error(error);
  }
};

let io$Sub: Subscription | null = null;
let clipboard$Sub: Subscription | null = null;

let accessibilityInterval: any = null;

export const preStartConfigureInterval = async () => {
  if (kitState.authorized) {
    log.info(`💻 Accessibility authorized ✅`);
    await updateAppDb({ authorized: true });
    await configureInterval();
  } else {
    await updateAppDb({ authorized: false });
    const { askForAccessibilityAccess } = await import('node-mac-permissions');

    askForAccessibilityAccess();

    accessibilityInterval = setInterval(async () => {
      log.silly(`Checking for accessibility authorization...`);
      await checkAccessibility();
      if (kitState.authorized) {
        await updateAppDb({ authorized: true });
        clearInterval(accessibilityInterval);
        kitState.requiresAuthorizedRestart = true;
      }
    }, 5000);
  }
};

export const configureInterval = async () => {
  if (kitState.isMac) {
    const fullyAuthenticated = kitState.authorized && appDb?.authorized;
    if (!fullyAuthenticated) return;
  }
  log.info(`Initializing 🖱 mouse and ⌨️ keyboard watcher`);

  if (kitState.isMac) {
    try {
      ({ default: frontmost } = await import('frontmost-app' as any));
    } catch (e) {
      log.warn(e);
    }
  }

  const io$ = new Observable((observer) => {
    log.info(`Creating new Observable for uiohook-napi...`);
    try {
      log.info(`Attempting to start uiohook-napi...`);

      log.info(`Adding click listeners...`);
      uIOhook.on('click', (event) => {
        try {
          observer.next(event);
        } catch (error) {
          log.error(error);
        }
      });

      log.info(`Adding keydown listeners...`);
      uIOhook.on('keydown', (event) => {
        try {
          observer.next(event);

          if (event.keycode === UiohookKey.Escape) {
            log.info(`✋ Escape pressed`);
            kitState.escapePressed = true;
          }
        } catch (error) {
          log.error(error);
        }
      });

      uIOhook.on('keyup', (event) => {
        if (event.keycode === UiohookKey.Escape) {
          log.info(`✋ Escape released`);
          kitState.escapePressed = false;
        }
      });

      log.info(`The line right before uIOhook.start()...`);
      uIOhook.start();
      kitState.watcherEnabled = true;
      log.info(`The line right after uIOhook.start()...`);

      log.info(`🟢 Started keyboard and mouse watcher`);
    } catch (e) {
      log.error(`🔴 Failed to start keyboard and mouse watcher`);
      log.error(e);

      observer.unsubscribe();
    }

    return () => {
      log.info(`🛑 Attempting to stop keyboard and mouse watcher`);
      uIOhook.stop();
      kitState.watcherEnabled = false;
      log.info(`🛑 Successfully stopped keyboard and mouse watcher`);
    };
  }).pipe(share());

  const clipboardText$: Observable<any> = new Observable((observer) => {
    log.info(`Creating new Observable for clipboard...`);
    try {
      log.info(`Attempting to start clipboard...`);
      clipboardEventListener.on('text', (text) => {
        try {
          observer.next(text);
        } catch (error) {
          log.error(error);
        }
      });
      clipboardEventListener.listen();
    } catch (e) {
      log.error(`🔴 Failed to start clipboard watcher`);
      log.error(e);
    }

    return () => {
      log.info(`🛑 Attempting to stop clipboard watcher`);
      clipboardEventListener.close();
      log.info(`🛑 Successfully stopped clipboard watcher`);
    };
  }).pipe(
    switchMap(async () => {
      if (frontmost) {
        try {
          const frontmostApp = await frontmost();
          const ignoreList = [
            'onepassword',
            'keychain',
            'security',
            'wallet',
            'lastpass',
          ];

          if (ignoreList.find((app) => frontmostApp.bundleId.includes(app))) {
            log.info(`Ignoring clipboard for ${frontmostApp.bundleId}`);
            return false;
          }

          return frontmostApp;
        } catch (error) {
          log.warn(error);
          return false;
        }
      }

      return false;
    }),
    filter((value) => value !== false),
    delay(100),
    map((app: ClipboardApp) => {
      try {
        const text = clipboard.readText();
        if (text && text.length < 1000) {
          return {
            app,
            text,
          };
        }
        return {
          app,
          text: '',
        };
      } catch (e) {
        log.error(e);
        return {
          app: '',
          text: '',
        };
      }
    }),
    filter((value) => (value as any)?.text),
    distinctUntilChanged((a, b) => a.text === b.text)
  );

  if (!clipboard$Sub)
    clipboard$Sub = clipboardText$.subscribe(
      async ({ text, app }: ClipboardApp) => {
        let value = '';
        let type = '';
        const timestamp = format(new Date(), 'yyyy-MM-dd-hh-mm-ss');

        if (typeof text === 'string') {
          type = 'text';
          value = text;
        } else {
          type = 'image';
          value = path.join(tmpClipboardDir, `${timestamp}.png`);
          await writeFile(value, (text as NativeImage).toPNG());
        }

        // TODO: Consider filtering consecutive characters without a space
        const maybeSecret = Boolean(
          type === 'text' &&
            value.match(/^(?=.*[0-9])(?=.*[a-zA-Z])([a-z0-9-]{5,})$/gi)
        );

        const appName = isFocused() ? 'Script Kit' : app.localizedName;

        const clipboardItem = {
          id: nanoid(),
          name: type === 'image' ? value : value.trim().slice(0, 40),
          description: `${appName} - ${timestamp}`,
          value,
          type,
          timestamp,
          maybeSecret,
        };

        remove(clipboardHistory, (item) => item.value === value);

        log.silly(`📋 Clipboard`, clipboardItem);

        clipboardHistory.unshift(clipboardItem);
        if (clipboardHistory.length > 100) {
          clipboardHistory.pop();
        }
      }
    );

  if (!io$Sub) io$Sub = io$.subscribe(ioEvent as any);
};

export const toggleTickOn = async () => {
  if (kitState.isMac) {
    const fullyAuthenticated = kitState.authorized && appDb?.authorized;
    if (!fullyAuthenticated) return;
  }

  destroyInterval();
  await new Promise((resolve) => setTimeout(resolve, 500));
  configureInterval();
};

const subSnippet = subscribeKey(kitState, 'snippet', async (snippet = ``) => {
  // Use `;;` as "end"?
  if (snippet.length < 2) return;
  for await (const snippetKey of snippetMap.keys()) {
    if (snippet.endsWith(snippetKey)) {
      log.info(`Running snippet: ${snippetKey}`);
      const script = snippetMap.get(snippetKey) as Script;
      if (kitConfig.deleteSnippet) {
        // get postfix from snippetMap
        if (snippetMap.has(snippetKey)) {
          const { postfix } = snippetMap.get(snippetKey) || {
            postfix: false,
          };

          const stringToDelete = postfix ? snippet : snippetKey;
          log.silly({ stringToDelete, postfix });
          kitState.snippet = '';

          await deleteText(stringToDelete);
        }
      }
      emitter.emit(KitEvent.RunPromptProcess, {
        scriptPath: script.filePath,
        args: [snippet.slice(0, -snippetKey?.length)],
        options: {
          force: false,
          trigger: Trigger.Snippet,
        },
      });
    }

    if (snippet.endsWith(SPACE)) {
      kitState.snippet = '';
    }
  }
});

const subIsTyping = subscribeKey(kitState, 'isTyping', () => {
  log.silly(`📕 isTyping: ${kitState.isTyping ? 'true' : 'false'}`);
});

export const destroyInterval = () => {
  try {
    if (io$Sub) io$Sub.unsubscribe();
    io$Sub = null;
    if (clipboard$Sub) clipboard$Sub.unsubscribe();
    clipboard$Sub = null;
    log.info(`🔥 Destroyed interval`);
    try {
      uIOhook.stop();
    } catch (e) {
      log.error(e);
    }
  } catch (e) {
    log.error(e);
  }
};

const snippetMap = new Map<
  string,
  {
    filePath: string;
    postfix: boolean;
  }
>();

export const addSnippet = (script: Script) => {
  for (const [key, value] of snippetMap.entries()) {
    if (value.filePath === script.filePath) {
      snippetMap.delete(key);
    }
  }

  if (script?.snippet) {
    if (kitState.authorized) {
      log.info(`Set snippet: ${script.snippet}`);

      // If snippet starts with an '*' then it's a postfix
      snippetMap.set(script.snippet.replace(/^\*/, ''), {
        filePath: script.filePath,
        postfix: script.snippet.startsWith('*'),
      });
    } else {
      kitState.notifyAuthFail = true;
    }
  }
};

export const removeSnippet = (filePath: string) => {
  for (const [key, value] of snippetMap.entries()) {
    if (value.filePath === filePath) {
      snippetMap.delete(key);
    }
  }
};

let prevWatcherEnabled = kitState.watcherEnabled;
const watcherEnabledSub = subscribeKey(
  kitState,
  'watcherEnabled',
  async (watcherEnabled) => {
    log.info(
      `📕 watcherEnabled: ${watcherEnabled ? 'true' : 'false'} ${
        prevWatcherEnabled ? 'true' : 'false'
      }}`
    );
    if (watcherEnabled === prevWatcherEnabled) return;
    prevWatcherEnabled = watcherEnabled;

    if (watcherEnabled) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (kitState.authorized) {
        log.info('📕 Authorized. Starting key watcher...');
        preStartConfigureInterval();
      } else {
        log.info('📕 Not authorized, not starting key watcher');
      }
    } else {
      destroyInterval();
    }

    prevWatcherEnabled = watcherEnabled;
  }
);

// sub to wakeWatcher
const subWakeWatcher = subscribeKey(
  kitState,
  'wakeWatcher',
  async (wakeWatcher) => {
    if (wakeWatcher) {
      toggleTickOn();
    } else {
      destroyInterval();
    }
  }
);

subs.push(subSnippet, subIsTyping, watcherEnabledSub, subWakeWatcher);

export const clearTickTimers = () => {
  if (accessibilityInterval) clearInterval(accessibilityInterval);
};
