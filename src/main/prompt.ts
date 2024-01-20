/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-bitwise */
/* eslint-disable import/prefer-default-export */
/* eslint-disable consistent-return */

import { electronApp, optimizer, is } from '@electron-toolkit/utils';

// REMOVE-MAC
import {
  makeKeyWindow,
  makePanel,
  makeWindow,
} from '@johnlindquist/mac-panel-window';
// END-REMOVE-MAC

// REMOVE-NODE-WINDOW-MANAGER
import { windowManager, Window } from '@johnlindquist/node-window-manager';
// END-REMOVE-NODE-WINDOW-MANAGER
import { PROMPT, Channel, Mode, UI } from '@johnlindquist/kit/core/enum';
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
  globalShortcut,
} from 'electron';
import contextMenu from 'electron-context-menu';
import os from 'os';
import path from 'path';
import log, { FileTransport } from 'electron-log';
import { assign, debounce } from 'lodash-es';
import { getMainScriptPath, kenvPath } from '@johnlindquist/kit/core/utils';
import { getAppDb } from '@johnlindquist/kit/core/db';
import { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { Display } from 'electron/main';
import { differenceInHours } from 'date-fns';

import { ChildProcess } from 'child_process';
import { getAssetPath } from '../shared/assets';
import {
  appDb,
  kitState,
  subs,
  promptState,
  getEmojiShortcut,
  kitSearch,
  preloadPromptDataMap,
  preloadChoicesMap,
  preloadPreviewMap,
  clearSearch,
  windows,
  clearFlagSearch,
} from '../shared/state';
import {
  EMOJI_HEIGHT,
  EMOJI_WIDTH,
  MIN_WIDTH,
  ZOOM_LEVEL,
} from '../shared/defaults';
import { ResizeData, ScoredChoice } from '../shared/types';
import { getVersion } from './version';
import { AppChannel, HideReason } from '../shared/enums';
import { emitter, KitEvent } from '../shared/events';
import { createScoredChoice, pathsAreEqual } from './helpers';
import { TrackEvent, trackEvent } from './track';
import {
  getCurrentScreen,
  getCurrentScreenFromBounds,
  isBoundsWithinDisplays,
} from './screen';
import {
  appToSpecificPrompt,
  createAppToPrompt,
  createSendToPrompt,
  sendToAllPrompts,
  sendToSpecificPrompt,
} from './channel';
import { setFlags, setChoices } from './search';
import { fileURLToPath } from 'url';
import { prompts } from './prompts';
import { ProcessAndPrompt, processes } from './process';

contextMenu({
  showInspectElement: process.env.NODE_ENV === 'development',
  showSearchWithGoogle: false,
  showLookUpSelection: false,
});

const getDefaultWidth = () => {
  return appDb.mini ? PROMPT.WIDTH.XXXS : PROMPT.WIDTH.BASE;
};

interface PromptState {
  isMinimized: boolean;
  isVisible: boolean;
  isFocused: boolean;
  isDestroyed: boolean;
  isFullScreen: boolean;
  isFullScreenable: boolean;
  isMaximizable: boolean;
  isResizable: boolean;
  isModal: boolean;
  isAlwaysOnTop: boolean;
  isClosable: boolean;
  isMovable: boolean;
  isSimpleFullScreen: boolean;
  isKiosk: boolean;
  [key: string]: boolean;
}

let prevPromptState: PromptState = {
  isMinimized: false,
  isVisible: false,
  isFocused: false,
  isDestroyed: false,
  isFullScreen: false,
  isFullScreenable: false,
  isMaximizable: false,
  isResizable: false,
  isModal: false,
  isAlwaysOnTop: false,
  isClosable: false,
  isMovable: false,
  isSimpleFullScreen: false,
  isKiosk: false,
};

export const logPromptState = () => {
  for (const prompt of prompts) {
    const promptState: PromptState = {
      isMinimized: prompt.window.isMinimized(),
      isVisible: prompt.window.isVisible(),
      isFocused: prompt.window.isFocused(),
      isDestroyed: prompt.window.isDestroyed(),
      isFullScreen: prompt.window.isFullScreen(),
      isFullScreenable: prompt.window.isFullScreenable(),
      isMaximizable: prompt.window.isMaximizable(),
      isResizable: prompt.window.isResizable(),
      isModal: prompt.window.isModal(),
      isAlwaysOnTop: prompt.window.isAlwaysOnTop(),
      isClosable: prompt.window.isClosable(),
      isMovable: prompt.window.isMovable(),
      isSimpleFullScreen: prompt.window.isSimpleFullScreen(),
      isKiosk: prompt.window.isKiosk(),
      isNormal: prompt.window.isNormal(),
      isVisibleOnAllWorkspaces: prompt.window.isVisibleOnAllWorkspaces(),
    };

    // Compare the previous state to the current state
    const diff = Object.keys(promptState).reduce((acc, key) => {
      if (promptState[key] !== prevPromptState[key]) {
        acc[key] = promptState[key];
      }
      return acc;
    }, {} as any);

    // If there are any differences, log them
    if (Object.keys(diff).length) {
      log.info(
        `
  👙 Prompt State:`,
        JSON.stringify(diff, null, 2)
      );
      prevPromptState = promptState;
    }
  }
};

// TODO: Move this into a screen utils
export const getCurrentScreenFromMouse = (): Display => {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
};

// REMOVE-NODE-WINDOW-MANAGER
let prevWindow: Window;
// END-REMOVE-NODE-WINDOW-MANAGER

export const getCurrentScreenPromptCache = (
  scriptPath: string,
  {
    ui,
    resize,
    bounds,
  }: { ui: UI; resize: boolean; bounds: Partial<Rectangle> } = {
    ui: UI.arg,
    resize: false,
    bounds: {},
  }
): Partial<Rectangle> => {
  const currentScreen = getCurrentScreen();
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

  if (ui === UI.arg) {
    const bounds = {
      ...promptBounds,
      width: getDefaultWidth(),
      height: PROMPT.HEIGHT.BASE,
    };

    log.verbose(`Bounds: No UI`, bounds);
    return bounds;
  }

  return promptBounds;
};

let hadPreview = true;
let prevResizeData = {} as ResizeData;

// TODO: Needs refactor to include unique ids, or conflicts will happen

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

const writePromptState = async (
  screenId: string,
  scriptPath: string,
  bounds: PromptBounds
) => {
  if (kitSearch.input !== '' || kitSearch.inputRegex) return;
  log.verbose(`writePromptState`, { screenId, scriptPath, bounds });

  if (!promptState?.screens) promptState.screens = {};
  if (!promptState?.screens[screenId]) promptState.screens[screenId] = {};

  if (!bounds.height) return;
  if (!bounds.width) return;
  if (!bounds.x) return;
  if (!bounds.y) return;
  promptState.screens[screenId][scriptPath] = bounds;
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

let boundsCheck: any = null;
let topTimeout: any = null;

// TODO: Reimplement preload?
export const preloadPromptData = async (promptData: PromptData) => {
  // let input = '';
  // if (kitSearch.keyword) {
  //   input = `${kitSearch.keyword} `;
  // } else {
  //   input = kitSearch.input || '';
  // }
  // input = promptData.input || input;
  // log.info(
  //   `🏋️‍♂️ Preload promptData for ${promptData?.scriptPath} with input:${input}<<<`
  // );
  // promptData.preload = true;
  // if (kitSearch.keyword) {
  //   promptData.keyword = kitSearch.keyword;
  // }
  // sendToSpecificPrompt(Channel.SET_PROMPT_DATA, {
  //   ...promptData,
  //   input,
  // });
  // kitState.scriptPath = promptData.scriptPath;
  // kitState.hideOnEscape = Boolean(promptData.hideOnEscape);
  // kitSearch.triggers.clear();
  // if (promptData?.hint) {
  //   for (const trigger of promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi) || []) {
  //     kitSearch.triggers.set(trigger, { name: trigger, value: trigger });
  //   }
  // }
  // if (promptData.flags) {
  //   setFlags(promptData.flags);
  // }
  // kitState.hiddenByUser = false;
  // kitState.alwaysOnTop =
  //   typeof promptData?.alwaysOnTop === 'boolean'
  //     ? promptData.alwaysOnTop
  //     : false;
  // kitState.resize = promptData?.resize || false;
  // kitState.shortcutsPaused = promptData.ui === UI.hotkey;
  // kitState.promptUI = promptData.ui;
  // kitState.promptId = promptData.id;
  // if (kitState.suspended || kitState.screenLocked) return;
  // kitState.ui = promptData.ui;
  // if (!kitState.ignoreBlur) kitState.ignoreBlur = promptData.ignoreBlur;
  // sendToSpecificPrompt(Channel.SET_OPEN, true);
};

export const preloadChoices = (choices: Choice[]) => {
  // TODO: Preload choices???

  return;
  log.info(`🏋️‍♂️ Preload choices ${choices.length}`);
  if (!isVisible()) {
    kitSearch.input = '';
  }

  // setChoices(choices, {
  //   preload: true,
  // });
};

const noPreview = `<div></div>`;
export const preloadPreview = (html: string) => {
  // TODO: Preload preview???

  return;
  if (kitSearch.input) return;
  setPreview(html);
};

export const attemptPreload = async (
  promptScriptPath: string,
  show = true,
  init = true
) => {
  // TODO: Reimplement preload?
  return;
  // if (kitState.kenvEnv?.KIT_NO_ATTEMPT_PRELOAD) return;
  // if (kitState.attemptingPreload) return;
  // kitState.attemptingPreload = true;
  // setTimeout(() => {
  //   kitState.attemptingPreload = false;
  // }, 200);

  // const isMainScript = getMainScriptPath() === promptScriptPath;
  // if (!promptScriptPath || isMainScript) return;
  // // log out all the keys of preloadPromptDataMap
  // kitState.preloaded = false;

  // if (isMainScript) {
  //   // log.info(`🏋️‍♂️ Reset main: ${promptScriptPath}`);
  // } else if (preloadPromptDataMap.has(promptScriptPath)) {
  //   if (init) {
  //     initBounds(promptScriptPath, show);
  //   }

  //   log.info(`🏋️‍♂️ Preload prompt: ${promptScriptPath}`);
  //   // kitState.preloaded = true;

  //   appToSpecificPrompt(promptWindow, AppChannel.SCROLL_TO_INDEX, 0);
  //   sendToSpecificPrompt(Channel.SET_TAB_INDEX, 0);
  //   appToSpecificPrompt(promptWindow, AppChannel.SET_PRELOADED, true);
  //   const promptData = preloadPromptDataMap.get(promptScriptPath) as PromptData;
  //   preloadPromptData(promptData);

  //   if (preloadChoicesMap.has(promptScriptPath)) {
  //     const preview = preloadPreviewMap.get(promptScriptPath) as string;
  //     preloadPreview(preview || noPreview);

  //     const choices = preloadChoicesMap.get(promptScriptPath) as Choice[];
  //     preloadChoices(choices as Choice[]);

  //     kitState.promptBounds = {
  //       x: promptData.x,
  //       y: promptData.y,
  //       width:
  //         getMainScriptPath() === promptData.scriptPath
  //           ? getDefaultWidth()
  //           : promptData.width || getDefaultWidth(),
  //       height:
  //         getMainScriptPath() === promptData.scriptPath
  //           ? PROMPT.HEIGHT.BASE
  //           : promptData.height,
  //     };
  //   }
  // }

  // log.info(`end of attemptPreload`);
};

const cacheMainChoices = (choices: ScoredChoice[]) => {
  // TODO: Reimplement cache?
  // log.info(`Caching main scored choices: ${choices.length}`);
  // log.info(
  //   `Most recent 3:`,
  //   choices.slice(1, 4).map((c) => c?.item?.name)
  // );
  // appToSpecificPrompt(
  //   promptWindow,
  //   AppChannel.SET_CACHED_MAIN_SCORED_CHOICES,
  //   choices
  // );
};

export const cacheMainPreview = (preview: string) => {
  // TODO: Reimplement cache?
  // appToSpecificPrompt(
  //   promptWindow,
  //   AppChannel.SET_CACHED_MAIN_PREVIEW,
  //   preview
  // );
};

export const scoreAndCacheMainChoices = (scripts: Script[]) => {
  // TODO: Reimplement score and cache?
  // const results = scripts
  //   .filter((c) => {
  //     if (c?.miss || c?.pass || c?.hideWithoutInput || c?.exclude) return false;
  //     return true;
  //   })
  //   .map(createScoredChoice);
  // cacheMainChoices(results);
};

export const appendChoices = (choices: Choice[]) => {
  // TODO: Reimplement append choices?
  // setChoices(kitSearch.choices.concat(choices), { preload: false });
};

export const clearPromptCache = async () => {
  // TODO: Reimplement clear prompt cache?
  // try {
  //   promptState.screens = {};
  // } catch (error) {
  //   log.info(error);
  // }
  // promptWindow?.webContents?.setZoomLevel(ZOOM_LEVEL);
  // kitState.resizePaused = true;
  // initBounds();
  // setTimeout(() => {
  //   kitState.resizePaused = false;
  // }, 1000);
};

export const destroyPromptWindow = () => {
  // TODO: Reimplement destroy prompt window?
  // if (promptWindow && !promptWindow?.isDestroyed()) {
  //   hideAppIfNoWindows(HideReason.Destroy);
  //   promptWindow.destroy();
  // }
};

// let attempts = 0;

// const boundsMatch = async (bounds: Rectangle) => {
//   const { width, height } = promptWindow?.getBounds();
//   if (width === bounds.width && height === bounds.height) {
//     log.info(`↖ Bounds attempt: ${attempts}`);
//     return true;
//   }

//   if (attempts < 4) {
//     attempts += 1;
//     return new Promise((resolve) => {
//       setTimeout(async () => {
//         const match = await boundsMatch(bounds);
//         attempts = 0;
//         resolve(match);
//       }, 0);
//     });
//   }
//   return true;
// };

export const initMainBounds = async () => {
  // const bounds = getCurrentScreenPromptCache(getMainScriptPath());
  // if (!bounds.height || bounds.height < PROMPT.HEIGHT.BASE) {
  //   bounds.height = PROMPT.HEIGHT.BASE;
  // }
  // setBounds(
  //   bounds,
  //   `promptId ${kitState.promptId} - promptCount ${
  //     kitState.promptCount
  //   } - kitState.promptBounds ${JSON.stringify(kitState.promptBounds)}`
  //   // promptWindow?.isVisible() &&
  //   //   kitState.promptCount > 1 &&
  //   //   !kitState.promptBounds.height
  // );
};

// TODO: I think this was only for the "main" prompt concept
// const subScriptPath = subscribeKey(
//   kitState,
//   'scriptPath',
//   async (scriptPath) => {
//     log.verbose(`📄 scriptPath changed: ${scriptPath}`);

//     if (promptWindow?.isDestroyed()) return;
//     const noScript = kitState.scriptPath === '';

//     kitState.promptUI = UI.arg;
//     kitState.resizedByChoices = false;

//     if (pathsAreEqual(scriptPath || '', kitState.scriptErrorPath)) {
//       kitState.scriptErrorPath = '';
//     }

//     if (noScript) {
//       log.info(
//         `
// 🎬: scriptPath changed: ${kitState.scriptPath}, prompt count: ${kitState.promptCount}
// ---`
//       );

//       // hideAppIfNoWindows(HideReason.NoScript);
//       clearSearch();
//       sendToSpecificPrompt(promptWindow, Channel.SET_OPEN, false);

//       if (kitState.isWindows) {
//         initMainBounds();
//       }
//       // kitState.alwaysOnTop = false;

//       return;
//     }

//     kitState.prevScriptPath = kitState.scriptPath;
//   }
// );

const subAlwaysOnTop = subscribeKey(kitState, 'alwaysOnTop', (alwaysOnTop) => {
  log.info(`👆 Always on top changed: ${alwaysOnTop ? 'on' : 'off'}`);
});

const subIsSponsor = subscribeKey(kitState, 'isSponsor', (isSponsor) => {
  log.info(`🎨 Sponsor changed:`, isSponsor);
  setKitStateAtom({ isSponsor });
});

export const setKitStateAtom = (partialState: Partial<typeof kitState>) => {
  sendToAllPrompts(Channel.SET_KIT_STATE, partialState);
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

subs.push(
  // subScriptPath,
  subIsSponsor,
  subUpdateDownloaded,
  subEscapePressed,
  subAppDbMini,
  subAppDbCachePrompt,
  subAlwaysOnTop
);

export class KitPrompt {
  id: string = '';
  pid: number = 0;
  public window: BrowserWindow;
  public sendToPrompt: (channel: Channel, data?: any) => void;
  public appToPrompt: (channel: AppChannel, data?: any) => void;

  constructor(pid: number) {
    this.pid = pid;
    log.info(`>>>>>>>>>>>


  createPromptWindow

  >>>>>>>>>>>>>>`);

    const width = PROMPT.WIDTH.BASE;
    const height = PROMPT.HEIGHT.BASE;
    // const currentScreen = getCurrentScreenFromMouse();
    const currentScreen = getCurrentScreen();
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
        backgroundThrottling: false,
        experimentalFeatures: true,
        spellcheck: true,
        preload: fileURLToPath(
          new URL('../preload/index.mjs', import.meta.url)
        ),
        webSecurity: false,
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
    };

    // Disable Windows show animation
    // TODO: Move appDb to electron store
    // assign(appDb, (await getAppDb()).data);

    if ((appDb && appDb?.disableBlurEffect) || !kitState.isMac) {
      this.window = new BrowserWindow({
        ...options,
      });
    } else {
      this.window = new BrowserWindow({
        ...options,
        transparent: kitState.isMac || kitState.isWindows,
        vibrancy: 'popover',
        visualEffectState: 'active',
        backgroundColor: '#00000000',
      });
    }

    const sendToPrompt = createSendToPrompt(this.window);
    const appToPrompt = createAppToPrompt(this.window);
    this.sendToPrompt = sendToPrompt;
    this.appToPrompt = appToPrompt;

    if (kitState.isWindows) {
      this.window.setBackgroundMaterial('mica');
    }

    // REMOVE-MAC
    if (kitState.isMac) {
      makePanel(this.window);
    }
    // END-REMOVE-MAC

    if (kitState.isWindows) {
      // REMOVE-NODE-WINDOW-MANAGER
      windowManager.setWindowAsPopupWithRoundedCorners(
        this.window?.getNativeWindowHandle()
      );

      this.window.setHasShadow(true);
      // END-REMOVE-NODE-WINDOW-MANAGER
    }

    // prompt.setVisibleOnAllWorkspaces(true, {
    //   visibleOnFullScreen: true,
    //   skipTransformProcessType: true,
    // });

    this.window?.webContents?.setZoomLevel(ZOOM_LEVEL);

    setInterval(() => {
      this.window?.webContents?.startPainting();
    }, 100);

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
        this.window.setTouchBar(touchbar);
      } catch (error) {
        log.error(error);
      }
    }

    this.window.webContents?.on('did-finish-load', () => {
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

      const user = snapshot(kitState.user);
      log.info(`Send user.json to prompt`, user);

      appToPrompt(AppChannel.USER_CHANGED, user);
      setKitStateAtom({
        isSponsor: kitState.isSponsor,
      });
      emitter.emit(KitEvent.DID_FINISH_LOAD);

      log.info(`>>>>>>>>>>>


      end createPromptWindow

      >>>>>>>>>>>>>>`);
    });

    // reload if unresponsive
    this.window.webContents?.on('unresponsive', () => {
      log.error(`Prompt window unresponsive. Reloading`);
      if (this.window.isDestroyed()) {
        log.error(`Prompt window is destroyed. Not reloading`);
        return;
      }

      this.window.webContents?.once('did-finish-load', () => {
        log.info(`Prompt window reloaded`);
      });

      this.window.reload();
    });

    let escapePressCount = 0;
    let lastEscapePressTime = 0;

    this.window.webContents?.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        const currentTime = Date.now();
        if (currentTime - lastEscapePressTime <= 300) {
          escapePressCount += 1;
          if (escapePressCount >= 5) {
            log.info(`Escape pressed 5 times quickly, reloading`);
            this.window.reload();
            escapePressCount = 0;
          }
        } else {
          escapePressCount = 1;
        }
        lastEscapePressTime = currentTime;
      }
    });

    //   this.prompt.webContents?.on('new-window', function (event, url) {
    //     event.preventDefault()
    //     shell.openExternal(url)
    // })

    this.window.webContents?.setWindowOpenHandler(({ url }) => {
      log.info(`Opening ${url}`);

      // Only allow websites to open in the browser
      if (!url.startsWith('http')) return { action: 'deny' };

      shell.openExternal(url);

      return { action: 'deny' };
    });

    log.silly(`Loading prompt window html`);

    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
      this.window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`);
    } else {
      this.window.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    this.window.webContents.on('devtools-closed', () => {
      log.silly(`event: devtools-closed`);
      this.window.setAlwaysOnTop(false);
      this.maybeHide(HideReason.DevToolsClosed);
    });

    emitter.on(KitEvent.OpenDevTools, () => {
      log.silly(`event: OpenDevTools`);
      this.window.webContents?.openDevTools({
        activate: true,
        mode: 'detach',
      });
    });

    const showEmoji = () => {
      kitState.emojiActive = true;
      log.info(`Using built-in emoji`);
      app.showEmojiPanel();
    };

    const onBlur = async () => {
      log.info(`🙈 Prompt window blurred`, {
        isPromptReady: kitState.isPromptReady,
        isActivated: kitState.isActivated,
      });
      if (kitState.justFocused && this.isVisible()) {
        log.info(`🙈 Prompt window was just focused. Ignore blur`);

        this.focusPrompt();
        return;
      }

      if (!kitState.isLinux) {
        globalShortcut.unregister(getEmojiShortcut());
        kitState.emojiActive = false;
      }

      if (!kitState.isPromptReady) return;

      if (this.window.isDestroyed()) return;
      if (kitState.isActivated) {
        kitState.isActivated = false;
        return;
      }
      if (this.window.webContents?.isDevToolsOpened()) return;

      // if (!this.prompt.isFocused()) return;

      log.info(`Blur: ${kitState.ignoreBlur ? 'ignored' : 'accepted'}`);

      if (this.window.isVisible()) {
        this.sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
      }

      this.maybeHide(HideReason.Blur);

      if (os.platform().startsWith('win')) {
        return;
      }

      if (kitState.ignoreBlur) {
        // this.prompt.setVibrancy('popover');
      } else if (!kitState.ignoreBlur) {
        log.verbose(`Blurred by kit: off`);
        kitState.blurredByKit = false;
      }
    };

    this.window.on('always-on-top-changed', () => {
      log.info(`📌 always-on-top-changed: ${this.window.isAlwaysOnTop()}`);
    });

    this.window.on('minimize', () => {
      log.info(`📌 minimize`);
    });

    this.window.on('restore', () => {
      log.info(`📌 restore`);
    });

    this.window.on('maximize', () => {
      log.info(`📌 maximize`);
    });

    this.window.on('unmaximize', () => {
      log.info(`📌 unmaximize`);
    });

    this.window.on('close', () => {
      log.info(`📌 close`);
    });

    this.window.on('closed', () => {
      log.info(`📌 closed`);
    });

    this.window.webContents?.on('focus', () => {
      log.info(`WebContents Focus`);
    });

    this.window.on('focus', () => {
      log.info(`👓 Focus bounds:`, this.window.getBounds());

      if (!kitState.isLinux) {
        log.verbose(`Registering emoji shortcut`);
        // Grab cmd+ctrl+space shortcut to use electron's emoji picker
        kitState.emojiActive = false;
        globalShortcut.register(getEmojiShortcut(), showEmoji);
      }

      kitState.justFocused = true;
      setTimeout(() => {
        kitState.justFocused = false;
      }, 1000);
    });
    this.window.on('blur', onBlur);

    this.window.on('hide', () => {
      log.info(`🫣 Prompt window hidden`);
      kitState.isPromptReady = false;
      kitState.promptHidden = true;

      if (!kitState.isLinux) {
        globalShortcut.unregister(getEmojiShortcut());
        kitState.emojiActive = false;
      }
    });

    this.window.on('show', async () => {
      log.info(`😳 Prompt window shown`);
      kitState.promptHidden = false;
    });

    this.window.webContents?.on(
      'did-fail-load',
      (errorCode, errorDescription, validatedURL, isMainFrame) => {
        log.info(`event: did-fail-load:`, {
          errorCode,
          errorDescription,
          isMainFrame,
        });
      }
    );

    this.window.webContents?.on('did-stop-loading', () => {
      log.info(`event: did-stop-loading`);
    });

    this.window.webContents?.on('dom-ready', () => {
      log.info(`🍀 dom-ready on ${kitState?.scriptPath}`);

      // hideAppIfNoWindows(HideReason.DomReady);
      sendToPrompt(Channel.SET_READY, true);
    });

    this.window.webContents?.on('render-process-gone', (event, details) => {
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
      log.info(`Resized: ${this.window.getSize()}`);

      if (kitState.isResizing) {
        kitState.isResizing = false;
      }

      this.saveCurrentPromptBounds();
    };

    if (kitState.isLinux) {
      this.window.on('resize', (event) => {
        kitState.modifiedByUser = true;
      });
    } else {
      this.window.on('will-resize', (event, rect) => {
        log.silly(`Will Resize ${rect.width} ${rect.height}`);

        kitState.modifiedByUser = true;
      });
    }

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
      this.saveCurrentPromptBounds();
    }, 250);

    this.window.on('will-move', willMoveHandler);
    this.window.on('resized', onResized);
    this.window.on('moved', onMoved);

    powerMonitor.on('lock-screen', () => {
      log.info(`🔒 System locked. Reloading prompt window.`);
      if (kitState.scriptPath === getMainScriptPath())
        this.maybeHide(HideReason.LockScreen);
    });
  }
  forcePromptToCenter = async () => {
    this.window?.show();
    this.window?.setPosition(0, 0);
    this.window?.center();
    this.window?.focus();
    this.window?.setAlwaysOnTop(true, 'pop-up-menu', 1);
  };

  reload = () => {
    log.info(`Reloading prompt window...`);
    if (this.window.isDestroyed()) {
      log.warn(`Prompt window is destroyed. Not reloading.`);
      return;
    }

    // if (callback) {
    //   this.prompt.webContents?.once('dom-ready', () => {
    //     setTimeout(callback, 1000);
    //   });

    // }

    this.window.reload();
  };

  getBounds = () => this.window.getBounds();
  hasFocus = () => this.window.isFocused();

  initShowPrompt = () => {
    this.sendToPrompt(Channel.SET_OPEN, true);
    if (kitState.isWindows && !this.isVisible()) {
      // REMOVE-NODE-WINDOW-MANAGER
      try {
        windowManager.forceWindowPaint(this.window.getNativeWindowHandle());
        const currentWindow = windowManager.getActiveWindow();
        if (currentWindow.processId !== process.pid) {
          log.info(
            `Storing previous window: ${currentWindow.processId} ${currentWindow.path}`
          );
          prevWindow = currentWindow;
        }
      } catch (error) {
        log.error(error);
      }
      // END-REMOVE-NODE-WINDOW-MANAGER
    }
    if (kitState.isMac) {
      this.window.showInactive();
    } else {
      // this.prompt.restore();
      // REMOVE-NODE-WINDOW-MANAGER
      windowManager.setWindowAsPopupWithRoundedCorners(
        this.window.getNativeWindowHandle()
      );

      this.window.setHasShadow(true);
      // END-REMOVE-NODE-WINDOW-MANAGER
      this.window.show();
    }

    if (kitState.isWindows) {
      this.window.setHasShadow(true);
    }

    this.setPromptAlwaysOnTop(true);

    if (topTimeout) clearTimeout(topTimeout);
    topTimeout = setTimeout(() => {
      if (kitState.ignoreBlur) {
        this.setPromptAlwaysOnTop(kitState.alwaysOnTop);
      }
    }, 200);

    this.focusPrompt();
  };

  onHideOnce = (fn: () => void) => {
    let id: null | NodeJS.Timeout = null;
    if (this.window) {
      const handler = () => {
        if (id) clearTimeout(id);
        this.window.removeListener('hide', handler);
        fn();
      };

      id = setTimeout(() => {
        if (this.window?.isDestroyed()) return;
        this.window?.removeListener('hide', handler);
      }, 1000);

      this.window?.once('hide', handler);
    }
  };

  showPrompt = () => {
    this.initShowPrompt();
    this.sendToPrompt(Channel.SET_OPEN, true);

    setTimeout(() => {
      kitState.isPromptReady = true;
    }, 100);
  };

  initBounds = async (forceScriptPath?: string, show = false) => {
    if (this.window?.isDestroyed()) return;

    if (this.window?.isVisible()) {
      log.info(`↖ Ignore init bounds, already visible`);
      return;
    }

    const bounds = getCurrentScreenPromptCache(
      forceScriptPath || kitState.scriptPath,
      {
        ui: kitState.promptUI,
        resize: kitState.resize,
        bounds: kitState.promptBounds,
      }
    );
    log.info(`↖ Init bounds: Prompt ${kitState.promptUI} ui`, bounds);

    // If widths or height don't match, send SET_RESIZING to prompt

    const { width, height } = this.window?.getBounds();
    if (bounds.width !== width || bounds.height !== height) {
      log.verbose(
        `Started resizing: ${this.window?.getSize()}. Prompt count: ${
          kitState.promptCount
        }`
      );

      kitState.isResizing = true;
    }

    // if (isKitScript(kitState.scriptPath)) return;

    this.setBounds(
      bounds,
      `promptId ${kitState.promptId} - promptCount ${
        kitState.promptCount
      } - kitState.promptBounds ${JSON.stringify(kitState.promptBounds)}`
      // this.prompt?.isVisible() &&
      //   kitState.promptCount > 1 &&
      //   !kitState.promptBounds.height
    );

    if (!show) {
      return;
    }

    log.info(`👋 Show Prompt from preloaded ${kitState.scriptPath}`);
    this.showPrompt();
  };

  makePromptWindow = async () => {
    // REMOVE-MAC
    makeWindow(this.window);
    // END-REMOVE-MAC
  };

  blurPrompt = () => {
    log.info(`blurPrompt`);
    if (this.window.isDestroyed()) return;
    if (this.window) {
      this.window.blur();
    }
  };

  setBounds = async (bounds: Partial<Rectangle>, reason = '') => {
    if (!kitState.ready) return;
    const prevSetBounds = this.window?.getBounds();
    const widthNotChanged =
      bounds?.width && Math.abs(bounds.width - prevSetBounds.width) < 4;
    const heightNotChanged =
      bounds?.height && Math.abs(bounds.height - prevSetBounds.height) < 4;
    const xNotChanged = bounds?.x && Math.abs(bounds.x - prevSetBounds.x) < 4;
    const yNotChanged = bounds?.y && Math.abs(bounds.y - prevSetBounds.y) < 4;

    const noChange =
      heightNotChanged && widthNotChanged && xNotChanged && yNotChanged;

    log.verbose(
      `📐 setBounds: ${kitState.scriptPath} reason ${reason}`,
      bounds
    );
    log.verbose({
      ...bounds,
      isVisible: this.isVisible() ? 'true' : 'false',
      noChange: noChange ? 'true' : 'false',
    });

    this.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
      id: kitState.promptId,
      ...bounds,
    });

    if (noChange) {
      return;
    }

    // TODO: Maybe use in the future with setting the html body bounds for faster resizing?
    // this.prompt?.setContentSize(bounds.width, bounds.height);

    // Keep in bounds on the current screen
    const currentScreen = this.isVisible()
      ? getCurrentScreenFromBounds(this.window?.getBounds())
      : this.getCurrentScreenFromMouse();
    const { x, y, width, height } = bounds;
    const { x: workX, y: workY } = currentScreen.workArea;
    const { width: screenWidth, height: screenHeight } =
      currentScreen.workAreaSize;

    if (typeof bounds?.height !== 'number')
      bounds.height = prevSetBounds.height;
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
    } else if (
      height &&
      (y || prevSetBounds.y) + height > workY + screenHeight
    ) {
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

    log.info(`📐 setBounds: ${reason}`, {
      ...bounds,
    });

    if (kitState?.kenvEnv?.KIT_WIDTH) {
      bounds.width = parseInt(kitState?.kenvEnv?.KIT_WIDTH, 10);
    }

    try {
      this.window.setBounds(bounds, false);
      const promptBounds = {
        id: kitState.promptId,
        ...this.window?.getBounds(),
      };

      sendToSpecificPrompt(
        this.window,
        Channel.SET_PROMPT_BOUNDS,
        promptBounds
      );
    } catch (error) {
      log.info(`setBounds error ${reason}`, error);
    }
  };

  togglePromptEnv = async (envName: string) => {
    log.info(`Toggle prompt env: ${envName} to ${kitState.kenvEnv?.[envName]}`);

    if (process.env[envName]) {
      delete process.env[envName];
      delete kitState.kenvEnv?.[envName];
      this.window?.webContents.executeJavaScript(`
      if(!process) process = {};
      if(!process.env) process.env = {};
      if(process.env?.["${envName}"]) delete process.env["${envName}"]
      `);
    } else if (kitState.kenvEnv?.[envName]) {
      process.env[envName] = kitState.kenvEnv?.[envName];
      this.window?.webContents.executeJavaScript(`
      if(!process) process = {};
      if(!process.env) process.env = {};
      process.env["${envName}"] = "${kitState.kenvEnv?.[envName]}"
      `);
    }
  };

  centerPrompt = async () => {
    this.window.center();
  };

  getPromptBounds = async () => {
    return this.window?.getBounds();
  };

  resetWindow = async () => {
    this.window.show();
    this.window.setPosition(0, 0);
    this.window.center();
    this.window.focus();
    this.window.setAlwaysOnTop(true, 'pop-up-menu', 1);
  };

  debugPrompt = async () => {
    const promptLog = log.create({
      logId: 'promptLog',
    });
    const promptLogPath = kenvPath('logs', 'prompt.log');

    (promptLog.transports.file as FileTransport).resolvePathFn = () =>
      promptLogPath;
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

      const promptBounds = this.window?.getBounds();
      const screenBounds = getCurrentScreen().bounds;
      const mouse = screen.getCursorScreenPoint();

      promptLog.info({
        scriptPath: kitState.scriptPath,
        isVisible: this.window?.isVisible() ? 'true' : 'false',
        promptBounds,
        screenBounds,
        mouse,
        activeAppBounds,
      });
    };

    shell.openPath(promptLogPath);

    const id = setInterval(getPromptInfo, 3000);
    // stop after 1 minute.
    setTimeout(() => {
      clearInterval(id);
    }, 60000);
  };

  pingPrompt = async (channel: AppChannel, data?: any) => {
    log.silly(`appToPrompt: ${String(channel)} ${data?.kitScript}`);
    return new Promise((resolve, reject) => {
      if (
        this.window &&
        !this.window.isDestroyed() &&
        this.window?.webContents
      ) {
        ipcMain.once(channel, () => {
          log.info(`🎤 ${channel} !!! <<<<`);
          resolve(true);
        });
        this.window?.webContents.send(channel, data);
      }
    });
  };

  savePromptBounds = async (
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

    const currentScreen = getCurrentScreenFromBounds(this.window?.getBounds());

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

  isDestroyed = () => this.window?.isDestroyed();

  getFromPrompt = <K extends keyof ChannelMap>(
    child: ChildProcess,
    channel: K,
    data?: ChannelMap[K]
  ) => {
    if (process.env.KIT_SILLY)
      log.silly(`sendToPrompt: ${String(channel)}`, data);
    // log.info(`>_ ${channel}`);
    if (this.window && !this.window.isDestroyed() && this.window?.webContents) {
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
      this.window?.webContents.send(String(channel), data);
    }
  };

  pingPromptWithTimeout = async <K extends keyof ChannelMap>(
    channel: K,
    timeout: number,
    data: ChannelMap[K]
  ) => {
    const messageId = Math.random();
    return new Promise((resolve) => {
      let id: any = null;
      const handler = (event, handledData) => {
        if (id) clearTimeout(id);
        log.verbose(`🎤 ${channel} pinged...`);

        if (handledData?.messageId === messageId) {
          log.info(`Message match: ${messageId}`);
          resolve('done');
        } else {
          log.error(
            `Message mismatch: ${messageId} !== ${handledData?.messageId}`
          );
        }
      };
      id = setTimeout(() => {
        // just in case
        log.verbose(`🎤 ${channel} timeout...`);
        ipcMain.off(channel, handler);
        resolve('done');
      }, timeout);
      ipcMain.once(channel, handler);
      if (process.env.KIT_SILLY)
        log.silly(`sendToPrompt: ${String(channel)}`, data);
      // log.info(`>_ ${channel}`);
      if (
        this.window &&
        !this.window.isDestroyed() &&
        this.window?.webContents
      ) {
        data.messageId = messageId;
        // log.info(`🎤 ${channel} >>>> ${data?.messageId}`);
        this.window?.webContents.send(String(channel), data);
      }
    });
  };

  resize = async (resizeData: ResizeData) => {
    /**
     * Linux doesn't support the "will-resize" or "resized" events making it impossible to distinguish
     * between when the user is manually resizing the window and when the window is being resized by the app.
     * Since we can only enable one, we had to choose to allow the user to manually resize the window.
     *
     * Hoping to be able to discover a clever workaround in the future 🤞
     */
    if (kitState.isLinux) return;
    // if (isEqual(prevResizeData, resizeData)) return;
    prevResizeData = resizeData;

    const {
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
      isMainScript,
    }: ResizeData = resizeData;
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
        this.saveCurrentPromptBounds();
      }, 50);
    }
    if (!forceHeight && !kitState.resize && !forceResize) return;
    // if (kitState.promptId !== id || kitState.modifiedByUser) return;
    if (kitState.modifiedByUser) return;
    if (this.window?.isDestroyed()) return;

    const {
      width: currentWidth,
      height: currentHeight,
      x,
      y,
    } = this.window.getBounds();

    const targetHeight = topHeight + mainHeight + footerHeight;

    let cachedWidth;
    let cachedHeight;
    let cachedX;
    let cachedY;

    if (isMainScript) {
      const cachedBounds = getCurrentScreenPromptCache(getMainScriptPath());
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

    // center x based on current prompt x position
    const newX = cachedX || Math.round(x + currentWidth / 2 - width / 2);
    const newY = cachedY || y;

    const bounds = { x: newX, y: newY, width, height };
    this.setBounds(
      bounds,
      `resize: ${reason} -> target: ${targetHeight} max: ${maxHeight} height: ${height}, force: ${
        forceResize ? 'true' : 'false'
      }`
    );

    if (kitState.promptCount === 1 && !inputChanged && justOpened) {
      this.savePromptBounds(kitState.scriptPath, bounds);
    }
    kitState.resizedByChoices = ui === UI.arg;
  };

  setPromptData = async (promptData: PromptData) => {
    const appToPrompt = createAppToPrompt(this.window);
    log.info(`
    >>> 📝 setPromptData for ${promptData?.scriptPath}`);
    clearFlagSearch();
    kitSearch.shortcodes.clear();
    kitSearch.triggers.clear();
    if (promptData?.hint) {
      for (const trigger of promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi) ||
        []) {
        kitSearch.triggers.set(trigger, { name: trigger, value: trigger });
      }
    }

    kitSearch.commandChars = promptData.inputCommandChars || [];

    if (kitState.cachePrompt && !promptData.preload) {
      kitState.cachePrompt = false;
      promptData.name ||= kitState.script.name || '';
      promptData.description ||= kitState.script.description || '';
      log.info(`💝 Caching prompt data: ${kitState?.scriptPath}`);
      preloadPromptDataMap.set(kitState.scriptPath, {
        ...promptData,
        input: promptData?.keyword ? '' : promptData?.input || '',
        keyword: '',
      });
    }

    if (promptData.flags) {
      setFlags(this.window, promptData.flags);
    }

    if (kitState.preloaded) {
      kitState.preloaded = false;
      return;
    }

    kitState.hiddenByUser = false;
    // if (!pidMatch(pid, `setPromptData`)) return;

    if (!kitState.ignoreBlur) kitState.ignoreBlur = promptData.ignoreBlur;

    const newAlwaysOnTop =
      typeof promptData?.alwaysOnTop === 'boolean'
        ? promptData.alwaysOnTop
        : // If alwaysOnTop is not defined, use the opposite of ignoreBlur
          !promptData?.ignoreBlur;

    this.setPromptAlwaysOnTop(newAlwaysOnTop);

    if (promptData?.scriptPath !== kitState.scriptPath) {
      log.warn(`🚫 setPromptData: scriptPath doesn't match`);
      log.warn(`${promptData?.scriptPath} !== ${kitState.scriptPath}`);

      return;
    }

    kitState.resize = promptData?.resize || false;
    kitState.shortcutsPaused = promptData.ui === UI.hotkey;
    kitState.promptUI = promptData.ui;

    log.verbose(`setPromptData ${promptData.scriptPath}`);
    const isMainScript = kitState.scriptPath === getMainScriptPath();

    kitState.promptBounds = {
      x: promptData.x,
      y: promptData.y,
      width: isMainScript
        ? getDefaultWidth()
        : promptData.width || getDefaultWidth(),
      height: isMainScript ? PROMPT.HEIGHT.BASE : promptData.height,
    };

    this.id = promptData.id;
    kitState.promptId = promptData.id;
    if (kitState.suspended || kitState.screenLocked) return;
    kitState.ui = promptData.ui;

    if (kitSearch.keyword) {
      promptData.keyword = kitSearch.keyword || kitSearch.keyword;
    }

    await this.pingPromptWithTimeout(Channel.SET_PROMPT_DATA, 250, promptData);

    if (
      typeof promptData?.x === 'number' ||
      typeof promptData?.y === 'number'
    ) {
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
      log.info(`Before initBounds`);
      this.initBounds();
      log.info(`After initBounds`);
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

    if (!this.isVisible() && promptData?.show) {
      log.info(`👋 Show Prompt from setPromptData for ${kitState.scriptPath}`);
      this.showPrompt();
    } else if (this.isVisible() && !promptData?.show) {
      this.actualHide();
    }

    if (boundsCheck) clearTimeout(boundsCheck);
    boundsCheck = setTimeout(async () => {
      if (this.window?.isDestroyed()) return;
      const currentBounds = this.window?.getBounds();
      const validBounds = isBoundsWithinDisplays(currentBounds);

      if (!validBounds) {
        log.info(`Prompt window out of bounds. Clearing cache and resetting.`);
        await clearPromptCacheFor(kitState.scriptPath);
        this.initBounds();
      } else {
        log.info(`Prompt window in bounds.`);
      }
    }, 1000);

    trackEvent(TrackEvent.SetPrompt, {
      ui: promptData.ui,
      script: path.basename(promptData.scriptPath),
      name: promptData?.name || kitState?.script?.name || '',
      description:
        promptData?.description || kitState?.script?.description || '',
    });
  };

  actualHide = () => {
    if (!this.isVisible()) return;

    log.info(`🙈 Hiding prompt window`);
    if (kitState.isWindows) {
      // REMOVE-NODE-WINDOW-MANAGER
      windowManager.hideInstantly(this.window?.getNativeWindowHandle());
      this.window?.emit('hide');
      // END-REMOVE-NODE-WINDOW-MANAGER
    } else {
      this.window?.hide();
    }
    // REMOVE-NODE-WINDOW-MANAGER
    if (kitState.isWindows && prevWindow) {
      try {
        prevWindow?.bringToTop();
      } catch (error) {
        log.error(error);
      }
    }
    // END-REMOVE-NODE-WINDOW-MANAGER
  };

  isVisible = () => {
    if (!this.window) return false;

    if (this.window.isDestroyed()) {
      return false;
    }
    const visible = this.window?.isVisible();
    // log.silly(`function: isVisible: ${visible ? 'true' : 'false'}`);
    return visible;
  };

  maybeHide = async (reason: string) => {
    if (!this.isVisible()) return;
    log.info(`Attempt Hide: ${reason}`);

    if (
      reason === HideReason.NoScript ||
      reason === HideReason.Escape ||
      reason === HideReason.BeforeExit
    ) {
      this.actualHide();
      if (!kitState.kenvEnv?.KIT_NO_RESET_PROMPT) this.resetPrompt();

      // attemptPreload(getMainScriptPath(), false);
      // clearSearch();
      // invokeSearch('');
      return;
    }

    if (reason === HideReason.PingTimeout) {
      log.info(`⛑ Attempting recover...`);
      kitState.debugging = false;
      kitState.ignoreBlur = false;

      emitter.emit(KitEvent.KillProcess, kitState.pid);
      this.actualHide();
      this.reload();

      return;
    }

    if (reason === HideReason.DebuggerClosed) {
      this.actualHide();
      return;
    }

    if (kitState.debugging) return;
    if (!kitState.ignoreBlur && this.window?.isVisible()) {
      log.verbose(`Hiding because ${reason}`);
      if (!kitState.preventClose) {
        this.actualHide();
      }
    }
  };

  saveCurrentPromptBounds = async () => {
    // if (kitState.promptCount === 1) {
    const currentBounds = this.window?.getBounds();
    this.savePromptBounds(kitState.scriptPath, currentBounds);

    this.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
      id: kitState.promptId,
      ...currentBounds,
    });
    // }
  };

  prepPromptForQuit = async () => {
    // REMOVE-MAC
    this.actualHide();
    await new Promise((resolve) => {
      setTimeout(() => {
        makeKeyWindow(new BrowserWindow());
        makeWindow(this.window);
        this.window?.close();
        resolve(null);
      });
    });
    // END-REMOVE-MAC
  };

  setVibrancy = (
    vibrancy: Parameters<typeof BrowserWindow.prototype.setVibrancy>[0]
  ) => {
    if (this.window.isDestroyed()) return;
    if (kitState.isMac) {
      try {
        this.window.setVibrancy(vibrancy);
      } catch (error) {
        log.error(error);
      }
    } else {
      log.info(`Custom vibrancy not supported on this platform`);
    }
  };

  setPromptProp = (data: { prop: { key: string; value: any } }) => {
    const { key, value }: any = data.prop;
    (this.window as any)[key](value);
  };

  focusPrompt = () => {
    log.silly(`👁️  Focusing prompt`);
    if (
      this.window &&
      !this.window.isDestroyed() &&
      !this.window?.isFocused()
    ) {
      try {
        if (kitState.isMac) {
          // REMOVE-MAC
          makeKeyWindow(this.window);
          // END-REMOVE-MAC
        } else {
          this.window?.focus();
        }
      } catch (error) {
        log.error(error);
      }
      // this.prompt?.focusOnWebView();
    }
  };

  forceFocus = () => {
    log.silly(`function: forceFocus`);
    this.window?.show();
    this.focusPrompt();
  };

  setPromptAlwaysOnTop = (onTop: boolean) => {
    log.info(`function: setPromptAlwaysOnTop: ${onTop ? 'true' : 'false'}`);
    if (this.window && !this.window.isDestroyed()) {
      const changed = onTop !== kitState.alwaysOnTop;
      kitState.alwaysOnTop = onTop;
      if (onTop && changed) {
        log.info(
          `📌 on top: ${onTop ? 'true' : 'false'}. ignoreBlur: ${
            kitState.ignoreBlur ? 'true' : 'false'
          }`
        );
        this.window.setAlwaysOnTop(onTop, 'pop-up-menu', 1);

        if (kitState.isMac) {
          this.window.moveTop();
        } else {
          this.window.setVisibleOnAllWorkspaces(true);
        }
      } else if (kitState.ignoreBlur && changed) {
        log.info({ onTop, ignoreBlur: kitState.ignoreBlur });
        this.window.setAlwaysOnTop(true, 'normal', 10);
        setTimeout(() => {
          this.window.setAlwaysOnTop(onTop, 'normal', 10);
        }, 100);

        if (!kitState.isMac) {
          this.window.setVisibleOnAllWorkspaces(false);
        }
      } else {
        this.window.setAlwaysOnTop(onTop, 'pop-up-menu', 1);
      }
    } else {
      kitState.alwaysOnTop = false;
    }
  };

  devToolsVisible = () => {
    log.silly(`function: devToolsVisible`);
    return this.window.webContents.isDevToolsOpened();
  };

  isFocused = () => {
    const focused = this.window?.isFocused();
    log.silly(`function: isFocused: ${focused ? 'true' : 'false'}`);
    return focused;
  };

  getCurrentScreenFromMouse = (): Display => {
    if (this.window?.isVisible() && kitState.promptCount > 1) {
      const [x, y] = this.window?.getPosition();
      return screen.getDisplayNearestPoint({ x, y });
    }
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  };

  forceRender = () => {
    this.appToPrompt(AppChannel.RESET_PROMPT);
  };

  resetPrompt = async () => {
    log.info(`🏋️‍♂️ Reset main`);
    try {
      kitState.promptCount = 0;
      this.forceRender();
      log.info(`🏋️ Force rendered...`);
    } catch (error) {
      log.error(error);
    }

    if (kitState.isWindows) {
      // REMOVE-NODE-WINDOW-MANAGER
      setTimeout(() => {
        windowManager.forceWindowPaint(this.window?.getNativeWindowHandle());
      }, 10);
      // END-REMOVE-NODE-WINDOW-MANAGER
    }
    this.initBounds();
  };

  setScript = async (
    script: Script,
    pid: number,
    force = false
  ): Promise<'denied' | 'allowed'> => {
    performance.mark('script');
    kitState.resizePaused = false;
    const cache = Boolean(script?.cache);
    kitState.cacheChoices = cache;
    kitState.cachePrompt = cache;
    kitState.cachePreview = cache;
    log.info(`${pid} setScript`, { script: script?.filePath });

    if (script.filePath === prevScriptPath && pid === prevPid) {
      // Using a keyboard shortcut to launch a script will hit this scenario
      // Because the app will call `setScript` immediately, then the process will call it too
      log.info(`Script already set. Ignore`);
      return 'denied';
    }

    prevScriptPath = script.filePath;
    prevPid = pid;

    const pidMatch = (pid: number, message: string) => {
      if (pid !== kitState.pid && promptWindow?.isVisible()) {
        log.info(
          `pid ${pid} doesn't match active pid ${kitState.pid}. ${message}`
        );
        return false;
      }

      return true;
    };

    if (!force && (!script?.filePath || !pidMatch(pid, `setScript`))) {
      return 'denied';
    }

    kitState.pid = pid;
    const { prompt } = processes.find((p) => p.pid === pid) as ProcessAndPrompt;
    if (!prompt) return 'denied';

    this.sendToPrompt(Channel.SET_PID, pid);

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

    if (script.filePath === getMainScriptPath()) {
      script.tabs = script?.tabs?.filter(
        (tab: string) => !tab.match(/join|live/i)
      );

      const sinceLast = differenceInHours(
        Date.now(),
        kitState.previousDownload
      );
      log.info(`Hours since sync: ${sinceLast}`);
      if (sinceLast > 6) {
        kitState.previousDownload = new Date();
      }
    }
    this.sendToPrompt(Channel.SET_SCRIPT, script);

    if (script.filePath === getMainScriptPath()) {
      emitter.emit(KitEvent.MainScript, script);
    }

    return 'allowed';
  };
}
