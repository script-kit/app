/* eslint-disable import/prefer-default-export */
import { clipboard, NativeImage } from 'electron';
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
import { UiohookKeyboardEvent, UiohookKey } from 'uiohook-napi';
import { tmpClipboardDir } from '@johnlindquist/kit/cjs/utils';
import { Choice, Script } from '@johnlindquist/kit/types/core';
import { remove } from 'lodash';

import { emitter, KitEvent } from './events';
import { kitConfig, kitState, subs } from './state';
import { isFocused } from './prompt';
import { deleteText } from './keyboard';
import { Trigger } from './enums';

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
  const key: string = UiohookToName[keycode] || '';
  if (shift) {
    return ShiftMap[key as KeyCodes] || key;
  }
  return key.toLowerCase();
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
const ioEvent = async (e: UiohookKeyboardEvent) => {
  try {
    kitState.isShiftDown = e.shiftKey;

    const key = toKey(e?.keycode || 0, e.shiftKey);

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

export const configureInterval = async () => {
  log.info(`Initializing 🖱 mouse and ⌨️ keyboard watcher`);
  if (kitState.isMac) {
    try {
      ({ default: frontmost } = await import('frontmost-app' as any));
    } catch (e) {
      log.warn(e);
    }
  }

  log.info(`Loading uiohook-napi`);
  const { uIOhook } = await import('uiohook-napi');
  log.info(`uiohook-napi ${uIOhook ? 'loaded' : 'failed'}`);
  const io$ = new Observable((observer) => {
    uIOhook.on('click', (event) => {
      log.silly(`click`);
      observer.next(event);
    });

    uIOhook.on('keydown', (event) => {
      log.silly({ event: 'keydown', key: String.fromCharCode(event.keycode) });
      observer.next(event);
    });

    // ioHook.on('keyup', (event) => {
    //   if (event.ctrlKey || event.metaKey) {
    //     // log.info(event);
    //     setTimeout(() => {
    //       observer.next(event);
    //     }, 100);
    //   }
    // });

    // Register and start hook
    log.info(`🟢 Starting keyboard and mouse watcher`);
    uIOhook.start();

    return () => {
      log.info(`🛑 Stopping keyboard and mouse watcher`);
      uIOhook.stop();
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
      const text = clipboard.readText();
      return {
        app,
        text,
      };
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
  if (io$Sub) io$Sub.unsubscribe();
  io$Sub = null;
  if (clipboard$Sub) clipboard$Sub.unsubscribe();
  clipboard$Sub = null;
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

subs.push(subSnippet, subIsTyping);
