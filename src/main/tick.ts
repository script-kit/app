import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
/* eslint-disable import/prefer-default-export */
import { Clipboard } from '@johnlindquist/clipboard';
import { format } from 'date-fns';
import { nanoid } from 'nanoid';
import { Observable, type Subscription } from 'rxjs';
import { debounceTime, filter, share, switchMap } from 'rxjs/operators';
import { subscribeKey } from 'valtio/utils';

import { store } from '@johnlindquist/kit/core/db';
import { kitPath, tmpClipboardDir } from '@johnlindquist/kit/core/utils';
import type { Script } from '@johnlindquist/kit/types';
import { debounce } from 'lodash-es';

import { clipboard } from 'electron';
import { KitEvent, emitter } from '../shared/events';
import { kitClipboard, kitConfig, kitState, kitStore, subs } from './state';

import { Trigger } from '../shared/enums';
import { deleteText } from './keyboard';

import { addToClipboardHistory, getClipboardHistory } from './clipboard';
import { registerIO } from './io';
import { prompts } from './prompts';
import shims from './shims';
import { createLogger } from '../shared/log-utils';

const log = createLogger('tick.ts');

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

const frontmost: any = null;

// syncClipboardStore();

const SPACE = '_';

let prevKey = -1;

// @ts-ignore This import might not work, depending on the platform
import type { UiohookKey, UiohookKeyboardEvent, UiohookMouseEvent } from 'uiohook-napi';
let uiohookKeyCode: typeof UiohookKey;

const ioEvent = (event: UiohookKeyboardEvent | UiohookMouseEvent) => {
  if (!uiohookKeyCode) {
    uiohookKeyCode = shims['uiohook-napi'].UiohookKey;
  }

  try {
    if ((event as UiohookMouseEvent).button) {
      log.silly('Clicked. Clearing snippet.');
      kitState.snippet = '';
      return;
    }

    const e = event as UiohookKeyboardEvent;

    if (e.keycode === uiohookKeyCode.Escape) {
      kitState.typedText = '';
      if (kitState.isTyping) {
        log.info('✋ Cancel typing');
        kitState.cancelTyping = true;
      }
    }

    if (kitState.isTyping) {
      kitState.snippet = '';
      log.silly('Ignoring snippet while Kit.app typing');
      return;
    }

    kitState.isShiftDown = e.shiftKey;

    let key = '';
    try {
      key = (event as any).key as string;
      log.silly(`key: ${key} code: ${e?.keycode}`);
    } catch (error) {
      log.error(error);
      kitState.snippet = '';
      return;
    }

    // Clear on arrow keys
    if (
      e.keycode === uiohookKeyCode.ArrowLeft ||
      e.keycode === uiohookKeyCode.ArrowRight ||
      e.keycode === uiohookKeyCode.ArrowUp ||
      e.keycode === uiohookKeyCode.ArrowDown
    ) {
      log.silly('Ignoring arrow key and clearing snippet');
      kitState.snippet = '';
      kitState.typedText = '';
      return;
    }

    // 42 is shift
    if (e.keycode === uiohookKeyCode.Shift || e.keycode === uiohookKeyCode.ShiftRight) {
      log.silly('Ignoring shift key');
      return;
    }

    // Clear on modifier key
    if (e.metaKey || e.ctrlKey || e.altKey) {
      log.silly('Ignoring modifier key and clearing snippet');
      kitState.snippet = '';
      if (e.keycode === uiohookKeyCode.Backspace) {
        kitState.typedText = '';
      }
      return;
    }

    if (e.keycode === uiohookKeyCode.Backspace) {
      log.silly('Backspace: Removing last character from snippet');
      kitState.snippet = kitState.snippet.slice(0, -1);
      kitState.typedText = kitState.typedText.slice(0, -1);
      // 57 is the space key
    } else if (e?.keycode === uiohookKeyCode.Space) {
      log.silly('Space: Adding space to snippet');
      if (prevKey === uiohookKeyCode.Backspace || kitState.snippet.length === 0) {
        kitState.snippet = '';
      } else {
        kitState.snippet += SPACE;
        kitState.typedText = `${kitState.typedText} `;
      }
    } else if (e?.keycode === uiohookKeyCode.Quote || key.length > 1 || key === '') {
      kitState.snippet = '';
      kitState.typedText = `${kitState.typedText}${key}`;
    } else {
      kitState.snippet = `${kitState.snippet}${key}`;
      kitState.typedText = `${kitState.typedText}${key}`.slice(-kitState.typedLimit);
      log.silly('kitState.snippet = ', kitState.snippet);
    }
    prevKey = e.keycode;
  } catch (error) {
    log.error(error);
  }
};

let io$Sub: Subscription | null = null;
let clipboard$Sub: Subscription | null = null;

export const preStartConfigureInterval = async () => {
  if (!kitClipboard.store) {
    try {
      kitClipboard.store = await store(kitPath('db', 'clipboard.json'), {
        history: [],
      });

      log.info(`📋 Clipboard store initialized: ${typeof kitClipboard.store}`);

      await getClipboardHistory();
    } catch (error) {
      log.error(error);
    }
  }
  if (kitStore.get('accessibilityAuthorized')) {
    log.info('💻 Accessibility authorized ✅');
    await startClipboardMonitor();
  }
};

const isTransient = () => {
  const badTypes = [
    'de.petermaurer.TransientPasteboardType',
    'com.typeit4me.clipping',
    'Pasteboard generator type',
    'com.agilebits.onepassword',
    'org.nspasteboard.TransientType',
    'org.nspasteboard.ConcealedType',
    'org.nspasteboard.AutoGeneratedType',
  ];
  return badTypes.find((badType) => {
    return clipboard.has(badType);
  });
};

let clipboardEventListener: Clipboard | null = null;
export const startKeyboardMonitor = async () => {
  if (kitState.kenvEnv?.KIT_KEYBOARD === 'false') {
    log.info('🔇 Keyboard monitor disabled');
    if (io$Sub) {
      io$Sub.unsubscribe();
    }
    return;
  }
  const io$ = new Observable((observer) => {
    log.info('Creating new Observable for uiohook-napi...');
    try {
      log.info('Attempting to start uiohook-napi...');

      // eslint-disable-next-line promise/catch-or-return, promise/always-return
      registerIO(observer.next.bind(observer)).then(() => {
        log.info('🟢 Started keyboard and mouse watcher');
      });
    } catch (e) {
      log.error('🔴 Failed to start keyboard and mouse watcher');
      log.error(e);

      observer.unsubscribe();
    }

    return () => {
      log.info('🛑 Attempting to stop keyboard and mouse watcher');
      const { uIOhook } = shims['uiohook-napi'];

      uIOhook.stop();
      log.info('🛑 Successfully stopped keyboard and mouse watcher');
    };
  }).pipe(share());
  if (!io$Sub) {
    io$Sub = io$.subscribe(ioEvent as any);
  }
};

export const startClipboardMonitor = async () => {
  if (kitState.kenvEnv?.KIT_CLIPBOARD === 'false') {
    log.info('🔇 Clipboard monitor disabled');
    if (clipboard$Sub) {
      clipboard$Sub.unsubscribe();
    }
    return;
  }
  log.info('⌚️ Configuring interval...');
  if (!kitState.supportsNut) {
    log.info('🛑 Keyboard watcher not supported on this platform');
    return;
  }

  log.info('Initializing 🖱 mouse and ⌨️ keyboard watcher');

  if (kitState.isMac) {
    try {
      log.info(shims['@johnlindquist/mac-frontmost'].getFrontmostApp());
    } catch (e) {
      log.warn(e);
    }
  }

  const clipboardText$: Observable<any> = new Observable<string>((observer) => {
    log.info('Creating new Observable for clipboard...');
    try {
      log.info('Attempting to start clipboard...');
      if (kitState.isMac) {
        log.info('Attempting to start @johnlindquist/mac-clipboard-listener...');

        shims['@johnlindquist/mac-clipboard-listener'].start();

        shims['@johnlindquist/mac-clipboard-listener'].onClipboardImageChange(
          debounce(
            () => {
              try {
                log.info('@johnlindquist/mac-clipboard-listener image changed...');
                observer.next('image');
              } catch (error) {
                log.error(error);
              }
            },
            100,
            {
              leading: true,
            },
          ),
        );

        shims['@johnlindquist/mac-clipboard-listener'].onClipboardTextChange(
          debounce(
            () => {
              try {
                log.info('@johnlindquist/mac-clipboard-listener text changed...');
                observer.next('text');
              } catch (error) {
                log.error(error);
              }
            },
            100,
            {
              leading: true,
            },
          ),
        );
      } else {
        clipboardEventListener = new Clipboard();
        clipboardEventListener.on('text', () => {
          try {
            log.info('Clipboard text changed...');
            observer.next('text');
          } catch (error) {
            log.error(error);
          }
        });

        clipboardEventListener.on('image', () => {
          try {
            log.info('Clipboard image changed...');
            observer.next('image');
          } catch (error) {
            log.error(error);
          }
        });

        clipboardEventListener.listen();
      }
    } catch (e) {
      log.error('🔴 Failed to start clipboard watcher');
      log.error(e);
    }

    return () => {
      log.info('🛑 Attempting to stop clipboard watcher');
      clipboardEventListener?.close();
      log.info('🛑 Successfully stopped clipboard watcher');
    };
  }).pipe(
    switchMap(async (type: string) => {
      if (kitState.isMac && frontmost) {
        try {
          const frontmostApp = frontmost();

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
    debounceTime(100),
  );

  if (!clipboard$Sub) {
    clipboard$Sub = clipboardText$.subscribe(async ({ type, app }: ClipboardInfo) => {
      if (isTransient()) {
        log.info('Ignoring transient clipboard');
        return;
      }

      const timestamp = format(new Date(), 'yyyy-MM-dd-hh-mm-ss');

      let maybeSecret = false;
      let itemName = '';
      let value = '';

      if (type === 'image') {
        try {
          log.info('Attempting to read image from clipboard...');
          const image = clipboard.readImage('clipboard');
          log.info('Read image from clipboard, converting toPNG()...');

          const pngImageBuffer = image.toPNG();
          log.info('Converted image to PNG, checking size...');

          log.info(`Image size: ${pngImageBuffer.length} bytes`);
          if (pngImageBuffer.length > 20 * 1024 * 1024) {
            log.info('Image size > 20MB. Ignoring...');
            return;
          }

          itemName = `${timestamp}.png`;
          value = path.join(tmpClipboardDir, itemName);

          await writeFile(value, pngImageBuffer);
        } catch (error) {
          log.error(error);
        }
      } else {
        try {
          value = clipboard.readText();
          if (value.length > 1280) {
            log.info('Ignoring clipboard value > 1280 characters');
            return;
          }
          if (
            kitState?.kenvEnv?.KIT_CLIPBOARD_IGNORE_REGEX &&
            value?.match(kitState?.kenvEnv?.KIT_CLIPBOARD_IGNORE_REGEX)
          ) {
            log.info('Ignoring clipboard value that matches KIT_CLIPBOARD_IGNORE_REGEX');
            return;
          }
          itemName = value.trim().slice(0, 40);
        } catch (error) {
          log.warn(error);
          return;
        }

        // TODO: Consider filtering consecutive characters without a space
        maybeSecret = Boolean(
          // no newlines
          (!value.match(/\n/g) &&
            value.match(/^(?=.*[0-9])(?=.*[a-zA-Z])[a-zA-Z0-9!@#$%^&*()-_=+{}[\]<>;:,.|~]{5,}$/i)) ||
            (kitState?.kenvEnv?.KIT_MAYBE_SECRET_REGEX &&
              value.match(new RegExp(kitState?.kenvEnv?.KIT_MAYBE_SECRET_REGEX))),
        );
      }

      // eslint-disable-next-line no-nested-ternary
      const appName = prompts?.prevFocused ? 'Script Kit' : app?.localizedName ? app.localizedName : 'Unknown';

      const clipboardItem = {
        id: nanoid(),
        name: itemName,
        description: `${appName} - ${timestamp}`,
        value,
        type,
        timestamp,
        maybeSecret,
      };

      addToClipboardHistory(clipboardItem);
    });
  }
};

export const startClipboardAndKeyboardWatchers = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  startClipboardMonitor();
  startKeyboardMonitor();
};

const subSnippet = subscribeKey(kitState, 'snippet', async (snippet = '') => {
  // Use `;;` as "end"?
  if (snippet.length < 2) {
    return;
  }
  for await (const snippetKey of snippetMap.keys()) {
    if (snippet.endsWith(snippetKey)) {
      let postfix = false;
      log.info(`Running snippet: ${snippetKey}`);
      const script = snippetMap.get(snippetKey) as {
        filePath: string;
        postfix: boolean;
        txt: boolean;
      };
      if (kitConfig.deleteSnippet) {
        // get postfix from snippetMap
        if (snippetMap.has(snippetKey)) {
          postfix = snippetMap.get(snippetKey)?.postfix;

          const stringToDelete = postfix ? snippet : snippetKey;
          log.silly({ stringToDelete, postfix });
          kitState.snippet = '';

          await deleteText(stringToDelete);
        }
      }
      if (script.txt) {
        emitter.emit(KitEvent.RunPromptProcess, {
          scriptPath: kitPath('app', 'paste-snippet.js'),
          args: ['--filePath', script?.filePath],
          options: {
            force: false,
            trigger: Trigger.Snippet,
          },
        });
      } else {
        emitter.emit(KitEvent.RunPromptProcess, {
          scriptPath: script.filePath,
          args: postfix ? [snippet.slice(0, -snippetKey?.length)] : [],
          options: {
            force: false,
            trigger: Trigger.Snippet,
          },
        });
      }
    }

    if (snippet.endsWith(SPACE)) {
      kitState.snippet = '';
    }
  }
});

const subIsTyping = subscribeKey(kitState, 'isTyping', () => {
  log.silly(`📕 isTyping: ${kitState.isTyping ? 'true' : 'false'}`);
});

const snippetMap = new Map<
  string,
  {
    filePath: string;
    postfix: boolean;
    txt: boolean;
  }
>();

const getSnippet = (
  contents: string,
): {
  metadata: Record<string, string>;
  snippet: string;
} => {
  const lines = contents.split('\n');
  const metadata: Record<string, string> = {};
  let contentStartIndex = lines.length;

  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/(?<=^(?:(?:\/\/)|#)\s{0,2})([\w-]+)(?::)(.*)/);

    if (match) {
      const [, key, value] = match;
      if (value) {
        metadata[key.trim().toLowerCase()] = value.trim();
      }
    } else {
      contentStartIndex = i;
      break;
    }
  }

  const snippet = lines.slice(contentStartIndex).join('\n');
  return { metadata, snippet };
};

export const addTextSnippet = async (filePath: string) => {
  for (const [key, value] of snippetMap.entries()) {
    if (value.filePath === filePath) {
      snippetMap.delete(key);
    }
  }

  const contents = await readFile(filePath, 'utf8');
  const { metadata } = await getSnippet(contents);

  if (metadata?.snippet) {
    log.info(`Set snippet: ${metadata.snippet}`);

    // If snippet starts with an '*' then it's a postfix
    snippetMap.set(metadata?.snippet, {
      filePath,
      postfix: false,
      txt: true,
    });
  }
};

export const addSnippet = (script: Script) => {
  for (const [key, value] of snippetMap.entries()) {
    if (value.filePath === script.filePath) {
      snippetMap.delete(key);
    }
  }

  if (script?.kenv !== '' && !kitState.trustedKenvs.includes(script?.kenv)) {
    if (script?.snippet) {
      log.info(`Ignoring ${script?.filePath} // Snippet metadata because it's not trusted in a trusted kenv.`);
      log.info(`Add "${kitState.trustedKenvsKey}=${script?.kenv}" to your .env file to trust it.`);
    }

    return;
  }

  if (script?.snippet) {
    log.info(`✂️ Set snippet: ${script.snippet}`);

    // If snippet starts with an '*' then it's a postfix
    snippetMap.set(script.snippet.replace(/^\*/, ''), {
      filePath: script.filePath,
      postfix: script.snippet.startsWith('*'),
      txt: false,
    });
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
