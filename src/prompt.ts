/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import { BrowserWindow, screen, app } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';
import { EventEmitter } from 'events';
import minimist from 'minimist';
import { getAssetPath } from './assets';
import { kenvPath } from './helpers';

let promptCache: Store | null = null;
export const getPromptCache = () => {
  return promptCache;
};

export const createPromptCache = () => {
  promptCache = new Store({
    name: 'prompt',
    cwd: kenvPath('cache'),
  });
  promptCache.clear();
};

let promptWindow: BrowserWindow | null = null;
let blurredByKit = false;

export const setBlurredByKit = () => {
  blurredByKit = true;
};

export const hideEmitter = new EventEmitter();

const miniArgs = minimist(process.argv);
const { devTools } = miniArgs;
log.info(process.argv.join(' '), devTools);

export const createPromptWindow = async () => {
  promptWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    hasShadow: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      devTools: process.env.NODE_ENV === 'development' || devTools,
      backgroundThrottling: false,
    },
    alwaysOnTop: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    movable: true,
    skipTaskbar: true,
  });

  promptWindow.setAlwaysOnTop(true, 'floating', 1);
  promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  promptWindow.loadURL(`file://${__dirname}/index.html`);

  promptWindow.webContents.once('did-finish-load', () => {
    promptWindow?.webContents.closeDevTools();
  });

  promptWindow?.setMaxListeners(2);

  promptWindow?.webContents.on('before-input-event', (event: any, input) => {
    if (input.key === 'Escape') {
      if (promptWindow) escapePromptWindow(promptWindow);
    }
  });

  promptWindow?.on('blur', () => {
    hidePromptWindow();
  });

  return promptWindow;
};

export const focusPrompt = () => {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow?.focus();
  }
};

export const escapePromptWindow = (bw: BrowserWindow) => {
  cachePromptPosition(bw);
  hideAppIfNoWindows(bw);
  hideEmitter.emit('hide');
};

export const showPrompt = () => {
  if (promptWindow && !promptWindow?.isVisible()) {
    const cursor = screen.getCursorScreenPoint();
    // Get display with cursor
    const distScreen = screen.getDisplayNearestPoint({
      x: cursor.x,
      y: cursor.y,
    });

    const screenConfig = getPromptCache()?.get(
      `prompt.${String(distScreen.id)}`
    );

    if (screenConfig) {
      const currentScreenBounds = getPromptCache()?.get(
        `prompt.${String(distScreen.id)}.bounds`
      );

      promptWindow.setBounds(currentScreenBounds as any);
    } else {
      const {
        width: screenWidth,
        height: screenHeight,
      } = distScreen.workAreaSize;

      const height = Math.floor(screenHeight / 3);
      const width = Math.floor(height * (4 / 3));
      const { x: workX, y: workY } = distScreen.workArea;
      const x = Math.floor(screenWidth / 2 - width / 2 + workX);
      const y = Math.floor(workY + height / 10);

      promptWindow?.setBounds({ x, y, width, height });
    }

    // TODO: Think through "show on every invoke" logic
    if (!promptWindow?.isVisible()) {
      promptWindow?.show();
      if (devTools) promptWindow?.webContents.openDevTools();
    }
  }

  return promptWindow;
};

export const sendToPrompt = (channel: string, data: any) => {
  // log.info(`>_ ${channel} ${data?.kitScript}`);
  if (promptWindow && !promptWindow.isDestroyed()) {
    // promptWindow?.setBackgroundColor('#00FFFFFF');
    promptWindow?.webContents.send(channel, data);
  }
};

const cachePromptPosition = (bw: BrowserWindow) => {
  const distScreen = screen.getDisplayNearestPoint({
    x: bw.getBounds().x,
    y: bw.getBounds().y,
  });
  const promptBounds = bw.getBounds();
  getPromptCache()?.set(`prompt.${String(distScreen.id)}.bounds`, promptBounds);
};

const hideAppIfNoWindows = (bw: BrowserWindow) => {
  if (bw?.isVisible()) {
    const allWindows = BrowserWindow.getAllWindows();
    // Check if all other windows are hidden
    bw?.hide();
    if (allWindows.every((window) => !window.isVisible())) {
      app?.hide();
    }
  }
};

export const hidePromptWindow = () => {
  if (promptWindow?.webContents.isDevToolsFocused()) return;
  if (blurredByKit) {
    blurredByKit = false;
    return;
  }

  if (promptWindow && promptWindow?.isVisible()) {
    cachePromptPosition(promptWindow);
    hideAppIfNoWindows(promptWindow);
  }
  blurredByKit = false;
};
