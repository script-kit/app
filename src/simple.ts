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
} from './prompt';
import { showNotification } from './notifications';
import { show } from './show';
import { simplePath, stringifyScriptArgsKey } from './helpers';
import { cache } from './cache';

let child: ChildProcess | null = null;
let script = '';
let key = '';
let args: any[] = [];

export const processMap = new Map();

ipcMain.on('quit', () => {
  log.warn(`>>> QUIT <<<`);
  reset();

  app.quit();
});

ipcMain.on('prompt', (_event, { input, value }) => {
  args.push(value);
  if (child) {
    child?.send(value);
  } else {
    trySimpleScript(script, args);
  }
});

ipcMain.on(
  'input',
  debounce((_event, input) => {
    if (child && input) {
      child?.send({ from: 'input', input });
    } else if (input) {
      trySimpleScript(script, [...args, '--simple-input', input]);
    }
  }, 250)
);

ipcMain.on(
  'selected',
  debounce((_event, choice: any) => {
    if (choice?.preview) {
      showPreview(choice.preview);
    } else {
      hidePreview();
    }
  }, 250)
);

const reset = () => {
  if (child) {
    log.info(`Exiting: ${child.pid}`);
    processMap.delete(child?.pid);
    child?.removeAllListeners();
    child?.kill();
    child = null;
    script = '';
    key = '';
    args = [];
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
  reset();
  invokePromptWindow('clear', {});
  log.info(`simpleScript`, scriptPath, runArgs);

  const resolvePath = scriptPath.startsWith(path.sep)
    ? scriptPath
    : simplePath(scriptPath);

  const codePath = 'usr/local/bin/';

  ({ key, script } = stringifyScriptArgsKey(scriptPath, runArgs));

  const cachedResult: any = cache.get(key);
  if (cachedResult) {
    log.info(`GOT CACHE:`, key);
    invokePromptWindow('prompt', cachedResult);

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

    if (data.from === 'hide') {
      app?.hide();
      return;
    }
    if (data.from === 'setLogin') {
      app.setLoginItemSettings(data);
      return;
    }
    if (data.from === 'quit') {
      if (child) {
        log.info(`Exiting: ${child.pid}`);
        reset();
      }
      app.exit();
      return;
    }
    if (data.from === 'update') {
      autoUpdater.checkForUpdatesAndNotify();
      return;
    }

    if (data.from === 'debug') {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      debugToggle();
      return;
    }

    if (data.from === 'notify') {
      showNotification(data.html, data.options);
      return;
    }

    if (data.from === 'show') {
      const showWindow = show(data.html, data.options);
      if (showWindow && !showWindow.isDestroyed()) {
        showWindow.on('close', () => {
          focusPrompt();
        });
      }
      return;
    }
    if (data.from === 'prompt') {
      ({ script, key } = stringifyScriptArgsKey(script, args));
      if (data.cache) cache.set(key, data);
      invokePromptWindow('prompt', data);

      return;
    }

    if (data.from === 'updateChoices') {
      invokePromptWindow('updateChoices', data?.choices);
      return;
    }

    if (data.from === 'run') {
      trySimpleScript(data.scriptPath, data.runArgs);
      return;
    }

    if (data.from === 'system') {
      const cursor = screen.getCursorScreenPoint();
      // Get display with cursor
      const activeScreen = screen.getDisplayNearestPoint({
        x: cursor.x,
        y: cursor.y,
      });

      child?.send({ from: 'system', activeScreen });
      return;
    }

    if (data.from === 'log') {
      log.info(data.message);
    }
  });

  child.on('error', (error) => {
    log.warn({ error });
    reset();
  });

  const handleStdout = (data: string) => {
    const line = data.toString();
    debug(line);
  };

  (child as any).stdout.on('data', handleStdout);
};

export const trySimpleScript = (filePath: string, runArgs: string[] = []) => {
  try {
    simpleScript(filePath, runArgs);
  } catch (error) {
    log.error(error);
  }
};
