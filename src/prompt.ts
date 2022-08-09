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
import {
  BrowserWindow,
  screen,
  Rectangle,
  powerMonitor,
  shell,
} from 'electron';
import os from 'os';
import path from 'path';
import log from 'electron-log';
import { debounce, uniqueId } from 'lodash';
import minimist from 'minimist';
import { mainScriptPath } from '@johnlindquist/kit/cjs/utils';
import { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { getPromptDb } from '@johnlindquist/kit/cjs/db';
import { Display } from 'electron/main';
import { differenceInHours } from 'date-fns';

import { getAssetPath } from './assets';
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
import { emitter, KitEvent } from './events';

let promptWindow: BrowserWindow;
let unsub: () => void;
let unsubKey: () => void;

const miniArgs = minimist(process.argv);
const { devTools } = miniArgs;
// log.info(process.argv.join(' '), devTools);

let electronPanelWindow: any = null;

export const maybeHide = (reason: string) => {
  if (!kitState.ignoreBlur && promptWindow?.isVisible()) {
    log.verbose(`Hiding because ${reason}`);
    promptWindow?.hide();
  }
};

export const beforePromptQuit = async () => {
  promptWindow?.hide();
  return new Promise((resolve) => {
    setTimeout(async () => {
      if (kitState.isMac) {
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
  });

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

  emitter.on(KitEvent.OpenDevTools, () => {
    promptWindow?.webContents?.openDevTools();
  });

  promptWindow?.setMaxListeners(2);

  // promptWindow?.webContents.on('before-input-event', (event: any, input) => {
  //   if (input.key === 'Escape') {
  //     if (promptWindow) escapePromptWindow(promptWindow);
  //   }
  // });

  // promptWindow?.on('focus', () => {
  //   triggerKeyWindow(true, 'focus');
  // });

  // promptWindow?.webContents?.on('focus', () => {
  //   triggerKeyWindow(true, 'webContents focus');
  // });

  const onBlur = () => {
    log.verbose(`Blur: ${kitState.ignoreBlur ? 'ignored' : 'accepted'}`);
    maybeHide('blur');

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

  promptWindow?.webContents?.on('dom-ready', () => {
    log.info(`🍀 dom-ready on ${kitState.promptProcess?.scriptPath}`);

    hideAppIfNoWindows(kitState?.promptProcess?.scriptPath, 'dom-ready');
    sendToPrompt(Channel.SET_READY, true);
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

  promptWindow?.on('will-resize', (event, rect) => {
    log.debug(`will-resize ${rect.width} ${rect.height}`);

    if (rect.height < MIN_HEIGHT) event.preventDefault();
    if (rect.width < MIN_WIDTH) event.preventDefault();

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
    !promptWindow?.isFocused()
  ) {
    try {
      promptWindow?.focus();
    } catch (error) {
      log.error(error);
    }
    // promptWindow?.focusOnWebView();
  }
};

export const endPrompt = async (scriptPath: string) => {
  hideAppIfNoWindows(scriptPath, `end ${scriptPath}`);
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
  id,
  reason,
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
  if (promptId !== id) {
    log.verbose(`📱 Resize: ${id} !== ${promptId}`);
    return;
  }
  if (kitState.modifiedByUser) {
    log.verbose(`📱 Resize: ${id} modified by user`);
    return;
  }
  log.verbose(`📱 Resize ${ui}from ${scriptPath}`);

  if ([UI.term, UI.editor, UI.drop].includes(ui)) return;

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

  // console.log({ topHeight, mainHeight, footerHeight, targetHeight });
  // const threeFourths = getCurrentScreenFromPrompt().bounds.height * (3 / 4);

  // const maxHeight = hasPanel
  //   ? Math.round(threeFourths)
  //   : Math.max(DEFAULT_HEIGHT, cachedHeight);

  const maxHeight = Math.max(DEFAULT_HEIGHT, cachedHeight);

  let width = Math.max(cachedWidth, DEFAULT_EXPANDED_WIDTH);

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

  log.verbose({
    reason,
    ui,
    width,
    height,
    mainHeight,
  });

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
    log.info(`💾 Saving prompt bounds`);
    const currentScreen = getCurrentScreenFromPrompt();
    const promptDb = await getPromptDb();

    try {
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
  if (promptWindow) {
    if (scriptPath) savePromptBounds(scriptPath, Bounds.Position);

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
  if (!script) return;
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

let boundsCheck: any = null;
let promptId = '__unset__';
export const setPromptData = async (promptData: PromptData) => {
  promptId = promptData.id;
  if (kitState.suspended || kitState.screenLocked) return;

  kitState.ui = promptData.ui;
  if (!kitState.ignoreBlur) kitState.ignoreBlur = promptData.ignoreBlur;

  sendToPrompt(Channel.SET_PROMPT_DATA, promptData);
  // if (!promptWindow?.isVisible())
  const bounds = await getCurrentScreenPromptCache(promptData.scriptPath);
  log.verbose(`↖ Opening a ${promptData.ui}`, bounds);
  promptWindow.setPosition(bounds.x, bounds.y);

  if ([UI.term, UI.editor].includes(promptData.ui)) {
    promptWindow.setSize(bounds.width, DEFAULT_HEIGHT);
    log.verbose(`Restoring prompt size:`, bounds.width, DEFAULT_HEIGHT);
  }
  // if (kitState.prevPromptScriptPath !== promptData.scriptPath) {
  //   // promptWindow.setBounds(bounds);
  //   kitState.prevPromptScriptPath = promptData.scriptPath;
  // }

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
