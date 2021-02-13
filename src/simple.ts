/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { app, ipcMain, screen } from 'electron';
import { autoUpdater } from 'electron-updater';

import path from 'path';
import { fork, ChildProcess } from 'child_process';
import log from 'electron-log';
import { debounce } from 'lodash';
import {
  invokePromptWindow,
  hidePromptWindow,
  focusPrompt,
  showPreview,
  hidePreview,
  debugToggle,
  debugLine,
  hideEmitter,
  promptCache,
} from './prompt';
import { showNotification } from './notifications';
import { show } from './show';
import { simplePath, stringifyScriptArgsKey } from './helpers';
import { cache } from './cache';

let child: ChildProcess | null = null;
let script = '';
let key = '';
let cacheKeyParts: any[] = [];

const consoleLog = log.create('consoleLog');
consoleLog.transports.file.resolvePath = () =>
  simplePath('logs', 'console.log');

export const processMap = new Map();

ipcMain.on('VALUE_SUBMITTED', (_event, { value }) => {
  cacheKeyParts.push(value);
  if (child) {
    child?.send(value);
  } else {
    trySimpleScript(script, cacheKeyParts);
  }
});

ipcMain.on(
  'INPUT_CHANGED',
  debounce((_event, input) => {
    if (child && input) {
      child?.send({ from: 'INPUT_CHANGED', input });
    } else if (input) {
      trySimpleScript(script, [...cacheKeyParts, '--simple-input', input]);
    }
  }, 250)
);

ipcMain.on(
  'VALUE_SELECTED',
  debounce((_event, choice: any) => {
    if (choice?.preview) {
      showPreview(choice.preview);
    } else {
      hidePreview();
    }
  }, 250)
);

const reset = () => {
  log.info(`---RESET: ${cacheKeyParts}`);
  cacheKeyParts = [];
  if (child) {
    log.info(`Exiting: ${child.pid}`);
    processMap.delete(child?.pid);
    child?.removeAllListeners();
    child?.kill();
    child = null;
    script = '';
    key = '';
  }
};

hideEmitter.on('hide', reset);

export const debug = (...debugArgs: any) => {
  const line = debugArgs.join(' ').replace(/\n/g, '');
  debugLine(line);

  if (line.startsWith('Error:')) {
    show(
      `<div class="bg-black text-green-500 font-mono h-screen">${line}</div>`
    );
  }
};

const simpleScript = (scriptPath: string, runArgs: string[] = []) => {
  invokePromptWindow('CLEAR_PROMPT', {});

  const resolvePath = scriptPath.startsWith(path.sep)
    ? scriptPath
    : simplePath(scriptPath);

  const codePath = 'usr/local/bin/';

  ({ key, script } = stringifyScriptArgsKey(scriptPath, runArgs));

  log.info(`>>> GET: ${key}`);
  const cachedResult: any = cache.get(key);
  if (cachedResult) {
    log.info(`GOT CACHE:`, key);

    // if (
    //   key.endsWith(cacheKeyParts[cacheKeyParts.length - 1]) &&
    //   cacheKeyParts.length > 1
    // ) {
    //   log.info(`Key:Parts ${key}:${cacheKeyParts}`);
    //   key = '';
    //   cacheKeyParts = cacheKeyParts.slice(1);
    //   log.info(`Key:Parts ${key}:${cacheKeyParts}`);
    // }

    // if (
    //   cacheKeyParts.includes(
    //     key
    //       .split('.')
    //       .filter((part) => !part.startsWith('-'))
    //       .pop()
    //   )
    // ) {
    //   log.info(`Parts includes: ${key}:${cacheKeyParts}`);
    // }
    invokePromptWindow('SHOW_PROMPT_WITH_DATA', cachedResult);

    return;
  }

  log.info(`FORK: ${resolvePath} ${[...runArgs, '--app']}`);

  child = fork(resolvePath, [...runArgs, '--app'], {
    silent: true,
    // stdio: 'inherit',
    execPath: simplePath('node', 'bin', 'node'),
    execArgv: [
      '--require',
      'dotenv/config',
      '--require',
      simplePath('preload', 'api.cjs'),
      '--require',
      simplePath('preload', 'simple.cjs'),
      '--require',
      simplePath('preload', 'mac.cjs'),
    ],
    env: {
      SIMPLE_CONTEXT: 'app',
      SIMPLE_MAIN: resolvePath,
      PATH: `${simplePath('node', 'bin')}:${codePath}:${process.env.PATH}`,
      SIMPLE_PATH: simplePath(),
      NODE_PATH: simplePath('node_modules'),
      DOTENV_CONFIG_PATH: simplePath('.env'),
      SIMPLE_APP_VERSION: app.getVersion(),
    },
  });
  processMap.set(child.pid, scriptPath);

  log.info(`Starting ${child.pid} - ${scriptPath}`);

  const tryClean = (on: string) => () => {
    try {
      debug(on, scriptPath, '| PID:', child?.pid);
      log.info(`tryClean...`, scriptPath);
      hidePromptWindow(true);
    } catch (error) {
      log.warn(error);
    }
  };

  child.on('close', tryClean('CLOSE'));
  child.on('message', async (data: any) => {
    log.info('> FROM:', data.from);

    switch (data.from) {
      case 'CLEAR_CACHE':
        promptCache.clear();
        cache.clear();
        break;

      case 'CONSOLE_LOG':
        consoleLog.info(data.log);
        break;

      case 'GET_SCREEN_INFO':
        const cursor = screen.getCursorScreenPoint();
        // Get display with cursor
        const activeScreen = screen.getDisplayNearestPoint({
          x: cursor.x,
          y: cursor.y,
        });

        child?.send({ from: 'SCREEN_INFO', activeScreen });
        break;

      case 'HIDE_APP':
        app?.hide();
        break;

      case 'LOG_MESSAGE':
        log.info(data.message);
        break;

      case 'QUIT_APP':
        reset();
        app.exit();
        break;

      case 'RUN_SCRIPT':
        trySimpleScript(data.scriptPath, data.runArgs);
        break;

      case 'SET_LOGIN':
        app.setLoginItemSettings(data);
        break;

      case 'SHOW_NOTIFICATION':
        showNotification(data.html, data.options);
        break;

      case 'SHOW_PROMPT_WITH_DATA':
        ({ script, key } = stringifyScriptArgsKey(script, cacheKeyParts));

        if (data.cache && !cache.get(key)) {
          log.info(`>>>SET: ${key}`);
          cache.set(key, data);
        }
        invokePromptWindow('SHOW_PROMPT_WITH_DATA', data);
        break;

      case 'SHOW_RESULTS':
        const showWindow = show(data.html, data.options);
        if (showWindow && !showWindow.isDestroyed()) {
          showWindow.on('close', () => {
            focusPrompt();
          });
        }
        break;

      case 'TOGGLE_DEBUGGER':
        debugToggle();
        break;

      case 'UPDATE_APP':
        autoUpdater.checkForUpdatesAndNotify();

        break;

      case 'UPDATE_PROMPT_CHOICES':
        invokePromptWindow('UPDATE_PROMPT_CHOICES', data?.choices);
        break;

      case 'UPDATE_PROMPT_INFO':
        invokePromptWindow('UPDATE_PROMPT_INFO', data?.info);
        break;

      case 'UPDATE_PROMPT_MESSAGE':
        invokePromptWindow('UPDATE_PROMPT_MESSAGE', data?.message);
        break;

      default:
        log.info(`Unknown message ${data.from}`);
    }
  });

  child.on('error', (error) => {
    log.warn({ error });
    reset();
  });

  (child as any).stdout.on('data', (data: string) => {
    const line = data.toString();
    debug(line);
  });
};

export const trySimpleScript = (filePath: string, runArgs: string[] = []) => {
  try {
    simpleScript(filePath, runArgs);
  } catch (error) {
    log.error(error);
  }
};
