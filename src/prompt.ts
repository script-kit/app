/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
/* eslint-disable consistent-return */
import { PROMPT, Channel, Mode, UI } from '@johnlindquist/kit/cjs/enum';
import {
  Choice,
  Script,
  PromptData,
  PromptBounds,
  FlagsWithKeys,
} from '@johnlindquist/kit/types/core';

import { snapshot } from 'valtio';
import { subscribeKey } from 'valtio/utils';

import {
  BrowserWindow,
  screen,
  Rectangle,
  powerMonitor,
  shell,
  BrowserWindowConstructorOptions,
  Point,
  TouchBar,
  ipcMain,
  app,
  globalShortcut,
} from 'electron';
import os from 'os';
import path from 'path';
import log from 'electron-log';
import { assign, debounce, isEqual } from 'lodash';
import {
  mainScriptPath,
  defaultGroupClassName,
  defaultGroupNameClassName,
  groupChoices,
  formatChoices,
  kenvPath,
} from '@johnlindquist/kit/cjs/utils';
import { getAppDb, setScriptTimestamp } from '@johnlindquist/kit/cjs/db';
import { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { Display } from 'electron/main';
import { differenceInHours } from 'date-fns';

import { ChildProcess } from 'child_process';
import { quickScore, createConfig, QuickScore } from 'quick-score';
import { getAssetPath } from './assets';
import {
  appDb,
  kitState,
  subs,
  promptState,
  getEmojiShortcut,
  kitSearch,
  flagSearch,
  preloadPromptDataMap,
  preloadChoicesMap,
  preloadPreviewMap,
  clearSearch,
} from './state';
import { EMOJI_HEIGHT, EMOJI_WIDTH, MIN_WIDTH, ZOOM_LEVEL } from './defaults';
import { ResizeData, ScoredChoice } from './types';
import { getVersion } from './version';
import { AppChannel, HideReason } from './enums';
import { emitter, KitEvent } from './events';
import { createScoredChoice, pathsAreEqual } from './helpers';
import { TrackEvent, trackEvent } from './track';
import { getCurrentScreen } from './screen';

let promptWindow: BrowserWindow;

const getDefaultWidth = () => {
  return appDb.mini ? PROMPT.WIDTH.XXXS : PROMPT.WIDTH.BASE;
};

export const blurPrompt = () => {
  log.info(`blurPrompt`);
  if (promptWindow?.isDestroyed()) return;
  if (promptWindow) {
    promptWindow.blur();
  }
};

const actualHide = () => {
  if (!kitState.isMac) promptWindow?.minimize();
  promptWindow?.hide();
};

export const maybeHide = async (reason: string) => {
  log.info(`Attempt Hide: ${reason}`);
  if (!promptWindow?.isVisible()) return;
  if (reason === HideReason.NoScript || reason === HideReason.Escape) {
    actualHide();
    preload(mainScriptPath, false);
    // clearSearch();
    // invokeSearch('');
    return;
  }

  if (reason === HideReason.PingTimeout) {
    log.info(`⛑ Attempting recover...`);
    kitState.debugging = false;
    kitState.ignoreBlur = false;

    emitter.emit(KitEvent.KillProcess, kitState.pid);
    actualHide();
    reload();

    return;
  }

  if (reason === HideReason.DebuggerClosed) {
    actualHide();
    return;
  }

  if (kitState.debugging) return;
  if (!kitState.ignoreBlur && promptWindow?.isVisible()) {
    log.verbose(`Hiding because ${reason}`);
    if (
      !promptWindow?.webContents?.isDevToolsOpened() &&
      !kitState.preventClose
    ) {
      actualHide();
    }
  }
};

export const forceHide = () => {
  if (promptWindow?.isVisible()) {
    promptWindow?.hide();
  }
};

export const setVibrancy = (
  vibrancy: Parameters<typeof BrowserWindow.prototype.setVibrancy>[0]
) => {
  if (promptWindow?.isDestroyed()) return;
  if (kitState.isMac) {
    try {
      promptWindow?.setVibrancy(vibrancy);
    } catch (error) {
      log.error(error);
    }
  } else {
    log.info(`Custom vibrancy not supported on this platform`);
  }
};

export const setBackgroundThrottling = (enabled: boolean, override = false) => {
  if (kitState.isWindows && !override) return;
  if (enabled === kitState.isThrottling) return;
  kitState.isThrottling = enabled;
  if (promptWindow?.isDestroyed()) return;
  log.info(`🚕 setBackgroundThrottling: ${enabled ? 'enabled' : 'disabled'}`);
  promptWindow?.webContents?.setBackgroundThrottling(enabled);
};

export const saveCurrentPromptBounds = async () => {
  // if (kitState.promptCount === 1) {
  const currentBounds = promptWindow?.getBounds();
  savePromptBounds(kitState.scriptPath, currentBounds);
  sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
    id: kitState.promptId,
    ...currentBounds,
  });
  // }
};

export const createPromptWindow = async () => {
  log.silly(`function: createPromptWindow`);

  const width = PROMPT.WIDTH.BASE;
  const height = PROMPT.HEIGHT.BASE;
  // const currentScreen = getCurrentScreenFromMouse();
  const currentScreen = await getCurrentScreen();
  const { width: screenWidth, height: screenHeight } =
    currentScreen.workAreaSize;
  const { x: workX, y: workY } = currentScreen.workArea;

  const options: BrowserWindowConstructorOptions = {
    useContentSize: true,
    frame: false,
    hasShadow: true,
    show: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true,
      backgroundThrottling: true,
      experimentalFeatures: true,
    },
    closable: false,
    minimizable: false,
    maximizable: false,
    movable: true,
    skipTaskbar: true,
    width,
    height,
    minWidth: MIN_WIDTH,
    minHeight: PROMPT.INPUT.HEIGHT.XS,
    x: Math.round(screenWidth / 2 - width / 2 + workX),
    y: Math.round(workY + screenHeight / 8),
    type: 'panel',
  };

  // Disable Windows show animation

  assign(appDb, (await getAppDb()).data);

  if (appDb && appDb?.disableBlurEffect) {
    promptWindow = new BrowserWindow({
      ...options,
    });
  } else {
    promptWindow = new BrowserWindow({
      ...options,
      transparent: kitState.isMac,
      vibrancy: 'popover',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
      backgroundMaterial: kitState.isWin10 ? 'acrylic' : 'mica',
    });
  }

  promptWindow.setFullScreenable(false);
  promptWindow?.webContents?.setZoomLevel(ZOOM_LEVEL);

  if (kitState.isMac) {
    const touchbar = new TouchBar({
      items: [
        new TouchBar.TouchBarLabel({
          label: `Script Kit ${getVersion()}`,
          accessibilityLabel: 'Hello',
        }),
      ],
    });

    try {
      promptWindow.setTouchBar(touchbar);
    } catch (error) {
      log.error(error);
    }
  }

  promptWindow?.webContents?.on('did-finish-load', () => {
    kitState.hiddenByUser = false;
    kitState.promptHidden = true;

    log.silly(`event: did-finish-load`);
    sendToPrompt(Channel.APP_CONFIG, {
      delimiter: path.delimiter,
      sep: path.sep,
      os: os.platform(),
      isMac: os.platform().startsWith('darwin'),
      isWin: os.platform().startsWith('win'),
      assetPath: getAssetPath(),
      version: getVersion(),
      isDark: kitState.isDark,
      searchDebounce: appDb.searchDebounce || true,
      termFont: appDb.termFont || 'monospace',
      url: kitState.url,
    });

    sendToPrompt(Channel.APP_DB, { ...appDb });
    setKitStateAtom({
      isSponsor: kitState.isSponsor,
    });
    emitter.emit(KitEvent.DID_FINISH_LOAD);

    // TODO: Consider how db/*.json files should sync with renderer process
    // This is a single property of app.json. So consider a .json file for the renderer process
    // Can chokidar run from the renderer process and skip the main process?
    // sendToPrompt(Channel.SET_SEARCH_DEBOUNCE, appDb.searchDebounce || true);
    // sendToPrompt(Channel.SET_SEARCH_DEBOUNCE, appDb.termFont || true);
  });

  // reload if unresponsive
  promptWindow?.webContents?.on('unresponsive', () => {
    log.error(`Prompt window unresponsive. Reloading`);
    if (promptWindow?.isDestroyed()) {
      log.error(`Prompt window is destroyed. Not reloading`);
      return;
    }

    promptWindow?.reload();
    promptWindow?.hide();
  });

  //   promptWindow?.webContents?.on('new-window', function (event, url) {
  //     event.preventDefault()
  //     shell.openExternal(url)
  // })

  promptWindow?.webContents?.setWindowOpenHandler(({ url }) => {
    log.info(`Opening ${url}`);
    shell.openExternal(url);

    return { action: 'deny' };
  });

  log.silly(`Loading prompt window html`);
  await promptWindow.loadURL(
    `file://${__dirname}/index.html?vs=${getAssetPath('vs')}`
  );

  promptWindow.webContents.on('devtools-closed', () => {
    log.silly(`event: devtools-closed`);
    promptWindow?.setAlwaysOnTop(false);
    maybeHide(HideReason.DevToolsClosed);
  });

  emitter.on(KitEvent.OpenDevTools, () => {
    log.silly(`event: OpenDevTools`);
    promptWindow?.webContents?.openDevTools({
      activate: true,
      mode: 'detach',
    });
  });

  // emitter.on(KitEvent.TermExited, (value: string) => {
  //   appToPrompt(AppChannel.TERM_EXIT, value);
  // });

  promptWindow?.setMaxListeners(1);

  const showEmoji = () => {
    kitState.emojiActive = true;
    log.info(`Using built-in emoji`);
    app.showEmojiPanel();
  };

  const onBlur = async () => {
    log.silly(`event: onBlur`);
    if (!kitState.isLinux) {
      globalShortcut.unregister(getEmojiShortcut());
      if (kitState.emojiActive) return;
    }

    if (!kitState.isPromptReady) return;

    if (promptWindow?.isDestroyed()) return;
    if (kitState.isActivated) {
      kitState.isActivated = false;
      return;
    }
    if (promptWindow?.webContents?.isDevToolsOpened()) return;

    // if (!promptWindow?.isFocused()) return;

    log.verbose(`Blur: ${kitState.ignoreBlur ? 'ignored' : 'accepted'}`);

    if (promptWindow?.isVisible()) {
      sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
    }
    maybeHide(HideReason.Blur);

    if (os.platform().startsWith('win')) {
      return;
    }

    if (kitState.ignoreBlur) {
      // promptWindow?.setVibrancy('popover');
    } else if (!kitState.ignoreBlur) {
      log.verbose(`Blurred by kit: off`);
      kitState.blurredByKit = false;
    }
  };

  promptWindow?.webContents?.on('focus', () => {
    log.info(`WebContents Focus`);
    kitState.allowBlur = false;
  });

  promptWindow?.on('focus', () => {
    log.info(`👓 Focus bounds:`, promptWindow?.getBounds());

    if (!kitState.isLinux) {
      log.verbose(`Registering emoji shortcut`);
      // Grab cmd+ctrl+space shortcut to use electron's emoji picker
      kitState.emojiActive = false;
      globalShortcut.register(getEmojiShortcut(), showEmoji);
    }
  });
  // promptWindow?.webContents?.on('blur', onBlur);
  promptWindow?.on('blur', onBlur);

  promptWindow?.on('hide', () => {
    log.silly(`event: hide`);
    kitState.isPromptReady = false;
    kitState.promptHidden = true;
  });

  promptWindow?.on('show', async () => {
    kitState.promptHidden = false;
    // kitState.allowBlur = false;
    log.silly(`event: show`);
  });

  promptWindow?.webContents?.setMaxListeners(1);

  promptWindow?.webContents?.on(
    'did-fail-load',
    (errorCode, errorDescription, validatedURL, isMainFrame) => {
      log.info(`event: did-fail-load:`, {
        errorCode,
        errorDescription,
        isMainFrame,
      });
    }
  );

  promptWindow?.webContents?.on('did-stop-loading', () => {
    log.info(`event: did-stop-loading`);
  });

  promptWindow?.webContents?.on('dom-ready', () => {
    log.info(`🍀 dom-ready on ${kitState?.scriptPath}`);

    hideAppIfNoWindows(HideReason.DomReady);
    sendToPrompt(Channel.SET_READY, true);
  });

  promptWindow?.webContents?.on('render-process-gone', (event, details) => {
    log.error(`🫣 Render process gone...`);
    log.error({ event, details });
  });

  app?.on('child-process-gone', (event, details) => {
    log.error(`🫣 Child process gone...`);
    log.error({ event, details });
  });

  // gpu-info-update
  // app?.on('gpu-info-update', () => {
  //   log.info(`🫣 gpu-info-update...`);
  //   log.info({
  //     gpuInfo: app?.getGPUInfo('complete'),
  //   });
  // });

  // accessibility-support-changed
  app?.on('accessibility-support-changed', (event, details) => {
    log.info(`🫣 accessibility-support-changed...`);
    log.info({ event, details });
  });

  const onResized = async () => {
    log.silly(`event: onResized`);
    kitState.modifiedByUser = false;
    log.info(`Resized: ${promptWindow?.getSize()}`);

    if (kitState.isResizing) {
      // sendToPrompt(Channel.SET_RESIZING, false);
      kitState.isResizing = false;
    }

    saveCurrentPromptBounds();
  };

  promptWindow?.on('will-resize', (event, rect) => {
    log.silly(`Will Resize ${rect.width} ${rect.height}`);

    kitState.modifiedByUser = true;
  });

  const willMoveHandler = debounce(
    () => {
      log.silly(`event: will-move`);
      kitState.modifiedByUser = true;
    },
    250,
    { leading: true }
  );

  const onMoved = debounce(async () => {
    log.silly(`event: onMove`);
    kitState.modifiedByUser = false;
    saveCurrentPromptBounds();
  }, 250);

  promptWindow?.on('will-move', willMoveHandler);
  promptWindow?.on('resized', onResized);
  promptWindow?.on('moved', onMoved);

  powerMonitor.on('lock-screen', () => {
    log.info(`🔒 System locked. Reloading prompt window.`);
    if (kitState.isMainScript()) maybeHide(HideReason.LockScreen);
  });

  // Debugging event listener counts...
  // setInterval(() => {
  //   const events = promptWindow?.eventNames();
  //   const logEventCountObject: any = {};
  //   for (const event of events) {
  //     const count = promptWindow?.listenerCount(event);
  //     logEventCountObject[event] = count;
  //   }

  //   const webContentsEvents = promptWindow?.webContents?.eventNames();
  //   for (const event of webContentsEvents) {
  //     const count = promptWindow?.webContents?.listenerCount(event);
  //     logEventCountObject[`webContents-${String(event)}`] = count;
  //   }

  //   log.info(logEventCountObject);
  // }, 2000);

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
    })}`
  );
};

export const focusPrompt = () => {
  log.silly(`👁️  Focusing prompt`);
  if (
    promptWindow &&
    !promptWindow.isDestroyed() &&
    !promptWindow?.isFocused() &&
    !promptWindow?.webContents?.isDevToolsOpened()
  ) {
    try {
      promptWindow?.focus();
    } catch (error) {
      log.error(error);
    }
    // promptWindow?.focusOnWebView();
  }
};

export const forceFocus = () => {
  log.silly(`function: forceFocus`);
  promptWindow?.show();
  promptWindow?.focus();
};

export const alwaysOnTop = (onTop: boolean) => {
  if (promptWindow && !promptWindow.isDestroyed()) {
    if (onTop) log.info(`🔝 Keep "alwaysOnTop"`);
    kitState.alwaysOnTop = onTop;
    promptWindow.setAlwaysOnTop(onTop, 'pop-up-menu', 1);
    if (onTop && kitState.isMac) {
      promptWindow.moveTop();
    }
  } else {
    kitState.alwaysOnTop = false;
  }
};

export const getCurrentScreenFromMouse = (): Display => {
  if (promptWindow?.isVisible() && kitState.promptCount > 1) {
    const [x, y] = promptWindow?.getPosition();
    return screen.getDisplayNearestPoint({ x, y });
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
};

export const getCurrentScreenFromPrompt = (): Display => {
  // log.info(`function: getCurrentScreenFromPrompt`);
  return screen.getDisplayNearestPoint(promptWindow.getBounds());
};

export const getCurrentScreenPromptCache = async (
  scriptPath: string,
  {
    ui,
    resize,
    bounds,
  }: { ui: UI; resize: boolean; bounds: Partial<Rectangle> } = {
    ui: UI.none,
    resize: false,
    bounds: {},
  }
) => {
  const currentScreen = await getCurrentScreen();
  const screenId = String(currentScreen.id);
  // log.info(`screens:`, promptState.screens);

  const savedPromptBounds = promptState?.screens?.[screenId]?.[scriptPath];

  if (savedPromptBounds) {
    // log.info(`📱 Screen: ${screenId}: `, savedPromptBounds);
    // log.info(`Bounds: found saved bounds for ${scriptPath}`);
    return savedPromptBounds;
  }

  // log.info(`resetPromptBounds`, scriptPath);
  const { width: screenWidth, height: screenHeight } =
    currentScreen.workAreaSize;

  let width = getDefaultWidth();
  let height = PROMPT.HEIGHT.BASE;

  log.verbose({
    ui,
    resize: Boolean(resize),
  });
  if (ui !== UI.none && resize) {
    if (ui === UI.emoji) {
      width = EMOJI_WIDTH;
      height = EMOJI_HEIGHT;
    }
    if (ui === UI.form) width /= 2;
    if (ui === UI.drop) {
      // width /= 2;
      height /= 2;
    }
    if (ui === UI.hotkey) {
      // width /= 2;
    }

    if (ui === UI.div) {
      // width /= 2;
      height = promptWindow?.getBounds()?.height;
    }

    if (ui === UI.arg) {
      // width /= 2;
    }

    if (ui === UI.editor || ui === UI.textarea) {
      width = Math.max(width, getDefaultWidth());
      height = Math.max(height, PROMPT.HEIGHT.BASE);
    }
  }

  if (typeof bounds?.width === 'number') width = bounds.width;
  if (typeof bounds?.height === 'number') height = bounds.height;

  const { x: workX, y: workY } = currentScreen.workArea;
  let x = Math.round(screenWidth / 2 - width / 2 + workX);
  let y = Math.round(workY + screenHeight / 8);

  if (typeof bounds?.x === 'number') x = bounds.x;
  if (typeof bounds?.y === 'number') y = bounds.y;

  const promptBounds = { x, y, width, height };

  if (ui === UI.none) {
    log.verbose(`Bounds: No ui, returning default`);
    return promptBounds;
  }

  return promptBounds;
};

export const setBounds = async (bounds: Partial<Rectangle>, reason = '') => {
  if (!kitState.ready) return;
  const prevSetBounds = promptWindow?.getBounds();
  const widthNotChanged =
    bounds?.width && Math.abs(bounds.width - prevSetBounds.width) < 4;
  const heightNotChanged =
    bounds?.height && Math.abs(bounds.height - prevSetBounds.height) < 4;
  const xNotChanged = bounds?.x && Math.abs(bounds.x - prevSetBounds.x) < 4;
  const yNotChanged = bounds?.y && Math.abs(bounds.y - prevSetBounds.y) < 4;

  const noChange =
    heightNotChanged && widthNotChanged && xNotChanged && yNotChanged;

  log.verbose(`📐 setBounds: reason ${reason}`, bounds);
  log.verbose({
    ...bounds,
    isVisible: isVisible() ? 'true' : 'false',
    noChange: noChange ? 'true' : 'false',
  });
  sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
    id: kitState.promptId,
    ...bounds,
  });

  if (noChange) {
    return;
  }

  // TODO: Maybe use in the future with setting the html body bounds for faster resizing?
  // promptWindow?.setContentSize(bounds.width, bounds.height);

  // Keep in bounds on the current screen
  const currentScreen = await getCurrentScreen();
  const { x, y, width, height } = bounds;
  const { x: workX, y: workY } = currentScreen.workArea;
  const { width: screenWidth, height: screenHeight } =
    currentScreen.workAreaSize;

  if (typeof bounds?.height !== 'number') bounds.height = prevSetBounds.height;
  if (typeof bounds?.width !== 'number') bounds.width = prevSetBounds.width;
  if (typeof bounds?.x !== 'number') bounds.x = prevSetBounds.x;
  if (typeof bounds?.y !== 'number') bounds.y = prevSetBounds.y;

  const xIsNumber = typeof x === 'number';

  if (xIsNumber && x < workX) {
    bounds.x = workX;
  } else if (
    width &&
    (xIsNumber ? x : prevSetBounds.x) + width > workX + screenWidth
  ) {
    bounds.x = workX + screenWidth - width;
  } else if (xIsNumber) {
    bounds.x = x;
    // } else if (!kitState.tabChanged && kitState.promptCount !== 1) {
  } else {
    bounds.x = screenWidth / 2 - bounds?.width / 2 + workX;
  }

  if (typeof y === 'number' && y < workY) {
    bounds.y = workY;
  } else if (height && (y || prevSetBounds.y) + height > workY + screenHeight) {
    bounds.y = workY + screenHeight - height;
  }

  // if width and height are larger than the screen, resize to fit
  if (width && width > screenWidth) {
    bounds.x = workX;
    bounds.width = screenWidth;
  }
  if (height && height > screenHeight) {
    bounds.y = workY;
    bounds.height = screenHeight;
  }

  try {
    promptWindow.setBounds(bounds);
    const promptBounds = {
      id: kitState.promptId,
      ...promptWindow?.getBounds(),
    };

    sendToPrompt(Channel.SET_PROMPT_BOUNDS, promptBounds);
  } catch (error) {
    log.info(`setBounds error ${reason}`, error);
  }
};

export const isVisible = () => {
  log.silly(`function: isVisible`);
  return !promptWindow.isDestroyed() && promptWindow.isVisible();
};

export const devToolsVisible = () => {
  log.silly(`function: devToolsVisible`);
  return promptWindow.webContents.isDevToolsOpened();
};

export const isFocused = () => {
  log.silly(`function: isFocused`);
  return promptWindow?.isFocused();
};

let hadPreview = true;
export const resize = async ({
  reason,
  id,
  topHeight,
  mainHeight,
  footerHeight,
  ui,
  isSplash,
  hasPreview,
  forceResize,
  forceHeight,
  forceWidth,
  inputChanged,
  justOpened,
  hasInput,
  totalChoices,
}: ResizeData) => {
  // log.info({
  //   reason,
  //   topHeight,
  //   mainHeight,
  //   resize: kitState.resize,
  //   forceResize,
  //   resizePaused: kitState.resizePaused,
  //   hasInput,
  //   inputChanged,
  //   hasPreview,
  //   totalChoices,
  // });

  if (kitState.resizePaused) return;

  if (reason === 'SETTLED') {
    setTimeout(() => {
      saveCurrentPromptBounds();
    }, 50);
  }
  if (!forceHeight && !kitState.resize && !forceResize) return;
  // if (kitState.promptId !== id || kitState.modifiedByUser) return;
  if (kitState.modifiedByUser) return;
  if (promptWindow?.isDestroyed()) return;

  const {
    width: currentWidth,
    height: currentHeight,
    x,
    y,
  } = promptWindow.getBounds();

  const targetHeight = topHeight + mainHeight + footerHeight;

  let cachedWidth;
  let cachedHeight;
  let cachedX;
  let cachedY;

  const isMainScript = kitState.isMainScript();
  if (isMainScript) {
    const cachedBounds = await getCurrentScreenPromptCache(mainScriptPath);
    if (!hasInput) {
      cachedHeight = cachedBounds?.height || PROMPT.HEIGHT.BASE;
    }
    cachedWidth = cachedBounds?.width || getDefaultWidth();

    if (typeof cachedBounds?.x === 'number') cachedX = cachedBounds?.x;
    if (typeof cachedBounds?.y === 'number') cachedY = cachedBounds?.y;
  }

  const maxHeight = Math.max(PROMPT.HEIGHT.BASE, currentHeight);
  let width = cachedWidth || forceWidth || currentWidth;
  let height =
    cachedHeight ||
    forceHeight ||
    Math.round(targetHeight > maxHeight ? maxHeight : targetHeight);

  if (isSplash) {
    width = PROMPT.WIDTH.BASE;
    height = PROMPT.HEIGHT.BASE;
  }

  height = Math.round(height);
  width = Math.round(width);

  const heightLessThanBase = height < PROMPT.HEIGHT.BASE;

  if (isMainScript && !hasInput && heightLessThanBase) {
    height = PROMPT.HEIGHT.BASE;
  }

  if ([UI.term, UI.editor].includes(ui) && heightLessThanBase) {
    height = PROMPT.HEIGHT.BASE;
  }

  if (currentHeight === height && currentWidth === width) return;

  if (hasPreview && !isMainScript) {
    width = Math.max(getDefaultWidth(), width);
  }

  if (hasPreview) {
    height =
      currentHeight < PROMPT.HEIGHT.BASE ? PROMPT.HEIGHT.BASE : currentHeight;
  }

  hadPreview = hasPreview;

  if (isVisible()) {
    // center x based on current prompt x position
    const newX = cachedX || Math.round(x + currentWidth / 2 - width / 2);
    const newY = cachedY || y;

    const bounds = { x: newX, y: newY, width, height };
    setBounds(
      bounds,
      `resize: ${reason} -> target: ${targetHeight} max: ${maxHeight} height: ${height}, force: ${
        forceResize ? 'true' : 'false'
      }`
    );

    if (kitState.promptCount === 1 && !inputChanged && justOpened) {
      savePromptBounds(kitState.scriptPath, bounds);
    }
    kitState.resizedByChoices = ui === UI.arg;
  }
};

// TODO: AppChannelMap?
export const sendToPrompt = <K extends keyof ChannelMap>(
  channel: K,
  data?: ChannelMap[K]
) => {
  if (process.env.KIT_SILLY)
    log.silly(`sendToPrompt: ${String(channel)}`, data);
  // log.info(`>_ ${channel}`);
  if (
    promptWindow &&
    !promptWindow.isDestroyed() &&
    promptWindow?.webContents
  ) {
    promptWindow?.webContents.send(String(channel), data);
  }
};

export const pingPromptWithTimeout = async <K extends keyof ChannelMap>(
  channel: K,
  data?: ChannelMap[K]
) => {
  return new Promise((resolve) => {
    let id: any = null;
    const handler = () => {
      if (id) clearTimeout(id);
      log.verbose(`🎤 ${channel} pinged...`);

      resolve('done');
    };
    id = setTimeout(() => {
      // just in case
      log.verbose(`🎤 ${channel} timeout...`);
      ipcMain.off(channel, handler);
      resolve('done');
    }, 250);
    ipcMain.once(channel, handler);
    if (process.env.KIT_SILLY)
      log.silly(`sendToPrompt: ${String(channel)}`, data);
    // log.info(`>_ ${channel}`);
    if (
      promptWindow &&
      !promptWindow.isDestroyed() &&
      promptWindow?.webContents
    ) {
      promptWindow?.webContents.send(String(channel), data);
    }
  });
};

export const getFromPrompt = <K extends keyof ChannelMap>(
  child: ChildProcess,
  channel: K,
  data?: ChannelMap[K]
) => {
  if (process.env.KIT_SILLY)
    log.silly(`sendToPrompt: ${String(channel)}`, data);
  // log.info(`>_ ${channel}`);
  if (
    promptWindow &&
    !promptWindow.isDestroyed() &&
    promptWindow?.webContents
  ) {
    ipcMain.removeAllListeners(String(channel));
    ipcMain.once(String(channel), (event, { value }) => {
      log.silly(`getFromPrompt: ${String(channel)}`, value);
      try {
        // log.info('childSend', channel, value, child, child?.connected);
        if (child && child?.connected) {
          child.send({ channel, value });
        }
      } catch (error) {
        log.error('childSend error', error);
      }
    });
    promptWindow?.webContents.send(String(channel), data);
  }
};

export const appToPrompt = (channel: AppChannel, data?: any) => {
  log.silly(`appToPrompt: ${String(channel)} ${data?.kitScript}`);
  if (
    promptWindow &&
    !promptWindow.isDestroyed() &&
    promptWindow?.webContents
  ) {
    promptWindow?.webContents.send(channel, data);
  }
};

export const pingPrompt = async (channel: AppChannel, data?: any) => {
  log.silly(`appToPrompt: ${String(channel)} ${data?.kitScript}`);
  return new Promise((resolve, reject) => {
    if (
      promptWindow &&
      !promptWindow.isDestroyed() &&
      promptWindow?.webContents
    ) {
      ipcMain.once(channel, () => {
        log.info(`🎤 ${channel} !!! <<<<`);
        resolve(true);
      });
      promptWindow?.webContents.send(channel, data);
    }
  });
};

enum Bounds {
  Position = 1 << 0,
  Size = 1 << 1,
}

export const pointOnMouseScreen = ({ x, y }: Point) => {
  log.silly(`function: pointOnMouseScreen`);
  const mouseScreen = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint()
  );
  // if bounds are off screen, don't save
  const onMouseScreen =
    x > mouseScreen.bounds.x &&
    y > mouseScreen.bounds.y &&
    x < mouseScreen.bounds.x + mouseScreen.bounds.width &&
    y < mouseScreen.bounds.y + mouseScreen.bounds.height;

  return onMouseScreen;
};

export const savePromptBounds = async (
  scriptPath: string,
  bounds: Rectangle,
  b: number = Bounds.Position | Bounds.Size
) => {
  if (!appDb.cachePrompt) {
    log.info(`Cache prompt disabled. Ignore saving bounds`);
    return;
  }
  log.info(`💾 Save Initial Bounds: ${scriptPath}`, bounds);
  // const isMain = scriptPath.includes('.kit') && scriptPath.includes('cli');
  // if (isMain) return;

  if (!pointOnMouseScreen(bounds)) return;

  const currentScreen = getCurrentScreenFromPrompt();

  try {
    const prevBounds =
      promptState?.screens?.[String(currentScreen.id)]?.[scriptPath];

    // Ignore if flag
    const size = b & Bounds.Size;
    const position = b & Bounds.Position;
    const { x, y } = position ? bounds : prevBounds || bounds;
    const { width, height } = size ? bounds : prevBounds || bounds;

    const promptBounds: PromptBounds = {
      x,
      y,
      width,
      height,
    };

    // if promptBounds is on the current screen

    writePromptState(String(currentScreen.id), scriptPath, promptBounds);
  } catch (error) {
    log.error(error);
  }
};

const writePromptState = async (
  screenId: string,
  scriptPath: string,
  bounds: PromptBounds
) => {
  log.verbose(`writePromptState`, { screenId, scriptPath, bounds });

  if (!promptState?.screens) promptState.screens = {};
  if (!promptState?.screens[screenId]) promptState.screens[screenId] = {};

  if (!bounds.height) return;
  if (!bounds.width) return;
  if (!bounds.x) return;
  if (!bounds.y) return;
  promptState.screens[screenId][scriptPath] = bounds;
};

export const hideAppIfNoWindows = (reason: HideReason) => {
  log.silly(`function: hideAppIfNoWindows: ${reason}`);
  if (promptWindow) {
    kitState.modifiedByUser = false;
    kitState.ignoreBlur = false;
    maybeHide(reason);
  }
};

export const setPlaceholder = (text: string) => {
  sendToPrompt(Channel.SET_PLACEHOLDER, text);
};

export const setFooter = (footer: string) => {
  sendToPrompt(Channel.SET_FOOTER, footer);
};

export const pidIsActive = (pid: number) => {
  // log.info(`pidIsActive`, { pid });
  return kitState.ps.find((p) => p.pid === pid);
};

export type ScriptTrigger =
  | 'startup'
  | 'shortcut'
  | 'prompt'
  | 'background'
  | 'schedule'
  | 'snippet';

let prevScriptPath = '';
let prevPid = 0;
export const setScript = async (
  script: Script,
  pid: number,
  force = false
): Promise<'denied' | 'allowed'> => {
  kitState.resizePaused = false;
  kitState.cacheChoices = Boolean(script?.cache);
  kitState.cachePrompt = Boolean(script?.cache);
  kitState.cachePreview = Boolean(script?.cache);
  // log.info(`setScript`, { script, pid });

  if (script.filePath === prevScriptPath && pid === prevPid) {
    // Using a keyboard shortcut to launch a script will hit this scenario
    // Because the app will call `setScript` immediately, then the process will call it too
    return 'denied';
  }

  if (kitState.mainMenuHasRun) {
    setScriptTimestamp({ filePath: script.filePath });
  }

  prevScriptPath = script.filePath;
  prevPid = pid;

  if (!force && (!script?.filePath || !pidMatch(pid, `setScript`))) {
    return 'denied';
  }

  kitState.pid = pid;
  sendToPrompt(Channel.SET_PID, pid);

  // if (promptWindow?.isAlwaysOnTop() && !script?.debug) {
  //   // promptWindow?.setAlwaysOnTop(false);
  //   // log.warn(`Prompt is always on top, but not a debug script`);
  // }
  kitState.scriptPath = script.filePath;
  kitState.hasSnippet = Boolean(script?.snippet);
  log.verbose(`setScript ${script.filePath}`);
  // if (promptScript?.filePath === script?.filePath) return;

  kitState.script = script;

  // if (promptScript?.id === script?.id) return;
  // log.info(script);

  if (script.filePath === mainScriptPath) {
    script.tabs = script?.tabs?.filter(
      (tab: string) => !tab.match(/join|live/i)
    );

    const sinceLast = differenceInHours(Date.now(), kitState.previousDownload);
    log.info(`Hours since sync: ${sinceLast}`);
    if (sinceLast > 6) {
      kitState.previousDownload = new Date();
    }
  }
  sendToPrompt(Channel.SET_SCRIPT, script);

  if (script.filePath === mainScriptPath) {
    emitter.emit(KitEvent.MainScript, script);
  }

  return 'allowed';
};

export const setMode = (mode: Mode) => {
  sendToPrompt(Channel.SET_MODE, mode);
};

export const setInput = (input: string) => {
  kitSearch.keywords.clear();
  kitSearch.keyword = '';
  kitSearch.input = input;
  sendToPrompt(Channel.SET_INPUT, input);
};

export const setPanel = (html: string) => {
  sendToPrompt(Channel.SET_PANEL, html);
};

export const setPreview = (html: string) => {
  sendToPrompt(Channel.SET_PREVIEW, html);
};

export const setShortcuts = (shortcuts) => {
  sendToPrompt(Channel.SET_SHORTCUTS, shortcuts);
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

let boundsCheck: any = null;
let topTimeout: any = null;

const pidMatch = (pid: number, message: string) => {
  if (pid !== kitState.pid && promptWindow?.isVisible()) {
    log.info(`pid ${pid} doesn't match active pid ${kitState.pid}. ${message}`);
    return false;
  }

  return true;
};

export const preloadPromptData = async (promptData: PromptData) => {
  let input = '';
  if (kitSearch.keyword) {
    input = `${kitSearch.keyword} `;
  } else {
    input = kitSearch.input || '';
  }

  input = promptData.input || input;

  log.info(
    `🏋️‍♂️ Preload promptData for ${promptData?.scriptPath} with input:${input}<<<`
  );
  promptData.preload = true;

  if (kitSearch.keyword) {
    promptData.keyword = kitSearch.keyword;
  }

  sendToPrompt(Channel.SET_PROMPT_DATA, {
    ...promptData,
    input,
  });

  kitState.preloaded = true;
  kitState.scriptPath = promptData.scriptPath;
  kitState.hideOnEscape = promptData.hideOnEscape;

  if (promptData?.hint) {
    const shortcodes = promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi);
    if (shortcodes) {
      kitSearch.shortcodes.clear();
      for (const shortcode of shortcodes) {
        kitSearch.shortcodes.set(shortcode, { value: shortcode });
      }
    }
  }

  if (promptData.flags) {
    setFlags(promptData.flags);
  }

  kitState.hiddenByUser = false;
  kitState.isPromptReady = false;
  kitState.alwaysOnTop =
    typeof promptData?.alwaysOnTop === 'boolean'
      ? promptData.alwaysOnTop
      : false;

  kitState.resize = promptData?.resize || false;
  kitState.shortcutsPaused = promptData.ui === UI.hotkey;
  kitState.promptUI = promptData.ui;

  kitState.promptId = promptData.id;
  if (kitState.suspended || kitState.screenLocked) return;
  kitState.ui = promptData.ui;
  if (!kitState.ignoreBlur) kitState.ignoreBlur = promptData.ignoreBlur;

  sendToPrompt(Channel.SET_OPEN, true);
};

let prevPromptData = {};

export const setPromptData = async (promptData: PromptData) => {
  kitSearch.shortcodes.clear();
  if (promptData?.hint) {
    const shortcodes = promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi);
    if (shortcodes) {
      for (const shortcode of shortcodes) {
        kitSearch.shortcodes.set(shortcode, { value: shortcode });
      }
    }
  }

  if (kitState.cachePrompt && !promptData.preload) {
    kitState.preloaded = false;
    kitState.cachePrompt = false;
    preloadPromptDataMap.set(kitState.scriptPath, {
      ...promptData,
      input: '',
      keyword: '',
    });
  }

  if (promptData.flags) {
    setFlags(promptData.flags);
  }

  if (isEqual(prevPromptData, promptData)) return;
  prevPromptData = promptData;

  kitState.hiddenByUser = false;
  kitState.isPromptReady = false;
  // if (!pidMatch(pid, `setPromptData`)) return;

  kitState.alwaysOnTop =
    typeof promptData?.alwaysOnTop === 'boolean'
      ? promptData.alwaysOnTop
      : false;

  if (promptData?.scriptPath !== kitState.scriptPath) {
    log.warn(`🚫 setPromptData: scriptPath doesn't match`);
    log.warn(`${promptData?.scriptPath} !== ${kitState.scriptPath}`);

    return;
  }

  kitState.resize = promptData?.resize || false;
  kitState.shortcutsPaused = promptData.ui === UI.hotkey;
  kitState.promptUI = promptData.ui;

  log.verbose(`setPromptData ${promptData.scriptPath}`);
  const isMainScript = kitState.isMainScript();

  kitState.promptBounds = {
    x: promptData.x,
    y: promptData.y,
    width: isMainScript
      ? getDefaultWidth()
      : promptData.width || getDefaultWidth(),
    height: isMainScript ? PROMPT.HEIGHT.BASE : promptData.height,
  };

  kitState.promptId = promptData.id;
  if (kitState.suspended || kitState.screenLocked) return;
  kitState.ui = promptData.ui;
  if (!kitState.ignoreBlur) kitState.ignoreBlur = promptData.ignoreBlur;

  if (kitSearch.keyword) {
    promptData.keyword = kitSearch.keyword || kitSearch.keyword;
  }

  await pingPromptWithTimeout(Channel.SET_PROMPT_DATA, promptData);

  if (typeof promptData?.x === 'number' || typeof promptData?.y === 'number') {
    setBounds(
      {
        x: promptData.x,
        y: promptData.y,
        width: promptData.width,
        height: promptData.height,
      },
      'PROMPT DATA HAS BOUNDS'
    );
  }

  kitState.promptCount += 1;
  if (kitState.promptCount === 1) {
    await initBounds();
  }
  // TODO: Combine types for sendToPrompt and appToPrompt?
  appToPrompt(AppChannel.USER_CHANGED, snapshot(kitState.user));

  // positionPrompt({
  //   ui: promptData.ui,
  //   scriptPath: promptData.scriptPath,
  //   tabIndex: promptData.tabIndex,
  // });

  if (kitState.hasSnippet) {
    const timeout = +kitState?.script?.snippetdelay || 120;
    // eslint-disable-next-line promise/param-names
    await new Promise((r) => setTimeout(r, timeout));
    kitState.hasSnippet = false;
  }

  if (kitState.promptHidden) {
    kitState.tabChanged = false;
  }

  if (kitState.isMac) {
    promptWindow?.showInactive();
  } else {
    promptWindow?.show();
  }
  log.verbose(`👋 Show Prompt ${kitState.pid} ${kitState.scriptPath}`);

  setBackgroundThrottling(true);

  setTimeout(() => {
    promptWindow.setAlwaysOnTop(true, 'pop-up-menu', 1);

    promptWindow.setFullScreenable(false);
  }, 0);

  if (topTimeout) clearTimeout(topTimeout);
  topTimeout = setTimeout(() => {
    if (kitState.ignoreBlur) {
      promptWindow?.setAlwaysOnTop(kitState.alwaysOnTop, 'pop-up-menu', 1);
    }
  }, 1000);

  // app.focus({
  //   steal: true,
  // });
  // if (devTools) promptWindow?.webContents.openDevTools();
  // }

  focusPrompt();
  sendToPrompt(Channel.SET_OPEN, true);

  setTimeout(() => {
    kitState.isPromptReady = true;
  }, 100);

  if (boundsCheck) clearTimeout(boundsCheck);
  boundsCheck = setTimeout(async () => {
    if (promptWindow?.isDestroyed()) return;
    const currentBounds = promptWindow?.getBounds();
    // const currentDisplayBounds = getCurrentScreenFromMouse().bounds;
    const currentDisplayBounds = (await getCurrentScreen()).bounds;

    const minX = currentDisplayBounds.x;
    const minY = currentDisplayBounds.y;
    const maxX = currentDisplayBounds.x + currentDisplayBounds.width;
    const maxY = currentDisplayBounds.y + currentDisplayBounds.height;

    if (
      currentBounds?.x < minX ||
      currentBounds?.x + currentBounds?.width > maxX ||
      currentBounds?.y < minY ||
      currentBounds?.y + currentBounds?.height > maxY
    ) {
      log.info(`Prompt window out of bounds. Clearing cache and resetting.`);
      await clearPromptCacheFor(kitState.scriptPath);
      await initBounds();
    } else {
      log.info(`Prompt window in bounds.`);
    }
  }, 1000);

  trackEvent(TrackEvent.SetPrompt, {
    ui: promptData.ui,
    script: path.basename(promptData.scriptPath),
    name: promptData?.name || kitState?.script?.name || '',
    description: promptData?.description || kitState?.script?.description || '',
  });
};

export const preloadPreview = (html: string) => {
  log.info(`🏋️‍♂️ Preload preview`);
  setPreview(html);
};

export const preloadChoices = (choices: Choice[]) => {
  log.info(`🏋️‍♂️ Preload choices ${choices.length}`);
  kitSearch.input = '';
  setChoices(choices, { preload: true });
};

export const preload = (promptScriptPath: string, show = true) => {
  if (preloadPromptDataMap.has(promptScriptPath)) {
    if (show) setBackgroundThrottling(false);
    sendToPrompt(AppChannel.SCROLL_TO_INDEX, 0);
    sendToPrompt(Channel.SET_TAB_INDEX, 0);
    sendToPrompt(AppChannel.SET_PRELOADED, true);

    if (preloadChoicesMap.has(promptScriptPath)) {
      const promptData = preloadPromptDataMap.get(
        promptScriptPath
      ) as PromptData;

      preloadPromptData(promptData);

      const choices = preloadChoicesMap.get(promptScriptPath) as Choice[];
      preloadChoices(choices as Choice[]);

      const preview = preloadPreviewMap.get(promptScriptPath) as string;
      preloadPreview(preview || `<div></div>`);

      kitState.promptBounds = {
        x: promptData.x,
        y: promptData.y,
        width:
          mainScriptPath === promptData.scriptPath
            ? getDefaultWidth()
            : promptData.width || getDefaultWidth(),
        height:
          mainScriptPath === promptData.scriptPath
            ? PROMPT.HEIGHT.BASE
            : promptData.height,
      };

      initBounds(promptScriptPath, show, promptScriptPath === mainScriptPath);
    }
  }
};

export const setScoredChoices = (choices: ScoredChoice[]) => {
  if (kitSearch.choices?.length) {
    log.info(`🎼 Scored choices count: ${choices.length}`);
  }
  sendToPrompt(Channel.SET_SCORED_CHOICES, choices);
};

export const setScoredFlags = (choices: ScoredChoice[]) => {
  // log.info(`🎼 Scored flags count: ${choices.length}`);
  sendToPrompt(Channel.SET_SCORED_FLAGS, choices);
};

export const invokeFlagSearch = (input: string) => {
  flagSearch.input = input;
  if (input === '') {
    setScoredFlags(
      flagSearch.choices
        .filter((c) => !c?.pass && !c?.hideWithoutInput && !c?.miss)
        .map(createScoredChoice)
    );
    return;
  }

  const result = flagSearch?.qs?.search(input) as ScoredChoice[];

  if (flagSearch.hasGroup) {
    // Build a map for constant time access
    const resultMap = new Map();
    const keepGroups = new Set();
    for (const r of result) {
      resultMap.set(r.item.id, r);
      keepGroups.add(r.item.group);
    }

    keepGroups.add('Pass');

    let groupedResults: ScoredChoice[] = [];

    const matchGroup = [
      createScoredChoice({
        name: 'Exact Match',
        group: 'Match',
        pass: true,
        skip: true,
        nameClassName: defaultGroupNameClassName,
        className: defaultGroupClassName,
        height: PROMPT.ITEM.HEIGHT.XXXS,
      }),
    ];
    const missGroup = [];

    for (const choice of flagSearch.choices) {
      const hide = choice?.hideWithoutInput && input === '';
      const miss = choice?.miss && !hide;
      if (miss) {
        missGroup.push(createScoredChoice(choice));
      } else if (!hide) {
        const scoredChoice = resultMap.get(choice.id);
        if (choice?.pass) {
          groupedResults.push(createScoredChoice(choice));
        }

        if (scoredChoice) {
          groupedResults.push(scoredChoice);
        } else if (choice?.skip && keepGroups?.has(choice?.group)) {
          groupedResults.push(createScoredChoice(choice));
        }
      }
    }

    if (matchGroup.length > 1) {
      groupedResults = matchGroup.concat(groupedResults);
    }

    if (groupedResults.length === 0) {
      groupedResults = missGroup;
    }

    setScoredFlags(groupedResults);
  } else if (result?.length === 0) {
    const missGroup = flagSearch.choices
      .filter((c) => c?.miss)
      .map(createScoredChoice);
    setScoredFlags(missGroup);
  } else {
    setScoredFlags(result);
  }
};

export const invokeSearch = (rawInput: string) => {
  log.info(`Invoke search: ${rawInput}`);
  let transformedInput = rawInput;
  if (kitSearch.inputRegex) {
    // eslint-disable-next-line no-param-reassign
    transformedInput = rawInput.match(kitSearch.inputRegex)?.[0] || '';
    log.info(
      `Transformed input: ${transformedInput} using regex ${kitSearch.inputRegex}`
    );
  }

  if (kitSearch.choices.length === 0) {
    setScoredChoices([]);
    return;
  }

  // TODO: Add kitSearch.computedInput?
  // Should probably separate rawInput from the input that comes after the regex...
  kitSearch.input = transformedInput;
  flagSearch.input = '';
  if (transformedInput === '') {
    const results = kitSearch.choices
      .filter((c) => {
        if (c?.miss || c?.pass || c?.hideWithoutInput) return false;

        return true;
      })
      .map(createScoredChoice);

    if (results?.length === 0) {
      const misses = kitSearch.choices
        .filter((c) => c?.miss || c?.info)
        .map(createScoredChoice);
      setScoredChoices(misses);
    } else {
      setScoredChoices(results);
    }

    return;
  }

  if (!kitSearch.qs) {
    log.warn(`No qs for ${kitState.scriptPath}`);
    return;
  }
  const result = (kitSearch?.qs as QuickScore<Choice>)?.search(
    transformedInput
  ) as ScoredChoice[];

  if (kitSearch.hasGroup) {
    // Build a map for constant time access
    const resultMap = new Map();
    const keepGroups = new Set();
    const removeGroups = new Map<string, { count: number; index: number }>();
    for (const r of result) {
      resultMap.set(r.item.id, r);
      keepGroups.add(r.item.group);
      removeGroups.set(r.item.group as string, {
        count: 0,
        index: 0,
      });
    }

    keepGroups.add('Pass');

    let groupedResults: ScoredChoice[] = [];

    const matchGroup = [];
    const missGroup = [];
    let alias: Choice;

    for (const choice of kitSearch.choices) {
      if ((choice as Script)?.alias === transformedInput) {
        alias = structuredClone(choice);
        alias.tag = (choice as Script)?.kenv || choice?.group || '';
        alias.pass = false;
        alias.group = 'Alias';
      } else if (
        !choice?.skip &&
        !choice?.miss &&
        choice.name?.toLowerCase()?.startsWith(transformedInput?.toLowerCase())
      ) {
        const scoredChoice = resultMap.get(choice.id);
        if (scoredChoice) {
          const c = structuredClone(scoredChoice);
          c.item.tag =
            c?.item?.kenv || c?.item?.group === 'Pass' ? '' : c?.item?.group;
          // This was breaking the choice.preview lookup in the SDK
          // c.item.id = Math.random();
          c.item.pass = false;
          matchGroup.push(c);
        }
      } else {
        const hide = choice?.hideWithoutInput && transformedInput === '';
        const miss = choice?.miss && !hide;
        if (miss) {
          missGroup.push(createScoredChoice(choice));
        } else if (!hide) {
          const scoredChoice = resultMap.get(choice.id);
          if (choice?.pass) {
            groupedResults.push(createScoredChoice(choice));
          } else if (scoredChoice) {
            groupedResults.push(scoredChoice);
            const removeGroup = removeGroups.get(scoredChoice?.item?.group);
            if (removeGroup) {
              if (scoredChoice?.item?.skip && removeGroup.index === 0) {
                removeGroup.index = groupedResults.length - 1;
              } else {
                removeGroup.count += 1;
              }
            }
          } else if (choice?.skip && keepGroups?.has(choice?.group)) {
            const removeGroup = removeGroups.get(choice?.group as string);

            groupedResults.push(createScoredChoice(choice));
            if (removeGroup && removeGroup.index === 0) {
              removeGroup.index = groupedResults.length - 1;
            }
          }
        }
      }
    }

    removeGroups.delete('Pass');

    // loop through removeGroups and remove groups that have no results
    // Sort removeGroups by index in descending order
    const sortedRemoveGroups = Array.from(removeGroups).sort(
      (a, b) => b[1].index - a[1].index
    );
    for (const [group, { count, index }] of sortedRemoveGroups) {
      // log.info(`Group ${group} has ${count} results at ${index}`);
      // log.info(`The item at ${index} is ${groupedResults[index]?.item?.name}`);
      if (count === 0) {
        // log.info(
        //   `🗑 ${group} with no results. Removing ${groupedResults[index].item.name}`
        // );
        groupedResults.splice(index, 1);
      }
    }

    if (matchGroup.length > 0) {
      matchGroup.sort((a, b) => {
        if (a?.item?.keyword && !b?.item?.keyword) return -1;
        if (!a?.item?.keyword && b?.item?.keyword) return 1;

        return 0;
      });
      matchGroup.unshift(
        createScoredChoice({
          name: 'Exact Match',
          group: 'Match',
          pass: false,
          skip: true,
          nameClassName: defaultGroupNameClassName,
          className: defaultGroupClassName,
          height: PROMPT.ITEM.HEIGHT.XXXS,
          id: Math.random().toString(),
        })
      );
      groupedResults.unshift(...matchGroup);
    }

    if (groupedResults.length === 0) {
      groupedResults = missGroup;
    }

    if (alias)
      groupedResults.unshift(
        createScoredChoice({
          name: 'Alias',
          group: 'Alias',
          pass: false,
          skip: true,
          nameClassName: defaultGroupNameClassName,
          className: defaultGroupClassName,
          height: PROMPT.ITEM.HEIGHT.XXXS,
          id: Math.random().toString(),
        }),
        createScoredChoice(alias)
      );

    setScoredChoices(groupedResults);
  } else if (result?.length === 0) {
    const missGroup = kitSearch.choices
      .filter((c) => c?.miss || c?.pass || c?.info)
      .map(createScoredChoice);
    setScoredChoices(missGroup);
  } else {
    const allMisses = result.every((r) => r?.item?.miss && r?.item?.info);
    if (allMisses) {
      setScoredChoices(result);
    } else {
      const filterConditions = result.filter((r) => {
        if (r.item.miss) return false;
        if (r.item.info) return true;
        if (r.item.pass) return true;
        if (transformedInput === '' && r.item.hideWithoutInput) return false;

        return true;
      });
      setScoredChoices(filterConditions);
    }
  }
};

export const debounceInvokeSearch = debounce(invokeSearch, 100);

export const setShortcodes = (choices: Choice[]) => {
  kitSearch.shortcodes.clear();

  for (const choice of choices) {
    const code = (
      choice?.shortcode ||
      choice?.name?.match(/(?<=\[)\w+(?=\])/i)?.[0] ||
      ''
    ).toLowerCase();

    if (code) {
      kitSearch.shortcodes.set(code, choice);
    }

    if (choice?.keyword) {
      // log.info(`🗝 Found keyword ${choice.keyword}`);
      kitSearch.keywords.set(choice.keyword.toLowerCase(), choice);
    }
  }
};

export const appendChoices = (choices: Choice[]) => {
  setChoices(kitSearch.choices.concat(choices), { preload: false });
};

export const setFlags = (f: FlagsWithKeys) => {
  const order = f?.order || [];
  const sortChoicesKey = f?.sortChoicesKey || [];

  let flagChoices = Object.entries(f)
    .filter(([key]) => {
      if (key === 'order') return false;
      if (key === 'sortChoicesKey') return false;
      return true;
    })
    .map(([key, value]: [string, any]) => {
      return {
        id: key,
        group: value?.group,
        command: value?.name,
        filePath: value?.name,
        name: value?.name || key,
        shortcut: value?.shortcut || '',
        friendlyShortcut: value?.shortcut || '',
        description: value?.description || '',
        value: key,
        preview: value?.preview || '',
      };
    });

  if (flagChoices.find((c: Choice) => c?.group)) {
    flagChoices = groupChoices(flagChoices, {
      order,
      sortChoicesKey,
    });
  }

  const choices = formatChoices(flagChoices);

  flagSearch.choices = choices;
  flagSearch.hasGroup = Boolean(choices?.find((c: Choice) => c?.group));
  function scorer(string: string, query: string, matches: number[][]) {
    return quickScore(
      string,
      query,
      matches as any,
      undefined,
      undefined,
      createConfig({
        maxIterations: kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS
          ? parseInt(kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS, 32)
          : 3,
      })
    );
  }

  const keys = kitState?.kenvEnv?.KIT_SEARCH_KEYS
    ? kitState?.kenvEnv?.KIT_SEARCH_KEYS.split(',').map((k) => k.trim())
    : ['slicedName', 'friendlyShortcut', 'tag', 'group', 'command'];

  flagSearch.qs = new QuickScore(choices, {
    keys: keys.map((name) => ({
      name,
      scorer,
    })),
    minimumScore: kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE
      ? parseInt(kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE, 10)
      : 0.6,
  } as any);

  // setFlagShortcodes(choices);

  log.info(`Flag choices: ${choices.length}`);
  invokeFlagSearch(flagSearch.input);
};

export const setChoices = (
  choices: Choice[],
  {
    // eslint-disable-next-line @typescript-eslint/no-shadow
    preload,
    skipInitialSearch,
    generated,
  }: { preload: boolean; skipInitialSearch?: boolean; generated?: boolean }
) => {
  if (!choices || !Array.isArray(choices) || choices?.length === 0) {
    kitSearch.choices = [];
    setScoredChoices([]);
    kitSearch.hasGroup = false;
    kitSearch.qs = null;
    return;
  }

  if (generated) {
    log.info(`📦 ${kitState.pid} Generated choices: ${choices.length}`);
    setScoredChoices(choices.map(createScoredChoice));
    return;
  }

  log.info(`📦 ${kitState.pid} Choices: ${choices.length} preload: ${preload}`);
  kitSearch.choices = choices.filter((c) => !c?.exclude);
  kitSearch.hasGroup = Boolean(choices?.find((c: Choice) => c?.group));
  function scorer(string: string, query: string, matches: number[][]) {
    return quickScore(
      string,
      query,
      matches as any,
      undefined,
      undefined,
      createConfig({
        maxIterations: kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS
          ? parseInt(kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS, 32)
          : 3,
      })
    );
  }

  const keys = kitState?.kenvEnv?.KIT_SEARCH_KEYS
    ? kitState?.kenvEnv?.KIT_SEARCH_KEYS.split(',').map((k) => k.trim())
    : ['slicedName', 'friendlyShortcut', 'tag', 'group', 'command'];

  kitSearch.qs = new QuickScore(choices, {
    keys: keys.map((name) => ({
      name,
      scorer,
    })),
    minimumScore: kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE
      ? parseInt(kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE, 10)
      : 0.6,
  } as any);
  sendToPrompt(Channel.SET_CHOICES_CONFIG, { preload });

  setShortcodes(choices);
  log.info(`Searching because choices: ${kitSearch.input}`);
  invokeSearch(skipInitialSearch ? '' : kitSearch.input);
};

export const clearPromptCache = async () => {
  try {
    promptState.screens = {};
  } catch (error) {
    log.info(error);
  }

  promptWindow?.webContents?.setZoomLevel(ZOOM_LEVEL);
  kitState.resizePaused = true;
  await initBounds();

  setTimeout(() => {
    kitState.resizePaused = false;
  }, 1000);
};

export const reload = (callback: () => void = () => {}) => {
  log.info(`Reloading prompt window...`);
  if (promptWindow?.isDestroyed()) {
    log.warn(`Prompt window is destroyed. Not reloading.`);
    return;
  }

  if (callback) {
    promptWindow?.webContents?.once('dom-ready', () => {
      setTimeout(callback, 1000);
    });
  }

  promptWindow?.reload();
};

export const getPromptBounds = () => promptWindow.getBounds();
export const getMainPrompt = () => promptWindow;

export const destroyPromptWindow = () => {
  if (promptWindow && !promptWindow?.isDestroyed()) {
    hideAppIfNoWindows(HideReason.Destroy);
    promptWindow.destroy();
  }
};

export const onHideOnce = (fn: () => void) => {
  let id: null | NodeJS.Timeout = null;
  if (promptWindow) {
    const handler = () => {
      if (id) clearTimeout(id);
      promptWindow.removeListener('hide', handler);
      fn();
    };

    id = setTimeout(() => {
      if (promptWindow?.isDestroyed()) return;
      promptWindow?.removeListener('hide', handler);
    }, 1000);

    promptWindow?.once('hide', handler);
  }
};

export const initBounds = async (
  forceScriptPath?: string,
  show = false,
  isMain = false
) => {
  if (promptWindow?.isDestroyed()) return;

  const bounds = await getCurrentScreenPromptCache(
    forceScriptPath || kitState.scriptPath,
    {
      ui: kitState.promptUI,
      resize: kitState.resize,
      bounds: kitState.promptBounds,
    }
  );
  if (promptWindow?.isDestroyed()) return;

  if (promptWindow?.isVisible()) {
    log.info(`↖ Ignore init bounds, already visible`);
    return;
  }
  log.info(`↖ Init bounds: Prompt ${kitState.promptUI} ui`, bounds);

  // If widths or height don't match, send SET_RESIZING to prompt

  const { width, height } = promptWindow?.getBounds();
  if (bounds.width !== width || bounds.height !== height) {
    log.verbose(
      `Started resizing: ${promptWindow?.getSize()}. Prompt count: ${
        kitState.promptCount
      }`
    );

    // sendToPrompt(Channel.SET_RESIZING, true);
    kitState.isResizing = true;
  }

  // if (isKitScript(kitState.scriptPath)) return;

  setBounds(
    bounds,
    `promptId ${kitState.promptId} - promptCount ${
      kitState.promptCount
    } - kitState.promptBounds ${JSON.stringify(kitState.promptBounds)}`
    // promptWindow?.isVisible() &&
    //   kitState.promptCount > 1 &&
    //   !kitState.promptBounds.height
  );

  if (!show) {
    return;
  }
  if (!isMain) {
    // eslint-disable-next-line promise/param-names
    // await new Promise((r) => setTimeout(r, 40));
    // eslint-disable-next-line promise/param-names
    await new Promise((r) => {
      const id = setTimeout(() => {
        r(true);
      }, 200);
      ipcMain.once(Channel.ON_INIT, () => {
        clearTimeout(id);
        r(true);
      });
    });
  }

  log.info(`👋 Show Prompt for ${kitState.scriptPath}`);
  promptWindow?.setAlwaysOnTop(true, 'pop-up-menu', 1);
  promptWindow?.setFullScreenable(false);

  if (kitState.isMac) {
    promptWindow.showInactive();
  } else {
    promptWindow.show();
  }
  promptWindow.focus();
};

const subScriptPath = subscribeKey(
  kitState,
  'scriptPath',
  async (scriptPath) => {
    log.verbose(`📄 scriptPath changed: ${scriptPath}`);
    if (promptWindow?.isDestroyed()) return;
    const noScript = kitState.scriptPath === '';

    kitState.promptUI = UI.none;
    kitState.resizedByChoices = false;

    if (pathsAreEqual(scriptPath || '', kitState.scriptErrorPath)) {
      kitState.scriptErrorPath = '';
    }

    if (noScript) {
      log.verbose(
        `noScript: scriptPath changed: ${kitState.scriptPath}, prompt count: ${kitState.promptCount}`
      );

      hideAppIfNoWindows(HideReason.NoScript);
      clearSearch();
      sendToPrompt(Channel.SET_OPEN, false);
      kitState.alwaysOnTop = false;
      return;
    }

    kitState.prevScriptPath = kitState.scriptPath;
  }
);

const subIsSponsor = subscribeKey(kitState, 'isSponsor', (isSponsor) => {
  log.info(`🎨 Sponsor changed:`, isSponsor);
  setKitStateAtom({ isSponsor });
});

const setKitStateAtom = (partialState: Partial<typeof kitState>) => {
  if (
    promptWindow &&
    !promptWindow.isDestroyed() &&
    promptWindow?.webContents
  ) {
    promptWindow?.webContents.send(AppChannel.KIT_STATE, partialState);
  }
};

const subUpdateDownloaded = subscribeKey(
  kitState,
  'updateDownloaded',
  (updateDownloaded) => {
    setKitStateAtom({ updateDownloaded });
  }
);

const subEscapePressed = subscribeKey(
  kitState,
  'escapePressed',
  (escapePressed) => {
    setKitStateAtom({ escapePressed });
  }
);

const subAppDbMini = subscribeKey(appDb, 'mini', () => {
  clearPromptCache();
});

const subAppDbCachePrompt = subscribeKey(appDb, 'cachePrompt', () => {
  clearPromptCache();
});

export const clearPromptCacheFor = async (scriptPath: string) => {
  try {
    const displays = screen.getAllDisplays();
    for await (const display of displays) {
      if (promptState?.screens?.[display.id]?.[scriptPath]) {
        delete promptState.screens[display.id][scriptPath];
        log.verbose(`🗑 Clear prompt cache for ${scriptPath} on ${display.id}`);
      }
    }
  } catch (e) {
    log.error(e);
  }

  if (preloadChoicesMap.has(scriptPath)) {
    preloadChoicesMap.delete(scriptPath);
  }

  if (preloadPromptDataMap.has(scriptPath)) {
    preloadPromptDataMap.delete(scriptPath);
  }

  if (preloadPreviewMap.has(scriptPath)) {
    preloadPreviewMap.delete(scriptPath);
  }
};

export const clearPromptTimers = async () => {
  try {
    if (boundsCheck) clearTimeout(boundsCheck);
    if (topTimeout) clearTimeout(topTimeout);
  } catch (e) {
    log.error(e);
  }
};

export const forcePromptToMouse = async () => {
  if (promptWindow?.isDestroyed()) {
    log.warn(`Prompt window is destroyed. Not forcing to mouse.`);
    return;
  }

  const mouse = screen.getCursorScreenPoint();
  promptWindow?.setPosition(mouse.x, mouse.y);
};

export const debugPrompt = async () => {
  const promptLog = log.create('promptLog');
  const promptLogPath = kenvPath('logs', 'prompt.log');

  promptLog.transports.file.resolvePath = () => promptLogPath;
  const getPromptInfo = async () => {
    const activeAppBounds: any = {};
    // REMOVE-NUT
    const { getActiveWindow } = await import('@nut-tree/nut-js');
    const activeWindow = await getActiveWindow();
    if (activeWindow) {
      const region = await activeWindow.region;
      activeAppBounds.x = region.left;
      activeAppBounds.y = region.top;
      activeAppBounds.width = region.width;
      activeAppBounds.height = region.height;
      activeAppBounds.title = await activeWindow.title;
    }
    // END-REMOVE-NUT

    const promptBounds = promptWindow?.getBounds();
    const screenBounds = (await getCurrentScreen()).bounds;
    const mouse = screen.getCursorScreenPoint();

    promptLog.info({
      scriptPath: kitState.scriptPath,
      isVisible: promptWindow?.isVisible() ? 'true' : 'false',
      promptBounds,
      screenBounds,
      mouse,
      activeAppBounds,
    });
  };

  shell.openPath(promptLogPath);

  const id = setInterval(getPromptInfo, 3000);
  // stop after 1 minute
  setTimeout(() => {
    clearInterval(id);
  }, 60000);
};

subs.push(
  subScriptPath,
  subIsSponsor,
  subUpdateDownloaded,
  subEscapePressed,
  subAppDbMini,
  subAppDbCachePrompt
);
