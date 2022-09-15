/* eslint-disable import/prefer-default-export */
import { clipboard, NativeImage } from 'electron';
import { Observable } from 'rxjs';
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
import { keyboard, Key } from '@nut-tree/nut-js';
import { format } from 'date-fns';
import { writeFile } from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { UiohookKeyboardEvent, UiohookKey } from 'uiohook-napi';
import { tmpClipboardDir, kitPath } from '@johnlindquist/kit/cjs/utils';
import { Choice, Script } from '@johnlindquist/kit/types/core';
import { remove } from 'lodash';

import { emitter, KitEvent } from './events';
import { kitConfig, kitState } from './state';
import { isFocused } from './prompt';

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

const ioEvent = async (e: UiohookKeyboardEvent) => {
  try {
    kitState.isShiftDown = e.shiftKey;

    const key = toKey(e?.keycode || 0, e.shiftKey);

    if (key === 'Shift') return;

    if (key === 'backspace') {
      kitState.snippet = kitState.snippet.slice(0, -1);
    } else if (e?.keycode === 57) {
      kitState.snippet += '_';
    } else if (
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      kitState.isTyping ||
      key.length > 1 ||
      key === ''
    ) {
      kitState.snippet = ``;
    } else {
      kitState.snippet = `${kitState.snippet}${key}`;
      log.silly(kitState.snippet);
    }
  } catch (error) {
    log.error(error);
  }

  // log.info(kitState.snippet);
};

export const configureInterval = async () => {
  log.silly(`Initializing 🖱 mouse and ⌨️ keyboard watcher`);
  if (kitState.isMac) {
    ({ default: frontmost } = await import('frontmost-app' as any));
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
      log.silly(`keydown`);
      // log.info(String.fromCharCode(event.keychar));
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
    uIOhook.start();

    return () => {
      uIOhook.stop();
    };
  }).pipe(share());

  const clipboardText$: Observable<any> = io$.pipe(
    tap((event) => {
      log.silly(`clipboardText$`);
      log.silly(event);
    }),
    filter((event: any) => {
      if (event?.keycode && (event.ctrlKey || event.metaKey)) {
        const key = toKey(event?.keycode || 0, event.shiftKey);
        return key === 'c' || key === 'x';
      }

      return event?.type === 'mouseclick';
    }),
    debounceTime(200),
    switchMap(async () => {
      if (frontmost) {
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

  clipboardText$.subscribe(async ({ text, app }: ClipboardApp) => {
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
  });

  subscribeKey(kitState, 'snippet', async (snippet = ``) => {
    // Use `;;` as "end"?
    if (!snippet) return;
    if (snippetMap.has(snippet)) {
      log.info(`Running snippet: ${snippet}`);
      const script = snippetMap.get(snippet) as Script;
      if (kitConfig.deleteSnippet) {
        const prevDelay = keyboard.config.autoDelayMs;
        keyboard.config.autoDelayMs = 0;
        for await (const key of snippet) {
          await keyboard.type(Key.Backspace);
        }

        keyboard.config.autoDelayMs = prevDelay;
      }
      emitter.emit(KitEvent.RunPromptProcess, script.filePath);
    }

    if (snippet.endsWith('_')) kitState.snippet = '';
  });

  subscribeKey(kitState, 'isTyping', () => {
    kitState.snippet = ``;
  });

  io$.subscribe(ioEvent as any);
};

const snippetMap = new Map<string, Script>();

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
      snippetMap.set(script.snippet, script);
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
