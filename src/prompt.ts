/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import { BrowserWindow, screen, nativeTheme, app } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';
import { EventEmitter } from 'events';
import minimist from 'minimist';
import { debounce } from 'lodash';
import { getAssetPath } from './assets';
import { kenvPath } from './helpers';
import { USER_RESIZED } from './channels';

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

let lastResizedByUser = false;
export const createPromptWindow = async () => {
  promptWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    backgroundColor: nativeTheme.shouldUseDarkColors
      ? '#33000000'
      : '#C0FFFFFF',
    vibrancy: nativeTheme.shouldUseDarkColors ? 'ultra-dark' : 'medium-light',
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

  let timeoutId: NodeJS.Timeout | null = null;
  const userResize = () => {
    lastResizedByUser = true;
    if (timeoutId) clearTimeout(timeoutId);
    if (!promptWindow) return;
    const promptBounds = promptWindow?.getBounds();

    const { width, height } = promptBounds;
    sendToPrompt(USER_RESIZED, { height, width });
  };

  promptWindow?.on('will-resize', userResize);
  promptWindow?.on('resized', () => {
    timeoutId = setTimeout(() => {
      sendToPrompt(USER_RESIZED, false);
    }, 500);
  });

  return promptWindow;
};

export const focusPrompt = () => {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow?.focus();
  }
};

export const escapePromptWindow = (bw: BrowserWindow) => {
  hideAppIfNoWindows(bw);
  hideEmitter.emit('hide');
};

const getCurrentScreen = () => {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
};

export const getCurrentScreenPromptCache = () => {
  const currentScreen = getCurrentScreen();
  const currentPromptCache = getPromptCache()?.get(
    `prompt.${String(currentScreen.id)}`
  );
  console.log(currentScreen.id, { currentPromptCache });

  return (currentPromptCache as any)?.bounds as Size;
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

  promptWindow?.setBounds({ x, y, width, height });
};

export const showPrompt = () => {
  if (promptWindow && !promptWindow?.isVisible()) {
    const currentScreenpPromptBounds = getCurrentScreenPromptCache();

    if (currentScreenpPromptBounds) {
      promptWindow.setBounds(currentScreenpPromptBounds as any);
    } else {
      setDefaultBounds();
    }

    // TODO: Think through "show on every invoke" logic
    if (!promptWindow?.isVisible()) {
      promptWindow?.show();
      promptWindow.setVibrancy(
        nativeTheme.shouldUseDarkColors ? 'ultra-dark' : 'medium-light'
      );
      promptWindow.setBackgroundColor(
        nativeTheme.shouldUseDarkColors ? '#66000000' : '#C0FFFFFF'
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
  if (lastResizedByUser) {
    lastResizedByUser = false;
    return;
  }
  // RESIZE HACK PART #2. setBounds seems like it sets the height too tall
  promptWindow?.setBounds({ height });
};

export const growPrompt = ({ height }: Size) => {
  const bounds = getCurrentScreenPromptCache() as { height: number };
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

const cachePromptPosition = () => {
  const currentScreen = getCurrentScreen();
  const promptBounds = promptWindow?.getBounds();
  log.info(`CACHING SIZE:`, promptBounds);

  getPromptCache()?.set(
    `prompt.${String(currentScreen.id)}.bounds`,
    promptBounds
  );
};

const hideAppIfNoWindows = (bw: BrowserWindow) => {
  cachePromptPosition();
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
    hideAppIfNoWindows(promptWindow);
  }
  blurredByKit = false;
};
