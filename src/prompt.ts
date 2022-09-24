/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
/* eslint-disable consistent-return */
import glasstron from 'glasstron';
import { subscribe, snapshot } from 'valtio/vanilla';
import { Channel, Mode, UI } from '@johnlindquist/kit/cjs/enum';
import {
  Choice,
  Script,
  PromptData,
  PromptBounds,
} from '@johnlindquist/kit/types/core';

import { subscribeKey } from 'valtio/utils';

import {
  app,
  BrowserWindow,
  screen,
  Rectangle,
  powerMonitor,
  shell,
  BrowserWindowConstructorOptions,
} from 'electron';
import os from 'os';
import path from 'path';
import log from 'electron-log';
import { debounce } from 'lodash';
import { mainScriptPath } from '@johnlindquist/kit/cjs/utils';
import { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { getPromptDb, AppDb } from '@johnlindquist/kit/cjs/db';
import { Display } from 'electron/main';
import { differenceInHours } from 'date-fns';

import { getAssetPath } from './assets';
import { appDb, kitState } from './state';
import {
  DEFAULT_EXPANDED_WIDTH,
  DEFAULT_HEIGHT,
  EMOJI_HEIGHT,
  EMOJI_WIDTH,
  INPUT_HEIGHT,
  MIN_HEIGHT,
  MIN_WIDTH,
  noScript,
} from './defaults';
import { ResizeData } from './types';
import { getVersion } from './version';
import { AppChannel } from './enums';
import { emitter, KitEvent } from './events';

interface GlasstronWindow extends BrowserWindow {
  blurType: string;
  setBlur(_: boolean): void;
}

let promptWindow: GlasstronWindow;
let unsub: () => void;
let unsubKey: () => void;
// log.info(process.argv.join(' '), devTools);

let electronPanelWindow: any = null;

export const maybeHide = async (reason: string) => {
  if (!kitState.ignoreBlur && promptWindow?.isVisible()) {
    kitState.scriptPath = '';
    kitState.promptUI = UI.none;
    log.verbose(`Hiding because ${reason}`);
    if (
      !promptWindow?.webContents?.isDevToolsOpened() &&
      !kitState.preventClose
    ) {
      // promptWindow?.blur();

      promptWindow?.hide();
      log.verbose(
        `🙈 maybeHide???: 💾 Saving prompt bounds for ${kitState.prevScriptPath} `
      );
    }
  }
};

export const beforePromptQuit = async () => {
  log.info('Before prompt quit');
  promptWindow?.hide();
  return new Promise((resolve) => {
    setTimeout(async () => {
      if (kitState.isMac) {
        log.info(`Removing panel window`);
        const dummy = new BrowserWindow({
          show: false,
        });
        electronPanelWindow.makeKeyWindow(dummy);
        electronPanelWindow.makeWindow(promptWindow);
        promptWindow?.close();
        resolve(true);
      }
    });
  });
};

export const createPromptWindow = async () => {
  if (kitState.isMac) {
    electronPanelWindow = await import('@akiflow/electron-panel-window' as any);
  }
  const options: BrowserWindowConstructorOptions = {
    titleBarStyle: kitState.isMac ? 'customButtonsOnHover' : 'hiddenInset',
    useContentSize: true,
    frame: false,
    transparent: !kitState.isWindows,
    show: false,
    // hasShadow: true,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true,
      backgroundThrottling: false,
    },
    closable: false,
    minimizable: false,
    maximizable: false,
    movable: true,
    skipTaskbar: true,
    width: DEFAULT_EXPANDED_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: INPUT_HEIGHT,
  };

  if (kitState.isMac) {
    promptWindow = new BrowserWindow(options) as GlasstronWindow;
    promptWindow.setVibrancy('menu');
  } else {
    promptWindow = new glasstron.BrowserWindow(options) as GlasstronWindow;

    try {
      promptWindow.blurType = kitState.isWindows ? 'acrylic' : 'blurbehind';
      promptWindow.setBlur(true);
      promptWindow.setBackgroundColor(`#00000000`);
    } catch (error) {
      log.error('Failed to set window blur', error);
    }

    // try {
    //   const { DwmEnableBlurBehindWindow } = await import('windows-blurbehind');
    //   DwmEnableBlurBehindWindow(promptWindow, true);
    // } catch (error) {
    //   log.error(`Failure to enable blurbehind`);
    //   log.error(error);
    // }
  }

  promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // promptWindow.setTouchBar(touchbar);

  // if (!kitState.isMac) {
  //   promptWindow.setAlwaysOnTop(true, 'modal-panel');
  // }
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
      isDark: kitState.isDark,
    });
  });

  //   promptWindow?.webContents?.on('new-window', function (event, url) {
  //     event.preventDefault()
  //     shell.openExternal(url)
  // })

  promptWindow?.webContents?.setWindowOpenHandler(async ({ url }) => {
    log.info(`Opening ${url}`);
    shell.openExternal(url);

    return { action: 'deny' };
  });

  await promptWindow.loadURL(
    `file://${__dirname}/index.html?vs=${getAssetPath('vs')}`
  );

  // promptWindow.on('ready-to-show', function () {
  //   promptWindow.showInactive();
  // });

  // promptWindow.webContents.once('did-finish-load', () => {
  //   promptWindow?.webContents.closeDevTools();
  // });

  promptWindow.webContents.on('devtools-closed', () => {
    promptWindow?.setAlwaysOnTop(false);
    maybeHide('Devtools closed');
  });

  promptWindow.webContents.on('devtools-opened', () => {
    log.info(`Devtools opened. Preventing close and always on top`);
    promptWindow?.setAlwaysOnTop(true);
    promptWindow?.webContents?.executeJavaScript(`console.clear()`);
  });

  emitter.on(KitEvent.OpenDevTools, () => {
    promptWindow?.webContents?.openDevTools();
  });

  promptWindow?.setMaxListeners(2);

  // promptWindow?.webContents.on('before-input-event', (event: any, input) => {
  //   if (devToolsVisible()) {
  //     log.info({ input });
  //     if (input.key === 'r' && (input.meta || input.control)) {
  //       reload();
  //     }
  //   }
  // });

  // promptWindow?.on('focus', () => {
  //   triggerKeyWindow(true, 'focus');
  // });

  // promptWindow?.webContents?.on('focus', () => {
  //   triggerKeyWindow(true, 'webContents focus');
  // });

  const onBlur = () => {
    if (promptWindow?.webContents?.isDevToolsOpened()) return;

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

    if (!kitState.isMac)
      sendToPrompt(Channel.SET_THEME, {
        '--opacity-themedark': '100%',
        '--opacity-themelight': '100%',
      });
  };

  promptWindow?.webContents?.on('blur', onBlur);
  promptWindow?.on('blur', onBlur);

  promptWindow?.on('hide', () => {
    kitState.isVisible = false;
  });

  promptWindow?.on('show', () => {
    kitState.isVisible = true;
  });

  promptWindow?.webContents?.on('dom-ready', () => {
    log.info(`🍀 dom-ready on ${kitState?.scriptPath}`);

    hideAppIfNoWindows(kitState?.scriptPath, 'dom-ready');
    sendToPrompt(Channel.SET_READY, true);
  });

  const onMove = async () => {
    kitState.modifiedByUser = false;
  };

  const onResized = async () => {
    kitState.modifiedByUser = false;
    log.info(`Resized: ${promptWindow?.getSize()}`);

    if (kitState.isResizing) {
      // sendToPrompt(Channel.SET_RESIZING, false);
      kitState.isResizing = false;
    }
  };

  promptWindow?.on('will-resize', (event, rect) => {
    log.info(`Will Resize ${rect.width} ${rect.height}`);

    if (rect.height < MIN_HEIGHT) event.preventDefault();
    if (rect.width < MIN_WIDTH) event.preventDefault();

    kitState.modifiedByUser = true;
  });

  promptWindow?.on('will-move', () => {
    kitState.modifiedByUser = true;
  });
  promptWindow?.on('resized', onResized);
  promptWindow?.on('moved', debounce(onMove, 500));

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

  if (unsubKey) unsubKey();

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

export const showInactive = () => {
  if (!kitState.isPanel && electronPanelWindow) {
    electronPanelWindow.makePanel(promptWindow);
    kitState.isPanel = true;
  }
  try {
    if (electronPanelWindow && kitState.ready) {
      promptWindow?.showInactive();
      electronPanelWindow?.makeKeyWindow(promptWindow);
    } else {
      promptWindow?.setAlwaysOnTop(true);
      promptWindow?.show();
    }
  } catch (error) {
    log.error(error);
  }
};

export const focusPrompt = () => {
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
  promptWindow?.show();
  promptWindow?.focus();
};

export const alwaysOnTop = (onTop: boolean) => {
  if (promptWindow) promptWindow.setAlwaysOnTop(onTop);
};

export const endPrompt = async (scriptPath: string) => {
  hideAppIfNoWindows(scriptPath, `end ${scriptPath}`);
};

export const getCurrentScreenFromMouse = (): Display => {
  if (promptWindow?.isVisible()) {
    const [x, y] = promptWindow?.getPosition();
    return screen.getDisplayNearestPoint({ x, y });
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
};

export const getCurrentScreenFromPrompt = (): Display => {
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
  const currentScreen = getCurrentScreenFromMouse();
  const screenId = String(currentScreen.id);
  const promptDb = await getPromptDb();
  // log.info(`screens:`, promptDb.screens);

  const savedPromptBounds = promptDb?.screens?.[screenId]?.[scriptPath];

  // log.info(`📱 Screen: ${screenId}: `, savedPromptBounds);

  if (savedPromptBounds) {
    log.verbose(`Bounds: found saved bounds for ${scriptPath}`);
    return savedPromptBounds;
  }

  // log.info(`resetPromptBounds`, scriptPath);
  const {
    width: screenWidth,
    height: screenHeight,
  } = currentScreen.workAreaSize;

  let width = DEFAULT_EXPANDED_WIDTH;
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
      width /= 2;
      height /= 2;
    }
    if (ui === UI.hotkey) {
      width /= 2;
    }

    if (ui === UI.div) {
      width /= 2;
      height = promptWindow?.getBounds()?.height;
    }

    if (ui === UI.arg) {
      width /= 2;
    }

    if (ui === UI.editor || ui === UI.textarea) {
      width = Math.max(width, DEFAULT_EXPANDED_WIDTH);
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

  // if (!promptDb?.screens) {
  //   promptDb.screens = {};
  // }
  // if (!promptDb?.screens[screenId]) {
  //   promptDb.screens[screenId] = {};
  // }
  // const boundsFilePath = promptDb.screens?.[screenId]?.[scriptPath];
  // const maybeBounds = boundsFilePath || {};

  // if (!boundsFilePath) {
  //   const promptBounds = {
  //     ...bounds,
  //     x: maybeBounds?.x || bounds.x,
  //     y: maybeBounds?.y || bounds.y,
  //   };

  //   // writePromptDb(screenId, scriptPath, promptBounds);
  // }
};

export const setBounds = (bounds: Partial<Rectangle>) => {
  promptWindow.setBounds(bounds);
};

export const isVisible = () => {
  return !promptWindow.isDestroyed() && promptWindow.isVisible();
};

export const devToolsVisible = () => {
  return promptWindow.webContents.isDevToolsOpened();
};

export const isFocused = () => {
  return promptWindow?.isFocused();
};

let resizeAnimate = true;
let resizeTimeout = setTimeout(() => {
  resizeAnimate = true;
}, 1000);
export const resize = async ({
  id,
  reason,
  scriptPath,
  topHeight,
  mainHeight,
  footerHeight,
  ui,
  isSplash,
  hasPreview,
  hasInput,
}: ResizeData) => {
  log.silly({
    id,
    reason,
    scriptPath,
    topHeight,
    mainHeight,
    footerHeight,
    ui,
    isSplash,
    hasPreview,
    hasInput,
    resize: kitState.resize,
    promptId: kitState.promptId,
  });
  if (!kitState.resize) return;

  if (kitState.promptId !== id) {
    log.verbose(`📱 Resize: ${id} !== ${kitState.promptId}`);
    return;
  }
  if (kitState.modifiedByUser) {
    log.verbose(`📱 Resize: ${id} modified by user`);
    return;
  }
  log.verbose(`📱 Resize ${ui} from ${scriptPath}`);

  // if ([UI.term, UI.editor, UI.drop].includes(ui)) {
  //   log.verbose(`📱 Resize: ${ui} not resizing`);
  //   return;
  // }

  const bounds = await getCurrentScreenPromptCache(scriptPath, {
    ui,
    resize: kitState.resize,
    bounds: {},
  });

  if (!bounds) return;
  const { width: cachedWidth, height: cachedHeight, x, y } = bounds;
  const {
    width: currentWidth,
    height: currentHeight,
  } = promptWindow.getBounds();

  const targetHeight = topHeight + mainHeight + footerHeight;

  // console.log({ topHeight, mainHeight, footerHeight, targetHeight });
  // const threeFourths = getCurrentScreenFromPrompt().bounds.height * (3 / 4);

  // const maxHeight = hasPanel
  //   ? Math.round(threeFourths)
  //   : Math.max(DEFAULT_HEIGHT, cachedHeight);

  const maxHeight = Math.max(DEFAULT_HEIGHT, cachedHeight);

  let width = cachedWidth;

  let height = Math.round(targetHeight > maxHeight ? maxHeight : targetHeight);

  // if (!nullChoices && !hasPanel) {
  //   height = Math.max(cachedHeight, DEFAULT_HEIGHT);
  // }

  if (isSplash) {
    width = DEFAULT_EXPANDED_WIDTH;
    height = DEFAULT_HEIGHT;
  }

  height = Math.round(height);
  width = Math.round(width);
  if (currentHeight === height && currentWidth === width) return;

  log.verbose({ reason, ui, width, height, mainHeight });

  if (hasPreview) {
    width = Math.max(DEFAULT_EXPANDED_WIDTH, width);
  }

  promptWindow?.setBounds({ x, y, width, height }, resizeAnimate && !hasInput);

  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
    resizeAnimate = false;
    resizeTimeout = setTimeout(() => {
      resizeAnimate = true;
    }, 1000);
  }

  kitState.resizedByChoices = true && ui === UI.arg;
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
  async (
    scriptPath: string,
    bounds: Rectangle,
    b: number = Bounds.Position | Bounds.Size
  ) => {
    // const isMain = scriptPath.includes('.kit') && scriptPath.includes('cli');
    // if (isMain) return;

    const currentScreen = getCurrentScreenFromPrompt();
    const promptDb = await getPromptDb();

    try {
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
    } catch (error) {
      log.error(error);
    }
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

export const hideAppIfNoWindows = (scriptPath = '', reason: string) => {
  if (kitState.interruptScript) {
    kitState.interruptScript = false;
    return;
  }
  if (promptWindow) {
    // const allWindows = BrowserWindow.getAllWindows();
    // Check if all other windows are hidden

    if (!kitState.hidden) {
      sendToPrompt(Channel.SET_OPEN, false);
      kitState.hidden = false;
    }

    kitState.modifiedByUser = false;
    kitState.ignoreBlur = false;
    maybeHide(reason);

    promptWindow.webContents.setBackgroundThrottling(false);
    setTimeout(() => {
      if (!promptWindow?.isVisible()) {
        promptWindow.webContents.setBackgroundThrottling(true);
      }
    }, 1000);
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

  if (promptWindow?.isAlwaysOnTop()) promptWindow?.setAlwaysOnTop(false);
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

    const sinceLast = differenceInHours(Date.now(), kitState.lastOpen);
    log.info(`Hours since sync: ${sinceLast}`);
    if (sinceLast > 6) {
      kitState.lastOpen = new Date();
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

const pidMatch = (pid: number, message: string) => {
  if (pid !== kitState.pid && promptWindow?.isVisible()) {
    log.info(`pid ${pid} doesn't match active pid ${kitState.pid}. ${message}`);
    return false;
  }

  return true;
};

export const setPromptData = async (promptData: PromptData, pid) => {
  // if (!pidMatch(pid, `setPromptData`)) return;
  if (promptData?.scriptPath !== kitState.scriptPath) return;

  kitState.promptUI = promptData.ui;
  kitState.resize = kitState.resize || promptData.resize;

  log.verbose(`setPromptData ${promptData.scriptPath}`);

  kitState.promptBounds = {
    x: promptData.x || 0,
    y: promptData.y || 0,
    width: promptData.width || 0,
    height: promptData.height || 0,
  };

  kitState.promptId = promptData.id;
  if (kitState.suspended || kitState.screenLocked) return;

  kitState.ui = promptData.ui;
  if (!kitState.ignoreBlur) kitState.ignoreBlur = promptData.ignoreBlur;

  sendToPrompt(Channel.SET_PROMPT_DATA, promptData);

  // positionPrompt({
  //   ui: promptData.ui,
  //   scriptPath: promptData.scriptPath,
  //   tabIndex: promptData.tabIndex,
  // });

  // eslint-disable-next-line promise/param-names
  if (kitState.hasSnippet) await new Promise((r) => setTimeout(r, 50));
  kitState.hasSnippet = false;

  showInactive();

  // app.focus({
  //   steal: true,
  // });
  // if (devTools) promptWindow?.webContents.openDevTools();
  // }

  focusPrompt();
  sendToPrompt(Channel.SET_OPEN, true);

  if (boundsCheck) clearTimeout(boundsCheck);
  boundsCheck = setTimeout(async () => {
    const currentBounds = promptWindow?.getBounds();

    const displays = screen.getAllDisplays();

    const minX = displays.reduce((min: number, display) => {
      const m = min === 0 ? display.bounds.x : min;
      return Math.min(m, display.bounds.x);
    }, 0);

    const maxX = displays.reduce((max: number, display) => {
      const m = max === 0 ? display.bounds.x + display.bounds.width : max;
      return Math.max(m, display.bounds.x + display.bounds.width);
    }, 0);

    const minY = displays.reduce((min: number, display) => {
      const m = min === 0 ? display.bounds.y : min;
      return Math.min(m, display.bounds.y);
    }, 0);

    const maxY = displays.reduce((max: number, display) => {
      const m = max === 0 ? display.bounds.y + display.bounds.height : max;
      return Math.max(m, display.bounds.y + display.bounds.height);
    }, 0);

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
  sendToPrompt(Channel.SET_UNFILTERED_CHOICES, choices);
};

export const clearPromptCache = async () => {
  const promptDb = await getPromptDb();
  promptDb.screens = {};

  log.info(`⛑ Clear prompt cache:`, promptDb);
  await promptDb.write();

  promptWindow?.webContents?.setZoomLevel(0);
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

export const onHideOnce = (fn: () => void) => {
  let id: null | NodeJS.Timeout = null;
  if (promptWindow) {
    const handler = () => {
      if (id) clearTimeout(id);
      promptWindow.removeListener('hide', handler);
      fn();
    };

    id = setTimeout(() => {
      promptWindow?.removeListener('hide', handler);
    }, 1000);

    promptWindow?.once('hide', handler);
  }
};

subscribeKey(kitState, 'promptId', async () => {
  log.silly({
    promptUI: kitState.promptUI,
    promptId: kitState.promptId,
  });
  // if (
  //   [UI.form, UI.div, UI.none].includes(kitState.promptUI) ||
  //   kitState.scriptPath === '' ||
  //   !promptWindow?.isVisible()
  // )
  //   return;

  const bounds = await getCurrentScreenPromptCache(kitState.scriptPath, {
    ui: kitState.promptUI,
    resize: kitState.resize,
    bounds: kitState.promptBounds,
  });
  log.verbose(`↖ Bounds: Prompt ${kitState.promptUI} ui`, bounds);

  // If widths or height don't match, send SET_RESIZING to prompt

  const { width, height } = promptWindow?.getBounds();
  if (bounds.width !== width || bounds.height !== height) {
    log.info(`Started resizing: ${promptWindow?.getSize()}`);

    // sendToPrompt(Channel.SET_RESIZING, true);
    kitState.isResizing = true;
  }

  promptWindow?.setBounds(bounds, promptWindow?.isVisible());
});

subscribeKey(kitState, 'scriptPath', async () => {
  kitState.promptUI = UI.none;
  kitState.resize = false;
  kitState.resizedByChoices = false;
  if (promptWindow?.isVisible()) {
    kitState.scriptHistory.push(kitState.scriptPath);
  } else {
    kitState.scriptHistory = [kitState.scriptPath];
  }

  if (!promptWindow?.isVisible())
    kitState.initialScriptPath = kitState.scriptPath;

  if (kitState.prevScriptPath && !kitState.resizedByChoices) {
    log.verbose(
      `>>>> 🎸 Set script: 💾 Saving prompt bounds for ${kitState.prevScriptPath} `
    );
    savePromptBounds(kitState.prevScriptPath, promptWindow.getBounds());
  }

  if (kitState.scriptPath && !promptWindow?.isVisible()) {
    log.verbose(`📄 scriptPath changed: ${kitState.scriptPath}`);
    const bounds = await getCurrentScreenPromptCache(kitState.scriptPath);

    log.verbose(`↖ Bounds: Script ${kitState.promptUI} ui`, bounds);
    promptWindow.setBounds(bounds, promptWindow?.isVisible());
  }

  kitState.prevScriptPath = kitState.scriptPath;
});

subscribeKey(appDb, 'appearance', () => {
  log.info(`🎨 Appearance changed:`, appDb.appearance);
  sendToPrompt(Channel.SET_APPEARANCE, appDb.appearance as AppDb['appearance']);
});

export const clearPromptCacheFor = async (scriptPath: string) => {
  try {
    const displays = screen.getAllDisplays();
    const promptDb = await getPromptDb();
    for await (const display of displays) {
      if (promptDb?.screens?.[display.id]?.[scriptPath]) {
        delete promptDb.screens[display.id][scriptPath];
        log.verbose(`🗑 Clear prompt cache for ${scriptPath} on ${display.id}`);
      }
    }
    await promptDb.write();
  } catch (e) {
    log.error(e);
  }
};
