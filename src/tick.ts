/* eslint-disable import/prefer-default-export */
import clipboardEventListener from '@johnlindquist/clipboard';
import { Observable, Subscription } from 'rxjs';
import { delay, filter, share, switchMap } from 'rxjs/operators';
import log from 'electron-log';
import { subscribeKey } from 'valtio/utils';
import { format } from 'date-fns';
import { writeFile, readFile } from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import {
  UiohookKeyboardEvent,
  UiohookKey,
  UiohookMouseEvent,
  uIOhook,
} from 'uiohook-napi';
import { tmpClipboardDir, kitPath } from '@johnlindquist/kit/cjs/utils';
import { Choice, Script } from '@johnlindquist/kit/types';
import { store } from '@johnlindquist/kit/cjs/db';
import { debounce, remove } from 'lodash';

import { clipboard } from 'electron';
import { emitter, KitEvent } from './events';
import { kitConfig, kitState, subs } from './state';
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

let clipboardStore: any;
let frontmost: any = null;

export const syncClipboardStore = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 200);
  });
  store(kitPath('db', 'clipboard.json'), {
    history: [],
  })
    .then((s) => {
      log.info(`📋 Clipboard store initialized: ${typeof s}`);
      clipboardStore = s;
      return s;
    })
    .catch((error) => {
      log.error(error);
    });
};

syncClipboardStore();

export const getClipboardHistory = async () => {
  const history = await clipboardStore.get('history');
  if (kitState.isMac && kitState?.kenvEnv?.KIT_ACCESSIBILITY !== 'true') {
    const choice = {
      name: `Clipboard history requires accessibility access`,
      description: `Unable to read clipboard history`,
      value: '__not-authorized__',
    };
    log.info(choice);

    await clipboardStore.set('history', [choice, ...history]);
  }

  return [];
};

export const removeFromClipboardHistory = async (itemId: string) => {
  const clipboardHistory = await clipboardStore.get('history');
  const index = clipboardHistory.findIndex(({ id }) => itemId === id);
  if (index > -1) {
    clipboardHistory.splice(index, 1);
  } else {
    log.info(`😅 Could not find ${itemId} in clipboard history`);
  }

  await clipboardStore.set('history', clipboardHistory);
};

export const clearClipboardHistory = () => {
  clipboardStore.set('history', []);
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

export const preStartConfigureInterval = async () => {
  if (!clipboardStore) {
    try {
      clipboardStore = await store(kitPath('db', 'clipboard.json'), {
        history: [],
      });

      log.info(`📋 Clipboard store initialized: ${typeof clipboardStore}`);

      await getClipboardHistory();
    } catch (error) {
      log.error(error);
    }
  }
  if (kitState.kenvEnv?.KIT_ACCESSIBILITY === 'true') {
    log.info(`💻 Accessibility authorized ✅`);
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

export const startKeyboardMonitor = async () => {
  if (kitState.kenvEnv?.KIT_KEYBOARD === 'false') {
    log.info(`🔇 Keyboard monitor disabled`);
    return;
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
      log.info(`🛑 Successfully stopped keyboard and mouse watcher`);
    };
  }).pipe(share());
  if (!io$Sub) io$Sub = io$.subscribe(ioEvent as any);
};

export const startClipboardMonitor = async () => {
  if (kitState.kenvEnv?.KIT_CLIPBOARD === 'false') {
    log.info(`🔇 Clipboard monitor disabled`);
    return;
  }
  log.info(`⌚️ Configuring interval...`);
  if (!kitState.supportsNut) {
    log.info(`🛑 Keyboard watcher not supported on this platform`);
    return;
  }

  log.info(`Initializing 🖱 mouse and ⌨️ keyboard watcher`);

  // REMOVE-MAC
  if (kitState.isMac) {
    try {
      ({ getFrontmostApp: frontmost } = await import(
        '@johnlindquist/mac-frontmost'
      ));

      log.info(frontmost());
    } catch (e) {
      log.warn(e);
    }
  }

  const {
    start: startMacClipboardListener,
    onClipboardImageChange,
    onClipboardTextChange,
  } = await import('@johnlindquist/mac-clipboard-listener');

  // END-REMOVE-MAC

  const clipboardText$: Observable<any> = new Observable<string>((observer) => {
    log.info(`Creating new Observable for clipboard...`);
    try {
      log.info(`Attempting to start clipboard...`);
      if (!kitState.isMac) {
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
      }

      // REMOVE-MAC
      else {
        log.info(
          `Attempting to start @johnlindquist/mac-clipboard-listener...`
        );

        startMacClipboardListener();

        onClipboardImageChange(
          debounce(
            () => {
              try {
                log.info(
                  `@johnlindquist/mac-clipboard-listener image changed...`
                );
                observer.next('image');
              } catch (error) {
                log.error(error);
              }
            },
            750,
            {
              leading: true,
            }
          )
        );

        onClipboardTextChange(
          debounce(
            () => {
              try {
                log.info(
                  `@johnlindquist/mac-clipboard-listener text changed...`
                );
                observer.next('text');
              } catch (error) {
                log.error(error);
              }
            },
            750,
            {
              leading: true,
            }
          )
        );
      }
      // END-REMOVE-MAC
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
    delay(100)
  );

  if (!clipboard$Sub)
    clipboard$Sub = clipboardText$.subscribe(
      async ({ type, app }: ClipboardInfo) => {
        if (isTransient()) {
          log.info(`Ignoring transient clipboard`);
          return;
        }

        const timestamp = format(new Date(), 'yyyy-MM-dd-hh-mm-ss');

        let maybeSecret = false;
        let itemName = ``;
        let value = ``;

        if (type === 'image') {
          try {
            const image = clipboard.readImage();

            const pngImageBuffer = image.toPNG();

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
              log.info(`Ignoring clipboard value > 1280 characters`);
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
            !value.match(/\n/g) &&
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

        const clipboardHistory = await clipboardStore.get('history');

        remove(clipboardHistory, (item) => item.value === value);

        log.silly(`📋 Clipboard`, clipboardItem);

        clipboardHistory.unshift(clipboardItem);
        const maxHistory = kitState?.kenvEnv?.KIT_CLIPBOARD_HISTORY_LIMIT
          ? parseInt(kitState?.kenvEnv?.KIT_CLIPBOARD_HISTORY_LIMIT, 10)
          : 100;

        if (
          // eslint-disable-next-line no-constant-condition
          clipboardHistory.length > maxHistory
        ) {
          clipboardHistory.pop();
        }

        log.info(
          `📋 Clipboard history: ${clipboardHistory.length}/${maxHistory}`
        );

        await clipboardStore.set('history', clipboardHistory);
      }
    );
};

export const startClipboardAndKeyboardWatchers = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  startClipboardMonitor();
  startKeyboardMonitor();
};

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
        txt: boolean;
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
  contents: string
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
  const { metadata, snippet } = await getSnippet(contents);

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
    log.info(`Set snippet: ${script.snippet}`);

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
