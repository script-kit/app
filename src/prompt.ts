/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import { BrowserWindow, screen, nativeTheme, app } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';
import { EventEmitter } from 'events';
import minimist from 'minimist';
import { execSync } from 'child_process';
import { getAssetPath } from './assets';
import { kenvPath, kitPath } from './helpers';
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
    useContentSize: true,
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

  // promptWindow?.webContents.on('before-input-event', (event: any, input) => {
  //   if (input.key === 'Escape') {
  //     if (promptWindow) escapePromptWindow(promptWindow);
  //   }
  // });

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
      if (promptWindow?.isVisible()) sendToPrompt(USER_RESIZED, false);
    }, 500);
  });

  // setInterval(() => {
  //   const [, newHeight] = promptWindow?.getSize() as number[];
  //   const { height: boundsHeight } = promptWindow?.getBounds() as Rectangle;
  //   const {
  //     height: normalBoundsHeight,
  //   } = promptWindow?.getNormalBounds() as Rectangle;
  //   const {
  //     height: contentBoundsHeight,
  //   } = promptWindow?.getContentBounds() as Rectangle;
  //   log.info(
  //     `REPORTING HEIGHT: `,
  //     newHeight,
  //     boundsHeight,
  //     normalBoundsHeight,
  //     contentBoundsHeight
  //   );
  // }, 2000);

  return promptWindow;
};

export const focusPrompt = () => {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow?.focus();
  }
};

export const escapePromptWindow = () => {
  blurredByKit = false;
  hideAppIfNoWindows();
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
  // console.log(currentScreen.id, { currentPromptCache });

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

  log.info(`DEFAULT: setBounds`);
  promptWindow?.setBounds({ x, y, width, height });
};

const HEADER_HEIGHT = 24;
const INPUT_HEIGHT = 64;
const TABS_HEIGHT = 36;

export const showPrompt = (options: any = {}) => {
  if (promptWindow && !promptWindow?.isVisible()) {
    const currentScreenPromptBounds = getCurrentScreenPromptCache();

    const headerHeight =
      options?.scriptInfo?.menu ||
      options?.scriptInfo?.twitter ||
      options?.scriptInfo?.description
        ? HEADER_HEIGHT
        : 0;
    const tabsHeight = options?.tabs?.length ? TABS_HEIGHT : 0;
    const height = INPUT_HEIGHT + headerHeight + tabsHeight;

    if (currentScreenPromptBounds) {
      log.info(`SHOW_PROMPT`, { height });

      promptWindow.setBounds({
        ...currentScreenPromptBounds,
        height,
      });
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
  if (!promptWindow?.isVisible()) return;
  if (lastResizedByUser) {
    lastResizedByUser = false;
    return;
  }

  const [width] = promptWindow?.getSize() as number[];

  log.info(`RESIZE: setBounds`, height);
  promptWindow?.setSize(width, height);
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

const hideAppIfNoWindows = () => {
  if (promptWindow?.isVisible()) {
    cachePromptPosition();
    const allWindows = BrowserWindow.getAllWindows();
    // Check if all other windows are hidden
    promptWindow?.hide();
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

  hideAppIfNoWindows();

  blurredByKit = false;
};
