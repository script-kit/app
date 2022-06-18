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
} from 'rxjs/operators';
import log from 'electron-log';
import { subscribeKey } from 'valtio/utils';
import { keyboard, Key } from '@nut-tree/nut-js';
import { format } from 'date-fns';
import { writeFile } from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { tmpClipboardDir, kitPath } from '@johnlindquist/kit/cjs/utils';
import { Choice, Script } from '@johnlindquist/kit/types/core';

import { Channel } from '@johnlindquist/kit/cjs/enum';
import { debounce, remove } from 'lodash';

import { emitter, KitEvent } from './events';
import { kitConfig, kitState } from './state';
import { isFocused } from './prompt';

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
    preview: `Please enable accessibility access in your Mac settings. Then quit and re-open Kit.app`,
  };
  log.info(choice);

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

const ioEvent = async (event: any) => {
  // log.info(event);
  try {
    const {
      keychar = '',
      shiftKey = false,
      type = '',
      metaKey = false,
      ctrlKey = false,
      altKey = false,
    } = event;
    kitState.isShiftDown = shiftKey;

    // log.info({ keychar, type });
    const key = String.fromCharCode(keychar);

    if (
      type === 'mouseclick' ||
      metaKey ||
      ctrlKey ||
      altKey ||
      kitState.isTyping ||
      keychar < 33
    ) {
      kitState.snippet = ``;
    } else {
      kitState.snippet = `${kitState.snippet}${key}`;
    }
  } catch (error) {
    log.error(error);
  }

  // log.info(kitState.snippet);
};

export const configureInterval = async () => {
  const { default: ioHook } = await import('@hcfy/iohook');

  if (kitState.isMac) {
    ({ default: frontmost } = await import('frontmost-app' as any));
  }
  const io$ = new Observable((observer) => {
    ioHook.on('mouseclick', (event) => {
      observer.next(event);
    });

    ioHook.on('keypress', (event) => {
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
    ioHook.start();

    return () => {
      ioHook.stop();
    };
  }).pipe(share());

  const clipboardText$: Observable<any> = io$.pipe(
    filter((event: any) => {
      if (event?.type === 'keypress' && (event.ctrlKey || event.metaKey)) {
        const key = String.fromCharCode(event.keychar);
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

    clipboardHistory.unshift(clipboardItem);
    if (clipboardHistory.length > 100) {
      clipboardHistory.pop();
    }
  });

  emitter.on(Channel.REMOVE_CLIPBOARD_HISTORY_ITEM, (id) => {
    removeFromClipboardHistory(id);
  });

  emitter.on(Channel.CLEAR_CLIPBOARD_HISTORY, () => {
    clipboardHistory = [];
  });

  subscribeKey(kitState, 'snippet', async (snippet = ``) => {
    // Use `;;` as "end"?
    if (snippetMap.has(snippet)) {
      log.info(`Running snippet: ${snippet}`);
      const script = snippetMap.get(snippet) as Script;
      if (kitConfig.deleteSnippet) {
        const prevDelay = keyboard.config.autoDelayMs;
        keyboard.config.autoDelayMs = 0;
        snippet.split('').forEach(async (char) => {
          await keyboard.type(Key.Backspace);
        });
        keyboard.config.autoDelayMs = prevDelay;
      }
      emitter.emit(KitEvent.RunBackgroundProcess, script.filePath);
    }
  });

  subscribeKey(kitState, 'isTyping', () => {
    kitState.snippet = ``;
  });

  io$.subscribe(ioEvent);
};

const snippetMap = new Map<string, Script>();

// export const maybeStopKeyLogger = () => {
//   if (snippetMap.size === 0 && kitState.keyloggerOn) {
//     log.info('📕 Stopping snippets...');
//     logger.stop();
//     kitState.keyloggerOn = false;
//   }
// };

const needsPermission = debounce(() => {
  emitter.emit(
    KitEvent.RunPromptProcess,
    kitPath('permissions', 'snippets.js')
  );
}, 250);

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
    } else if (!script.filePath.includes('examples')) {
      needsPermission();
    } //
  }
};

export const removeSnippet = (filePath: string) => {
  for (const [key, value] of snippetMap.entries()) {
    if (value.filePath === filePath) {
      snippetMap.delete(key);
    }
  }
};
