import { app, BrowserWindow, ipcMain, Event, Tray, screen } from 'electron';
import path from 'path';
import kill from 'tree-kill';
import { fork, ChildProcess } from 'child_process';
import log from 'electron-log';
import { debounce } from 'lodash';
import { getPromptWindow, closePromptWindow } from './prompt';
import { SimplePromptOptions } from './types';

export const SIMPLE_PATH = path.join(app.getPath('home'), '.simple');
export const simplePath = (...parts: string[]) =>
  path.join(SIMPLE_PATH, ...parts);

export const SIMPLE_SCRIPTS_PATH = path.join(SIMPLE_PATH, 'scripts');
export const SIMPLE_BIN_PATH = path.join(SIMPLE_PATH, 'bin');
export const SIMPLE_NODE_PATH = path.join(SIMPLE_PATH, 'node');

let child: ChildProcess | null = null;

export const processMap = new Map();

ipcMain.on('escape', () => {
  log.info(`Escape pressed`);
  closePromptWindow();

  if (child) {
    log.info(`Exiting: ${child.pid}`);
    kill(child.pid);
  }
});

ipcMain.on('prompt', (event, data) => {
  // console.log(`ipcMain.on('prompt')`, { data });
  if (child) {
    child?.send(data);
  }
  closePromptWindow();
});

ipcMain.on(
  'input',
  debounce((event, input) => {
    console.log({ input });
    if (child) {
      child?.send({ from: 'input', input });
    }
    // prompt?.close();
  }, 250)
);

// https://www.electronjs.org/docs/api/web-contents#event-before-input-event
interface WebContentsInput {
  key: string;
  code: number;
}

const displayPrompt = (data: SimplePromptOptions) => {
  log.info('prompt', data);
  const prompt = getPromptWindow();
  prompt.setMaxListeners(1);

  if (prompt) {
    const cursor = screen.getCursorScreenPoint();
    // Get display with cursor
    const distScreen = screen.getDisplayNearestPoint({
      x: cursor.x,
      y: cursor.y,
    });

    const {
      width: screenWidth,
      height: screenHeight,
    } = distScreen.workAreaSize;
    const width = Math.floor((screenWidth / 4) * distScreen.scaleFactor);
    const height = Math.floor((screenHeight / 4) * distScreen.scaleFactor);
    const x = Math.floor(screenWidth * distScreen.scaleFactor - width); // * distScreen.scaleFactor
    const { y } = distScreen.workArea;
    prompt.setBounds({ x, y, width, height });

    prompt.loadURL(`file://${__dirname}/index.html`);

    prompt.webContents.once('did-finish-load', () => {
      prompt.webContents.send('prompt', data);
      prompt.webContents.closeDevTools();

      prompt.show();
    });
  }
};

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
      SIMPLE_PATH,
      NODE_PATH: simplePath('node_modules'),
      DOTENV_CONFIG_PATH: simplePath('.env'),
    },
  });
  processMap.set(scriptPath, child.pid);

  child.on('exit', () => {
    log.info(`EXITING:`, scriptPath, '| PID:', child?.pid);
    processMap.delete(scriptPath);
    closePromptWindow();
  });

  child.on('close', () => {
    // log.info(`CLOSING`, child.pid)
    processMap.delete(scriptPath);
    closePromptWindow();
  });

  child.on('disconnect', () => {
    // log.info(`DISCONNECTED`, child.pid)
    processMap.delete(scriptPath);
    closePromptWindow();
  });

  child.on('message', async (data: any) => {
    // console.log({ data });
    if (data.from === 'prompt') {
      displayPrompt(data);
      return;
    }
    if (data.from === 'choices') {
      // console.log(`data.from === choices:`, data.choices);
      const prompt = getPromptWindow();
      prompt.webContents.send('lazy', data?.choices);
      return;
    }

    if (data.from === 'run') {
      console.log({ data });
      trySimpleScript(data.scriptPath, data.runArgs);
      return;
    }

    if (data.from === 'show') {
      // showDismissableWindow(data);
    }

    if (data.from === 'log') {
      log.info(data.message);
      return;
    }
  });

  child.on('error', (error) => {
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
