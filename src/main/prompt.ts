// REMOVE-MAC
import {
  makeKeyWindow,
  makePanel,
  makeWindow,
  hideInstant,
} from '@johnlindquist/mac-panel-window';
// END-REMOVE-MAC

// REMOVE-NODE-WINDOW-MANAGER
import { windowManager, Window } from '@johnlindquist/node-window-manager';
// END-REMOVE-NODE-WINDOW-MANAGER
import { PROMPT, Channel, UI } from '@johnlindquist/kit/core/enum';
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
  shell,
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
import { debounce } from 'lodash-es';
import {
  getMainScriptPath,
  kenvPath,
  kitPath,
} from '@johnlindquist/kit/core/utils';
import { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { Display } from 'electron/main';
import { differenceInHours } from 'date-fns';

import { ChildProcess } from 'child_process';
import { closedDiv, noScript } from '../shared/defaults';
import { getAssetPath } from '../shared/assets';
import {
  kitState,
  subs,
  promptState,
  getEmojiShortcut,
  preloadPromptDataMap,
  preloadChoicesMap,
  preloadPreviewMap,
  kitCache,
} from '../shared/state';
import { EMOJI_HEIGHT, EMOJI_WIDTH, ZOOM_LEVEL } from '../shared/defaults';
import { ResizeData, ScoredChoice } from '../shared/types';
import { getVersion } from './version';
import { AppChannel, HideReason } from '../shared/enums';
import { emitter, KitEvent } from '../shared/events';
import { TrackEvent, trackEvent } from './track';
import {
  getCurrentScreen,
  getCurrentScreenFromBounds,
  isBoundsWithinDisplayById,
  isBoundsWithinDisplays,
} from './screen';
import { sendToAllPrompts } from './channel';
import { setFlags, setChoices, invokeSearch, scorer } from './search';
import { fileURLToPath } from 'url';
import { prompts } from './prompts';
import { ensureIdleProcess, processes, updateTheme } from './process';
import { QuickScore } from 'quick-score';
import { createPty } from './pty';
import { cliFromParams, runPromptProcess } from './kit';
import EventEmitter from 'events';
import { OFFSCREEN_X, OFFSCREEN_Y, getPromptOptions } from './prompt.options';

contextMenu({
  showInspectElement: process.env.NODE_ENV === 'development',
  showSearchWithGoogle: false,
  showLookUpSelection: false,
});

const getDefaultWidth = () => {
  return PROMPT.WIDTH.BASE;
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
        JSON.stringify(diff, null, 2),
      );
      prevPromptState = promptState;
    }
  }
};

// TODO: Move this into a screen utils
export const getCurrentScreenFromMouse = (): Display => {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
};

export const getAllScreens = (): Display[] => {
  return screen.getAllDisplays();
};

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
  },
): Partial<Rectangle> & { screenId: string } => {
  const currentScreen = getCurrentScreen();
  const screenId = String(currentScreen.id);
  // log.info(`screens:`, promptState.screens);

  const savedPromptBounds = promptState?.screens?.[screenId]?.[scriptPath];

  if (savedPromptBounds) {
    log.info(`📱 Screen: ${screenId}: `, savedPromptBounds);
    log.info(`Bounds: found saved bounds for ${scriptPath}`);
    // TODO: Reimplement div UI based on promptWindow?
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

    // TODO: Reimplement div UI based on promptWindow?
    // if (ui === UI.div) {
    //   // width /= 2;
    //   height = promptWindow?.getBounds()?.height;
    // }

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

  if (typeof bounds?.x === 'number' && bounds.x !== OFFSCREEN_X) x = bounds.x;
  if (typeof bounds?.y === 'number' && bounds.y !== OFFSCREEN_Y) y = bounds.y;

  const promptBounds = { x, y, width, height, screenId };

  if (ui === UI.arg) {
    const bounds = {
      ...promptBounds,
      width: getDefaultWidth(),
      height: PROMPT.HEIGHT.BASE,
      screenId,
    };

    log.verbose(`Bounds: No UI`, bounds);
    return bounds;
  }

  log.info(
    `Bounds: No saved bounds for ${scriptPath}, returning default bounds`,
    promptBounds,
  );
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
    screen.getCursorScreenPoint(),
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
  prompt: KitPrompt,
  screenId: string,
  scriptPath: string,
  bounds: PromptBounds,
) => {
  if (!prompt.window || !prompt?.isDestroyed()) return;
  if (prompt.kitSearch.input !== '' || prompt.kitSearch.inputRegex) return;
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

let prevEmoji = false;
const subEmoji = subscribeKey(kitState, 'emojiActive', (emoji) => {
  if (prevEmoji === emoji) return;
  prevEmoji = emoji;
  log.info(`👆 Emoji changed: ${emoji ? 'on' : 'off'}`);
  const emojiShortcut = getEmojiShortcut();
  if (emoji) {
    globalShortcut.register(emojiShortcut, () => {
      prompts?.focused?.setPromptAlwaysOnTop(false);
      app.showEmojiPanel();
    });
  } else {
    globalShortcut.unregister(emojiShortcut);
  }
});

const subIsSponsor = subscribeKey(kitState, 'isSponsor', (isSponsor) => {
  log.info(`🎨 Sponsor changed:`, isSponsor);
  setKitStateAtom({ isSponsor });
});

export const setKitStateAtom = (partialState: Partial<typeof kitState>) => {
  sendToAllPrompts(AppChannel.KIT_STATE, partialState);
};

export const setFocusedKitStateAtom = (
  partialState: Partial<typeof kitState>,
) => {
  prompts?.focused?.sendToPrompt(AppChannel.KIT_STATE, partialState);
};

const subUpdateDownloaded = subscribeKey(
  kitState,
  'updateDownloaded',
  (updateDownloaded) => {
    setKitStateAtom({ updateDownloaded });
  },
);

const subEscapePressed = subscribeKey(
  kitState,
  'escapePressed',
  (escapePressed) => {
    setFocusedKitStateAtom({ escapePressed });
  },
);

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
  subEmoji,
);

export class KitPrompt {
  ui = UI.arg;
  count = 0;
  id = ``;
  pid = 0;
  initMain = true;
  script = noScript;
  scriptPath = ``;
  allowResize = true;
  resizing = false;
  isScripts = true;
  promptData = null as null | PromptData;
  firstPrompt = true;
  justFocused = true;
  ready = false;
  shown = false;
  alwaysOnTop = true;
  hideOnEscape = false;
  cacheScriptChoices = false;
  cacheScriptPromptData = false;
  cacheScriptPreview = false;
  actionsOpen = false;
  wasActionsJustOpen = false;

  birthTime = performance.now();

  lifeTime = () => {
    return (performance.now() - this.birthTime) / 1000 + 's';
  };
  preloaded: string = '';

  get scriptName() {
    return this?.scriptPath?.split('/')?.pop() || '';
  }

  public window: BrowserWindow;
  public sendToPrompt: (channel: Channel | AppChannel, data?: any) => void = (
    channel,
    data,
  ) => {
    log.warn(`sendToPrompt not set`, { channel, data });
  };

  modifiedByUser = false;

  kitSearch = {
    input: '',
    inputRegex: undefined as undefined | RegExp,
    keyword: '',
    keywordCleared: false,
    generated: false,
    flaggedValue: '',
    choices: kitCache.scripts as Choice[],
    scripts: kitCache.scripts as Script[],
    triggers: kitCache.triggers,
    postfixes: kitCache.postfixes,
    keywords: kitCache.keywords,
    shortcodes: kitCache.shortcodes,
    hasGroup: false,
    qs: new QuickScore(kitCache.choices, {
      keys: kitCache.keys.map((name) => ({
        name,
        scorer,
      })),
      minimumScore: kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE
        ? parseInt(kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE, 10)
        : 0.6,
    }) as QuickScore<ScoredChoice> | null,
    commandChars: [] as string[],
    keys: kitCache.keys,
  };

  clearSearch = () => {
    if (kitState.kenvEnv?.KIT_NO_CLEAR_SEARCH) return;

    log.info(`🧹 Clearing search...`);
    this.kitSearch.keyword = '';
    this.kitSearch.choices = [];
    this.kitSearch.input = '';
    this.kitSearch.qs = new QuickScore([], { keys: ['name'] }); // Adjust according to your actual keys
    this.kitSearch.keywords.clear();
    this.kitSearch.triggers.clear();
    this.kitSearch.postfixes.clear();
    this.kitSearch.shortcodes.clear();
    this.updateShortcodes();
    this.kitSearch.hasGroup = false;
    this.kitSearch.commandChars = [];
    this.kitSearch.keys = ['slicedName', 'tag', 'group', 'command'];
  };

  flagSearch = {
    input: '',
    choices: [] as Choice[],
    hasGroup: false,
    qs: null as null | QuickScore<Choice>,
  };

  clearFlagSearch = () => {
    this.flagSearch.input = '';
    this.flagSearch.choices = [];
    this.flagSearch.hasGroup = false;
    this.flagSearch.qs = null;
  };

  boundToProcess = false;
  bindToProcess = async (pid: number) => {
    if (this.boundToProcess) return;
    this.pid = pid;
    this.boundToProcess = true;
    log.info(`${pid} -> ${this?.window?.id}: 🔗 Binding prompt to process`);
  };

  promptBounds = {
    id: ``,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };

  readyEmitter = new EventEmitter();

  waitForReady = async () => {
    return new Promise<void>((resolve) => {
      this.readyEmitter.once('ready', () => {
        log.info(`${this?.window?.id} 🎉 Ready because ready emit`);
        resolve();
      });
    });
  };
  constructor() {
    ipcMain.on(AppChannel.GET_KIT_CONFIG, (event) => {
      event.returnValue = {
        kitPath: kitPath(),
        mainScriptPath: getMainScriptPath(),
        pid: this.pid,
      };
    });

    const options = getPromptOptions();
    this.window = new BrowserWindow(options);

    let timeout = 2000;
    if (kitState?.kenvEnv?.KIT_PROMPT_INITIAL_HIDE_TIMEOUT) {
      timeout = parseInt(kitState?.kenvEnv?.KIT_PROMPT_INITIAL_HIDE_TIMEOUT);
    }
    if (kitState.isWindows) {
      setTimeout(() => {
        if (this?.window && !this.window.isDestroyed()) {
          if (!this.window.isFocusable()) {
            this.window.hide();
          }
          log.info(
            'Hiding prompt window. Current position',
            this.window.getPosition(),
          );
        }
      }, timeout);
    }

    this.sendToPrompt = (channel: Channel | AppChannel, data) => {
      log.silly(`sendToPrompt: ${String(channel)}`, data);

      if (this?.window?.webContents?.send) {
        if (channel) {
          this.window?.webContents.send(String(channel), data);
        } else {
          log.error(`channel is undefined`, { data });
        }
      }
    };

    // REMOVE-MAC
    if (kitState.isMac) {
      makePanel(this.window);
      // log.info({
      //   systemBackgroundColor: getWindowBackgroundColor(),
      //   systemTextColor: getTextColor(),
      // });
    }
    // END-REMOVE-MAC

    // REMOVE-NODE-WINDOW-MANAGER
    if (kitState.isWindows) {
      if (kitState?.kenvEnv?.KIT_DISABLE_ROUNDED_CORNERS !== 'true') {
        windowManager.setWindowAsPopupWithRoundedCorners(
          this.window?.getNativeWindowHandle(),
        );
      }
    }
    // END-REMOVE-NODE-WINDOW-MANAGER

    // prompt.setVisibleOnAllWorkspaces(true, {
    //   visibleOnFullScreen: true,
    //   skipTransformProcessType: true,
    // });

    this.window?.webContents?.setZoomLevel(ZOOM_LEVEL);

    setTimeout(() => {
      if (!this.window || this.window?.isDestroyed()) return;

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

    this.window.webContents?.on(
      'will-navigate',
      async (event, navigationUrl) => {
        try {
          const url = new URL(navigationUrl);
          log.info(`👉 Prevent navigating to ${navigationUrl}`);
          event.preventDefault();

          const pathname = url.pathname.replace('//', '');

          if (url.host === 'scriptkit.com' && url.pathname === '/api/new') {
            await cliFromParams('new-from-protocol', url.searchParams);
          } else if (url.host === 'scriptkit.com' && pathname === 'kenv') {
            const repo = url.searchParams.get('repo');
            await runPromptProcess(kitPath('cli', 'kenv-clone.js'), [
              repo || '',
            ]);
          } else if (url.protocol === 'kit:') {
            log.info(`Attempting to run kit protocol:`, JSON.stringify(url));
            await cliFromParams(url.pathname, url.searchParams);
          } else if (url.protocol === 'submit:') {
            // TODO: Handle submit protocol
            log.info(`Attempting to run submit protocol:`, JSON.stringify(url));
            this.sendToPrompt(Channel.SET_SUBMIT_VALUE, url.pathname);
          } else if (url.protocol.startsWith('http')) {
            shell.openExternal(url.href);
          }
        } catch (e) {
          log.warn(e);
        }
      },
    );

    this.window.once('ready-to-show', async () => {
      log.info(`${this.pid}: 👍 Ready to show`);
      updateTheme();
    });

    this.window.webContents?.on('dom-ready', () => {
      log.info(`${this.pid}: 📦 dom-ready`);
      this.window?.webContents?.setZoomLevel(ZOOM_LEVEL);
    });

    this.window.webContents?.once('did-finish-load', () => {
      kitState.hiddenByUser = false;
      kitState.promptHidden = true;

      log.silly(`event: did-finish-load`);
      this.sendToPrompt(Channel.APP_CONFIG, {
        delimiter: path.delimiter,
        sep: path.sep,
        os: os.platform(),
        isMac: os.platform().startsWith('darwin'),
        isWin: os.platform().startsWith('win'),
        assetPath: getAssetPath(),
        version: getVersion(),
        isDark: kitState.isDark,
        searchDebounce: Boolean(
          kitState.kenvEnv?.KIT_SEARCH_DEBOUNCE === 'false',
        ),
        termFont: kitState.kenvEnv?.KIT_TERM_FONT || 'monospace',
        url: kitState.url,
      });

      const user = snapshot(kitState.user);
      log.info(
        `${this.pid}: did-finish-load, setting prompt user to: ${user?.login}`,
      );

      this.sendToPrompt(AppChannel.USER_CHANGED, user);
      setKitStateAtom({
        isSponsor: kitState.isSponsor,
      });
      emitter.emit(KitEvent.DID_FINISH_LOAD);

      const messagesReadyHandler = async (event, pid) => {
        // this.window.webContents.setBackgroundThrottling(false);

        log.info(`${this.pid}: 📬 Messages ready. `);
        if (this.initMain) {
          this.initPromptData();
          this.initMainChoices();
          this.initMainPreview();
          this.initMainShortcuts();
          this.initMainFlags();

          log.info(`${pid}: 🚀 Prompt init`);
          this.initPrompt();

          // this.window.webContents
          //   .executeJavaScript(`document.querySelector('#main').innerHTML`)
          //   .then((main) => {
          //     log.info({ pid: this.pid, main });
          //   })
          //   .catch((e) => {
          //     log.error({
          //       pid: this.pid,
          //       error: e,
          //     });
          //   })
          //   .finally(() => {
          //     log.info(`${this.pid}: 🚀 Prompt js ready`);
          //   });
        }

        this.readyEmitter.emit('ready');
        this.ready = true;

        // Force render
        // Trigger re-layout without visual change

        log.info(
          `${this.pid}:${this.window.id}: 🚀 Prompt ready. Forcing render. ${this.window?.isVisible() ? 'visible' : 'hidden'}`,
        );

        this.sendToPrompt(AppChannel.FORCE_RENDER);
        await this.window?.webContents?.executeJavaScript(
          `console.log(document.body.offsetHeight);`,
        );

        this.window.webContents.setBackgroundThrottling(true);
      };

      ipcMain.once(AppChannel.MESSAGES_READY, messagesReadyHandler);

      if (kitState.kenvEnv?.KIT_MIC) {
        this.sendToPrompt(AppChannel.SET_MIC_ID, kitState.kenvEnv.KIT_MIC);
      }
      if (kitState.kenvEnv?.KIT_WEBCAM) {
        this.sendToPrompt(
          AppChannel.SET_WEBCAM_ID,
          kitState.kenvEnv.KIT_WEBCAM,
        );
      }
    });

    // reload if unresponsive
    this.window.webContents?.on('unresponsive', () => {
      log.error(
        `${this.pid}: ${this.scriptName}: Prompt window unresponsive. Reloading`,
      );
      if (this.window.isDestroyed()) {
        log.error(
          `${this.pid}: ${this.scriptName}: Prompt window is destroyed. Not reloading`,
        );
        return;
      }

      this.window.webContents?.once('did-finish-load', () => {
        log.info(`${this.pid}: Prompt window reloaded`);
      });

      this.window.reload();
    });

    let escapePressCount = 0;
    let lastEscapePressTime = 0;

    this.window.webContents?.on('before-input-event', (event, input) => {
      const isW = input.key === 'w';
      const isEscape = input.key === 'Escape';
      if (
        (isW && (kitState.isMac ? input.meta : input.control)) ||
        (this.firstPrompt &&
          this.scriptPath === getMainScriptPath() &&
          isEscape &&
          !this.wasActionsJustOpen)
      ) {
        if (isW) {
          log.info(
            `Closing prompt window with ${kitState.isMac ? '⌘' : '⌃'}+w`,
          );
        } else if (isEscape) {
          log.info(`Closing prompt window with escape`);
          this.hideInstant();
        }

        processes.removeByPid(this.pid);
        emitter.emit(KitEvent.KillProcess, this.pid);
        event.preventDefault();
      }
      if (isEscape) {
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
      this.window.loadFile(
        fileURLToPath(new URL('../renderer/index.html', import.meta.url)),
      );
    }

    this.window.webContents?.on('devtools-opened', () => {
      // REMOVE-MAC
      if (kitState.isMac) {
        makeWindow(this.window);
      }
      // END-REMOVE-MAC
    });

    this.window.webContents.on('devtools-closed', () => {
      log.silly(`event: devtools-closed`);

      if (kitState.isMac) {
        // REMOVE-MAC
        log.info(`${this.pid}: 👋 setPromptAlwaysOnTop: false, so makeWindow`);
        makeWindow(this.window);
        // END-REMOVE-MAC
      } else {
        this.setPromptAlwaysOnTop(false);
      }
      this.maybeHide(HideReason.DevToolsClosed);
    });

    emitter.on(KitEvent.OpenDevTools, () => {
      log.silly(`event: OpenDevTools`);
      if (prompts.focused?.pid === this?.pid) {
        this.window.webContents?.openDevTools({
          activate: true,
          mode: 'detach',
        });
      }
    });

    const onBlur = async () => {
      // log.info(`🙈 Prompt window blurred`, {
      //   isPromptReady: this.ready,
      //   isActivated: kitState.isActivated,
      // });

      // REMOVE-MAC
      if (kitState.isMac) {
        makeWindow(this.window);
      }
      // END-REMOVE-MAC

      if (this.justFocused && this.isVisible()) {
        log.info(`🙈 Prompt window was just focused. Ignore blur`);

        // this.focusPrompt();
        return;
      }

      if (!kitState.isLinux) {
        // globalShortcut.unregister(getEmojiShortcut());
        kitState.emojiActive = false;
      }

      if (!this.shown) return;

      if (this.window.isDestroyed()) return;
      if (kitState.isActivated) {
        kitState.isActivated = false;
        return;
      }
      if (this.window.webContents?.isDevToolsOpened()) return;

      // if (!this.prompt.isFocused()) return;

      if (this.window.isVisible()) {
        this.sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
      }

      // this.maybeHide(HideReason.Blur);

      if (os.platform().startsWith('win')) {
        return;
      }

      kitState.blurredByKit = false;
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
      kitState.emojiActive = false;
      // if (!this.window.isDestroyed()) {
      //   this?.window?.destroy();
      // }

      // this.window.removeAllListeners();
    });

    this.window.webContents?.on('focus', () => {
      log.info(`WebContents Focus`);
    });

    this.window.on('focus', () => {
      log.info(`👓 Focus bounds:`, this.window.getBounds());

      if (!kitState.isLinux) {
        log.verbose(`Registering emoji shortcut`);
        // Grab cmd+ctrl+space shortcut to use electron's emoji picker
        kitState.emojiActive = true;
        // globalShortcut.register(getEmojiShortcut(), showEmoji);
      }

      this.justFocused = true;
      setTimeout(() => {
        if (!this?.window || !this.window?.isDestroyed()) {
          this.justFocused = false;
        }
      }, 100);
    });
    this.window.on('blur', onBlur);

    this.window.on('hide', () => {
      log.info(`🫣 Prompt window hidden`);
      kitState.promptHidden = true;

      if (!kitState.isLinux) {
        // globalShortcut.unregister(getEmojiShortcut());
        kitState.emojiActive = false;
      }
    });

    this.window.on('show', async () => {
      log.info(`${this.pid} 😳 Prompt window shown`);
      kitState.promptHidden = false;
    });

    this.window.webContents?.on(
      'did-fail-load',
      (errorCode, errorDescription, validatedURL, isMainFrame) => {
        log.error(`${this.pid} did-fail-load:`, {
          errorCode,
          errorDescription,
          isMainFrame,
        });
      },
    );

    this.window.webContents?.on('did-stop-loading', () => {
      log.info(
        `${this.pid}:${this?.window?.id}: ${this.scriptName}: did-stop-loading`,
      );
    });

    this.window.webContents?.on('dom-ready', () => {
      log.info(
        `${this.pid}:${this?.window?.id} 🍀 dom-ready on ${this?.scriptPath}`,
      );

      // hideAppIfNoWindows(HideReason.DomReady);
      this.sendToPrompt(Channel.SET_READY, true);
    });

    this.window.webContents?.on('render-process-gone', (event, details) => {
      processes.removeByPid(this.pid);
      this.sendToPrompt = () => {};
      this.window.webContents.send = () => {};
      // processes.removeByPid(this.pid);
      log.error(`${this.pid}: ${this.scriptName}: 🫣 Render process gone...`);
      log.error({ event, details });
    });

    const onResized = async () => {
      log.silly(`event: onResized`);
      this.modifiedByUser = false;
      log.info(`Resized: ${this.window.getSize()}`);

      if (this.resizing) {
        this.resizing = false;
      }

      this.saveCurrentPromptBounds();
    };

    if (kitState.isLinux) {
      this.window.on('resize', (event) => {
        this.modifiedByUser = true;
      });
    } else {
      this.window.on('will-resize', (event, rect) => {
        log.silly(`Will Resize ${rect.width} ${rect.height}`);
        this.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
          id: this.id,
          ...rect,
          human: true,
        });
        this.modifiedByUser = true;
      });
    }

    const willMoveHandler = debounce(
      () => {
        log.silly(`event: will-move`);
        kitState.modifiedByUser = true;
      },
      250,
      { leading: true },
    );

    const onMoved = debounce(async () => {
      log.silly(`event: onMove`);
      this.modifiedByUser = false;
      this.saveCurrentPromptBounds();
    }, 250);

    this.window.on('will-move', willMoveHandler);
    this.window.on('resized', onResized);
    this.window.on('moved', onMoved);
  }
  forcePromptToCenter = async () => {
    this.window?.show();
    this.window?.setPosition(0, 0);
    this.window?.center();
    this.window?.focus();
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

  clearCache = () => {
    log.info(`--> 📦 CLEARING CACHE, Not main!`);
    this.sendToPrompt(AppChannel.CLEAR_CACHE, {});
  };

  initShowPrompt = () => {
    if (!kitState.isMac) {
      if (kitState?.kenvEnv?.KIT_PROMPT_RESTORE === 'true') {
        this.window?.restore();
      }
    }

    this.setPromptAlwaysOnTop(true);
    this.focusPrompt();
    this.sendToPrompt(Channel.SET_OPEN, true);

    if (topTimeout) clearTimeout(topTimeout);

    setTimeout(() => {
      ensureIdleProcess();
    }, 10);
  };

  hide = () => {
    log.info(`Hiding prompt window...`);
    if (this.window.isDestroyed()) {
      log.warn(`Prompt window is destroyed. Not hiding.`);
      return;
    }
    this.actualHide();
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
        if (!this?.window || this.window?.isDestroyed()) return;
        this.window?.removeListener('hide', handler);
      }, 1000);

      this.window?.once('hide', handler);
    }
  };

  showAfterNextResize = false;

  showPrompt = () => {
    if (this.window.isDestroyed()) return;
    this.initShowPrompt();
    this.sendToPrompt(Channel.SET_OPEN, true);

    setTimeout(() => {
      if (!this?.window || this.window?.isDestroyed()) return;
      this.shown = true;
    }, 100);
  };

  initBounds = async (forceScriptPath?: string, show = false) => {
    if (this?.window?.isDestroyed()) return;

    // if (this.window?.isVisible()) {
    //   log.info(`↖ Ignore init bounds, already visible`);
    //   return;
    // }

    const bounds = getCurrentScreenPromptCache(
      forceScriptPath || this.scriptPath,
      {
        ui: this.ui,
        resize: this.allowResize,
        bounds: this.window.getBounds(),
      },
    );
    log.info(
      `${this.pid}:${path.basename(this?.scriptPath || '')}: ↖ Init bounds: ${this.ui} ui`,
      bounds,
    );

    // If widths or height don't match, send SET_RESIZING to prompt

    const { width, height } = this.window?.getBounds();
    if (bounds.width !== width || bounds.height !== height) {
      log.verbose(
        `Started resizing: ${this.window?.getSize()}. First prompt?: ${
          this.firstPrompt ? 'true' : 'false'
        }`,
      );

      this.resizing = true;
    }

    // if (isKitScript(kitState.scriptPath)) return;

    this.setBounds(
      bounds,
      'initBounds',
      // this.prompt?.isVisible() &&
      //   kitState.promptCount > 1 &&
      //   !kitState.promptBounds.height
    );

    if (!show) {
      return;
    }

    log.info(`👋 Show Prompt from preloaded ${this.scriptPath}`);
    // this.showPrompt();
  };

  blurPrompt = () => {
    log.info(`blurPrompt`);
    if (this.window.isDestroyed()) return;
    if (this.window) {
      this.window.blur();
    }
  };

  initMainBounds = async () => {
    if (kitState.isWindows) {
      this.window?.setFocusable(true);
    }
    const bounds = getCurrentScreenPromptCache(getMainScriptPath());
    if (!bounds.height || bounds.height < PROMPT.HEIGHT.BASE) {
      bounds.height = PROMPT.HEIGHT.BASE;
    }
    this.setBounds(
      bounds,
      'initMainBounds',
      // promptWindow?.isVisible() &&
      //   kitState.promptCount > 1 &&
      //   !kitState.promptBounds.height
    );
  };

  setBounds = async (bounds: Partial<Rectangle>, reason = '') => {
    if (!this.window || this.window.isDestroyed()) return;
    log.info(
      `${this.pid}: Attempt ${this.scriptName}: setBounds reason: ${reason}`,
      bounds,
    );
    if (!kitState.ready) return;
    const currentBounds = this.window.getBounds();
    const widthNotChanged =
      bounds?.width && Math.abs(bounds.width - currentBounds.width) < 4;
    const heightNotChanged =
      bounds?.height && Math.abs(bounds.height - currentBounds.height) < 4;
    const xNotChanged = bounds?.x && Math.abs(bounds.x - currentBounds.x) < 4;
    const yNotChanged = bounds?.y && Math.abs(bounds.y - currentBounds.y) < 4;

    // log.info({
    //   widthNotChanged,
    //   heightNotChanged,
    //   xNotChanged,
    //   yNotChanged,
    // });

    const noChange =
      heightNotChanged && widthNotChanged && xNotChanged && yNotChanged;

    if (noChange) {
      log.info(`📐 No change in bounds, ignoring`);
      return;
    }

    this.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
      id: this.id,
      ...bounds,
    });

    // if (noChange) {
    //   return;
    // }

    // TODO: Maybe use in the future with setting the html body bounds for faster resizing?
    // this.prompt?.setContentSize(bounds.width, bounds.height);

    // Keep in bounds on the current screen
    // TODO: Reimplement keep in bounds?
    const boundsScreen = getCurrentScreenFromBounds(this.window?.getBounds());
    const mouseScreen = getCurrentScreen();
    const boundsOnMouseScreen = isBoundsWithinDisplayById(
      bounds as Rectangle,
      mouseScreen.id,
    );

    log.info(
      `${this.pid}: boundsScreen.id ${boundsScreen.id} mouseScreen.id ${mouseScreen.id} boundsOnMouseScreen ${boundsOnMouseScreen ? 'true' : 'false'}`,
    );

    if (boundsScreen.id !== mouseScreen.id && boundsOnMouseScreen) {
      log.info(
        `🔀 Mouse screen is different, but bounds are within display. Using mouse screen.`,
      );
      // return
    }

    const currentScreen = mouseScreen;
    // const currentScreen = this.getCurrentScreenFromMouse();
    let { x, y, width, height } = { ...currentBounds, ...bounds };
    let { x: workX, y: workY } = currentScreen.workArea;
    const { width: screenWidth, height: screenHeight } =
      currentScreen.workAreaSize;

    if (typeof bounds?.height !== 'number')
      bounds.height = currentBounds.height;
    if (typeof bounds?.width !== 'number') bounds.width = currentBounds.width;
    if (typeof bounds?.x !== 'number') bounds.x = currentBounds.x;
    if (typeof bounds?.y !== 'number') bounds.y = currentBounds.y;

    const xIsNumber = typeof x === 'number';

    if (!boundsOnMouseScreen) {
      // x = bounds.x =
      //   screenWidth / 2 - (bounds?.width ?? currentBounds.width) / 2 + workX;
      // y = bounds.y =
      //   screenHeight / 2.75 -
      //   (bounds?.height ?? currentBounds.height) / 2 +
      //   workY;

      this.window.center();
    }

    if (xIsNumber && x < workX) {
      bounds.x = workX;
    } else if (
      width &&
      (xIsNumber ? x : currentBounds.x) + width > workX + screenWidth
    ) {
      bounds.x = workX + screenWidth - width;
    } else if (xIsNumber) {
      bounds.x = x;
      // } else if (!kitState.tabChanged && kitState.promptCount !== 1) {
    } else {
    }

    if (typeof y === 'number' && y < workY) {
      bounds.y = workY;
    } else if (
      height &&
      (y || currentBounds.y) + height > workY + screenHeight
    ) {
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

    // log.info(`📐 setBounds: ${reason}`, {
    //   ...bounds,
    // });

    if (kitState?.kenvEnv?.KIT_WIDTH) {
      bounds.width = parseInt(kitState?.kenvEnv?.KIT_WIDTH, 10);
    }

    try {
      // if (this.pid) {
      //   debugLog.info(
      //     `Count: ${this.count} -> 📐 setBounds: ${this.scriptPath} reason ${reason}`,
      //     bounds
      //     // {
      //     //   screen: currentScreen,
      //     //   isVisible: this.isVisible() ? 'true' : 'false',
      //     //   noChange: noChange ? 'true' : 'false',
      //     //   pid: this.pid,
      //     // }
      //   );
      // }

      log.info(
        `${this.pid}: Apply ${this.scriptName}: setBounds reason: ${reason}`,
        bounds,
      );
      const finalBounds = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };

      // log.info(`Final bounds:`, finalBounds);

      if (kitState.isWindows) {
        if (!this.window?.isFocusable()) {
          finalBounds.x = OFFSCREEN_X;
          finalBounds.y = OFFSCREEN_Y;
        }
      }

      this.window.setBounds(finalBounds, false);
      this.promptBounds = {
        id: this.id,
        ...this.window?.getBounds(),
      };

      this.sendToPrompt(Channel.SET_PROMPT_BOUNDS, this.promptBounds);
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
      // REMOVE-NODE-WINDOW-MANAGER
      const activeWindow = windowManager.getActiveWindow();
      if (activeWindow) {
        const bounds = activeWindow.getBounds();
        activeAppBounds.x = bounds.x;
        activeAppBounds.y = bounds.y;
        activeAppBounds.width = bounds.width;
        activeAppBounds.height = bounds.height;
        activeAppBounds.title = activeWindow.getTitle();
      }
      // END-REMOVE-NODE-WINDOW-MANAGER

      const promptBounds = this.window?.getBounds();
      const screenBounds = getCurrentScreen().bounds;
      const mouse = screen.getCursorScreenPoint();

      promptLog.info({
        scriptPath: this.scriptPath,
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
    log.silly(`sendToPrompt: ${String(channel)} ${data?.kitScript}`);
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
        this.sendToPrompt(channel, data);
      }
    });
  };

  savePromptBounds = async (
    scriptPath: string,
    bounds: Rectangle,
    b: number = Bounds.Position | Bounds.Size,
  ) => {
    if (!this.window || this.window.isDestroyed()) return;
    if (kitState.kenvEnv?.KIT_CACHE_PROMPT === 'false') {
      log.info(`Cache prompt disabled. Ignore saving bounds`);
      return;
    }
    log.info(`${this.pid}: 💾 Save Initial Bounds: ${scriptPath}`, bounds);
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

      writePromptState(
        this,
        String(currentScreen.id),
        scriptPath,
        promptBounds,
      );
    } catch (error) {
      log.error(error);
    }
  };

  isDestroyed = () => this.window?.isDestroyed();

  getFromPrompt = <K extends keyof ChannelMap>(
    child: ChildProcess,
    channel: K,
    data?: ChannelMap[K],
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

  resize = async (resizeData: ResizeData) => {
    // log.info({ resizeData });
    // debugLog.info(`Testing...`, resizeData);
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

    if (this.showAfterNextResize) {
      this.showAfterNextResize = false;
      this.showPrompt();
    }

    log.info(`📐 Resize main height: ${mainHeight}`);
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

    // if (kitState.resizePaused) return;

    if (reason === 'SETTLE') {
      setTimeout(() => {
        if (!this?.window || this.window?.isDestroyed()) return;
        log.info(`📬 ${this.pid} 📐 Resize settled. Saving bounds`);
        this.saveCurrentPromptBounds();
      }, 50);
    }
    if (!forceHeight && !this.allowResize && !forceResize) return;
    // if (kitState.promptId !== id || kitState.modifiedByUser) return;
    if (this.modifiedByUser) return;
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
      log.info(`isSplash: ${isSplash ? 'true' : 'false'}`);
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
      log.info(
        `hasPreview: ${hasPreview} && !isMainScript: ${
          isMainScript ? 'true' : 'false'
        }`,
      );
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

    // log.info({ topHeight, mainHeight, footerHeight });
    // log.info(
    //   `Resize Details for PID: ${this.pid} - ${this.scriptPath}\n` +
    //     `+----------------+----------------+----------------+----------------+----------------+\n` +
    //     `|                | Current        | Cached         | Forced         | Actual          |\n` +
    //     `+----------------+----------------+----------------+----------------+----------------+\n` +
    //     `| Width          | ${currentWidth.toString().padEnd(14)} | ${cachedWidth?.toString().padEnd(14) || ''.padEnd(14)} | ${forceWidth?.toString().padEnd(14) || ''.padEnd(14)} | ${bounds.width.toString().padEnd(14)} |\n` +
    //     `| Height         | ${currentHeight.toString().padEnd(14)} | ${cachedHeight?.toString().padEnd(14) || ''.padEnd(14)} | ${forceHeight?.toString().padEnd(14) || ''.padEnd(14)} | ${bounds.height.toString().padEnd(14)} |\n` +
    //     `| Target Height  | ${targetHeight.toString().padEnd(14)} | ----------    | ${maxHeight.toString().padEnd(14)} |                |\n` +
    //     `+----------------+----------------+----------------+----------------+----------------+\n` +
    //     `| Force Resize   | ${forceResize ? 'Yes'.padEnd(14) : 'No'.padEnd(14)} |                |                |                |\n` +
    //     `+----------------+----------------+----------------+----------------+----------------+\n` +
    //     `| Reason         | ${reason.padEnd(14)} |                |                |                |\n` +
    //     `+----------------+----------------+----------------+----------------+----------------+`
    // );

    this.setBounds(bounds, reason);

    if (this.firstPrompt && !inputChanged && justOpened) {
      this.savePromptBounds(this.scriptPath, bounds);
    }
  };

  updateShortcodes = () => {
    const shortcodes = [
      ...Array.from(this.kitSearch.shortcodes.keys(), (k) => `${k} `),
      ...this.kitSearch.triggers.keys(),
    ];

    log.info(`${this.pid}: Shortcodes:`, shortcodes.join(', '));

    this.sendToPrompt(Channel.SET_SHORTCODES, shortcodes);
  };

  setPromptData = async (promptData: PromptData) => {
    this.promptData = promptData;

    if (promptData.ui === UI.term) {
      log.info({ termPromptData: promptData });
      this.sendToPrompt(AppChannel.SET_TERM_CONFIG, {
        command: promptData.command || '',
        cwd: promptData.cwd || '',
        env: promptData.env || {},
        shell: promptData.shell || '',
        promptId: this.id || '',
      });
      createPty(this);
    }

    // if (promptData.ui !== UI.arg) {
    //   // REMOVE-MAC
    //   if (kitState.isMac) {
    //     makeWindow(this.window);
    //   }
    //   // END-REMOVE-MAC
    // }

    this.scriptPath = promptData?.scriptPath;
    this.clearFlagSearch();
    this.kitSearch.shortcodes.clear();
    this.kitSearch.triggers.clear();
    if (promptData?.hint) {
      for (const trigger of promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi) ||
        []) {
        this.kitSearch.triggers.set(trigger, { name: trigger, value: trigger });
      }
    }

    this.kitSearch.commandChars = promptData.inputCommandChars || [];
    this.updateShortcodes();

    if (this.cacheScriptPromptData && !promptData.preload) {
      this.cacheScriptPromptData = false;
      promptData.name ||= this.script.name || '';
      promptData.description ||= this.script.description || '';
      log.info(`💝 Caching prompt data: ${this?.scriptPath}`);
      preloadPromptDataMap.set(this.scriptPath, {
        ...promptData,
        input: promptData?.keyword ? '' : promptData?.input || '',
        keyword: '',
      });
    }

    if (promptData.flags) {
      setFlags(this, promptData.flags);
    }

    // TODO: When to handled preloaded?
    // if (this.preloaded) {
    //   this.preloaded = '';
    //   return;
    // }

    kitState.hiddenByUser = false;
    // if (!pidMatch(pid, `setPromptData`)) return;

    if (typeof promptData?.alwaysOnTop === 'boolean') {
      log.info(
        `📌 setPromptAlwaysOnTop from promptData: ${promptData.alwaysOnTop ? 'true' : 'false'}`,
      );

      this.setPromptAlwaysOnTop(promptData.alwaysOnTop, true);
    }

    this.allowResize = promptData?.resize || false;
    kitState.shortcutsPaused = promptData.ui === UI.hotkey;

    log.verbose(`setPromptData ${promptData.scriptPath}`);

    this.id = promptData.id;
    if (kitState.suspended || kitState.screenLocked) return;
    this.ui = promptData.ui;

    if (this.kitSearch.keyword) {
      promptData.keyword = this.kitSearch.keyword || this.kitSearch.keyword;
    }

    this.sendToPrompt(Channel.SET_PROMPT_DATA, promptData);

    const isMainScript = getMainScriptPath() === promptData.scriptPath;

    // browse.js passes a height of 46px which causes a "shrink flash" here. I'm not sure if this setBounds call is necessary
    // There's still an issue with setBounds when using a shortcut where the prompt needs to resize before its shown
    // if (
    //   !isMainScript &&
    //   (typeof promptData?.x === 'number' ||
    //     typeof promptData?.y === 'number' ||
    //     typeof promptData?.width === 'number' ||
    //     typeof promptData?.height === 'number')
    // ) {
    //   log.info(`Found bounds`, {
    //     x: promptData.x,
    //     y: promptData.y,
    //     width: promptData.width,
    //     height: promptData.height,
    //   });

    //   this.setBounds(
    //     {
    //       x: promptData.x,
    //       y: promptData.y,
    //       width: promptData.width,
    //       height: promptData.height,
    //     },
    //     'setPromptData has bounds',
    //   );
    // }

    if (this.firstPrompt && !isMainScript) {
      log.info(`${this.pid} Before initBounds`);
      if (kitState.isWindows) {
        this.window?.setFocusable(true);
      }
      this.initBounds();
      log.info(`${this.pid} After initBounds`);
      this.focusPrompt();
      this.firstPrompt = false;
    }
    // TODO: Combine types for sendToPrompt and appToPrompt?
    this.sendToPrompt(AppChannel.USER_CHANGED, snapshot(kitState.user));

    // positionPrompt({
    //   ui: promptData.ui,
    //   scriptPath: promptData.scriptPath,
    //   tabIndex: promptData.tabIndex,
    // });

    if (kitState.hasSnippet) {
      const timeout = this.script?.snippetdelay || 120;
      // eslint-disable-next-line promise/param-names
      await new Promise((r) => setTimeout(r, timeout));
      kitState.hasSnippet = false;
    }

    if (kitState.promptHidden) {
      kitState.tabChanged = false;
    }

    if (!this.isVisible() && promptData?.show) {
      this.showAfterNextResize = true;
      // log.info(`👋 Show Prompt from setPromptData for ${this.scriptPath}`);
      // this.showPrompt();
    } else if (this.isVisible() && !promptData?.show) {
      this.actualHide();
    }

    if (boundsCheck) clearTimeout(boundsCheck);
    boundsCheck = setTimeout(async () => {
      if (!this.window) return;
      if (this.window?.isDestroyed()) return;
      const currentBounds = this.window?.getBounds();
      const validBounds = isBoundsWithinDisplays(currentBounds);

      if (!validBounds) {
        log.info(`Prompt window out of bounds. Clearing cache and resetting.`);
        await clearPromptCacheFor(this.scriptPath);
        this.initBounds();
      } else {
        log.info(`Prompt window in bounds.`);
      }
    }, 1000);

    trackEvent(TrackEvent.SetPrompt, {
      ui: promptData.ui,
      script: path.basename(promptData.scriptPath),
      name: promptData?.name || this?.script?.name || '',
      description: promptData?.description || this?.script?.description || '',
    });
  };

  actualHide = () => {
    if (!this?.window) return;
    if (this.window.isDestroyed()) return;
    if (kitState.emojiActive) {
      // globalShortcut.unregister(getEmojiShortcut());
      kitState.emojiActive = false;
    }
    // if (kitState.isMac) {
    //   // REMOVE-MAC
    //   log.info(`🙈 Hiding prompt window`);
    //   makeWindow(this.window);
    //   // END-REMOVE-MAC
    // }
    this.setPromptAlwaysOnTop(false);
    if (!this.isVisible()) return;

    log.info(`🙈 Hiding prompt window`);

    this.hideInstant();
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
    if (!this.isVisible() || !this.boundToProcess) return;
    log.info(`Attempt Hide: ${reason}`);

    if (
      reason === HideReason.NoScript ||
      reason === HideReason.Escape ||
      reason === HideReason.BeforeExit
    ) {
      this.actualHide();

      this.clearSearch();
      invokeSearch(this, '', 'maybeHide, so clear');
      return;
    }

    if (reason === HideReason.PingTimeout) {
      log.info(`⛑ Attempting recover...`);

      emitter.emit(KitEvent.KillProcess, this.pid);
      this.actualHide();
      this.reload();

      return;
    }

    if (reason === HideReason.DebuggerClosed) {
      this.actualHide();
      return;
    }

    if (this.window?.isVisible()) {
      log.info(`Hiding because ${reason}`);
      if (!kitState.preventClose) {
        this.actualHide();
      }
    }
  };

  saveCurrentPromptBounds = async () => {
    if (!this?.window || this.window?.isDestroyed()) {
      log.info(
        `${this.pid} Prompt window is destroyed. Not saving bounds for ${this.scriptPath}`,
      );
      return;
    }
    // if (kitState.promptCount === 1) {
    const currentBounds = this.window?.getBounds();
    log.info(
      `${this.pid}: 💾 Save Current Bounds: ${this.scriptPath}`,
      currentBounds,
    );
    this.savePromptBounds(this.scriptPath, currentBounds);

    this.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
      id: this.id,
      ...currentBounds,
    });
    // }
  };

  prepPromptForQuit = async () => {
    // REMOVE-MAC
    this.actualHide();
    await new Promise((resolve) => {
      makeWindow(this.window);
      setTimeout(() => {
        if (!this.window || this.window?.isDestroyed()) {
          resolve(null);
          return;
        }
        this?.close();
        resolve(null);
      });
    });
    // END-REMOVE-MAC
  };

  setVibrancy = (
    vibrancy: Parameters<typeof BrowserWindow.prototype.setVibrancy>[0],
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
    log.info(`👁️  this.focusPrompt`);
    if (
      this.window &&
      !this.window.isDestroyed() &&
      !this.window?.isFocused()
    ) {
      try {
        if (kitState.isMac) {
          // REMOVE-MAC
          log.info(`🥱 >>>>>>> 🥱 makeKeyWindow`);
          this.window?.showInactive();
          makeKeyWindow(this.window);
          // END-REMOVE-MAC
        } else {
          this?.window?.setFocusable(true);
          this.window?.showInactive();
          this.window?.focus();
        }
      } catch (error) {
        log.error(error);
      }
    }
  };

  forceFocus = () => {
    log.info(`${this.pid}: forceFocus`);
    this.window?.show();
    this.window?.focus();
  };

  setPromptAlwaysOnTop = (onTop: boolean, manual = false) => {
    if (kitState?.kenvEnv?.KIT_DISABLE_ALWAYS_ON_TOP === 'true') {
      return;
    }
    if (kitState.isMac) {
      const allow = manual && onTop;
      if (!allow) {
        return;
      }
    }

    // log.info(`function: setPromptAlwaysOnTop: ${onTop ? 'true' : 'false'}`);
    if (this.window && !this.window.isDestroyed()) {
      const changed = onTop !== this.alwaysOnTop;
      this.alwaysOnTop = onTop;

      if (onTop && changed) {
        this.window.setAlwaysOnTop(onTop, 'screen-saver');

        if (kitState.isMac) {
          this.window.moveTop();
        } else {
          this.window.setVisibleOnAllWorkspaces(true);
        }
      } else if (changed) {
        log.info({ onTop });
        this.window.setAlwaysOnTop(true, 'screen-saver');
        setTimeout(() => {
          if (!this?.window || this.window?.isDestroyed()) return;
          this.window.setAlwaysOnTop(onTop, 'screen-saver');
        }, 100);

        if (!kitState.isMac) {
          this.window.setVisibleOnAllWorkspaces(false);
        }
      } else {
        this.window.setAlwaysOnTop(onTop, 'screen-saver');
      }
    } else {
      this.alwaysOnTop = false;
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
    if (this.window?.isVisible() && !this.firstPrompt) {
      const [x, y] = this.window?.getPosition();
      const currentScreen = screen.getDisplayNearestPoint({ x, y });
      log.info(`Current screen from mouse: ${currentScreen.id}`, {
        visible: this.isVisible,
        firstPrompt: this.firstPrompt,
      });
    }
    const currentScreen = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    log.info(`Current screen from mouse: ${currentScreen.id}`, {
      visible: this.isVisible,
      firstPrompt: this.firstPrompt,
    });
    return currentScreen;
  };

  forceRender = () => {
    this.sendToPrompt(AppChannel.RESET_PROMPT);
  };

  scriptSet = false;

  setScript = async (
    script: Script,
    pid: number,
    force = false,
  ): Promise<'denied' | 'allowed'> => {
    this.scriptSet = true;
    log.info(`${this.pid}: ${pid} setScript`, script, {
      preloaded: this.preloaded || 'none',
    });
    performance.mark('script');
    kitState.resizePaused = false;
    const cache = Boolean(script?.cache);
    this.cacheScriptChoices = cache;
    this.cacheScriptPreview = cache;
    this.cacheScriptPromptData = cache;

    // if (script.filePath === prevScriptPath && pid === prevPid) {
    //   // Using a keyboard shortcut to launch a script will hit this scenario
    //   // Because the app will call `setScript` immediately, then the process will call it too
    //   log.info(`${this.pid}: Script already set. Ignore`);
    //   return 'denied';
    // }

    // prevScriptPath = script.filePath;
    // prevPid = pid;

    // const { prompt } = processes.find((p) => p.pid === pid) as ProcessAndPrompt;
    // if (!prompt) return 'denied';

    this.sendToPrompt(Channel.SET_PID, pid);

    // if (promptWindow?.isAlwaysOnTop() && !script?.debug) {
    //   // promptWindow?.setAlwaysOnTop(false);
    //   // log.warn(`Prompt is always on top, but not a debug script`);
    // }
    this.scriptPath = script.filePath;
    kitState.hasSnippet = Boolean(script?.snippet);
    // if (promptScript?.filePath === script?.filePath) return;

    this.script = script;

    // if (promptScript?.id === script?.id) return;
    // log.info(script);

    if (script.filePath === getMainScriptPath()) {
      script.tabs = script?.tabs?.filter(
        (tab: string) => !tab.match(/join|live/i),
      );

      const sinceLast = differenceInHours(
        Date.now(),
        kitState.previousDownload,
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

    log.info(`setScript done`);

    return 'allowed';
  };

  close = async () => {
    if (!this.window || this.window.isDestroyed()) return;
    log.info(`${this.pid} ${this.window.id} 👋 Close prompt`);
    try {
      // this.sendToPrompt(AppChannel.CLOSE_PROMPT);
      // makeWindow(this.window);
      // willClosePanel(this.window);

      // this.window.setVisibleOnAllWorkspaces(false);
      // A hack for electron-log
      this.window.webContents.send = () => {};
      // this.window.webContents.removeAllListeners();
      // this.window.removeAllListeners();
      // // this.window.webContents.executeJavaScript(`process.exit()`);
      // this.window.webContents.closeDevTools();
      // this.window.webContents.close();
      // this.window.close();
      // makeWindow(this.window);

      if (this?.window && kitState.isMac) {
        // REMOVE-MAC
        log.info(`Before willClosePanel`);
        // makeKeyWindow(prompts.idle)
        // this.setPromptAlwaysOnTop(false);

        // this.window.close();
        // closeWindow(this.window);
        // this.window.emit('close');
        // this.window.emit('closed');
        log.info(`After willClosePanel`);
        // END-REMOVE-MAC
      }

      this.sendToPrompt = () => {};

      // this.window?.close();

      // This is crashing the app, is there anything else I can do?
      // this.window?.destroy();
      try {
        // REMOVE-MAC
        if (kitState.isMac) {
          log.info(`Before makeWindow(this.window)`);
          makeWindow(this.window);
          log.info(`After makeWindow(this.window)`);
        }
        // END-REMOVE-MAC

        this.window.setClosable(true);
        this.window.close();
        log.info(`${this?.pid}: window ${this?.window?.id}: closed`);
      } catch (error) {
        log.error(error);
      }

      setImmediate(() => {
        this.window.destroy();
      });

      // this.window = null;
    } catch (error) {
      log.error(error);
    }

    // prompts.delete(this.pid);

    // check browser window cleanup

    // setTimeout(() => {
    //   const promptStates = [...prompts].map((p) => ({
    //     pid: p.pid,
    //     scriptPath: p.scriptPath,
    //     window: p.window,
    //   }));

    //   const allWindows = BrowserWindow.getAllWindows();
    //   const windowStates = allWindows.map((w) => ({
    //     id: w.id,
    //     destroyed: w.isDestroyed() ? 'Yes' : 'No',
    //     closable: w.isClosable() ? 'Yes' : 'No',
    //     // focusable: w.isFocusable() ? 'Yes' : 'No',
    //     // minimizable: w.isMinimizable() ? 'Yes' : 'No',
    //     // maximizable: w.isMaximizable() ? 'Yes' : 'No',
    //     // modal: w.isModal() ? 'Yes' : 'No',
    //     // movable: w.isMovable() ? 'Yes' : 'No',
    //     // resizable: w.isResizable() ? 'Yes' : 'No',
    //     // visible: w.isVisible() ? 'Yes' : 'No',
    //     // fullscreen: w.isFullScreen() ? 'Yes' : 'No',
    //     // fullscreenable: w.isFullScreenable() ? 'Yes' : 'No',
    //     // kiosk: w.isKiosk() ? 'Yes' : 'No',
    //     // alwaysOnTop: w.isAlwaysOnTop() ? 'Yes' : 'No',
    //     // normal: w.isNormal() ? 'Yes' : 'No',
    //     // minimized: w.isMinimized() ? 'Yes' : 'No',
    //     // maximized: w.isMaximized() ? 'Yes' : 'No',
    //     // hasShadow: w.hasShadow() ? 'Yes' : 'No',
    //     // hasFocus: w.isFocused() ? 'Yes' : 'No',
    //     // visibleOnAllWorkspaces: w.isVisibleOnAllWorkspaces() ? 'Yes' : 'No',
    //   }));

    //   const promptTable = promptStates
    //     .map(
    //       (p) =>
    //         `PID: ${p.pid} | ` +
    //         `Script: ${p.scriptPath} | ` +
    //         `Window: ${p.window ? p.window.id : 'No'}`,
    //     )
    //     .join('\n');

    //   const stateTable = windowStates
    //     .map(
    //       (ws) =>
    //         `ID: ${ws.id} | ` +
    //         `Destroyed: ${ws.destroyed} | ` +
    //         `Closable: ${ws.closable} | `,
    //       // `Focusable: ${ws.focusable} | ` +
    //       // `Minimizable: ${ws.minimizable} | ` +
    //       // `Maximizable: ${ws.maximizable} | ` +
    //       // `Modal: ${ws.modal} | ` +
    //       // `Movable: ${ws.movable} | ` +
    //       // `Resizable: ${ws.resizable} | ` +
    //       // `Visible: ${ws.visible} | ` +
    //       // `Fullscreen: ${ws.fullscreen} | ` +
    //       // `Fullscreenable: ${ws.fullscreenable} | ` +
    //       // `Kiosk: ${ws.kiosk} | ` +
    //       // `AlwaysOnTop: ${ws.alwaysOnTop} | ` +
    //       // `Normal: ${ws.normal} | ` +
    //       // `Minimized: ${ws.minimized} | ` +
    //       // `Maximized: ${ws.maximized} | ` +
    //       // `HasShadow: ${ws.hasShadow} | ` +
    //       // `HasFocus: ${ws.hasFocus} | ` +
    //       // `VisibleOnAllWorkspaces: ${ws.visibleOnAllWorkspaces} | `
    //     )
    //     .join('\n');
    //   // Log or handle the stateTable string as needed

    //   const processTable = processes.map((p) => {
    //     return `PID: ${p.pid} | Script: ${p.scriptPath}`;
    //   });

    //   log.info(`Prompt States:\n${promptTable}`);
    //   log.info(`Process States:\n${processTable}`);
    //   log.info(`Browser Window States:\n${stateTable}`);

    //   // this.window.destroy();
    // }, 2000);

    return;
  };

  initPromptData = async () => {
    // TODO: Needed?
    // this.sendToPrompt(Channel.SET_PROMPT_DATA, kitCache.promptData);
  };

  initMainChoices = () => {
    // TODO: Reimplement cache?
    log.info(`Caching main scored choices: ${kitCache.choices.length}`);
    log.info(
      `Most recent 3:`,
      kitCache.choices.slice(1, 4).map((c) => c?.item?.name),
    );

    this.sendToPrompt(
      AppChannel.SET_CACHED_MAIN_SCORED_CHOICES,
      kitCache.choices,
    );
    // this.sendToPrompt(Channel.SET_SCORED_CHOICES, kitCache.choices);
  };

  initMainPreview = () => {
    // log.info({
    //   preview: kitCache.preview,
    // });
    this.sendToPrompt(AppChannel.SET_CACHED_MAIN_PREVIEW, kitCache.preview);
    // this.sendToPrompt(Channel.SET_PREVIEW, kitCache.preview);
  };

  initMainShortcuts = () => {
    this.sendToPrompt(AppChannel.SET_CACHED_MAIN_SHORTCUTS, kitCache.shortcuts);
    // this.sendToPrompt(Channel.SET_SHORTCUTS, kitCache.shortcuts);
  };

  initMainFlags = () => {
    this.sendToPrompt(
      AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS,
      kitCache.scriptFlags,
    );
    // this.sendToPrompt(Channel.SET_FLAGS, kitCache.flags);
  };

  initPrompt = () => {
    this.sendToPrompt(AppChannel.INIT_PROMPT, {});
  };

  preloadPromptData = async (promptData: PromptData) => {
    let input = '';
    if (this.kitSearch.keyword) {
      input = `${this.kitSearch.keyword} `;
    } else {
      input = this.kitSearch.input || '';
    }
    input = promptData.input || input;
    log.info(
      `🏋️‍♂️ Preload promptData for ${promptData?.scriptPath} with input:${input}<<<`,
    );
    promptData.preload = true;
    if (this.kitSearch.keyword) {
      promptData.keyword = this.kitSearch.keyword;
    }
    this.sendToPrompt(Channel.SET_PROMPT_DATA, {
      ...promptData,
      input,
    });
    this.scriptPath = promptData.scriptPath;
    this.hideOnEscape = Boolean(promptData.hideOnEscape);
    this.kitSearch.triggers.clear();
    if (promptData?.hint) {
      for (const trigger of promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi) ||
        []) {
        this.kitSearch.triggers.set(trigger, { name: trigger, value: trigger });
      }
    }
    this.updateShortcodes();
    if (promptData.flags) {
      setFlags(this, promptData.flags);
    }
    this.alwaysOnTop =
      typeof promptData?.alwaysOnTop === 'boolean'
        ? promptData.alwaysOnTop
        : false;
    kitState.shortcutsPaused = promptData.ui === UI.hotkey;
    this.ui = promptData.ui;
    this.id = promptData.id;
    if (kitState.suspended || kitState.screenLocked) return;
    this.sendToPrompt(Channel.SET_OPEN, true);
  };

  attemptPreload = debounce(
    async (promptScriptPath: string, show = true, init = true) => {
      const isMainScript = getMainScriptPath() === promptScriptPath;
      if (!promptScriptPath || isMainScript) return;
      // log out all the keys of preloadPromptDataMap
      this.preloaded = '';

      const cachedPromptData = preloadPromptDataMap.has(promptScriptPath);
      log.info(`${this.pid}: 🏋️‍♂️ attemptPreload: ${promptScriptPath}`, {
        hasData: cachedPromptData ? 'true' : 'false',
      });

      if (isMainScript) {
      } else if (cachedPromptData) {
        log.info(`🏋️‍♂️ Preload prompt: ${promptScriptPath}`, { init, show });

        if (init) {
          this.initBounds(promptScriptPath, show);
        }

        // kitState.preloaded = true;

        this.sendToPrompt(AppChannel.SCROLL_TO_INDEX, 0);
        this.sendToPrompt(Channel.SET_TAB_INDEX, 0);
        this.sendToPrompt(AppChannel.SET_PRELOADED, true);
        const promptData = preloadPromptDataMap.get(
          promptScriptPath,
        ) as PromptData;
        this.preloadPromptData(promptData);

        const hasCachedChoices = preloadChoicesMap.has(promptScriptPath);

        if (hasCachedChoices) {
          const choices = preloadChoicesMap.get(promptScriptPath) as Choice[];
          log.info(`🏋️‍♂️ Preload choices: ${promptScriptPath}`, choices.length);
          setChoices(this, choices, {
            preload: true,
            generated: false,
            skipInitialSearch: true,
          });

          // this.setBounds({
          //   x: promptData.x,
          //   y: promptData.y,
          //   width:
          //     getMainScriptPath() === promptData.scriptPath
          //       ? getDefaultWidth()
          //       : promptData.width || getDefaultWidth(),
          //   height:
          //     getMainScriptPath() === promptData.scriptPath
          //       ? PROMPT.HEIGHT.BASE
          //       : promptData.height,
          // });

          const preview = preloadPreviewMap.get(promptScriptPath) as string;
          if (preview) {
            log.info(`${this.pid}: 🏋️‍♂️ Preload preview: ${promptScriptPath}`);
          }
          this.sendToPrompt(Channel.SET_PREVIEW, preview || closedDiv);
        } else {
          log.info(`No cached choices for ${promptScriptPath}`);
        }
      }

      log.info(`end of attemptPreload`);
      this.preloaded = promptScriptPath;
    },
    25,
    {
      leading: true,
    },
  );

  hideInstant = () => {
    if (kitState.isWindows) {
      // REMOVE-NODE-WINDOW-MANAGER
      windowManager.hideInstantly(this.window?.getNativeWindowHandle());
      this.window?.emit('blur');
      this.window?.emit('hide');
      // END-REMOVE-NODE-WINDOW-MANAGER
    }

    // REMOVE-MAC
    if (kitState.isMac) {
      hideInstant(this.window);
    }
    // END-REMOVE-MAC

    if (kitState.isLinux) {
      this.window?.hide();
    }

    kitState.shortcutsPaused = false;
  };
}

export const prepQuitWindow = async () => {
  // REMOVE-MAC
  log.info(`👋 Prep quit window`);
  const options = getPromptOptions();
  const window = new BrowserWindow(options);

  await new Promise((resolve) => {
    setTimeout(() => {
      log.info(`👋 Prep quit window timeout`);
      if (!window?.isDestroyed()) {
        makeKeyWindow(window);
      }

      for (const prompt of prompts) {
        if (prompt?.window?.isDestroyed()) continue;
        makeWindow(prompt.window);
      }
      if (!window?.isDestroyed()) {
        window?.close();
      }
      log.info(`👋 Prep quit window done`);
      resolve(null);
    });
  });

  // END-REMOVE-MAC
};

export const makeSplashWindow = async (window?: BrowserWindow) => {
  // REMOVE-MAC
  log.info(`👋 Make splash window`);
  if (!window) {
    return;
  }
  makeWindow(window);
  // END-REMOVE-MAC
};
