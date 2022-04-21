import { app } from 'electron';
import log from 'electron-log';
import { Observable } from 'rxjs';
import { filter, scan, tap } from 'rxjs/operators';
import { Script } from '@johnlindquist/kit/types/core';
import { keyboard, Key } from '@nut-tree/nut-js';
import { kitState } from './state';
import { runPromptProcess } from './kit';

const snippetMap = new Map<string, Script>();

export const startSnippets = async () => {
  const pathToKeylogger = `${
    process.env.NODE_ENV === 'development'
      ? ''
      : `${app.getAppPath()}.unpacked/node_modules/`
  }keylogger.js/dist/index.js`;
  log.info(`Path to keylogger`, pathToKeylogger);
  // const logger = (await import(
  //   pathToKeylogger
  // )) as typeof import('keylogger.js');
  const logger = await import('keylogger.js');

  type KeyEvent = {
    key: string;
    isKeyUp: boolean;
    keyCode: number;
  };

  let text = ``;
  log.info(`BEFORE new Observable`);
  const o = new Observable<KeyEvent>((observer) => {
    log.info(`STARTING LOGGER`);
    try {
      log.info(`logger:`, logger);
      logger.start((key, isKeyUp, keyCode) => {
        log.info({ key, isKeyUp, keyCode });
        observer.next({ key, isKeyUp, keyCode });
      });
    } catch (error) {
      log.error(`FAILED TO START LOGGER`, error);
    }

    return () => {
      log.info(`STOPPING LOGGER`);
      // logger.stop();
    };
  });

  const snippet = o.pipe(
    filter(({ key, isKeyUp, keyCode }) => {
      return !isKeyUp && !kitState?.isTyping;
    }),
    scan((acc, { key, isKeyUp, keyCode }) => {
      if (key.length > 1) {
        return ``;
      }

      return `${acc}${key}`;
    }, ``),
    tap((currentText) => {
      text = currentText;
    })
  );

  snippet.subscribe(async () => {
    log.info(`🧠 Snippet`, text);
    if (snippetMap.has(text)) {
      const script = snippetMap.get(text) as Script;
      const backspaces = text.split('').map(() => Key.Backspace);
      log.info(backspaces);
      const prevDelay = keyboard.config.autoDelayMs;
      keyboard.config.autoDelayMs = 0;
      log.info(`Key.Backspace`, Key.Backspace);
      text.split('').forEach(async (char) => {
        await keyboard.type(Key.Backspace);
      });
      keyboard.config.autoDelayMs = prevDelay;
      runPromptProcess(script.filePath);
      text = ``;
    }
  });
};

export const addSnippet = (script: Script) => {
  if (script?.snippet) {
    for (const [key, value] of snippetMap.entries()) {
      if (value.filePath === script.filePath) {
        snippetMap.delete(key);
      }
    }

    snippetMap.set(script.snippet, script);
  }
};

export const removeSnippet = (filePath: string) => {
  for (const [key, value] of snippetMap.entries()) {
    if (value.filePath === filePath) {
      snippetMap.delete(key);
    }
  }
};
