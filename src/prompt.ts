/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
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
import { debounce, lowerFirst } from 'lodash';
import minimist from 'minimist';
import { mainScriptPath, kitPath } from '@johnlindquist/kit/cjs/utils';
import { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { getPromptDb } from '@johnlindquist/kit/cjs/db';
import { Display } from 'electron/main';
import { getAssetPath } from './assets';

// import { Channel, Mode, UI } from '@johnlindquist/kit';
import { getScriptsMemory } from './state';
import {
  DEFAULT_EXPANDED_WIDTH,
  DEFAULT_HEIGHT,
  heightMap,
  INPUT_HEIGHT,
  MIN_HEIGHT,
  MIN_WIDTH,
  noScript,
  SPLASH_PATH,
} from './defaults';
import { ResizeData } from './types';
import { getVersion } from './version';

let state = {
  pid: 0,
  script: noScript,
  ui: UI.arg,
  blurredByKit: false,
  modifiedByUser: false,
  ignoreBlur: false,
  hidden: false,
  minHeight: MIN_HEIGHT,
  resize: false,
  prevResize: false,
  isMainScript: () => state.script.filePath === mainScriptPath,
};

export const getPromptState = () => state;
export const setPromptState = (newState: Partial<typeof state>) => {
  // log.info('🎉 state', newState);
  state = {
    ...state,
    ...newState,
  };

  if (state.hidden) {
    hideAppIfNoWindows(state.script.filePath);
    savePromptBounds(state.script.filePath);
  }
};

export const setBlurredByKit = (blurredByKit = true) => {
  setPromptState({
    blurredByKit,
  });
};

export const setIgnoreBlur = (ignoreBlur = true) => {
  setPromptState({
    ignoreBlur,
  });
};

let promptWindow: BrowserWindow;

const miniArgs = minimist(process.argv);
const { devTools } = miniArgs;
// log.info(process.argv.join(' '), devTools);

export const createPromptWindow = async () => {
  const isMac = os.platform() === 'darwin';
  promptWindow = new BrowserWindow({
    useContentSize: true,
    frame: false,
    transparent: isMac,
    vibrancy: 'menu',
    visualEffectState: 'active',
    show: false,
    hasShadow: true,
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

  promptWindow.setAlwaysOnTop(false, 'floating', 1);
  promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  await promptWindow.loadURL(`file://${__dirname}/index.html`);

  sendToPrompt(Channel.APP_CONFIG, {
    delimiter: path.delimiter,
    sep: path.sep,
    os: os.platform(),
    isMac: os.platform().startsWith('darwin'),
    isWin: os.platform().startsWith('win'),
    assetPath: getAssetPath(),
    version: getVersion(),
  });

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
    // sendToPrompt(Channel.SET_THEME, {
    //   '--opacity-themedark': '33%',
    //   '--opacity-themelight': '33%',
    // });
    promptWindow?.setVibrancy('menu');
  });

  promptWindow.on('hide', () => {
    setPromptState({ modifiedByUser: false, ignoreBlur: false });
  });

  promptWindow?.on('blur', () => {
    if (promptWindow?.webContents.isDevToolsOpened()) return;

    // console.log('blur', state);
    if (os.platform().startsWith('win')) {
      return;
    }

    if (promptWindow?.isVisible()) {
      sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
    }

    if (state.ignoreBlur) {
      // sendToPrompt(Channel.SET_THEME, {
      //   '--opacity-themedark': '0%',
      //   '--opacity-themelight': '0%',
      // });
      promptWindow?.setVibrancy('popover');
    } else if (!state.ignoreBlur) {
      // log.info(`Blur Hide Prompt Window`, state.ignoreBlur);
      // if (promptWindow?.webContents.isDevToolsFocused()) return;

      // I think this should be handled by process.exit() in onBlur handler...
      // if (!state.blurredByKit) {
      //   hideAppIfNoWindows(state.script.filePath);
      // }

      setPromptState({
        blurredByKit: false,
      });
    }

    if (!isMac)
      sendToPrompt(Channel.SET_THEME, {
        '--opacity-themedark': '100%',
        '--opacity-themelight': '100%',
      });
  });

  const onMove = async () => {
    if (state.modifiedByUser) {
      await savePromptBounds(state.script.filePath, Bounds.Position);
    }

    setPromptState({
      modifiedByUser: false,
    });
  };

  const onResized = async () => {
    if (state.modifiedByUser) {
      await savePromptBounds(state.script.filePath, Bounds.Size);
    }

    setPromptState({
      modifiedByUser: false,
    });
  };

  promptWindow?.on('will-resize', () => {
    setPromptState({
      modifiedByUser: true,
    });
  });

  promptWindow?.on('will-move', () => {
    setPromptState({
      modifiedByUser: true,
    });
  });
  promptWindow?.on('resized', debounce(onResized, 500));
  promptWindow?.on('moved', debounce(onMove, 500));

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

  promptWindow?.on('show', () => {
    setTimeout(() => {
      focusPrompt();
    }, 150);
  });

  powerMonitor.addListener('unlock-screen', () => {
    log.info(`🔓 System unlocked. Reloading prompt window.`);
    reload();
  });

  powerMonitor.on('lock-screen', () => {
    log.info(`🔒 System locked. Reloading prompt window.`);
    reload();
  });

  return promptWindow;
};

export const setPromptProp = (data: { prop: { key: string; value: any } }) => {
  const { key, value }: any = data.prop;
  (promptWindow as any)[key](value);
};

export const focusPrompt = () => {
  if (promptWindow && !promptWindow.isDestroyed()) {
    log.info(`👓 Focus Prompt`);

    promptWindow?.focus();
    promptWindow?.focusOnWebView();
    sendToPrompt(Channel.SET_OPEN, true);
  }
};
export const escapePromptWindow = async (scriptPath: string) => {
  setPromptState({
    hidden: false,
    blurredByKit: false,
  });

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

  log.info(`resetPromptBounds`, scriptPath);
  const isSplash = state.script.filePath === SPLASH_PATH;
  const { width: screenWidth, height: screenHeight } =
    currentScreen.workAreaSize;

  const height = isSplash
    ? DEFAULT_HEIGHT
    : Math.max(
        state.minHeight,
        Math.round(
          state.script.filePath?.includes(kitPath()) || instantChoices.length
            ? DEFAULT_HEIGHT
            : state.ui === UI.arg
            ? guessTopHeight(state.script)
            : heightMap[state.ui]
        )
      ); // Math.round(screenHeight / 1.5);

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

  log.info(`Bounds file path: ${boundsFilePath}`);
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

const guessTopHeight = (script: Script) => {
  let height = 0;
  if (script?.description || script?.twitter || script?.menu) {
    height += 24;
  }
  if (script?.description && script?.twitter) {
    height += 12;
  }

  height += INPUT_HEIGHT;

  if (script?.tabs?.length) {
    height += 12;
  }

  return height;
};

export const setBounds = (bounds: Partial<Rectangle>) => {
  promptWindow.setBounds(bounds);
  savePromptBounds(state.script.filePath);
};

export const isVisible = () => {
  return !promptWindow.isDestroyed() && promptWindow.isVisible();
};

export const isFocused = () => {
  return promptWindow?.isFocused();
};

let prevPromptId = 0;

export const resize = debounce(
  async ({
    scriptPath,
    topHeight,
    mainHeight,
    ui,
    mode,
    hasChoices,
    hasPanel,
    hasInput,
    tabIndex,
    isSplash,
    promptId,
    inputChanged,
  }: ResizeData) => {
    const isMain = state.isMainScript();

    if (promptId === prevPromptId) {
      if (!state.resize && !state.prevResize) {
        setPromptState({ prevResize: false });
        return;
      }
    }

    prevPromptId = promptId;

    log.info(`isMain:`, isMain);
    setPromptState({
      minHeight: topHeight,
    });

    const sameScript = scriptPath === state?.script.filePath;
    if (state.modifiedByUser || !sameScript) return;

    if (!mainHeight && ui & (UI.form | UI.div | UI.editor | UI.drop)) return;

    if (!mainHeight && !hasInput && hasChoices) return;

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

    const checkMainHeight =
      ui & UI.arg && !hasPanel && !hasChoices ? 0 : mainHeight;

    const targetHeight = topHeight + checkMainHeight;

    const threeFourths = getCurrentScreenFromPrompt().bounds.height * (3 / 4);
    log.info({
      hasPanel,
      mode,
      ui: ui & (UI.form | UI.div),
      threeFourths,
      DEFAULT_HEIGHT,
      cachedHeight,
      targetHeight,
    });

    const maxHeight =
      (hasPanel && !hasChoices) ||
      mode === Mode.GENERATE ||
      ui & (UI.form | UI.div)
        ? Math.round(threeFourths)
        : Math.max(DEFAULT_HEIGHT, cachedHeight);

    let width = Math.max(cachedWidth, DEFAULT_EXPANDED_WIDTH);

    let height = Math.round(
      targetHeight > maxHeight ? maxHeight : targetHeight
    );

    if (!inputChanged) {
      height = cachedHeight;
    }

    if (hasChoices) {
      height = cachedHeight;
    }

    if (isSplash) {
      width = DEFAULT_EXPANDED_WIDTH;
      height = DEFAULT_HEIGHT;
    }
    if (currentHeight === height && currentWidth === width) return;
    log.info(`↕ RESIZE: ${width} x ${height}`);
    promptWindow.setSize(width, height);
    setPromptState({ prevResize: true });

    if (ui !== UI.arg) savePromptBounds(scriptPath, Bounds.Size);

    if (ui === UI.arg && !tabIndex && !hasInput) {
      savePromptBounds(scriptPath, Bounds.Size);
    }

    if (currentX !== cachedX && currentY !== cachedY) {
      promptWindow.setPosition(cachedX, cachedY);
    }
  },
  0
);

export const sendToPrompt = <K extends keyof ChannelMap>(
  channel: K,
  data?: ChannelMap[K]
) => {
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

export const killPrompt = async (scriptPath: string) => {
  if (scriptPath === state.script.filePath) {
    hideAppIfNoWindows(scriptPath);
  }
};

export const hideAppIfNoWindows = (scriptPath: string) => {
  // log.info(`hideAppIfNoWindows`, { scriptPath });
  if (promptWindow?.isVisible()) {
    savePromptBounds(scriptPath, Bounds.Position);

    const allWindows = BrowserWindow.getAllWindows();
    // Check if all other windows are hidden

    if (!state.hidden) {
      sendToPrompt(Channel.SET_OPEN, false);
    }
    promptWindow?.hide();
    // setPromptBounds();

    if (allWindows.every((window) => !window.isVisible())) {
      if (app?.hide) app?.hide();
    }
  }
};

export const setPlaceholder = (text: string) => {
  sendToPrompt(Channel.SET_PLACEHOLDER, text);
};

export const getPromptPid = () => state.pid;

export const setPromptPid = (pid: number) => {
  setPromptState({ pid });
  sendToPrompt(Channel.SET_PID, pid);
};

let instantChoices = [];

export const setScript = async (script: Script) => {
  // if (promptScript?.filePath === script?.filePath) return;
  setPromptState({
    resize: script.resize,
    script,
  });

  // if (promptScript?.id === script?.id) return;
  // log.info(script);

  if (script.filePath === mainScriptPath) {
    script.tabs = script?.tabs?.filter(
      (tab: string) => !tab.match(/join|live/i)
    );
  }

  sendToPrompt(Channel.SET_SCRIPT, script);

  instantChoices = [];
  if (script.filePath === mainScriptPath) {
    sendToPrompt(Channel.SET_PLACEHOLDER, 'Run Script');
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
  setPromptState({
    ui: promptData.ui,
    ignoreBlur: promptData.ignoreBlur,
  });

  sendToPrompt(Channel.SET_PROMPT_DATA, promptData);
  if (!promptWindow?.isVisible()) {
    const bounds = await getCurrentScreenPromptCache(promptData.scriptPath);
    log.info(`↖ OPEN:`, bounds);
    promptWindow.setBounds(bounds);

    promptWindow?.show();
    if (devTools) promptWindow?.webContents.openDevTools();
  }

  promptWindow.setAlwaysOnTop(
    state.ui === UI.splash || state.ignoreBlur,
    'floating',
    1
  );

  focusPrompt();
};

export const setChoices = (choices: Choice[]) => {
  sendToPrompt(Channel.SET_UNFILTERED_CHOICES, choices);
};

export const clearPromptCache = async () => {
  const promptDb = await getPromptDb();
  promptDb.screens = {};

  log.info(`⛑ Clear prompt cache:`, promptDb);
  promptDb.write();
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
