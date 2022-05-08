/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import { subscribe } from 'valtio/vanilla';
import { Channel, Mode, UI } from '@johnlindquist/kit/cjs/enum';
import {
  Choice,
  Script,
  PromptData,
  PromptBounds,
} from '@johnlindquist/kit/types/core';
import { BrowserWindow, screen, app, Rectangle, powerMonitor } from 'electron';
import os from 'os';
import path from 'path';
import log from 'electron-log';
import { debounce } from 'lodash';
import minimist from 'minimist';
import { mainScriptPath } from '@johnlindquist/kit/cjs/utils';
import { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { getPromptDb } from '@johnlindquist/kit/cjs/db';
import { Display } from 'electron/main';
import { getAssetPath } from './assets';

// import { Channel, Mode, UI } from '@johnlindquist/kit';
import { getScriptsMemory, kitState } from './state';
import {
  DEFAULT_EXPANDED_WIDTH,
  DEFAULT_HEIGHT,
  INPUT_HEIGHT,
  MIN_HEIGHT,
  MIN_WIDTH,
} from './defaults';
import { ResizeData } from './types';
import { getVersion } from './version';
import { AppChannel } from './enums';

let promptWindow: BrowserWindow;
let unsub: () => void;

const miniArgs = minimist(process.argv);
const { devTools } = miniArgs;
// log.info(process.argv.join(' '), devTools);

const handleHide = () => {
  if (kitState.isKeyWindow) {
    electronPanelWindow.makeWindow(promptWindow);
    kitState.isKeyWindow = false;
  }
  kitState.modifiedByUser = false;
  kitState.ignoreBlur = false;
};

let electronPanelWindow: any = null;
export const createPromptWindow = async () => {
  if (kitState.isMac) {
    electronPanelWindow = await import('@akiflow/electron-panel-window' as any);
  }
  promptWindow = new BrowserWindow({
    titleBarStyle: 'customButtonsOnHover',
    useContentSize: true,
    frame: false,
    transparent: kitState.isMac,
    vibrancy: 'menu',
    // visualEffectState: 'active',
    show: false,
    // hasShadow: true,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: process.env.NODE_ENV === 'development' || devTools,
      backgroundThrottling: false,
    },
    closable: false,
    minimizable: false,
    maximizable: false,
    movable: true,
    skipTaskbar: true,
    minHeight: INPUT_HEIGHT,
  });

  promptWindow.setAlwaysOnTop(true, 'modal-panel');
  // promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  promptWindow?.webContents?.on('did-finish-load', () => {
    sendToPrompt(Channel.APP_CONFIG, {
      delimiter: path.delimiter,
      sep: path.sep,
      os: os.platform(),
      isMac: os.platform().startsWith('darwin'),
      isWin: os.platform().startsWith('win'),
      assetPath: getAssetPath(),
      version: getVersion(),
    });
  });

  await promptWindow.loadURL(
    `file://${__dirname}/index.html?vs=${getAssetPath('vs')}`
  );

  // promptWindow.on('ready-to-show', function () {
  //   promptWindow.showInactive();
  // });

  promptWindow.webContents.once('did-finish-load', () => {
    promptWindow?.webContents.closeDevTools();
  });

  promptWindow?.setMaxListeners(2);

  // promptWindow?.webContents.on('before-input-event', (event: any, input) => {
  //   if (input.key === 'Escape') {
  //     if (promptWindow) escapePromptWindow(promptWindow);
  //   }
  // });

  promptWindow.on('focus', () => {
    if (!kitState.isKeyWindow) {
      electronPanelWindow?.makePanel(promptWindow);
      electronPanelWindow?.makeKeyWindow(promptWindow);
      kitState.isKeyWindow = true;
    }

    // sendToPrompt(Channel.SET_THEME, {
    //   '--opacity-themedark': '33%',
    //   '--opacity-themelight': '33%',
    // });
    // promptWindow?.setVibrancy('menu');
  });

  promptWindow?.webContents?.on('dom-ready', () => {
    log.info(`🍀 dom-ready on ${kitState.promptProcess?.scriptPath}`);
    hideAppIfNoWindows(kitState?.promptProcess?.scriptPath);
    sendToPrompt(Channel.SET_READY, true);
  });

  promptWindow?.on('blur', () => {
    // if (kitState.isKeyWindow) {
    //   electronPanelWindow.makeWindow(promptWindow);
    //   kitState.isKeyWindow = false;
    // }
    if (promptWindow?.webContents?.isDevToolsOpened()) return;

    if (os.platform().startsWith('win')) {
      return;
    }

    if (promptWindow?.isVisible() && !kitState.ignoreBlur) {
      sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
    }

    if (kitState.ignoreBlur) {
      // promptWindow?.setVibrancy('popover');
    } else if (!kitState.ignoreBlur) {
      kitState.blurredByKit = false;
    }

    if (!kitState.isMac)
      sendToPrompt(Channel.SET_THEME, {
        '--opacity-themedark': '100%',
        '--opacity-themelight': '100%',
      });
  });

  const onMove = async () => {
    if (kitState.modifiedByUser) {
      await savePromptBounds(kitState.script.filePath, Bounds.Position);
    }

    kitState.modifiedByUser = false;
  };

  const onResized = async () => {
    if (kitState.modifiedByUser) {
      await savePromptBounds(kitState.script.filePath, Bounds.Size);
    }

    kitState.modifiedByUser = false;
  };

  promptWindow?.on('will-resize', () => {
    kitState.modifiedByUser = true;
  });

  promptWindow?.on('will-move', () => {
    kitState.modifiedByUser = true;
  });
  promptWindow?.on('resized', debounce(onResized, 500));
  promptWindow?.on('moved', debounce(onMove, 500));

  // promptWindow?.on('show', () => {
  //   setTimeout(() => {
  //     focusPrompt();
  //   }, 150);
  // });

  // powerMonitor.addListener('user-did-resign-active', () => {
  //   log.info(`🔓 System unlocked. Reloading prompt window.`);
  //   reload();
  // });

  powerMonitor.on('lock-screen', () => {
    log.info(`🔒 System locked. Reloading prompt window.`);
    reload();
  });

  if (unsub) unsub();

  unsub = subscribe(kitState.ps, () => {
    const ps = kitState.ps
      .filter((p) => p.scriptPath !== '')
      .map((p) => {
        const { child, values, ...rest } = p;

        return { ...rest };
      });

    // log.info(`ps`, ps);
    appToPrompt(AppChannel.PROCESSES, ps);
  });

  return promptWindow;
};

export const setPromptProp = (data: { prop: { key: string; value: any } }) => {
  const { key, value }: any = data.prop;
  (promptWindow as any)[key](value);
};

export const logFocus = () => {
  log.warn(
    `👓 Unable to focus Prompt ${JSON.stringify({
      focused: promptWindow.isFocused(),
      focusable: promptWindow.isFocusable(),
    })}`
  );
};

export const showInactive = () => {
  try {
    if (electronPanelWindow) {
      promptWindow?.showInactive();

      if (!kitState.isKeyWindow) {
        electronPanelWindow?.makePanel(promptWindow);
        electronPanelWindow?.makeKeyWindow(promptWindow);
        kitState.isKeyWindow = true;
      }
    }
  } catch (error) {
    log.error(error);
  }
};

export const focusPrompt = () => {
  if (
    promptWindow &&
    !promptWindow.isDestroyed() &&
    kitState.isKeyWindow &&
    !promptWindow?.isFocused()
  ) {
    // promptWindow.setAlwaysOnTop(true, 'modal-panel');
    // app.focus({
    //   steal: true,
    // });
    promptWindow?.focus();
    // promptWindow?.focusOnWebView();
  }
};

export const endPrompt = async (scriptPath: string) => {
  hideAppIfNoWindows(scriptPath);
};
export const getCurrentScreenFromMouse = (): Display => {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
};

export const getCurrentScreenFromPrompt = (): Display => {
  return screen.getDisplayNearestPoint(promptWindow.getBounds());
};

export const getCurrentScreenPromptCache = async (scriptPath: string) => {
  const currentScreen = getCurrentScreenFromMouse();
  const screenId = String(currentScreen.id);
  const promptDb = await getPromptDb();
  // log.info(`screens:`, promptDb.screens);

  const savedPromptBounds = promptDb?.screens?.[screenId]?.[scriptPath];

  // log.info(`📱 Screen: ${screenId}: `, savedPromptBounds);

  if (savedPromptBounds) return savedPromptBounds;

  // log.info(`resetPromptBounds`, scriptPath);
  const {
    width: screenWidth,
    height: screenHeight,
  } = currentScreen.workAreaSize;

  const height = DEFAULT_HEIGHT;
  const width = DEFAULT_EXPANDED_WIDTH;
  const { x: workX, y: workY } = currentScreen.workArea;
  const x = Math.round(screenWidth / 2 - width / 2 + workX);
  const y = Math.round(workY + screenHeight / 8);

  const bounds = { x, y, width, height };

  if (!promptDb?.screens) {
    promptDb.screens = {};
  }
  if (!promptDb?.screens[screenId]) {
    promptDb.screens[screenId] = {};
  }
  const boundsFilePath = promptDb.screens?.[screenId]?.[scriptPath];
  const maybeBounds = boundsFilePath || {};

  if (!boundsFilePath) {
    const promptBounds = {
      ...bounds,
      x: maybeBounds?.x || bounds.x,
      y: maybeBounds?.y || bounds.y,
    };

    writePromptDb(screenId, scriptPath, promptBounds);
  }

  return bounds;
};

export const setBounds = (bounds: Partial<Rectangle>) => {
  promptWindow.setBounds(bounds);
  savePromptBounds(kitState.script.filePath);
};

export const isVisible = () => {
  return !promptWindow.isDestroyed() && promptWindow.isVisible();
};

export const isFocused = () => {
  return promptWindow?.isFocused();
};

export const resize = async ({
  scriptPath,
  topHeight,
  mainHeight,
  footerHeight,
  ui,
  hasPanel,
  hasInput,
  tabIndex,
  isSplash,
  nullChoices,
}: ResizeData) => {
  if (kitState.modifiedByUser) return;

  const {
    width: cachedWidth,
    height: cachedHeight,
    x: cachedX,
    y: cachedY,
  } = await getCurrentScreenPromptCache(scriptPath);
  const {
    width: currentWidth,
    height: currentHeight,
    x: currentX,
    y: currentY,
  } = promptWindow.getBounds();

  const targetHeight = topHeight + mainHeight + footerHeight;
  // const threeFourths = getCurrentScreenFromPrompt().bounds.height * (3 / 4);

  // const maxHeight = hasPanel
  //   ? Math.round(threeFourths)
  //   : Math.max(DEFAULT_HEIGHT, cachedHeight);

  const maxHeight = Math.max(DEFAULT_HEIGHT, cachedHeight);

  let width = Math.max(cachedWidth, DEFAULT_EXPANDED_WIDTH);

  let height = Math.round(targetHeight > maxHeight ? maxHeight : targetHeight);

  if (!nullChoices && !hasPanel) {
    height = Math.max(cachedHeight, DEFAULT_HEIGHT);
  }

  if (isSplash) {
    width = DEFAULT_EXPANDED_WIDTH;
    height = DEFAULT_HEIGHT;
  }

  height = Math.round(height);
  width = Math.round(width);
  if (currentHeight === height && currentWidth === width) return;

  log.info(`↕ RESIZE: ${width} x ${height}`);
  promptWindow.setSize(width, height);

  kitState.prevResize = true;

  if (ui !== UI.arg) savePromptBounds(scriptPath, Bounds.Size);

  if (ui === UI.arg && !tabIndex && !hasInput) {
    savePromptBounds(scriptPath, Bounds.Size);
  }

  if (currentX !== cachedX && currentY !== cachedY) {
    promptWindow.setPosition(cachedX, cachedY);
  }
};

export const sendToPrompt = <K extends keyof ChannelMap>(
  channel: K,
  data?: ChannelMap[K]
) => {
  // log.info(`>_ ${channel} ${data?.kitScript}`);
  // log.info(`>_ ${channel}`);
  if (
    promptWindow &&
    !promptWindow.isDestroyed() &&
    promptWindow?.webContents
  ) {
    promptWindow?.webContents.send(channel, data);
  }
};

export const appToPrompt = (channel: AppChannel, data?: any) => {
  // log.info(`>_ ${channel} ${data?.kitScript}`);
  // log.info(`>_ ${channel}`);
  if (
    promptWindow &&
    promptWindow?.webContents &&
    !promptWindow.isDestroyed()
  ) {
    promptWindow?.webContents.send(channel, data);
  }
};

enum Bounds {
  Position = 1 << 0,
  Size = 1 << 1,
}

export const savePromptBounds = debounce(
  async (scriptPath: string, b: number = Bounds.Position | Bounds.Size) => {
    const currentScreen = getCurrentScreenFromPrompt();
    const promptDb = await getPromptDb();

    const bounds = promptWindow?.getBounds();

    const prevBounds =
      promptDb?.screens?.[String(currentScreen.id)]?.[scriptPath];

    // Ignore if flag
    const size = b & Bounds.Size;
    const position = b & Bounds.Position;
    const { x, y } = position ? bounds : prevBounds || bounds;
    const { width, height } = size ? bounds : prevBounds || bounds;

    const promptBounds: PromptBounds = {
      x,
      y,
      width: width < MIN_WIDTH ? MIN_WIDTH : width,
      height: height < MIN_HEIGHT ? MIN_HEIGHT : height,
    };

    writePromptDb(String(currentScreen.id), scriptPath, promptBounds);
  },
  100
);

const writePromptDb = debounce(
  async (screenId: string, scriptPath: string, bounds: PromptBounds) => {
    // log.info(`writePromptDb`, { screenId, scriptPath, bounds });
    const promptDb = await getPromptDb();

    if (!promptDb?.screens) promptDb.screens = {};
    if (!promptDb?.screens[screenId]) promptDb.screens[screenId] = {};

    promptDb.screens[screenId][scriptPath] = bounds;
    await promptDb.write();
  },
  100
);

export const hideAppIfNoWindows = (scriptPath = '') => {
  if (
    promptWindow &&
    !promptWindow?.isDestroyed() &&
    promptWindow?.isVisible() &&
    kitState.isKeyWindow
  ) {
    if (scriptPath) savePromptBounds(scriptPath, Bounds.Position);

    const allWindows = BrowserWindow.getAllWindows();
    // Check if all other windows are hidden

    if (!kitState.hidden) {
      sendToPrompt(Channel.SET_OPEN, false);
      kitState.hidden = false;
    }

    promptWindow?.hide();
    setTimeout(handleHide, 0);
    // setPromptBounds();

    if (allWindows.every((window) => !window.isVisible())) {
      // if (app?.hide) app?.hide();
    }

    savePromptBounds(kitState.script.filePath);
  }
};

export const setPlaceholder = (text: string) => {
  sendToPrompt(Channel.SET_PLACEHOLDER, text);
};

export const setFooter = (footer: string) => {
  sendToPrompt(Channel.SET_FOOTER, footer);
};

export const setPromptPid = (pid: number) => {
  kitState.pid = pid;
  sendToPrompt(Channel.SET_PID, pid);
};

export const setScript = async (script: Script) => {
  // log.info(script);
  // if (promptScript?.filePath === script?.filePath) return;

  kitState.script = script;

  // if (promptScript?.id === script?.id) return;
  // log.info(script);

  if (script.filePath === mainScriptPath) {
    script.tabs = script?.tabs?.filter(
      (tab: string) => !tab.match(/join|live/i)
    );
  }

  sendToPrompt(Channel.SET_SCRIPT, script);

  if (script.filePath === mainScriptPath) {
    sendToPrompt(Channel.SET_DESCRIPTION, 'Run Script');
    // sendToPrompt(Channel.SET_PROMPT_DATA, {
    //   placeholder: 'Run Script',
    //   placeholderOnly: false,
    //   panel: ``,
    // });
    setChoices(getScriptsMemory());
  }
};

export const setMode = (mode: Mode) => {
  sendToPrompt(Channel.SET_MODE, mode);
};

export const setInput = (input: string) => {
  sendToPrompt(Channel.SET_INPUT, input);
};

export const setPanel = (html: string) => {
  sendToPrompt(Channel.SET_PANEL, html);
};

export const setPreview = (html: string) => {
  sendToPrompt(Channel.SET_PREVIEW, html);
};

export const setLog = (_log: string) => {
  sendToPrompt(Channel.SET_LOG, _log);
};

export const setHint = (hint: string) => {
  sendToPrompt(Channel.SET_HINT, hint);
};

export const setTabIndex = (tabIndex: number) => {
  sendToPrompt(Channel.SET_TAB_INDEX, tabIndex);
};

export const setPromptData = async (promptData: PromptData) => {
  if (kitState.suspended || kitState.screenLocked) return;

  kitState.ui = promptData.ui;
  if (!kitState.ignoreBlur) kitState.ignoreBlur = promptData.ignoreBlur;

  sendToPrompt(Channel.SET_PROMPT_DATA, promptData);
  if (!promptWindow?.isVisible()) {
    const bounds = await getCurrentScreenPromptCache(promptData.scriptPath);
    log.info(`↖ OPEN:`, bounds);
    promptWindow.setBounds(bounds);

    // log.info(`⛳️ MAKING KEY WINDOW!!!!!`);
    showInactive();

    // app.focus({
    //   steal: true,
    // });
    if (devTools) promptWindow?.webContents.openDevTools();
  }

  focusPrompt();
  sendToPrompt(Channel.SET_OPEN, true);
};

export const setChoices = (choices: Choice[]) => {
  sendToPrompt(Channel.SET_UNFILTERED_CHOICES, choices);
};

export const clearPromptCache = async () => {
  const promptDb = await getPromptDb();
  promptDb.screens = {};

  log.info(`⛑ Clear prompt cache:`, promptDb);
  await promptDb.write();

  promptWindow?.webContents?.setZoomLevel(0);
  const bounds = await getCurrentScreenPromptCache(kitState.script.filePath);
  // log.info(`↖ CLEARED:`, bounds);
  promptWindow.setBounds(bounds);
};

export const reload = () => {
  promptWindow?.reload();
};

export const getPromptBounds = () => promptWindow.getBounds();

export const destroyPromptWindow = () => {
  if (promptWindow) {
    hideAppIfNoWindows(`__destroy__`);
    promptWindow.destroy();
  }
};
