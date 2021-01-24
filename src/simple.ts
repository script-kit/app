import { app, ipcMain, screen, globalShortcut } from 'electron';
import path from 'path';
import kill from 'tree-kill';
import { fork, ChildProcess } from 'child_process';
import log from 'electron-log';
import { debounce } from 'lodash';
import { invokePromptWindow, closePromptWindow } from './prompt';
import { SimplePromptOptions } from './types';

export const SIMPLE_PATH = path.join(app.getPath('home'), '.simple');
export const simplePath = (...parts: string[]) =>
  path.join(SIMPLE_PATH, ...parts);

export const SIMPLE_SCRIPTS_PATH = simplePath('scripts');
export const SIMPLE_APP_SCRIPTS_PATH = simplePath('app');
export const SIMPLE_BIN_PATH = simplePath('bin');
export const SIMPLE_NODE_PATH = simplePath('node');

let child: ChildProcess | null = null;

export const processMap = new Map();

export const killChild = () => {
  console.log(`killChild`, child?.pid);
  if (child) {
    log.info(`Exiting: ${child.pid}`);
    kill(child.pid);
    child = null;
  }
};

app.on('ready', () => {
  const escapeHandler = () => {
    log.info(`Escape pressed`);
    closePromptWindow();
    killChild();
  };

  globalShortcut.register('escape', escapeHandler);
});

ipcMain.on('quit', () => {
  closePromptWindow();

  if (child) {
    log.info(`Exiting: ${child.pid}`);
    kill(child.pid);
  }

  app.quit();
});

ipcMain.on('prompt', (event, data) => {
  console.log(`ipcMain.on('prompt')`, { data });
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

const simpleScript = (scriptPath: string, runArgs: string[] = []) => {
  log.info(`\n--- SIMPLE SCRIPT ---`);
  log.info('processMap:', processMap);
  log.info(`EXECUTING: ${scriptPath} ${runArgs.join(' ')}`);
  if (processMap.get(scriptPath)) {
    kill(processMap.get(scriptPath));
    processMap.delete(scriptPath);
    return;
  }

  const resolvePath = scriptPath.startsWith(path.sep)
    ? scriptPath
    : simplePath(scriptPath);

  console.log('attempting to run:', resolvePath);

  child = fork(resolvePath, [...runArgs, '--app'], {
    stdio: 'inherit',
    execPath: simplePath('node', 'bin', 'node'),
    execArgv: [
      '--require',
      'dotenv/config',
      '--require',
      simplePath('preload', 'api.cjs'),
      '--require',
      simplePath('preload', 'app.cjs'),
      '--require',
      simplePath('preload', 'simple.cjs'),
      '--require',
      simplePath('preload', 'system.cjs'),
    ],
    env: {
      PATH: `${simplePath('node', 'bin')}:${process.env.PATH}`,
      SIMPLE_PATH,
      NODE_PATH: simplePath('node_modules'),
      DOTENV_CONFIG_PATH: simplePath('.env'),
    },
  });
  processMap.set(scriptPath, child.pid);

  log.info(`Starting ${child.pid}`);

  child.on('exit', () => {
    log.info(`EXITING:`, scriptPath, '| PID:', child?.pid);
    processMap.delete(scriptPath);
    closePromptWindow();
  });

  child.on('close', () => {
    log.info(`CLOSING`, child?.pid);
    processMap.delete(scriptPath);
    closePromptWindow();
  });

  child.on('disconnect', () => {
    log.info(`DISCONNECTED`, child?.pid);
    processMap.delete(scriptPath);
    closePromptWindow();
  });

  child.on('message', async (data: any) => {
    if (data.from === 'quit') {
      app.quit();
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

    if (data.from === 'show') {
      // showDismissableWindow(data);
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
    processMap.delete(scriptPath);
    child?.kill();
  });
};

export const trySimpleScript = (filePath: string, runArgs: string[] = []) => {
  try {
    simpleScript(filePath, runArgs);
  } catch (error) {
    log.error(error);
  }
};
