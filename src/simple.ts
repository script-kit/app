import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { autoUpdater } from 'electron-updater';

import path from 'path';
import kill from 'tree-kill';
import { fork, ChildProcess } from 'child_process';
import log from 'electron-log';
import { debounce } from 'lodash';
import { invokePromptWindow, hidePromptWindow, focusPrompt } from './prompt';
import { showNotification } from './notifications';
import { show } from './show';
import { createDebug, killDebug } from './debug';

export const SIMPLE_PATH = path.join(app.getPath('home'), '.simple');
export const simplePath = (...parts: string[]) =>
  path.join(SIMPLE_PATH, ...parts);

export const SIMPLE_SCRIPTS_PATH = simplePath('scripts');
export const SIMPLE_APP_SCRIPTS_PATH = simplePath('app');
export const SIMPLE_BIN_PATH = simplePath('bin');
export const SIMPLE_NODE_PATH = simplePath('node');

let child: ChildProcess | null = null;
let debugWindow: BrowserWindow | null = null;

export const processMap = new Map();

ipcMain.on('quit', () => {
  console.log(`>>> QUIT <<<`);
  if (child) {
    log.info(`Exiting: ${child.pid}`);
    child.removeAllListeners();
    kill(child.pid);
  }

  app.quit();
});

ipcMain.on('prompt', (event, data) => {
  console.log(`APP -> ${processMap.get(child?.pid).split('/').pop()}`);

  if (child) {
    child?.send(data);
  }
});

ipcMain.on(
  'input',
  debounce((event, input) => {
    if (child) {
      child?.send({ from: 'input', input });
    }
  }, 250)
);

const killChild = () => {
  console.log(`killChild`, child?.pid);
  if (child) {
    log.info(`Exiting: ${child.pid}`);
    kill(child.pid);
    child = null;
  }
};

let debugLineIndex = 0;
export const debug = (...args: any) => {
  const line = args
    .map((arg: any) => JSON.stringify(arg))
    .join(' - ')
    .replace('\n', '');
  log.info(line);
  if (debugWindow && !debugWindow?.isDestroyed()) {
    debugWindow.webContents.send('debug', {
      line,
      i: debugLineIndex += 1,
    });
  }

  if (line.startsWith('Error:')) {
    show(
      `<div class="bg-black text-green-500 font-mono h-screen">${line}</div>`
    );
  }
};

const simpleScript = (scriptPath: string, runArgs: string[] = []) => {
  log.info(`\n--- SIMPLE SCRIPT ---`);
  log.info('processMap:', [...processMap.entries()]);
  log.info(`EXECUTING: ${scriptPath.split('/').pop()} ${runArgs.join(' ')}`);
  // TODO: Support long-running scripts e.g. Crons

  const resolvePath = scriptPath.startsWith(path.sep)
    ? scriptPath
    : simplePath(scriptPath);

  const codePath = 'usr/local/bin/';

  processMap.delete(child?.pid);
  child?.removeAllListeners();
  child?.kill();
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
      PATH: `${simplePath('node', 'bin')}:${codePath}:${process.env.PATH}`,
      SIMPLE_PATH,
      NODE_PATH: simplePath('node_modules'),
      DOTENV_CONFIG_PATH: simplePath('.env'),
    },
  });
  processMap.set(child.pid, scriptPath);

  log.info(`Starting ${child.pid}`);

  const tryClean = (on: string) => () => {
    try {
      debug(on, scriptPath, '| PID:', child?.pid);
      processMap.delete(child?.pid);
      hidePromptWindow();
    } catch (error) {
      log.warn(error);
    }
  };

  child.on('exit', tryClean('EXIT'));
  child.on('close', tryClean('CLOSE'));
  child.on('disconnect', tryClean('DISCONNECT'));
  child.on('message', async (data: any) => {
    if (data.from === 'quit') {
      if (child) {
        log.info(`Exiting: ${child.pid}`);
        child.removeAllListeners();
        kill(child.pid);
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
    // console.log({ data });
    if (data.from === 'prompt') {
      invokePromptWindow('prompt', data);

      return;
    }
    if (data.from === 'choices') {
      invokePromptWindow('lazy', data?.choices);

      return;
    }

    if (data.from === 'run') {
      console.log({ data });
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
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
    console.log({ error });
    child?.send(error);
    processMap.delete(child?.pid);
    child?.kill();
  });

  const handleStdout = (data: string) => {
    const line = data.toString();
    debug(line);
  };

  (child as any).stdout.on('data', handleStdout);
};

export const debugToggle = () => {
  debugWindow = createDebug();
  if (debugWindow) {
    debugWindow?.webContents.on(
      'before-input-event',
      (event: any, input: any) => {
        if (input.key === 'Escape') {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          killDebug();
          debugWindow = null;
        }
      }
    );
  }
};

export const trySimpleScript = (filePath: string, runArgs: string[] = []) => {
  try {
    simpleScript(filePath, runArgs);
  } catch (error) {
    log.error(error);
  }
};
