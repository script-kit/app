import logger from 'keylogger.js';
import log from 'electron-log';
import { subscribeKey } from 'valtio/utils';
import { Script } from '@johnlindquist/kit/types/core';
import { keyboard, Key } from '@nut-tree/nut-js';
import { kitState } from './state';
import { runPromptProcess } from './kit';

const snippetMap = new Map<string, Script>();
/* eslint-disable no-useless-computed-key */
const shiftMap = {
  ['1']: '!',
  ['2']: '@',
  ['3']: '#',
  ['4']: '$',
  ['5']: '%',
  ['6']: '^',
  ['7']: '&',
  ['8']: '*',
  ['9']: '(',
  ['0']: ')',
  ['-']: '_',
  ['=']: '+',
  ['`']: '~',
  ['[']: '{',
  [']']: '}',
  ['\\']: '|',
  [';']: ':',
  ["'"]: '"',
  [',']: '<',
  ['.']: '>',
  ['/']: '?',
  [' ']: ' ',
};

export const subSnippets = () => {
  subscribeKey(kitState, 'snippet', async (snippet = ``) => {
    // Use `;;` as "end"?
    if (snippetMap.has(snippet)) {
      log.info(`Running snippet: ${snippet}`);
      const script = snippetMap.get(snippet) as Script;
      const prevDelay = keyboard.config.autoDelayMs;
      keyboard.config.autoDelayMs = 0;
      snippet.split('').forEach(async (char) => {
        await keyboard.type(Key.Backspace);
      });
      keyboard.config.autoDelayMs = prevDelay;
      runPromptProcess(script.filePath);
    }
  });

  subscribeKey(kitState, 'isTyping', () => {
    kitState.snippet = ``;
  });
};

export const startSnippets = async () => {
  log.info('📗 Starting snippets...');

  // subscribeKey(kitState, 'snippet', (snippet) => {
  //   log.info(`Snippet: ${snippet}`);
  // });

  logger.start((key, isKeyUp) => {
    if (key === 'Shift') {
      kitState.isShiftDown = !isKeyUp;
      return;
    }

    if (isKeyUp && key.length !== 1) {
      kitState.snippet = ``;
    } else if (!isKeyUp) {
      /* eslint-disable no-lonely-if */
      if (kitState.isTyping) {
        kitState.snippet = ``;
      } else {
        if (key.length === 1) {
          if (kitState.isShiftDown) {
            if ((shiftMap as any)?.[key]) {
              kitState.snippet = `${kitState.snippet}${
                (shiftMap as any)?.[key]
              }`;
            } else {
              kitState.snippet = `${kitState.snippet}${key.toUpperCase()}`;
            }
          } else {
            kitState.snippet = `${kitState.snippet}${key}`;
          }
        } else {
          kitState.snippet = ``;
        }
      }
    }
  });
};

export const maybeStopKeyLogger = () => {
  if (snippetMap.size === 0 && kitState.keyloggerOn) {
    log.info('📕 Stopping snippets...');
    logger.stop();
    kitState.keyloggerOn = false;
  }
};

export const addSnippet = (script: Script) => {
  for (const [key, value] of snippetMap.entries()) {
    if (value.filePath === script.filePath) {
      snippetMap.delete(key);
    }
  }

  if (script?.snippet) {
    snippetMap.set(script.snippet, script);
    if (!kitState.keyloggerOn) {
      startSnippets();
      kitState.keyloggerOn = true;
    }
  } else {
    maybeStopKeyLogger();
  }
};

export const removeSnippet = (filePath: string) => {
  for (const [key, value] of snippetMap.entries()) {
    if (value.filePath === filePath) {
      snippetMap.delete(key);
    }
  }

  maybeStopKeyLogger();
};
