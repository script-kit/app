/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
/* eslint-disable consistent-return */
import glasstron from 'glasstron-clarity';
import { PROMPT, Channel, Mode, UI } from '@johnlindquist/kit/cjs/enum';
import {
  Choice,
  Script,
  PromptData,
  PromptBounds,
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
} from 'electron';
import os from 'os';
import path from 'path';
import log from 'electron-log';
import { debounce } from 'lodash';
import { mainScriptPath } from '@johnlindquist/kit/cjs/utils';
import { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { Display } from 'electron/main';
import { differenceInHours } from 'date-fns';

import { ChildProcess } from 'child_process';
import { getAssetPath } from './assets';
import { appDb, kitState, subs, promptState } from './state';
import {
  DEFAULT_EXPANDED_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  EMOJI_HEIGHT,
  EMOJI_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
  ZOOM_LEVEL,
} from './defaults';
import { ResizeData } from './types';
import { getVersion } from './version';
import { AppChannel } from './enums';
import { emitter, KitEvent } from './events';
import { pathsAreEqual } from './helpers';

let promptWindow: BrowserWindow;

const getDefaultWidth = () => {
  return appDb.mini ? DEFAULT_WIDTH : DEFAULT_EXPANDED_WIDTH;
};

export const blurPrompt = () => {
  log.info(`blurPrompt`);
  if (promptWindow?.isDestroyed()) return;
  if (promptWindow) {
    promptWindow.blur();
  }
};

export const maybeHide = async (reason: string) => {
  if (kitState.debugging) return;
  if (!kitState.ignoreBlur && promptWindow?.isVisible()) {
    log.verbose(`Hiding because ${reason}`);
    if (
      !promptWindow?.webContents?.isDevToolsOpened() &&
      !kitState.preventClose
    ) {
      if (!kitState.isMac) {
        promptWindow?.minimize();
      }

      promptWindow?.hide();
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

export const setBackgroundThrottling = (enabled: boolean) => {
  if (promptWindow?.isDestroyed()) return;
  log.info(`setBackgroundThrottling: ${enabled ? 'enabled' : 'disabled'}`);
  promptWindow?.webContents?.setBackgroundThrottling(enabled);
};

export const createPromptWindow = async () => {
  log.silly(`function: createPromptWindow`);

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
    width: getDefaultWidth(),
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: PROMPT.INPUT.HEIGHT.XS,
    type: 'panel',
  };

  // Disable Windows show animation

  if (kitState.isMac) {
    promptWindow = new BrowserWindow({
      ...options,
      transparent: true,
    });
    promptWindow.setVibrancy('hud');
  } else {
    promptWindow = new glasstron.BrowserWindow({
      ...options,

      blur: true,
    });

    try {
      promptWindow.setBackgroundColor(`#00000000`);
    } catch (error) {
      log.error('Failed to set window blur', error);
    }
  }

  promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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

  // if (!kitState.isMac) {
  //   promptWindow.setAlwaysOnTop(true, 'modal-panel');
  // }
  // promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

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
    reload();
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
    maybeHide('Devtools closed');
  });

  emitter.on(KitEvent.OpenDevTools, () => {
    log.silly(`event: OpenDevTools`);
    promptWindow?.webContents?.openDevTools({
      activate: true,
      mode: 'detach',
    });
  });

  emitter.on(KitEvent.TermExited, (value: string) => {
    appToPrompt(AppChannel.TERM_EXIT, value);
  });

  promptWindow?.setMaxListeners(2);

  const onBlur = () => {
    log.silly(`event: onBlur`);

    if (!kitState.isPromptReady) return;

    if (promptWindow?.isDestroyed()) return;
    if (kitState.isActivated) {
      kitState.isActivated = false;
      return;
    }
    if (promptWindow?.webContents?.isDevToolsOpened()) return;

    // if (!promptWindow?.isFocused()) return;

    log.verbose(`Blur: ${kitState.ignoreBlur ? 'ignored' : 'accepted'}`);

    if (promptWindow?.isVisible() && !kitState.ignoreBlur) {
      sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
    }
    maybeHide('blur');

    if (os.platform().startsWith('win')) {
      return;
    }

    if (kitState.ignoreBlur) {
      // promptWindow?.setVibrancy('popover');
    } else if (!kitState.ignoreBlur) {
      log.verbose(`Blurred by kit: off`);
      kitState.blurredByKit = false;
    }

    // if (!kitState.isMac)
    //   sendToPrompt(Channel.SET_THEME, {
    //     '--opacity-themedark': '100%',
    //     '--opacity-themelight': '100%',
    //   });
  };

  promptWindow?.webContents?.on('focus', () => {
    log.info(`WebContents Focus`);
    kitState.allowBlur = false;
  });

  promptWindow?.on('focus', () => {
    log.info(`Focus`);
  });
  // promptWindow?.webContents?.on('blur', onBlur);
  promptWindow?.on('blur', onBlur);

  promptWindow?.on('hide', () => {
    log.silly(`event: hide`);
    // setBackgroundThrottling(false);
    kitState.isPromptReady = false;
    kitState.promptHidden = true;
  });

  promptWindow?.on('show', async () => {
    kitState.promptHidden = false;
    // kitState.allowBlur = false;
    log.info(`event: show`);
  });

  promptWindow?.webContents?.on('dom-ready', () => {
    log.info(`🍀 dom-ready on ${kitState?.scriptPath}`);

    hideAppIfNoWindows('dom-ready');
    sendToPrompt(Channel.SET_READY, true);
  });

  const onMove = async () => {
    log.silly(`event: onMove`);
    kitState.modifiedByUser = false;
  };

  const onResized = async () => {
    log.silly(`event: onResized`);
    kitState.modifiedByUser = false;
    log.info(`Resized: ${promptWindow?.getSize()}`);

    if (kitState.isResizing) {
      // sendToPrompt(Channel.SET_RESIZING, false);
      kitState.isResizing = false;
    }
  };

  promptWindow?.on('will-resize', (event, rect) => {
    log.silly(`Will Resize ${rect.width} ${rect.height}`);

    if (rect.height < MIN_HEIGHT) event.preventDefault();
    if (rect.width < MIN_WIDTH) event.preventDefault();

    kitState.modifiedByUser = true;
  });

  promptWindow?.on('will-move', () => {
    log.silly(`event: will-move`);
    kitState.modifiedByUser = true;
  });
  promptWindow?.on('resized', onResized);
  promptWindow?.on('moved', debounce(onMove, 250));

  // powerMonitor.addListener('user-did-resign-active', () => {
  //   log.info(`🔓 System unlocked. Reloading prompt window.`);
  //   reload();
  // });

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
  log.silly(`function: alwaysOnTop`);
  if (promptWindow && !promptWindow.isDestroyed())
    promptWindow.setAlwaysOnTop(onTop);
};

export const getCurrentScreenFromMouse = (): Display => {
  if (promptWindow?.isVisible() && kitState.promptCount > 1) {
    const [x, y] = promptWindow?.getPosition();
    return screen.getDisplayNearestPoint({ x, y });
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
};

export const getCurrentScreenFromPrompt = (): Display => {
  log.info(`function: getCurrentScreenFromPrompt`);
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
  log.silly(`function: getCurrentScreenPromptCache`);
  const currentScreen = getCurrentScreenFromMouse();
  const screenId = String(currentScreen.id);
  // log.info(`screens:`, promptState.screens);

  const savedPromptBounds = promptState?.screens?.[screenId]?.[scriptPath];

  // log.info(`📱 Screen: ${screenId}: `, savedPromptBounds);

  if (savedPromptBounds && kitState.promptCount === 1) {
    // log.info(`Bounds: found saved bounds for ${scriptPath}`);
    return savedPromptBounds;
  }

  // log.info(`resetPromptBounds`, scriptPath);
  const {
    width: screenWidth,
    height: screenHeight,
  } = currentScreen.workAreaSize;

  let width = getDefaultWidth();
  let height = DEFAULT_HEIGHT;

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
      height = Math.max(height, DEFAULT_HEIGHT);
    }
  }

  if (bounds?.width) width = bounds.width;
  if (bounds?.height) height = bounds.height;

  const { x: workX, y: workY } = currentScreen.workArea;
  let x = Math.round(screenWidth / 2 - width / 2 + workX);
  let y = Math.round(workY + screenHeight / 8);

  if (bounds?.x) x = bounds.x;
  if (bounds?.y) y = bounds.y;

  const promptBounds = { x, y, width, height };

  if (ui === UI.none) {
    log.verbose(`Bounds: No ui, returning default`);
    return promptBounds;
  }

  return promptBounds;

  // if (!promptState?.screens) {
  //   promptState.screens = {};
  // }
  // if (!promptState?.screens[screenId]) {
  //   promptState.screens[screenId] = {};
  // }
  // const boundsFilePath = promptState.screens?.[screenId]?.[scriptPath];
  // const maybeBounds = boundsFilePath || {};

  // if (!boundsFilePath) {
  //   const promptBounds = {
  //     ...bounds,
  //     x: maybeBounds?.x || bounds.x,
  //     y: maybeBounds?.y || bounds.y,
  //   };

  //   // writePromptState(screenId, scriptPath, promptBounds);
  // }
};

export const setBounds = (bounds: Rectangle, reason = '') => {
  // log.info(`📐 setBounds, reason ${reason}`, bounds);
  // TODO: Maybe use in the future with setting the html body bounds for faster resizing?
  // promptWindow?.setContentSize(bounds.width, bounds.height);
  try {
    promptWindow.setBounds(bounds);
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
}: ResizeData) => {
  if (!forceHeight && !kitState.resize && !forceResize) return;
  if (kitState.promptId !== id || kitState.modifiedByUser) return;
  if (promptWindow?.isDestroyed()) return;

  const {
    width: currentWidth,
    height: currentHeight,
    x,
    y,
  } = promptWindow.getBounds();
  const targetHeight = topHeight + mainHeight + footerHeight;
  const maxHeight = Math.max(DEFAULT_HEIGHT, currentHeight);
  let width = forceWidth || currentWidth;
  let height =
    forceHeight ||
    Math.round(targetHeight > maxHeight ? maxHeight : targetHeight);

  if (isSplash) {
    width = DEFAULT_EXPANDED_WIDTH;
    height = DEFAULT_HEIGHT;
  }

  height = Math.round(height);
  width = Math.round(width);
  if (currentHeight === height && currentWidth === width) return;

  if (hasPreview) {
    width = Math.max(getDefaultWidth(), width);
  }

  if (isVisible()) {
    // center x based on current prompt x position
    const newX = Math.round(x + currentWidth / 2 - width / 2);

    const bounds = { x: newX, y, width, height };
    setBounds(
      bounds,
      `resize: ${reason} -> target: ${targetHeight} max: ${maxHeight} height: ${height}, force: ${
        forceResize ? 'true' : 'false'
      }`
    );
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
  log.silly(`function: savePromptBounds`);
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
      width: width < MIN_WIDTH ? MIN_WIDTH : width,
      height: height < MIN_HEIGHT ? MIN_HEIGHT : height,
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
  log.silly(`writePromptState`, { screenId, scriptPath, bounds });

  if (!promptState?.screens) promptState.screens = {};
  if (!promptState?.screens[screenId]) promptState.screens[screenId] = {};

  if (!bounds.height) return;
  if (!bounds.width) return;
  if (!bounds.x) return;
  if (!bounds.y) return;
  promptState.screens[screenId][scriptPath] = bounds;
};

export const hideAppIfNoWindows = (reason: string) => {
  log.silly(`function: hideAppIfNoWindows: ${reason}`);
  if (promptWindow) {
    // const allWindows = BrowserWindow.getAllWindows();
    // Check if all other windows are hidden

    kitState.modifiedByUser = false;
    kitState.ignoreBlur = false;
    maybeHide(reason);

    // setTimeout(() => {
    //   if (!promptWindow?.isVisible()) {
    //     promptWindow.webContents.setBackgroundThrottling(true);
    //   }
    // }, 1000);
    // setPromptBounds();

    // if (allWindows.every((window) => !window.isVisible())) {
    // if (app?.hide) app?.hide();
    // }
  }
};

export const setPlaceholder = (text: string) => {
  sendToPrompt(Channel.SET_PLACEHOLDER, text);
};

export const setFooter = (footer: string) => {
  sendToPrompt(Channel.SET_FOOTER, footer);
};

export const pidIsActive = (pid: number) => {
  log.info(`pidIsActive`, { pid });
  return kitState.ps.find((p) => p.pid === pid);
};

export type ScriptTrigger =
  | 'startup'
  | 'shortcut'
  | 'prompt'
  | 'background'
  | 'schedule'
  | 'snippet';

export const setScript = async (
  script: Script,
  pid: number,
  force = false
): Promise<'denied' | 'allowed'> => {
  // log.info(`setScript`, { script, pid });

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

  // log.verbose(`Saving previous script path: ${kitState.prevScriptPath}`);
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

let boundsCheck: any = null;
let topTimeout: any = null;

const pidMatch = (pid: number, message: string) => {
  if (pid !== kitState.pid && promptWindow?.isVisible()) {
    log.info(`pid ${pid} doesn't match active pid ${kitState.pid}. ${message}`);
    return false;
  }

  return true;
};

export const setPromptData = async (promptData: PromptData) => {
  kitState.hiddenByUser = false;
  kitState.isPromptReady = false;
  // if (!pidMatch(pid, `setPromptData`)) return;
  if (typeof promptData?.alwaysOnTop === 'boolean') {
    alwaysOnTop(promptData.alwaysOnTop);
  }

  if (promptData?.scriptPath !== kitState.scriptPath) return;

  kitState.resize = promptData?.resize || false;
  kitState.shortcutsPaused = promptData.ui === UI.hotkey;
  kitState.promptUI = promptData.ui;

  log.verbose(`setPromptData ${promptData.scriptPath}`);

  kitState.promptBounds = {
    x: promptData.x || 0,
    y: promptData.y || 0,
    width:
      promptData.width || (appDb.mini ? PROMPT.WIDTH.XS : PROMPT.WIDTH.BASE),
    height: kitState.isMainScript()
      ? PROMPT.HEIGHT.BASE
      : promptData.height || 0,
  };

  // log.info({
  //   here: `😅`,
  //   bounds: kitState.promptBounds,
  // });

  kitState.promptId = promptData.id;
  if (kitState.suspended || kitState.screenLocked) return;

  kitState.ui = promptData.ui;
  if (!kitState.ignoreBlur) kitState.ignoreBlur = promptData.ignoreBlur;

  sendToPrompt(Channel.SET_PROMPT_DATA, promptData);
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

  // promptWindow.webContents.setBackgroundThrottling(false);

  if (kitState.isMac) {
    promptWindow?.showInactive();
    // 0 second setTimeout
    setTimeout(() => {
      promptWindow?.setAlwaysOnTop(true, 'screen-saver', 1);
    }, 0);

    if (topTimeout) clearTimeout(topTimeout);
    topTimeout = setTimeout(() => {
      if (kitState.ignoreBlur) {
        promptWindow?.setAlwaysOnTop(false);
      }
    }, 1000);
  } else if (kitState.isWindows) {
    promptWindow?.show();
  } else {
    promptWindow?.show();
  }

  kitState.promptCount += 1;
  if (kitState.promptCount === 1) {
    await initBounds();
  }

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
    const currentDisplayBounds = getCurrentScreenFromMouse().bounds;

    const minX = currentDisplayBounds.x;
    const minY = currentDisplayBounds.y;
    const maxX = currentDisplayBounds.x + currentDisplayBounds.width;
    const maxY = currentDisplayBounds.y + currentDisplayBounds.height;

    // const displays = screen.getAllDisplays();

    // const minX = displays.reduce((min: number, display) => {
    //   const m = min === 0 ? display.bounds.x : min;
    //   return Math.min(m, display.bounds.x);
    // }, 0);

    // const maxX = displays.reduce((max: number, display) => {
    //   const m = max === 0 ? display.bounds.x + display.bounds.width : max;
    //   return Math.max(m, display.bounds.x + display.bounds.width);
    // }, 0);

    // const minY = displays.reduce((min: number, display) => {
    //   const m = min === 0 ? display.bounds.y : min;
    //   return Math.min(m, display.bounds.y);
    // }, 0);

    // const maxY = displays.reduce((max: number, display) => {
    //   const m = max === 0 ? display.bounds.y + display.bounds.height : max;
    //   return Math.max(m, display.bounds.y + display.bounds.height);
    // }, 0);

    // log.info(`↖ BOUNDS:`, {
    //   bounds: currentBounds,
    //   minX,
    //   maxX,
    //   minY,
    //   maxY,
    // });

    if (
      currentBounds?.x < minX ||
      currentBounds?.x + currentBounds?.width > maxX ||
      currentBounds?.y < minY ||
      currentBounds?.y + currentBounds?.height > maxY
    ) {
      log.info(`Prompt window out of bounds. Clearing cache and resetting.`);
      await clearPromptCache();
    } else {
      log.info(`Prompt window in bounds.`);
    }
  }, 1000);
};

export const setChoices = (choices: Choice[]) => {
  log.silly(`setChoices`, { length: choices?.length || 0 });
  sendToPrompt(Channel.SET_UNFILTERED_CHOICES, choices);
};

export const clearPromptCache = async () => {
  try {
    promptState.screens = {};
  } catch (error) {
    log.info(error);
  }

  promptWindow?.webContents?.setZoomLevel(ZOOM_LEVEL);
  await initBounds();
};

export const reload = (callback: () => void = () => {}) => {
  log.info(`Reloading prompt window...`);
  if (promptWindow?.isDestroyed()) {
    log.warn(`Prompt window is destroyed. Not reloading.`);
    return;
  }

  if (callback) {
    promptWindow?.once('ready-to-show', callback);
  }

  promptWindow?.reload();
};

export const getPromptBounds = () => promptWindow.getBounds();
export const getMainPrompt = () => promptWindow;

export const destroyPromptWindow = () => {
  if (promptWindow && !promptWindow?.isDestroyed()) {
    hideAppIfNoWindows(`__destroy__`);
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

const initBounds = async () => {
  if (promptWindow?.isDestroyed()) return;

  const bounds = await getCurrentScreenPromptCache(kitState.scriptPath, {
    ui: kitState.promptUI,
    resize: kitState.resize,
    bounds: kitState.promptBounds,
  });
  if (promptWindow?.isDestroyed()) return;

  log.verbose(`↖ Bounds: Prompt ${kitState.promptUI} ui`, bounds);

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

  log.info(
    `↖ Bounds: Prompt ${kitState.promptUI}`,
    bounds,
    ` Count - ${kitState.promptCount}`
  );
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
};

const subScriptPath = subscribeKey(
  kitState,
  'scriptPath',
  async (scriptPath) => {
    if (promptWindow?.isDestroyed()) return;
    setBackgroundThrottling(kitState.scriptPath === '');

    kitState.promptUI = UI.none;
    kitState.resizedByChoices = false;

    if (pathsAreEqual(scriptPath || '', kitState.scriptErrorPath)) {
      kitState.scriptErrorPath = '';
    }

    if (kitState.scriptPath === '') {
      log.info(
        `📄 scriptPath changed: ${kitState.scriptPath}, prompt count: ${kitState.promptCount}`
      );
      if (
        kitState.prevScriptPath &&
        !kitState.resizedByChoices &&
        kitState.promptCount === 0
      ) {
        log.info(
          `>>>> 🎸 Set script: 💾 Saving prompt bounds for ${kitState.prevScriptPath} `
        );
        savePromptBounds(kitState.prevScriptPath, promptWindow.getBounds());
      }
      hideAppIfNoWindows(`remove ${kitState.scriptPath}`);
      sendToPrompt(Channel.SET_OPEN, false);
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
};

export const clearPromptTimers = async () => {
  try {
    if (boundsCheck) clearTimeout(boundsCheck);
    if (topTimeout) clearTimeout(topTimeout);
  } catch (e) {
    log.error(e);
  }
};

subs.push(
  subScriptPath,
  subIsSponsor,
  subUpdateDownloaded,
  subEscapePressed,
  subAppDbMini,
  subAppDbCachePrompt
);
