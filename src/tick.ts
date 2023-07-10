/* eslint-disable import/prefer-default-export */
import clipboardEventListener from '@johnlindquist/clipboard';
import { Observable, Subscription } from 'rxjs';
import { delay, filter, share, switchMap } from 'rxjs/operators';
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

import { systemPreferences } from 'electron';
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
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  e: 'E',
  f: 'F',
  g: 'G',
  h: 'H',
  i: 'I',
  j: 'J',
  k: 'K',
  l: 'L',
  m: 'M',
  n: 'N',
  o: 'O',
  p: 'P',
  q: 'Q',
  r: 'R',
  s: 'S',
  t: 'T',
  u: 'U',
  v: 'V',
  w: 'W',
  x: 'X',
  y: 'Y',
  z: 'Z',
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

type ClipboardInfo = {
  type: 'image' | 'text' | 'ignore';
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

    // Clear on arrow keys
    if (
      e.keycode === UiohookKey.ArrowLeft ||
      e.keycode === UiohookKey.ArrowRight ||
      e.keycode === UiohookKey.ArrowUp ||
      e.keycode === UiohookKey.ArrowDown
    ) {
      log.silly(`Ignoring arrow key and clearing snippet`);
      kitState.snippet = '';
      kitState.typedText = '';
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
      if (key === backspace) {
        kitState.typedText = '';
      }
      return;
    }

    if (key === backspace) {
      log.silly(`Backspace: Removing last character from snippet`);
      kitState.snippet = kitState.snippet.slice(0, -1);
      kitState.typedText = kitState.typedText.slice(0, -1);
      // 57 is the space key
    } else if (e?.keycode === UiohookKey.Space) {
      log.silly(`Space: Adding space to snippet`);
      if (prevKey === backspace || kitState.snippet.length === 0) {
        kitState.snippet = '';
      } else {
        kitState.snippet += SPACE;
        kitState.typedText = `${kitState.typedText} `;
      }
    } else if (
      e?.keycode === UiohookKey.Quote ||
      key.length > 1 ||
      key === ''
    ) {
      kitState.snippet = ``;
      kitState.typedText = `${kitState.typedText}${key}`;
    } else {
      kitState.snippet = `${kitState.snippet}${key}`;
      kitState.typedText = `${kitState.typedText}${key}`.slice(
        -kitState.typedLimit
      );
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
    // REMOVE-MAC
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

    // END-REMOVE-MAC
  }
};

export const configureInterval = async () => {
  log.info(`⌚️ Configuring interval...`);
  if (!kitState.supportsNut) {
    log.info(`🛑 Keyboard watcher not supported on this platform`);
    return;
  }
  if (kitState.isMac) {
    const fullyAuthenticated = kitState.authorized && appDb?.authorized;
    log.info(`🔑 Authenticated: ${fullyAuthenticated ? '🔓' : '🔒'}`);
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

      uIOhook.stop();

      setTimeout(() => {
        if (systemPreferences.isTrustedAccessibilityClient(true)) {
          log.info(`The line right before uIOhook.start()...`);
          uIOhook.start();
          kitState.watcherEnabled = true;
          log.info(`The line right after uIOhook.start()...`);
          log.info(`🟢 Started keyboard and mouse watcher`);
        } else {
          log.error(
            `🔴 Failed to start keyboard and mouse watcher because Kit.app is not trusted`
          );
        }
      }, 1000);
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

  const clipboardText$: Observable<any> = new Observable<string>((observer) => {
    log.info(`Creating new Observable for clipboard...`);
    try {
      log.info(`Attempting to start clipboard...`);
      clipboardEventListener.on('text', (text) => {
        try {
          log.info(`Clipboard text changed...`);
          observer.next('text');
        } catch (error) {
          log.error(error);
        }
      });

      clipboardEventListener.on('image', (image) => {
        try {
          log.info(`Clipboard image changed...`);
          observer.next('image');
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
    switchMap(async (type: string) => {
      if (kitState.isMac && frontmost) {
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
            return {
              type: 'ignore',
              app: frontmostApp,
            };
          }

          return {
            type,
            app: frontmostApp,
          };
        } catch (error) {
          log.warn(error);
        }
      }

      return {
        type,
        app: {
          localizedName: 'Unknown',
        },
      };
    }),
    filter((value) => value.type !== 'ignore'),
    delay(100)
  );

  if (!clipboard$Sub)
    clipboard$Sub = clipboardText$.subscribe(
      async ({ type, app }: ClipboardInfo) => {
        const timestamp = format(new Date(), 'yyyy-MM-dd-hh-mm-ss');

        let maybeSecret = false;
        let itemName = ``;
        let value = ``;

        if (type === 'image') {
          value = path.join(tmpClipboardDir, `${timestamp}.png`);
          itemName = `${timestamp}.png`;
          try {
            const imageBuffer = await clipboardEventListener.readImage();
            // if imageBuffer is larger than 5mb, don't save it
            if (imageBuffer.length > 1024 * 1024 * 5) {
              return;
            }
            await writeFile(value, imageBuffer);
          } catch (error) {
            log.error(error);
          }
        } else {
          try {
            value = await clipboardEventListener.readText();
            itemName = value.trim().slice(0, 40);
          } catch (error) {
            log.warn(error);
            return;
          }

          // TODO: Consider filtering consecutive characters without a space
          maybeSecret = Boolean(
            value.match(
              /^(?=.*[0-9])(?=.*[a-zA-Z])[a-zA-Z0-9!@#$%^&*()-_=+{}[\]<>;:,.|~]{5,}$/i
            )
          );
        }

        // eslint-disable-next-line no-nested-ternary
        const appName = isFocused()
          ? 'Script Kit'
          : app?.localizedName
          ? app.localizedName
          : 'Unknown';

        const clipboardItem = {
          id: nanoid(),
          name: itemName,
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
  if (!kitState.supportsNut) return;
  if (kitState.isMac) {
    const fullyAuthenticated = kitState.authorized && appDb?.authorized;
    if (!fullyAuthenticated) return;
  }

  destroyInterval();
  await new Promise((resolve) => setTimeout(resolve, 500));
  configureInterval();
};

const subTyped = subscribeKey(kitState, 'typed', async (typed = ``) => {
  log.info({
    typed,
  });
});

const subSnippet = subscribeKey(kitState, 'snippet', async (snippet = ``) => {
  // Use `;;` as "end"?
  if (snippet.length < 2) return;
  for await (const snippetKey of snippetMap.keys()) {
    if (snippet.endsWith(snippetKey)) {
      let postfix = false;
      log.info(`Running snippet: ${snippetKey}`);
      const script = snippetMap.get(snippetKey) as {
        filePath: string;
        postfix: boolean;
      };
      if (kitConfig.deleteSnippet) {
        // get postfix from snippetMap
        if (snippetMap.has(snippetKey)) {
          postfix = snippetMap.get(snippetKey)?.postfix || false;

          const stringToDelete = postfix ? snippet : snippetKey;
          log.silly({ stringToDelete, postfix });
          kitState.snippet = '';

          await deleteText(stringToDelete);
        }
      }
      emitter.emit(KitEvent.RunPromptProcess, {
        scriptPath: script.filePath,
        args: postfix ? [snippet.slice(0, -snippetKey?.length)] : [],
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
  if (!kitState.supportsNut) return;
  try {
    if (io$Sub) io$Sub.unsubscribe();
    io$Sub = null;
    if (clipboard$Sub) clipboard$Sub.unsubscribe();
    clipboard$Sub = null;
    log.info(`🔥 Destroyed interval`);
    try {
      uIOhook.removeAllListeners();
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

  if (script?.kenv !== '' && !kitState.trustedKenvs.includes(script?.kenv)) {
    if (script?.snippet) {
      log.info(
        `Ignoring ${script?.filePath} // Snippet metadata because it's not trusted in a trusted kenv.`
      );
      log.info(
        `Add "${kitState.trustedKenvsKey}=${script?.kenv}" to your .env file to trust it.`
      );
    }

    return;
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
      `📕 watcherEnabled: ${
        watcherEnabled ? 'true' : 'false'
      } - wasWatcherEnabled: ${prevWatcherEnabled ? 'true' : 'false'}`
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

subs.push(subSnippet, subIsTyping, watcherEnabledSub, subWakeWatcher, subTyped);

export const clearTickTimers = () => {
  if (accessibilityInterval) clearInterval(accessibilityInterval);
};
