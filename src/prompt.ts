/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import { BrowserWindow, screen, nativeTheme, app } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';
import { EventEmitter } from 'events';
import minimist from 'minimist';
import { getAssetPath } from './assets';
import { kenvPath } from './helpers';
import { PROMPT_BOUNDS_UPDATED } from './channels';

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

export const setBlurredByKit = (value = true) => {
  blurredByKit = value;
};

export const hideEmitter = new EventEmitter();

const miniArgs = minimist(process.argv);
const { devTools } = miniArgs;
log.info(process.argv.join(' '), devTools);

export const createPromptWindow = async () => {
  promptWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    backgroundColor: nativeTheme.shouldUseDarkColors
      ? '#33000000'
      : '#C0FFFFFF',
    vibrancy: nativeTheme.shouldUseDarkColors ? 'dark' : 'medium-light',
    show: false,
    hasShadow: true,
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

  const resize = () => {
    // if (!promptWindow) return;

    // const distScreen = getCurrentScreen();
    // const promptBounds = promptWindow.getBounds();

    // console.log(`CACHE BY RESIZE`, promptBounds);
    // getPromptCache()?.set(
    //   `prompt.${String(distScreen.id)}.bounds`,
    //   promptBounds
    // );

    // log.info(`CACHING PROMPT:`, promptBounds);

    // sendToPrompt(PROMPT_BOUNDS_UPDATED, promptBounds);

    cachePromptPosition(true);
  };

  promptWindow?.on('will-resize', resize);

  return promptWindow;
};

export const focusPrompt = () => {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow?.focus();
  }
};

export const escapePromptWindow = (bw: BrowserWindow) => {
  cachePromptPosition();
  hideAppIfNoWindows(bw);
  hideEmitter.emit('hide');
};

const getCurrentScreen = () => {
  const cursor = screen.getCursorScreenPoint();
  // Get display with cursor
  return screen.getDisplayNearestPoint({
    x: cursor.x,
    y: cursor.y,
  });
};

export const getCurrentScreenPromptCache = () => {
  const currentScreen = getCurrentScreen();
  const currentPromptCache = getPromptCache()?.get(
    `prompt.${String(currentScreen.id)}`
  );

  return (currentPromptCache as any)?.bounds as Size;
};

export const getCurrentScreenPromptBounds = () => {
  const currentPromptCache = getCurrentScreenPromptCache();

  if (!currentPromptCache) return null;

  const currentScreen = getCurrentScreen();
  const bounds = getPromptCache()?.get(
    `prompt.${String(currentScreen.id)}.bounds`
  );

  return currentPromptCache ? bounds : null;
};

export const setDefaultBounds = () => {
  const currentScreen = getCurrentScreen();

  const {
    width: screenWidth,
    height: screenHeight,
  } = currentScreen.workAreaSize;

  const height = Math.round(screenHeight / 3);
  const width = Math.round(height * (4 / 3));
  const { x: workX, y: workY } = currentScreen.workArea;
  const x = Math.round(screenWidth / 2 - width / 2 + workX);
  const y = Math.round(workY + height / 10);

  console.log(`DEFAULT BOUNDS`, height);
  promptWindow?.setBounds({ x, y, width, height });
};

export const showPrompt = () => {
  if (promptWindow && !promptWindow?.isVisible()) {
    const currentScreenpPromptBounds = getCurrentScreenPromptBounds();

    if (currentScreenpPromptBounds) {
      console.log(`SET CURRENT BOUNDS`, currentScreenpPromptBounds.height);

      // promptWindow.setBounds(currentScreenpPromptBounds as any);
    } else {
      setDefaultBounds();
    }

    // TODO: Think through "show on every invoke" logic
    if (!promptWindow?.isVisible()) {
      promptWindow?.show();
      promptWindow.setVibrancy(
        nativeTheme.shouldUseDarkColors ? 'dark' : 'medium-light'
      );
      promptWindow.setBackgroundColor(
        nativeTheme.shouldUseDarkColors ? '#33000000' : '#C0FFFFFF'
      );
      if (devTools) promptWindow?.webContents.openDevTools();
    }
  }

  return promptWindow;
};

type Size = {
  width: number;
  height: number;
};
export const resizePrompt = ({ height }: Size) => {
  console.log(`RESIZE:`, height);
  promptWindow?.setBounds({ height });
};

export const growPrompt = ({ height }: Size) => {
  const bounds = getCurrentScreenPromptBounds() as { height: number };
  let newHeight = height;

  if (bounds && newHeight > bounds?.height) {
    if (newHeight > bounds.height) newHeight = bounds.height;
  }

  console.log(`GROW:`, { newHeight, boundsHeight: bounds?.height });
  promptWindow?.setBounds({ height: newHeight });
};

export const sendToPrompt = (channel: string, data: any) => {
  // log.info(`>_ ${channel} ${data?.kitScript}`);
  if (promptWindow && !promptWindow.isDestroyed()) {
    // promptWindow?.setBackgroundColor('#00FFFFFF');
    promptWindow?.webContents.send(channel, data);
  }
};

const cachePromptPosition = (userResize = false) => {
  if (!promptWindow) return;

  const distScreen = getCurrentScreen();
  const promptBounds = promptWindow.getBounds();

  const currentPromptCache = getCurrentScreenPromptCache();

  if (
    !currentPromptCache ||
    promptBounds.height > currentPromptCache?.height ||
    userResize
  ) {
    getPromptCache()?.set(
      `prompt.${String(distScreen.id)}.bounds`,
      promptBounds
    );

    log.info(`CACHING PROMPT:`, promptBounds);
    log.info(`PROMPT SIZE:`, promptWindow?.getSize());

    const { width, height } = promptBounds;
    sendToPrompt(PROMPT_BOUNDS_UPDATED, { height, width });
  }
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
    cachePromptPosition();
    hideAppIfNoWindows(promptWindow);
  }
  blurredByKit = false;
};
