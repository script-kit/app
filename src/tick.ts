/* eslint-disable import/prefer-default-export */
import { clipboard, NativeImage, systemPreferences } from 'electron';
import { Observable, Subscription } from 'rxjs';
import {
  debounceTime,
  delay,
  distinctUntilChanged,
  filter,
  map,
  share,
  switchMap,
  tap,
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
    if (keymap) {
      const char = chars[keycode];
      if (char) {
        const keymapChar = keymap?.[char];
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

// const memory = (kDec = 2) => {
//   const bytes = process.memoryUsage().rss;

//   const MBytes = bytes / (1024 * 1024);
//   const roundedMegabytes =
//     Math.round(MBytes * Math.pow(10, kDec)) / Math.pow(10, kDec);

//   return roundedMegabytes.toString() + ' MB';
// };

interface ClipboardItem extends Choice {
  type: string;
  timestamp: string;
  maybeSecret: boolean;
  value: any;
}

let clipboardHistory: ClipboardItem[] = [];
let frontmost: any = null;
let nativeKeymap: any = null;
let keymap: any = null;
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

  // emitter.emit(
  //   KitEvent.RunPromptProcess,
  //   kitPath('permissions', 'clipboard-history.js')
  // );

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

    kitState.isShiftDown = e.shiftKey;

    let key = '';
    try {
      key = toKey(e?.keycode || 0, e.shiftKey);
      log.silly(`key: ${key}`);
    } catch (error) {
      log.error(error);
      kitState.snippet = '';
      return;
    }

    if (key === 'Shift' || e.metaKey || e.ctrlKey || e.altKey) return;

    if (key === backspace) {
      kitState.snippet = kitState.snippet.slice(0, -1);
      // 57 is the space key
    } else if (e?.keycode === 57) {
      if (prevKey === backspace) {
        kitState.snippet = '';
      } else {
        kitState.snippet += '_';
      }
    } else if (
      e?.keycode === 40 ||
      kitState.isTyping ||
      key.length > 1 ||
      key === ''
    ) {
      kitState.snippet = ``;
    } else {
      kitState.snippet = `${kitState.snippet}${key}`;
      log.silly(kitState.snippet);
    }
    prevKey = key;
  } catch (error) {
    log.error(error);
  }

  // log.info(kitState.snippet);
};

let io$Sub: Subscription | null = null;
let clipboard$Sub: Subscription | null = null;

export const pantsKick = async () => {
  log.info(`Kicking pants...`);
  uIOhook.start();
  log.info(`Pants kicked!`);
};

export const preStartConfigureInterval = async () => {
  if (kitState.authorized) {
    log.info(`💻 Accessibility authorized ✅`);
    await updateAppDb({ authorized: true });
    await configureInterval();
  } else {
    await updateAppDb({ authorized: false });
    const { askForAccessibilityAccess } = await import('node-mac-permissions');

    askForAccessibilityAccess();

    const id = setInterval(async () => {
      log.silly(`Checking for accessibility authorization...`);
      await checkAccessibility();
      if (kitState.authorized) {
        await updateAppDb({ authorized: true });
        clearInterval(id);
        kitState.requiresAuthorizedRestart = true;
      }
    }, 5000);
  }
};

export const configureInterval = async () => {
  log.info(`Initializing 🖱 mouse and ⌨️ keyboard watcher`);
  if (!keymap) {
    try {
      ({ default: nativeKeymap } = await import('native-keymap' as any));
      keymap = nativeKeymap.getKeyMap();
      nativeKeymap.onDidChangeKeyboardLayout(() => {
        keymap = nativeKeymap.getKeyMap();
      });
    } catch (e) {
      log.error(e);
    }
  }
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
        } catch (error) {
          log.error(error);
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

  let previous = 0;
  const clipboardText$: Observable<any> = io$.pipe(
    // tap((event) => {
    //   log.silly(`clipboardText$`);
    //   log.silly(event);
    // }),
    filter((event: any) => {
      if (event?.keycode && (event.ctrlKey || event.metaKey)) {
        const key = toKey(event?.keycode || 0, event.shiftKey);
        return key === 'c' || key === 'x';
      }

      if (event?.button === 1 && previous === 2) {
        previous = 0;
        return true;
      }

      previous = event?.button;

      return false;
    }),
    debounceTime(200),
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

  // const memoryLog = interval(5000).pipe(map(() => memory()));

  // memoryLog.subscribe((s) => {
  //   log.info(`🧠 Memory`, s);
  // });

  // let image: NativeImage | null = null;
  // const clipboardImage$ = tick$.pipe(
  //   tap(() => {
  //     image = clipboard.readImage();
  //   }),
  //   filter(() => Boolean(image)),
  //   skip(1),
  //   map(() => image?.toDataURL()),
  //   filter((dataUrl) => !dataUrl?.endsWith(',')),
  //   distinctUntilChanged(),
  //   map(() => image)
  // );

  // merge(clipboardText$, clipboardImage$)

  /*
  {
  localizedName: '1Password 7',
  bundleId: 'com.agilebits.onepassword7',
  bundlePath: '/Applications/1Password 7.app',
  executablePath: '/Applications/1Password 7.app/Contents/MacOS/1Password 7',
  isLaunched: true,
  pid: 812
}
*/

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

        // log.info({ appName, text });

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
  }

  if (snippet.endsWith('_')) kitState.snippet = '';
});

const subIsTyping = subscribeKey(kitState, 'isTyping', () => {
  kitState.snippet = ``;
});

export const destroyInterval = () => {
  try {
    if (io$Sub) io$Sub.unsubscribe();
    io$Sub = null;
    if (clipboard$Sub) clipboard$Sub.unsubscribe();
    clipboard$Sub = null;
    log.info(`🔥 Destroyed interval`);
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

// export const maybeStopKeyLogger = () => {
//   if (snippetMap.size === 0 && kitState.keyloggerOn) {
//     log.info('📕 Stopping snippets...');
//     logger.stop();
//     kitState.keyloggerOn = false;
//   }
// };

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
    if (watcherEnabled === prevWatcherEnabled) return;

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

subs.push(subSnippet, subIsTyping, watcherEnabledSub);
