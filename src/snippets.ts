import logger from 'keylogger.js';
import log from 'electron-log';
import { Observable, BehaviorSubject } from 'rxjs';
import { filter, scan, tap } from 'rxjs/operators';
import { Script } from '@johnlindquist/kit/types/core';
import { ProcessType } from '@johnlindquist/kit/cjs/enum';
import { processes } from './process';
import { kitState } from './state';

const snippetMap = new Map<string, Script>();

export const startSnippets = () => {
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

  snippet.subscribe(() => {
    log.info(`🧠 Snippet`, text);
    if (snippetMap.has(text)) {
      const script = snippetMap.get(text) as Script;
      processes.add(ProcessType.Background, script.filePath);
      text = ``;
    }
  });
};

export const addSnippet = (script: Script) => {
  if (script?.snippet) snippetMap.set(script.snippet, script);
};
