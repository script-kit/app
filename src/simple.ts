import { app, BrowserWindow, ipcMain, Event, Tray, screen } from 'electron';
import path from 'path';
import kill from 'tree-kill';
import { fork, ChildProcess } from 'child_process';
import log from 'electron-log';
import { getPromptWindow } from './prompt';
import { SimplePromptOptions } from './types';

export const SIMPLE_PATH = path.join(app.getPath('home'), '.simple');
export const SIMPLE_SCRIPTS_PATH = path.join(SIMPLE_PATH, 'scripts');
export const SIMPLE_BIN_PATH = path.join(SIMPLE_PATH, 'bin');

let child: ChildProcess | null = null;

export const processMap = new Map();

ipcMain.on('prompt', (event, data) => {
  const prompt = getPromptWindow();
  if (child) {
    child?.send(data);
    prompt?.hide();
  }
});

// https://www.electronjs.org/docs/api/web-contents#event-before-input-event
interface WebContentsInput {
  key: string;
  code: number;
}

const closeOnEscape = (prompt: BrowserWindow) => (
  event: Event,
  input: WebContentsInput
) => {
  if (input.key === 'Escape' || input.key === 'Esc' || input.code === 27) {
    event.preventDefault();
    if (child) {
      log.info(child.pid);
      kill(child.pid);
      prompt.hide();
    }
    log.info(`Escape pressed`);
  }
};

const displayPrompt = (data: SimplePromptOptions) => {
  log.info('prompt', data);
  const prompt = getPromptWindow();

  if (prompt) {
    const cursor = screen.getCursorScreenPoint();
    // Get display with cursor
    const distScreen = screen.getDisplayNearestPoint({
      x: cursor.x,
      y: cursor.y,
    });

    const { width, height } = distScreen.workAreaSize;

    log.info('-------');
    log.info('Position:', width, '-', prompt.getPosition()[0]);
    log.info('-------');

    prompt.setSize(
      Math.floor((width - prompt.getPosition()[0]) * distScreen.scaleFactor),
      600 // Math.floor((height / 7) * distScreen.scaleFactor)
    );
    log.info('size:', prompt.getSize());
    prompt.loadURL(`file://${__dirname}/index.html`);
    prompt.webContents.on('did-finish-load', () => {
      prompt.webContents.on('before-input-event', closeOnEscape(prompt));
      prompt.webContents.send('prompt', data);
      prompt.webContents.closeDevTools();

      prompt.show();
    });
  }
};

const simpleScript = (execPath: string, execArgv: string[] = []) => {
  log.info('processMap:', processMap);
  log.info(`EXECUTING: ${execPath} ${execArgv.join(' ')}`);
  if (processMap.get(execPath)) {
    kill(processMap.get(execPath));
    processMap.delete(execPath);
    return;
  }

  child = fork('', ['--app'], {
    stdio: 'inherit',
    execPath,
    execArgv,
  });
  processMap.set(execPath, child.pid);

  child.on('exit', () => {
    log.info(`EXITING:`, execPath, '| PID:', child?.pid);
    processMap.delete(execPath);
  });

  child.on('close', () => {
    // log.info(`CLOSING`, child.pid)
    processMap.delete(execPath);
  });

  child.on('disconnect', () => {
    // log.info(`DISCONNECTED`, child.pid)
    processMap.delete(execPath);
  });

  child.on('message', async (data: SimplePromptOptions) => {
    if (data.from === 'prompt') {
      displayPrompt(data);
    }
    if (data.from === 'need') {
      displayPrompt(data);
    }
    if (data.from === 'show') {
      // showDismissableWindow(data);
    }

    if (data.from === 'log') {
      log.info(data.message);
    }
  });

  child.on('error', (error) => {
    child?.send(error);
    processMap.delete(execPath);
    child?.kill();
  });
};

export const trySimpleScript = (execPath: string, execArgv: string[] = []) => {
  try {
    simpleScript(execPath, execArgv);
  } catch (error) {
    log.error(error);
  }
};
