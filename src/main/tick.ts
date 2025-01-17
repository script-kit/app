import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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

let prevKey = -1;

// @ts-ignore platform-dependent imports
import type { UiohookKey, UiohookKeyboardEvent, UiohookMouseEvent } from 'uiohook-napi';
let uiohookKeyCode: typeof UiohookKey;

const SPACE = '_';

function isTransient(): boolean {
  const badTypes = [
    'de.petermaurer.TransientPasteboardType',
    'com.typeit4me.clipping',
    'Pasteboard generator type',
    'com.agilebits.onepassword',
    'org.nspasteboard.TransientType',
    'org.nspasteboard.ConcealedType',
    'org.nspasteboard.AutoGeneratedType',
  ];

  for (let i = 0; i < badTypes.length; i++) {
    if (clipboard.has(badTypes[i])) return true;
  }
  return false;
}

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
    const kc = e.keycode;

    if (kc === uiohookKeyCode.Escape) {
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

    let key: string;
    try {
      key = (event as any).key as string;
      log.silly(`key: ${key} code: ${kc}`);
    } catch (error) {
      log.error(error);
      kitState.snippet = '';
      return;
    }

    if (
      kc === uiohookKeyCode.ArrowLeft ||
      kc === uiohookKeyCode.ArrowRight ||
      kc === uiohookKeyCode.ArrowUp ||
      kc === uiohookKeyCode.ArrowDown
    ) {
      log.silly('Ignoring arrow key and clearing snippet');
      kitState.snippet = '';
      kitState.typedText = '';
      return;
    }

    if (kc === uiohookKeyCode.Shift || kc === uiohookKeyCode.ShiftRight) {
      log.silly('Ignoring shift key');
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) {
      log.silly('Ignoring modifier key and clearing snippet');
      kitState.snippet = '';
      if (kc === uiohookKeyCode.Backspace) {
        kitState.typedText = '';
      }
      return;
    }

    if (kc === uiohookKeyCode.Backspace) {
      log.silly('Backspace: Removing last character from snippet');
      kitState.snippet = kitState.snippet.slice(0, -1);
      kitState.typedText = kitState.typedText.slice(0, -1);
    } else if (kc === uiohookKeyCode.Space) {
      log.silly('Space: Adding space to snippet');
      if (prevKey === uiohookKeyCode.Backspace || kitState.snippet.length === 0) {
        kitState.snippet = '';
      } else {
        kitState.snippet += SPACE;
        kitState.typedText = kitState.typedText + ' ';
      }
    } else if (kc === uiohookKeyCode.Quote || key.length > 1 || key === '') {
      kitState.snippet = '';
      kitState.typedText += key;
    } else {
      kitState.snippet += key;
      const tt = kitState.typedText + key;
      const tl = tt.length;
      const limit = kitState.typedLimit;
      kitState.typedText = tl > limit ? tt.slice(-limit) : tt;
      log.silly('kitState.snippet = ', kitState.snippet);
    }
    prevKey = kc;
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

  const clipboardText$ = new Observable<string>((observer) => {
    log.info('Creating new Observable for clipboard...');
    try {
      log.info('Attempting to start clipboard...');

      if (kitState.isMac) {
        log.info('Attempting to start @johnlindquist/mac-clipboard-listener...');
        shims['@johnlindquist/mac-clipboard-listener'].start();

        const onImageChange = debounce(
          () => {
            log.info('@johnlindquist/mac-clipboard-listener image changed...');
            observer.next('image');
          },
          100,
          { leading: true },
        );

        const onTextChange = debounce(
          () => {
            log.info('@johnlindquist/mac-clipboard-listener text changed...');
            observer.next('text');
          },
          100,
          { leading: true },
        );

        shims['@johnlindquist/mac-clipboard-listener'].onClipboardImageChange(onImageChange);
        shims['@johnlindquist/mac-clipboard-listener'].onClipboardTextChange(onTextChange);
      } else {
        const clipboardEventListener = new Clipboard();
        clipboardEventListener.on('text', () => {
          log.info('Clipboard text changed...');
          observer.next('text');
        });

        clipboardEventListener.on('image', () => {
          log.info('Clipboard image changed...');
          observer.next('image');
        });

        clipboardEventListener.listen();

        return () => {
          log.info('🛑 Attempting to stop clipboard watcher');
          clipboardEventListener.close();
          log.info('🛑 Successfully stopped clipboard watcher');
        };
      }
    } catch (e) {
      log.error('🔴 Failed to start clipboard watcher');
      log.error(e);
    }
  }).pipe(
    // biome-ignore lint/suspicious/useAwait: need to return a promise
    switchMap(async (type: string) => {
      if (kitState.isMac && frontmost) {
        try {
          const frontmostApp = frontmost();
          return { type, app: frontmostApp };
        } catch (error) {
          log.warn(error);
        }
      }
      return { type, app: { localizedName: 'Unknown' } };
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
          const pngImageBuffer = image.toPNG();
          log.info(`Converted image to PNG. Size: ${pngImageBuffer.length} bytes`);
          if (pngImageBuffer.length > 20 * 1024 * 1024) {
            log.info('Image size > 20MB. Ignoring...');
            return;
          }

          itemName = `${timestamp}.png`;
          value = path.join(tmpClipboardDir, itemName);
          await writeFile(value, pngImageBuffer);
        } catch (error) {
          log.error(error);
          return;
        }
      } else {
        try {
          const txt = clipboard.readText();
          const txtLen = txt.length;
          if (txtLen > 1280) {
            log.info('Ignoring clipboard value > 1280 characters');
            return;
          }
          const ignoreRegex = kitState?.kenvEnv?.KIT_CLIPBOARD_IGNORE_REGEX;
          if (ignoreRegex && txt.match(ignoreRegex)) {
            log.info('Ignoring clipboard value that matches KIT_CLIPBOARD_IGNORE_REGEX');
            return;
          }
          value = txt;
          const trimmed = txt.trim();
          const endIndex = trimmed.length > 40 ? 40 : trimmed.length;
          itemName = trimmed.slice(0, endIndex);
        } catch (error) {
          log.warn(error);
          return;
        }

        maybeSecret = Boolean(
          (!value.match(/\n/g) &&
            value.match(/^(?=.*[0-9])(?=.*[a-zA-Z])[a-zA-Z0-9!@#$%^&*()-_=+{}[\]<>;:,.|~]{5,}$/i)) ||
            (kitState?.kenvEnv?.KIT_MAYBE_SECRET_REGEX &&
              value.match(new RegExp(kitState?.kenvEnv?.KIT_MAYBE_SECRET_REGEX))),
        );
      }

      const appName = prompts?.prevFocused ? 'Script Kit' : app?.localizedName || 'Unknown';
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

// --- Optimized Snippet Management ---
interface SnippetInfo {
  filePath: string;
  postfix: boolean;
  txt: boolean;
}

const snippetMap = new Map<string, SnippetInfo>();
const snippetPrefixIndex = new Map<string, string[]>();

function updateSnippetPrefixIndex() {
  snippetPrefixIndex.clear();
  const keys = snippetMap.keys();
  for (const key of keys) {
    const kl = key.length;
    const prefix = kl >= 3 ? key.slice(-3) : key;
    let arr = snippetPrefixIndex.get(prefix);
    if (!arr) {
      arr = [];
      snippetPrefixIndex.set(prefix, arr);
    }
    arr.push(key);
  }
}

const subSnippet = subscribeKey(kitState, 'snippet', async (snippet: string) => {
  const sl = snippet.length;
  if (sl < 2) {
    return;
  }

  const potentialPrefix = sl >= 3 ? snippet.slice(-3) : snippet.slice(0, sl);
  const potentialSnippetKeys = snippetPrefixIndex.get(potentialPrefix);
  if (!potentialSnippetKeys) {
    return;
  }

  for (let i = 0; i < potentialSnippetKeys.length; i++) {
    const snippetKey = potentialSnippetKeys[i];
    if (snippet.endsWith(snippetKey)) {
      log.info(`Running snippet: ${snippetKey}`);
      const script = snippetMap.get(snippetKey)!;
      const postfix = script.postfix;

      if (kitConfig.deleteSnippet) {
        const stringToDelete = postfix ? snippet : snippetKey;
        log.info({ stringToDelete, postfix });
        kitState.snippet = '';
        await deleteText(stringToDelete);
      }

      const args = postfix ? [snippet.slice(0, snippet.length - snippetKey.length)] : [];
      const options = {
        force: false,
        trigger: Trigger.Snippet,
      };

      if (script.txt) {
        emitter.emit(KitEvent.RunPromptProcess, {
          scriptPath: kitPath('app', 'paste-snippet.js'),
          args: [...args, '--filePath', script.filePath],
          options,
        });
      } else {
        emitter.emit(KitEvent.RunPromptProcess, {
          scriptPath: script.filePath,
          args,
          options,
        });
      }
    }
  }

  if (snippet.endsWith(SPACE)) {
    kitState.snippet = '';
  }
});

const subIsTyping = subscribeKey(kitState, 'isTyping', () => {
  log.silly(`📕 isTyping: ${kitState.isTyping ? 'true' : 'false'}`);
});

function parseSnippet(contents: string): {
  metadata: Record<string, string>;
  snippet: string;
} {
  const lines = contents.split('\n');
  const metadata: Record<string, string> = {};
  let snippetStartIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(?:\/\/|#)\s{0,2}([\w-]+):\s*(.*)/);
    if (match) {
      metadata[match[1].trim().toLowerCase()] = match[2].trim();
    } else {
      snippetStartIndex = i;
      break;
    }
  }

  const snippet = lines.slice(snippetStartIndex).join('\n');
  return { metadata, snippet };
}

export const addTextSnippet = async (filePath: string) => {
  log.verbose(`Adding text snippet: ${filePath}`);
  // Remove if already added
  {
    const keys = snippetMap.keys();
    const toDelete: string[] = [];
    for (const key of keys) {
      const val = snippetMap.get(key)!;
      if (val.filePath === filePath && val.txt) {
        toDelete.push(key);
      }
    }
    for (let i = 0; i < toDelete.length; i++) {
      snippetMap.delete(toDelete[i]);
    }
  }

  const contents = await readFile(filePath, 'utf8');
  const { metadata } = parseSnippet(contents);

  let expand = metadata?.snippet || metadata?.expand;
  if (expand) {
    let postfix = false;
    if (expand.startsWith('*')) {
      postfix = true;
      expand = expand.slice(1);
    }
    snippetMap.set(expand, {
      filePath,
      postfix,
      txt: true,
    });
  }
  updateSnippetPrefixIndex();
  log.info(`Text snippet: Current snippet map: ${JSON.stringify(Object.fromEntries(snippetMap), null, 2)}`);
};

export const addSnippet = (script: Script) => {
  // Remove if already added
  {
    const keys = snippetMap.keys();
    const toDelete: string[] = [];
    for (const key of keys) {
      const val = snippetMap.get(key)!;
      if (val.filePath === script.filePath && !val.txt) {
        toDelete.push(key);
      }
    }
    for (let i = 0; i < toDelete.length; i++) {
      snippetMap.delete(toDelete[i]);
    }
  }

  const expand = script?.expand || script?.snippet;

  if (script?.kenv !== '' && !kitState.trustedKenvs.includes(script?.kenv)) {
    if (expand) {
      log.info(`Ignoring ${script?.filePath} // Snippet metadata because it's not trusted.`);
      log.info(`Add "${kitState.trustedKenvsKey}=${script?.kenv}" to your .env file to trust it.`);
    }
    return;
  }

  if (expand) {
    log.info(`✂️ Set expansion: ${expand}`);
    let postfix = false;
    let exp = expand;
    if (exp.startsWith('*')) {
      postfix = true;
      exp = exp.slice(1);
    }
    snippetMap.set(exp, {
      filePath: script.filePath,
      postfix,
      txt: false,
    });
  }

  updateSnippetPrefixIndex();
  log.info(`Standard Snippet: Current snippet map: ${JSON.stringify(Object.fromEntries(snippetMap), null, 2)}`);
};

export const removeSnippet = (filePath: string) => {
  const keys = snippetMap.keys();
  const toDelete: string[] = [];
  for (const key of keys) {
    const val = snippetMap.get(key)!;
    if (val.filePath === filePath) {
      toDelete.push(key);
    }
  }
  for (let i = 0; i < toDelete.length; i++) snippetMap.delete(toDelete[i]);
  updateSnippetPrefixIndex();
};

subs.push(subSnippet, subIsTyping);
