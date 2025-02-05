import { Channel, PROMPT, UI } from '@johnlindquist/kit/core/enum';
import type { Choice, PromptBounds, PromptData, Script, Scriptlet } from '@johnlindquist/kit/types/core';
import { snapshot } from 'valtio';
import { subscribeKey } from 'valtio/utils';

import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getMainScriptPath, kenvPath, kitPath } from '@johnlindquist/kit/core/utils';
import type { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { differenceInHours } from 'date-fns';
import {
  BrowserWindow,
  type Input,
  type Point,
  type Rectangle,
  TouchBar,
  app,
  globalShortcut,
  ipcMain,
  screen,
  shell,
} from 'electron';
import contextMenu from 'electron-context-menu';
import type { Display } from 'electron/main';
import { debounce } from 'lodash-es';

import type { ChildProcess } from 'node:child_process';
import EventEmitter from 'node:events';
import { fileURLToPath } from 'node:url';
import { QuickScore } from 'quick-score';
import { getAssetPath } from '../shared/assets';
import { closedDiv, noScript } from '../shared/defaults';
import { EMOJI_HEIGHT, EMOJI_WIDTH, ZOOM_LEVEL } from '../shared/defaults';
import { AppChannel, HideReason } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import type { ResizeData, ScoredChoice } from '../shared/types';
import { sendToAllPrompts } from './channel';
import { cliFromParams, runPromptProcess } from './kit';
import { ensureIdleProcess, getIdles, processes, updateTheme } from './process';
import { OFFSCREEN_X, OFFSCREEN_Y, getPromptOptions } from './prompt.options';
import { prompts } from './prompts';
import { createPty } from './pty';
import {
  getCurrentScreen,
  getCurrentScreenFromBounds,
  isBoundsWithinDisplayById,
  isBoundsWithinDisplays,
} from './screen';
import { invokeSearch, scorer, setChoices, setFlags } from './search';
import {
  getEmojiShortcut,
  kitCache,
  kitState,
  preloadChoicesMap,
  preloadPreviewMap,
  preloadPromptDataMap,
  promptState,
  subs,
} from './state';
import { TrackEvent, trackEvent } from './track';
import { getVersion } from './version';
import { makeKeyPanel, makeKeyWindow, makePanel, makeWindow, prepForClose, setAppearance } from './window/utils';
import shims from './shims';

import { createLogger } from '../shared/log-utils';
import { promptLog, themeLog } from './logs';
const log = createLogger('prompt.ts');

// TODO: Hack context menu to avoid "object destroyed" errors
contextMenu({
  showInspectElement: true,
  showSearchWithGoogle: false,
  showLookUpSelection: false,
  append: (defaultActions, params, browserWindow) => [
    {
      label: 'Detach Dev Tools',
      click: async () => {
        if ((browserWindow as BrowserWindow)?.id) {
          promptLog.info(`Inspect prompt: ${browserWindow?.id}`, {
            browserWindow,
          });
          prompts
            .find((prompt) => prompt?.window?.id === browserWindow?.id)
            ?.window?.webContents?.openDevTools({
              mode: 'detach',
            });
        }
      },
    },
    {
      label: 'Close',
      click: async () => {
        if ((browserWindow as BrowserWindow)?.id) {
          promptLog.info(`Close prompt: ${browserWindow?.id}`, {
            browserWindow,
          });
          prompts.find((prompt) => prompt?.window?.id === browserWindow?.id)?.close('detach dev tools');
        }
      },
    },
  ],
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
      promptLog.info(
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
  { ui, resize, bounds }: { ui: UI; resize: boolean; bounds: Partial<Rectangle> } = {
    ui: UI.arg,
    resize: false,
    bounds: {},
  },
): Partial<Rectangle> & { screenId: string } => {
  const currentScreen = getCurrentScreen();
  const screenId = String(currentScreen.id);
  // promptLog.info(`screens:`, promptState.screens);

  const savedPromptBounds = promptState?.screens?.[screenId]?.[scriptPath];

  if (savedPromptBounds) {
    promptLog.info(`📱 Screen: ${screenId}: `, savedPromptBounds);
    promptLog.info(`Bounds: found saved bounds for ${scriptPath}`);
    // TODO: Reimplement div UI based on promptWindow?
    return savedPromptBounds;
  }

  // promptLog.info(`resetPromptBounds`, scriptPath);
  const { width: screenWidth, height: screenHeight, x: workX, y: workY } = currentScreen.workArea;

  let width = getDefaultWidth();
  let height = PROMPT.HEIGHT.BASE;

  if (ui !== UI.none && resize) {
    if (ui === UI.emoji) {
      width = EMOJI_WIDTH;
      height = EMOJI_HEIGHT;
    }
    if (ui === UI.form) {
      width /= 2;
    }
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

  if (typeof bounds?.width === 'number') {
    width = bounds.width;
  }
  if (typeof bounds?.height === 'number') {
    height = bounds.height;
  }

  let x = Math.round(screenWidth / 2 - width / 2 + workX);
  let y = Math.round(workY + screenHeight / 8);

  // Log screen and window bounds
  const screenTopLeft = { x: workX, y: workY };
  const screenBottomRight = { x: workX + screenWidth, y: workY + screenHeight };
  const windowTopLeft = { x, y };
  const windowBottomRight = { x: x + width, y: y + height };

  promptLog.info('Screen bounds:', {
    topLeft: screenTopLeft,
    bottomRight: screenBottomRight,
  });

  promptLog.info('Center screen', {
    x: screenWidth / 2,
    y: screenHeight / 2,
  });

  promptLog.info('Window bounds:', {
    topLeft: windowTopLeft,
    bottomRight: windowBottomRight,
  });

  if (typeof bounds?.x === 'number' && bounds.x !== OFFSCREEN_X) {
    promptLog.info(`x is a number and not ${OFFSCREEN_X}`);
    x = bounds.x;
  }
  if (typeof bounds?.y === 'number' && bounds.y !== OFFSCREEN_Y) {
    promptLog.info(`y is a number and not ${OFFSCREEN_Y}`);
    y = bounds.y;
  }

  const promptBounds = { x, y, width, height, screenId };

  if (ui === UI.arg) {
    const bounds = {
      ...promptBounds,
      width: getDefaultWidth(),
      height: PROMPT.HEIGHT.BASE,
      screenId,
    };

    log.verbose('Bounds: No UI', bounds);
    return bounds;
  }

  promptLog.info(`Bounds: No saved bounds for ${scriptPath}, returning default bounds`, promptBounds);
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
  log.silly('function: pointOnMouseScreen');
  const mouseScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  // if bounds are off screen, don't save
  const onMouseScreen =
    x > mouseScreen.bounds.x &&
    y > mouseScreen.bounds.y &&
    x < mouseScreen.bounds.x + mouseScreen.bounds.width &&
    y < mouseScreen.bounds.y + mouseScreen.bounds.height;

  return onMouseScreen;
};

const writePromptState = (prompt: KitPrompt, screenId: string, scriptPath: string, bounds: PromptBounds) => {
  if (!(prompt.window && prompt?.isDestroyed())) {
    return;
  }
  if (prompt.kitSearch.input !== '' || prompt.kitSearch.inputRegex) {
    return;
  }
  log.verbose('writePromptState', { screenId, scriptPath, bounds });

  if (!promptState?.screens) {
    promptState.screens = {};
  }
  if (!promptState?.screens[screenId]) {
    promptState.screens[screenId] = {};
  }

  if (!bounds.height) {
    return;
  }
  if (!bounds.width) {
    return;
  }
  if (!bounds.x) {
    return;
  }
  if (!bounds.y) {
    return;
  }
  promptState.screens[screenId][scriptPath] = bounds;
};

export type ScriptTrigger = 'startup' | 'shortcut' | 'prompt' | 'background' | 'schedule' | 'snippet';

let boundsCheck: any = null;
const topTimeout: any = null;

export const clearPromptCache = async () => {
  // TODO: Reimplement clear prompt cache?
  // try {
  //   promptState.screens = {};
  // } catch (error) {
  //   promptLog.info(error);
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
//     promptLog.info(`↖ Bounds attempt: ${attempts}`);
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
//       promptLog.info(
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
const subEmoji = subscribeKey(
  kitState,
  'emojiActive',
  debounce(
    (emoji) => {
      if (prevEmoji === emoji) {
        return;
      }
      prevEmoji = emoji;
      promptLog.info(`👆 Emoji changed: ${emoji ? 'on' : 'off'}`);
      const emojiShortcut = getEmojiShortcut();
      if (emoji) {
        globalShortcut.register(emojiShortcut, () => {
          if (prompts.focused) {
            promptLog.info(`👆 Emoji shortcut pressed. 😘. Setting emojiActive to true on focused prompt`, {
              id: prompts.focused.id,
            });
            prompts.focused.emojiActive = true;
          }
          // prompts?.prevFocused?.setPromptAlwaysOnTop(false);
          app.showEmojiPanel();
        });
      } else {
        globalShortcut.unregister(emojiShortcut);
      }
    },
    200,
    {
      leading: true,
      trailing: false,
    },
  ),
);

let _isSponsor = false;
const subIsSponsor = subscribeKey(kitState, 'isSponsor', (isSponsor) => {
  if (_isSponsor === isSponsor) {
    return;
  }
  _isSponsor = isSponsor;
  promptLog.info('🎨 Sponsor changed:', isSponsor);
  setKitStateAtom({ isSponsor });
});

export const setKitStateAtom = (partialState: Partial<typeof kitState>) => {
  sendToAllPrompts(AppChannel.KIT_STATE, partialState);
};

export const setFocusedKitStateAtom = (partialState: Partial<typeof kitState>) => {
  prompts?.prevFocused?.sendToPrompt(AppChannel.KIT_STATE, partialState);
};

const subUpdateDownloaded = subscribeKey(kitState, 'updateDownloaded', (updateDownloaded) => {
  setKitStateAtom({ updateDownloaded });
});

const subEscapePressed = subscribeKey(kitState, 'escapePressed', (escapePressed) => {
  setFocusedKitStateAtom({ escapePressed });
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
    promptLog.error(e);
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
    if (boundsCheck) {
      clearTimeout(boundsCheck);
    }
    if (topTimeout) {
      clearTimeout(topTimeout);
    }
  } catch (e) {
    promptLog.error(e);
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
  id = '';
  pid = 0;
  initMain = true;
  script = noScript;
  scriptPath = '';
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
  preloaded = '';

  get scriptName() {
    return this?.scriptPath?.split('/')?.pop() || '';
  }

  public window: BrowserWindow;
  public sendToPrompt: (channel: Channel | AppChannel, data?: any) => void = (channel, data) => {
    promptLog.warn('sendToPrompt not set', { channel, data });
  };

  modifiedByUser = false;

  opacity = 1;
  setOpacity = (opacity: number) => {
    if (opacity === this.opacity) {
      return;
    }
    if (this.window) {
      this.window.setOpacity(opacity);
      this.opacity = opacity;
    }
  };
  ignoreMouseEvents = false;
  setIgnoreMouseEvents = (ignoreMouseEvents: boolean) => {
    if (ignoreMouseEvents === this.ignoreMouseEvents) {
      return;
    }
    if (this.window) {
      this.window.setIgnoreMouseEvents(ignoreMouseEvents);
      this.ignoreMouseEvents = ignoreMouseEvents;
    }
  };

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
        ? Number.parseInt(kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE, 10)
        : 0.6,
    }) as QuickScore<ScoredChoice> | null,
    commandChars: [] as string[],
    keys: kitCache.keys,
  };

  clearSearch = () => {
    if (kitState.kenvEnv?.KIT_NO_CLEAR_SEARCH) {
      return;
    }

    promptLog.info('🧹 Clearing search...');
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
  bindToProcess = (pid: number) => {
    if (this.boundToProcess) {
      return;
    }
    this.pid = pid;
    this.boundToProcess = true;
    promptLog.info(`${pid} -> ${this?.window?.id}: 🔗 Binding prompt to process`);
  };

  promptBounds = {
    id: '',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };

  readyEmitter = new EventEmitter();

  waitForReady = async () => {
    return new Promise<void>((resolve) => {
      this.readyEmitter.once('ready', () => {
        promptLog.info(`${this?.window?.id} 🎉 Ready because ready emit`);
        resolve();
      });
    });
  };

  emojiActive = false;
  mainMenuPreventCloseOnBlur = false;

  onBlur = () => {
    promptLog.info(`${this.pid}:${this.scriptName}: 🙈 Prompt window blurred`);

    promptLog.info(`${this.pid}:${this.scriptName}: 🙈 Prompt window blurred. Emoji active: ${this.emojiActive}`, {
      emojiActive: this.emojiActive,
      focusedEmojiActive: prompts?.focused?.emojiActive,
    });
    if (this.emojiActive) {
      promptLog.info(`${this.pid}:${this.scriptName}: 🙈 Prompt window blurred. Emoji active. Ignore blur`);
      return;
    }
    if (this.window.webContents.isDevToolsOpened()) {
      promptLog.info(`${this.pid}:${this.scriptName}: 🙈 Prompt window blurred. Dev tools are open. Ignore blur`);
      return;
    }

    const isMainScript = getMainScriptPath() === this.scriptPath;
    if (isMainScript && !this.mainMenuPreventCloseOnBlur) {
      promptLog.info(`${this.pid}:${this.scriptName}: 🙈 Prompt window blurred. Main script. Make window`);
      this.hideAndRemoveProcess();
      return;
    }

    if (kitState.isMac) {
      makeWindow(this.window);
    }

    if (this.justFocused && this.isVisible()) {
      promptLog.info(`${this.pid}:${this.scriptName}: 🙈 Prompt window was just focused. Ignore blur`);
      return;
    }

    if (!kitState.isLinux) {
      kitState.emojiActive = false;
    }

    if (!this.shown) {
      return;
    }

    if (this.window.isDestroyed()) {
      return;
    }
    if (kitState.isActivated) {
      kitState.isActivated = false;
      return;
    }
    if (this.window.webContents?.isDevToolsOpened()) {
      return;
    }

    if (this.window.isVisible()) {
      this.sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
    }

    if (os.platform().startsWith('win')) {
      return;
    }

    kitState.blurredByKit = false;
  };

  initMainPrompt = (reason = 'unknown') => {
    this.initPromptData();
    this.initMainChoices();
    this.initMainPreview();
    this.initMainShortcuts();
    this.initMainFlags();
    this.initTheme();

    promptLog.info(`${this.pid}: 🚀 Prompt init: ${reason}`);
    this.initPrompt();
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

    this.sendToPrompt = (channel: Channel | AppChannel, data) => {
      log.silly(`sendToPrompt: ${String(channel)}`, data);

      if (this?.window?.webContents?.send) {
        if (channel) {
          this.window?.webContents.send(String(channel), data);
        } else {
          promptLog.error('channel is undefined', { data });
        }
      }
    };

    promptLog.info(`🎬 Init appearance: ${kitState.appearance}`);
    setAppearance(this.window, kitState.appearance);

    this.window?.webContents?.setZoomLevel(ZOOM_LEVEL);

    setTimeout(() => {
      if (!this.window || this.window?.isDestroyed()) {
        return;
      }

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
        promptLog.error(error);
      }
    }

    this.window.webContents?.on('will-navigate', async (event, navigationUrl) => {
      try {
        const url = new URL(navigationUrl);
        promptLog.info(`👉 Prevent navigating to ${navigationUrl}`);
        event.preventDefault();

        const pathname = url.pathname.replace('//', '');

        if (url.host === 'scriptkit.com' && url.pathname === '/api/new') {
          await cliFromParams('new-from-protocol', url.searchParams);
        } else if (url.host === 'scriptkit.com' && pathname === 'kenv') {
          const repo = url.searchParams.get('repo');
          await runPromptProcess(kitPath('cli', 'kenv-clone.js'), [repo || '']);
        } else if (url.protocol === 'kit:') {
          promptLog.info('Attempting to run kit protocol:', JSON.stringify(url));
          await cliFromParams(url.pathname, url.searchParams);
        } else if (url.protocol === 'submit:') {
          promptLog.info('Attempting to run submit protocol:', JSON.stringify(url));
          this.sendToPrompt(Channel.SET_SUBMIT_VALUE, url.pathname);
        } else if (url.protocol.startsWith('http')) {
          shell.openExternal(url.href);
        }
      } catch (e) {
        promptLog.warn(e);
      }
    });

    this.window.once('ready-to-show', async () => {
      if (!this.window || this.window.isDestroyed()) {
        return;
      }
      if (!kitState.isWindows) {
        return;
      }

      if (kitState.kenvEnv?.KIT_WINDOWS_OPACITY !== 'false') {
        this.setIgnoreMouseEvents(true);
        this.setOpacity(0.0);
        this.window.showInactive();
      }

      const handler = () => {
        promptLog.info(`${this.pid}: 👍 INPUT_READY`);
      };

      this.window.webContents.ipc.on(AppChannel.INPUT_READY, handler);
      this.window.webContents.ipc.emit(AppChannel.INPUT_READY);

      promptLog.info(`${this.pid}: 👍 Ready to show`);
      try {
        const css = await readFile(kenvPath('kit.css'), 'utf8');
        if (css) {
          this.sendToPrompt(AppChannel.CSS_CHANGED, css);
        }
      } catch (error) {
        // promptLog.warn(error);
        this.sendToPrompt(AppChannel.CSS_CHANGED, '');
      }
      updateTheme();
    });

    this.window.webContents?.on('dom-ready', () => {
      promptLog.info(`${this.pid}: 📦 dom-ready`);
      this.window?.webContents?.setZoomLevel(ZOOM_LEVEL);

      this.window.webContents?.on('before-input-event', this.beforeInputHandler);
    });

    this.window.webContents?.once('did-finish-load', () => {
      kitState.hiddenByUser = false;

      log.silly('event: did-finish-load');
      this.sendToPrompt(Channel.APP_CONFIG, {
        delimiter: path.delimiter,
        sep: path.sep,
        os: os.platform(),
        isMac: os.platform().startsWith('darwin'),
        isWin: os.platform().startsWith('win'),
        isLinux: os.platform().startsWith('linux'),
        assetPath: getAssetPath(),
        version: getVersion(),
        isDark: kitState.isDark,
        searchDebounce: Boolean(kitState.kenvEnv?.KIT_SEARCH_DEBOUNCE === 'false'),
        termFont: kitState.kenvEnv?.KIT_TERM_FONT || 'monospace',
        url: kitState.url,
      });

      const user = snapshot(kitState.user);
      promptLog.info(`${this.pid}: did-finish-load, setting prompt user to: ${user?.login}`);

      this.sendToPrompt(AppChannel.USER_CHANGED, user);
      setKitStateAtom({
        isSponsor: kitState.isSponsor,
      });
      emitter.emit(KitEvent.DID_FINISH_LOAD);

      const messagesReadyHandler = async (event, pid) => {
        if (!this.window || this.window.isDestroyed()) {
          promptLog.error(`${this.pid}: 📬 Messages ready. Prompt window is destroyed. Not initializing`);
          return;
        }
        promptLog.info(`${this.pid}: 📬 Messages ready. `);
        if (this.ui === UI.splash) {
          this.window.on('blur', () => {
            promptLog.info(`${this.pid}: ${this.scriptName}: 🙈 Prompt window blurred`);
          });
        } else {
          this.window.on('blur', this.onBlur);
        }

        if (this.initMain) {
          this.initMainPrompt('messages ready');
        }

        this.readyEmitter.emit('ready');
        this.ready = true;

        promptLog.info(
          `${this.pid}:${this.window.id}: 🚀 Prompt ready. Forcing render. ${this.window?.isVisible() ? 'visible' : 'hidden'}`,
        );

        this.sendToPrompt(AppChannel.FORCE_RENDER);
        await this.window?.webContents?.executeJavaScript('console.log(document.body.offsetHeight);');

        this.window.webContents.setBackgroundThrottling(true);
      };

      ipcMain.once(AppChannel.MESSAGES_READY, messagesReadyHandler);

      if (kitState.kenvEnv?.KIT_MIC) {
        this.sendToPrompt(AppChannel.SET_MIC_ID, kitState.kenvEnv.KIT_MIC);
      }
      if (kitState.kenvEnv?.KIT_WEBCAM) {
        this.sendToPrompt(AppChannel.SET_WEBCAM_ID, kitState.kenvEnv.KIT_WEBCAM);
      }
    });

    this.window.webContents?.on('unresponsive', () => {
      promptLog.error(`${this.pid}: ${this.scriptName}: Prompt window unresponsive. Reloading`);
      if (this.window.isDestroyed()) {
        promptLog.error(`${this.pid}: ${this.scriptName}: Prompt window is destroyed. Not reloading`);
        return;
      }

      this.window.webContents?.once('did-finish-load', () => {
        promptLog.info(`${this.pid}: Prompt window reloaded`);
      });

      this.window.reload();
    });

    this.window.webContents?.setWindowOpenHandler(({ url }) => {
      promptLog.info(`Opening ${url}`);

      // Only allow websites to open in the browser
      if (!url.startsWith('http')) {
        return { action: 'deny' };
      }

      shell.openExternal(url);

      return { action: 'deny' };
    });

    log.silly('Loading prompt window html');

    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
      this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html`);
    } else {
      this.window.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)));
    }

    this.window.webContents?.on('devtools-opened', () => {
      // remove blur handler
      this.window.removeListener('blur', this.onBlur);
      makeWindow(this.window);
    });

    this.window.webContents?.on('devtools-closed', () => {
      log.silly('event: devtools-closed');

      if (kitState.isMac) {
        promptLog.info(`${this.pid}: 👋 setPromptAlwaysOnTop: false, so makeWindow`);
        makeWindow(this.window);
      } else {
        this.setPromptAlwaysOnTop(false);
      }
      this.maybeHide(HideReason.DevToolsClosed);
    });

    emitter.on(KitEvent.OpenDevTools, () => {
      log.silly('event: OpenDevTools');
      if (prompts.prevFocused?.pid === this?.pid) {
        this.window.webContents?.openDevTools({
          activate: true,
          mode: 'detach',
          title: 'Kit Dev Tools',
        });
      }
    });

    const formatLog = (event: string) => {
      return `pid: ${this.pid}: id: ${this.id} scriptName: ${this.scriptName} windowId: ${this.window.id}: ${event}`;
    };

    this.window.on('always-on-top-changed', () => {
      promptLog.info(formatLog('📌 always-on-top-changed'));
    });

    this.window.on('minimize', () => {
      promptLog.info(formatLog('📌 minimize'));
    });

    this.window.on('restore', () => {
      promptLog.info(formatLog('📌 restore'));
    });

    this.window.on('maximize', () => {
      promptLog.info(formatLog('📌 maximize'));
    });

    this.window.on('unmaximize', () => {
      promptLog.info(formatLog('📌 unmaximize'));
    });

    this.window.on('close', () => {
      processes.removeByPid(this.pid, 'prompt destroy cleanup');
      promptLog.info(formatLog('📌 close'));
    });

    this.window.on('closed', () => {
      promptLog.info(formatLog('📌 closed'));
      kitState.emojiActive = false;
    });

    this.window.webContents?.on('focus', () => {
      promptLog.info(formatLog('� WebContents Focus'));
      this.emojiActive = false;
    });

    this.window.on('focus', () => {
      this.emojiActive = false;
      promptLog.info(formatLog('👓 Focus bounds:'));

      if (!kitState.isLinux) {
        log.verbose(formatLog('👓 Registering emoji shortcut'));
        kitState.emojiActive = true;
      }

      this.justFocused = true;
      setTimeout(() => {
        if (!this?.window?.isDestroyed()) {
          this.justFocused = false;
        }
      }, 100);
    });

    this.window.on('hide', () => {
      promptLog.info(formatLog('🫣 Prompt window hidden'));

      if (!kitState.isLinux) {
        kitState.emojiActive = false;
      }
    });

    this.window.on('show', () => {
      promptLog.info(formatLog('😳 Prompt window shown'));
    });

    this.window.webContents?.on('did-fail-load', (errorCode, errorDescription, validatedURL, isMainFrame) => {
      promptLog.error(formatLog(`did-fail-load: ${errorCode} ${errorDescription} ${validatedURL} ${isMainFrame}`));
    });

    this.window.webContents?.on('did-stop-loading', () => {
      promptLog.info(formatLog('did-stop-loading'));
    });

    this.window.webContents?.on('dom-ready', () => {
      promptLog.info(formatLog(`🍀 dom-ready on ${this?.scriptPath}`));

      this.sendToPrompt(Channel.SET_READY, true);
    });

    this.window.webContents?.on('render-process-gone', (event, details) => {
      processes.removeByPid(this.pid, 'prompt exit cleanup');
      this.sendToPrompt = () => {};
      this.window.webContents.send = () => {};
      promptLog.error(formatLog('🫣 Render process gone...'));
      promptLog.error({ event, details });
    });

    const onResized = () => {
      log.silly('event: onResized');
      this.modifiedByUser = false;
      promptLog.info(formatLog(`Resized: ${this.window.getSize()}`));

      if (this.resizing) {
        this.resizing = false;
      }

      this.saveCurrentPromptBounds();
    };

    if (kitState.isLinux) {
      this.window.on('resize', () => {
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
        log.silly('event: will-move');
        kitState.modifiedByUser = true;
      },
      250,
      { leading: true },
    );

    const onMoved = debounce(() => {
      log.silly('event: onMove');
      this.modifiedByUser = false;
      this.saveCurrentPromptBounds();
    }, 250);

    this.window.on('will-move', willMoveHandler);
    this.window.on('resized', onResized);
    this.window.on('moved', onMoved);
  }

  appearance: 'light' | 'dark' | 'auto' = 'auto';
  setAppearance = (appearance: 'light' | 'dark' | 'auto') => {
    if (this.appearance === appearance || this.window.isDestroyed()) {
      return;
    }
    promptLog.info(`${this.pid}:${this.scriptName}: 👀 Setting appearance to ${appearance}`);
    setAppearance(this.window, appearance);
    this.appearance = appearance;
  };

  forcePromptToCenter = () => {
    this.window?.setPosition(0, 0);
    this.window?.center();
    this.focusPrompt();
  };

  reload = () => {
    promptLog.info('Reloading prompt window...');
    if (this.window.isDestroyed()) {
      promptLog.warn('Prompt window is destroyed. Not reloading.');
      return;
    }

    this.window.reload();
  };

  getBounds = () => {
    if (this?.window && !this.window.isDestroyed()) {
      return this.window.getBounds();
    }
    promptLog.error(`${this.pid}:${this.scriptName}: 🫣 Prompt window is destroyed. Not getting bounds.`);
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  };
  hasFocus = () => {
    if (this?.window && !this.window.isDestroyed()) {
      return this.window.isFocused();
    }
    promptLog.error(`${this.pid}:${this.scriptName}: 🫣 Prompt window is destroyed. Not getting focus.`);
    return false;
  };

  clearCache = () => {
    promptLog.info('--> 📦 CLEARING CACHE, Not main!');
    this.sendToPrompt(AppChannel.CLEAR_CACHE, {});
  };

  initShowPrompt = () => {
    promptLog.info(`${this.pid}:🎪 initShowPrompt: ${this.id} ${this.scriptPath}`);
    if (!kitState.isMac) {
      if (kitState?.kenvEnv?.KIT_PROMPT_RESTORE === 'true') {
        this.window?.restore();
      }
    }

    this.setPromptAlwaysOnTop(true);

    this.focusPrompt();

    this.sendToPrompt(Channel.SET_OPEN, true);

    if (topTimeout) {
      clearTimeout(topTimeout);
    }

    setTimeout(() => {
      ensureIdleProcess();
    }, 10);
  };

  hide = () => {
    if (this.window.isVisible()) {
      this.hasBeenHidden = true;
    }
    promptLog.info('Hiding prompt window...');
    if (this.window.isDestroyed()) {
      promptLog.warn('Prompt window is destroyed. Not hiding.');
      return;
    }
    this.actualHide();
  };

  onHideOnce = (fn: () => void) => {
    let id: null | NodeJS.Timeout = null;
    if (this.window) {
      const handler = () => {
        if (id) {
          clearTimeout(id);
        }
        this.window.removeListener('hide', handler);
        fn();
      };

      id = setTimeout(() => {
        if (!this?.window || this.window?.isDestroyed()) {
          return;
        }
        this.window?.removeListener('hide', handler);
      }, 1000);

      this.window?.once('hide', handler);
    }
  };

  showAfterNextResize = false;

  showPrompt = () => {
    if (this.window.isDestroyed()) {
      return;
    }
    this.initShowPrompt();
    this.sendToPrompt(Channel.SET_OPEN, true);

    setTimeout(() => {
      if (!this?.window || this.window?.isDestroyed()) {
        return;
      }
      this.shown = true;
    }, 100);
  };

  moveToMouseScreen = () => {
    if (this?.window?.isDestroyed()) {
      promptLog.warn(`moveToMouseScreen. Window already destroyed`, this?.id);
      return;
    }

    const mouseScreen = getCurrentScreenFromMouse();
    this.window.setPosition(mouseScreen.workArea.x, mouseScreen.workArea.y);
  };

  initBounds = (forceScriptPath?: string, show = false) => {
    if (this?.window?.isDestroyed()) {
      promptLog.warn(`initBounds. Window already destroyed`, this?.id);
      return;
    }

    const bounds = this.window.getBounds();
    const cachedBounds = getCurrentScreenPromptCache(forceScriptPath || this.scriptPath, {
      ui: this.ui,
      resize: this.allowResize,
      bounds: {
        width: bounds.width,
        height: bounds.height,
      },
    });

    const currentBounds = this?.window?.getBounds();
    promptLog.info(`${this.pid}:${path.basename(this?.scriptPath || '')}: ↖ Init bounds: ${this.ui} ui`, {
      currentBounds,
      cachedBounds,
    });

    const { x, y, width, height } = this.window.getBounds();
    if (cachedBounds.width !== width || cachedBounds.height !== height) {
      log.verbose(`Started resizing: ${this.window?.getSize()}. First prompt?: ${this.firstPrompt ? 'true' : 'false'}`);

      this.resizing = true;
    }

    if (this.promptData?.scriptlet) {
      cachedBounds.height = this.promptData?.inputHeight;
    }

    if (this?.window?.isFocused()) {
      cachedBounds.x = x;
      cachedBounds.y = y;
    }

    this.setBounds(cachedBounds, 'initBounds');
  };

  blurPrompt = () => {
    promptLog.info(`${this.pid}: blurPrompt`);
    if (this.window.isDestroyed()) {
      return;
    }
    if (this.window) {
      this.window.blur();
    }
  };

  initMainBounds = () => {
    const bounds = getCurrentScreenPromptCache(getMainScriptPath());
    if (!bounds.height || bounds.height < PROMPT.HEIGHT.BASE) {
      bounds.height = PROMPT.HEIGHT.BASE;
    }
    this.setBounds(bounds, 'initMainBounds');
  };

  setBounds = (bounds: Partial<Rectangle>, reason = '') => {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    promptLog.info(`${this.pid}: 🆒 Attempt ${this.scriptName}: setBounds reason: ${reason}`, bounds);
    if (!kitState.ready) {
      return;
    }
    const currentBounds = this.window.getBounds();
    const widthNotChanged = bounds?.width && Math.abs(bounds.width - currentBounds.width) < 4;
    const heightNotChanged = bounds?.height && Math.abs(bounds.height - currentBounds.height) < 4;
    const xNotChanged = bounds?.x && Math.abs(bounds.x - currentBounds.x) < 4;
    const yNotChanged = bounds?.y && Math.abs(bounds.y - currentBounds.y) < 4;

    let sameXAndYAsAnotherPrompt = false;
    for (const prompt of prompts) {
      if (prompt?.window?.id === this.window?.id) {
        continue;
      }
      if (prompt.getBounds().x === bounds.x && prompt.getBounds().y === bounds.y) {
        if (prompt?.isFocused() && prompt?.isVisible()) {
          promptLog.info(`🔀 Prompt ${prompt.id} has same x and y as ${this.id}. Scooching x and y!`);
          sameXAndYAsAnotherPrompt = true;
        }
      }
    }

    const noChange =
      heightNotChanged &&
      widthNotChanged &&
      xNotChanged &&
      yNotChanged &&
      !sameXAndYAsAnotherPrompt &&
      !prompts.focused;

    if (noChange) {
      promptLog.info('📐 No change in bounds, ignoring', {
        currentBounds,
        bounds,
      });
      return;
    }

    this.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
      id: this.id,
      ...bounds,
    });

    const boundsScreen = getCurrentScreenFromBounds(this.window?.getBounds());
    const mouseScreen = getCurrentScreen();
    const boundsOnMouseScreen = isBoundsWithinDisplayById(bounds as Rectangle, mouseScreen.id);

    promptLog.info(
      `${this.pid}: boundsScreen.id ${boundsScreen.id} mouseScreen.id ${mouseScreen.id} boundsOnMouseScreen ${boundsOnMouseScreen ? 'true' : 'false'} isVisible: ${this.isVisible() ? 'true' : 'false'}`,
    );

    let currentScreen = boundsScreen;
    if (boundsScreen.id !== mouseScreen.id && boundsOnMouseScreen) {
      promptLog.info('🔀 Mouse screen is different, but bounds are within display. Using mouse screen.');
      currentScreen = mouseScreen;
    }

    const { x, y, width, height } = { ...currentBounds, ...bounds };
    const { x: workX, y: workY } = currentScreen.workArea;
    const { width: screenWidth, height: screenHeight } = currentScreen.workAreaSize;

    if (typeof bounds?.height !== 'number') {
      bounds.height = currentBounds.height;
    }
    if (typeof bounds?.width !== 'number') {
      bounds.width = currentBounds.width;
    }
    if (typeof bounds?.x !== 'number') {
      bounds.x = currentBounds.x;
    }
    if (typeof bounds?.y !== 'number') {
      bounds.y = currentBounds.y;
    }

    const xIsNumber = typeof x === 'number';

    if (!boundsOnMouseScreen) {
      this.window.center();
    }

    if (xIsNumber && x < workX) {
      bounds.x = workX;
    } else if (width && (xIsNumber ? x : currentBounds.x) + width > workX + screenWidth) {
      bounds.x = workX + screenWidth - width;
    } else if (xIsNumber) {
      bounds.x = x;
    } else {
    }

    if (typeof y === 'number' && y < workY) {
      bounds.y = workY;
    } else if (height && (y || currentBounds.y) + height > workY + screenHeight) {
    }

    if (width && width > screenWidth) {
      bounds.x = workX;
      bounds.width = screenWidth;
    }
    if (height && height > screenHeight) {
      bounds.y = workY;
      bounds.height = screenHeight;
    }

    // promptLog.info(`📐 setBounds: ${reason}`, {
    //   ...bounds,
    // });

    if (kitState?.kenvEnv?.KIT_WIDTH) {
      bounds.width = Number.parseInt(kitState?.kenvEnv?.KIT_WIDTH, 10);
    }

    try {
      // if (this.pid) {
      //   debuginfo(
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

      promptLog.info(`${this.pid}: Apply ${this.scriptName}: setBounds reason: ${reason}`, bounds);

      const finalBounds = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };

      let hasMatch = true;

      while (hasMatch) {
        hasMatch = false;
        for (const prompt of prompts) {
          if (!prompt.id || prompt.id === this.id) {
            continue;
          }

          const bounds = prompt.getBounds();
          if (bounds.x === finalBounds.x) {
            promptLog.info(`🔀 Prompt ${prompt.id} has same x as ${this.id}. Scooching x!`);
            finalBounds.x += 40;
            hasMatch = true;
          }
          if (bounds.y === finalBounds.y) {
            promptLog.info(`🔀 Prompt ${prompt.id} has same y as ${this.id}. Scooching y!`);
            finalBounds.y += 40;
            hasMatch = true;
          }
          if (hasMatch) {
            break;
          }
        }
      }

      // promptLog.info(`Final bounds:`, finalBounds);

      // TODO: Windows prompt behavior
      // if (kitState.isWindows) {
      //   if (!this.window?.isFocusable()) {
      //     finalBounds.x = OFFSCREEN_X;
      //     finalBounds.y = OFFSCREEN_Y;
      //   }
      // }

      promptLog.info('setBounds', finalBounds);
      this.window.setBounds(finalBounds, false);
      this.promptBounds = {
        id: this.id,
        ...this.window?.getBounds(),
      };

      this.sendToPrompt(Channel.SET_PROMPT_BOUNDS, this.promptBounds);
    } catch (error) {
      promptLog.info(`setBounds error ${reason}`, error);
    }
  };

  togglePromptEnv = (envName: string) => {
    promptLog.info(`Toggle prompt env: ${envName} to ${kitState.kenvEnv?.[envName]}`);

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

  centerPrompt = () => {
    this.window.center();
  };

  getPromptBounds = () => {
    return this.window?.getBounds();
  };

  resetWindow = () => {
    this.window.setPosition(0, 0);
    this.window.center();
    this.focusPrompt();
  };

  pingPrompt = async (channel: AppChannel, data?: any) => {
    log.silly(`sendToPrompt: ${String(channel)} ${data?.kitScript}`);
    return new Promise((resolve) => {
      if (this.window && !this.window.isDestroyed() && this.window?.webContents) {
        ipcMain.once(channel, () => {
          promptLog.info(`🎤 ${channel} !!! <<<<`);
          resolve(true);
        });
        this.sendToPrompt(channel, data);
      }
    });
  };

  savePromptBounds = (scriptPath: string, bounds: Rectangle, b: number = Bounds.Position | Bounds.Size) => {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    if (kitState.kenvEnv?.KIT_CACHE_PROMPT === 'false') {
      promptLog.info('Cache prompt disabled. Ignore saving bounds');
      return;
    }
    promptLog.info(`${this.pid}: 💾 Save Initial Bounds: ${scriptPath}`, bounds);
    // const isMain = scriptPath.includes('.kit') && scriptPath.includes('cli');
    // if (isMain) return;

    if (!pointOnMouseScreen(bounds)) {
      return;
    }

    const currentScreen = getCurrentScreenFromBounds(this.window?.getBounds());

    try {
      const prevBounds = promptState?.screens?.[String(currentScreen.id)]?.[scriptPath];

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

      writePromptState(this, String(currentScreen.id), scriptPath, promptBounds);
    } catch (error) {
      promptLog.error(error);
    }
  };

  isDestroyed = () => this.window?.isDestroyed();

  getFromPrompt = <K extends keyof ChannelMap>(child: ChildProcess, channel: K, data?: ChannelMap[K]) => {
    if (process.env.KIT_SILLY) {
      log.silly(`sendToPrompt: ${String(channel)}`, data);
    }
    // promptLog.info(`>_ ${channel}`);
    if (this.window && !this.window.isDestroyed() && this.window?.webContents) {
      ipcMain.removeAllListeners(String(channel));
      ipcMain.once(String(channel), (event, { value }) => {
        log.silly(`getFromPrompt: ${String(channel)}`, value);
        try {
          // promptLog.info('childSend', channel, value, child, child?.connected);
          if (child?.connected) {
            child.send({ channel, value });
          }
        } catch (error) {
          promptLog.error('childSend error', error);
        }
      });
      this.window?.webContents.send(String(channel), data);
    }
  };

  private shouldApplyResize(resizeData: ResizeData): boolean {
    if (kitState.isLinux) return false;
    if (!(resizeData.forceHeight || this.allowResize || resizeData.forceResize)) return false;
    if (this.modifiedByUser) return false;
    if (this.window?.isDestroyed()) return false;
    return true;
  }

  private handleSettle() {
    if (!this?.window || this.window?.isDestroyed()) return;

    promptLog.info(`📬 ${this.pid} 📐 Resize settled. Saving bounds`);
    this.saveCurrentPromptBounds();
  }

  private calculateTargetDimensions(
    resizeData: ResizeData,
    currentBounds: Electron.Rectangle,
  ): Pick<Rectangle, 'width' | 'height'> {
    const {
      topHeight,
      mainHeight,
      footerHeight,
      ui,
      isSplash,
      hasPreview,
      forceHeight,
      forceWidth,
      hasInput,
      isMainScript,
    } = resizeData;

    // Get cached dimensions for main script
    const getCachedDimensions = (): Partial<Pick<Rectangle, 'width' | 'height'>> => {
      if (!isMainScript) return {};

      const cachedBounds = getCurrentScreenPromptCache(getMainScriptPath());
      return {
        width: cachedBounds?.width || getDefaultWidth(),
        height: !hasInput ? cachedBounds?.height || PROMPT.HEIGHT.BASE : undefined,
      };
    };

    const { width: cachedWidth, height: cachedHeight } = getCachedDimensions();

    const maxHeight = Math.max(PROMPT.HEIGHT.BASE, currentBounds.height);
    const targetHeight = topHeight + mainHeight + footerHeight;

    let width = cachedWidth || forceWidth || currentBounds.width;
    let height = cachedHeight || forceHeight || Math.round(targetHeight > maxHeight ? maxHeight : targetHeight);

    // Handle splash screen
    if (isSplash) {
      return {
        width: PROMPT.WIDTH.BASE,
        height: PROMPT.HEIGHT.BASE,
      };
    }

    height = Math.round(height);
    width = Math.round(width);

    const heightLessThanBase = height < PROMPT.HEIGHT.BASE;

    // Ensure minimum height for specific conditions
    if (
      (isMainScript && !hasInput && heightLessThanBase) ||
      ([UI.term, UI.editor].includes(ui) && heightLessThanBase)
    ) {
      height = PROMPT.HEIGHT.BASE;
    }

    // Handle preview adjustments
    if (hasPreview) {
      if (!isMainScript) {
        width = Math.max(getDefaultWidth(), width);
      }
      height = currentBounds.height < PROMPT.HEIGHT.BASE ? PROMPT.HEIGHT.BASE : currentBounds.height;
    }

    return { width, height };
  }

  private calculateTargetPosition(
    currentBounds: Electron.Rectangle,
    targetDimensions: Pick<Rectangle, 'width' | 'height'>,
    cachedBounds?: Partial<Electron.Rectangle>,
  ): Pick<Rectangle, 'x' | 'y'> {
    // Center the window horizontally if no cached position
    const newX = cachedBounds?.x ?? Math.round(currentBounds.x + (currentBounds.width - targetDimensions.width) / 2);
    const newY = cachedBounds?.y ?? currentBounds.y;

    return { x: newX, y: newY };
  }

  private saveBoundsIfInitial(resizeData: ResizeData, bounds: Rectangle) {
    if (this.firstPrompt && !resizeData.inputChanged && resizeData.justOpened) {
      this.savePromptBounds(this.scriptPath, bounds);
    }
  }

  resize = async (resizeData: ResizeData) => {
    if (!this.shouldApplyResize(resizeData)) {
      return;
    }

    prevResizeData = resizeData;

    if (this.showAfterNextResize) {
      promptLog.info('🎤 Showing prompt after next resize...');
      this.showAfterNextResize = false;
      this.showPrompt();
    }

    if (resizeData.reason === 'SETTLE') {
      setTimeout(() => this.handleSettle(), 50);
    }

    const currentBounds = this.window.getBounds();

    promptLog.info(`📐 Resize main height: ${resizeData.mainHeight}`);

    const targetDimensions = this.calculateTargetDimensions(resizeData, currentBounds);

    // Skip resize if dimensions haven't changed
    if (currentBounds.height === targetDimensions.height && currentBounds.width === targetDimensions.width) {
      return;
    }

    const cachedBounds = resizeData.isMainScript ? getCurrentScreenPromptCache(getMainScriptPath()) : undefined;

    const targetPosition = this.calculateTargetPosition(currentBounds, targetDimensions, cachedBounds);

    const bounds: Rectangle = { ...targetPosition, ...targetDimensions };

    this.setBounds(bounds, resizeData.reason);
    this.saveBoundsIfInitial(resizeData, bounds);

    hadPreview = resizeData.hasPreview;
  };

  updateShortcodes = () => {
    const shortcodes = [
      ...Array.from(this.kitSearch.shortcodes.keys(), (k) => `${k} `),
      ...this.kitSearch.triggers.keys(),
    ];

    promptLog.info(`${this.pid}: Shortcodes:`, shortcodes.join(', '));

    this.sendToPrompt(Channel.SET_SHORTCODES, shortcodes);
  };

  checkPromptDataBounds = (promptData: PromptData) => {
    const { x, y, width, height } = promptData;

    // Handle position
    if (x !== undefined || y !== undefined) {
      const [currentX, currentY] = this.window?.getPosition() || [];
      if ((x !== undefined && x !== currentX) || (y !== undefined && y !== currentY)) {
        this.window?.setPosition(
          x !== undefined ? Math.round(Number(x)) : currentX,
          y !== undefined ? Math.round(Number(y)) : currentY,
        );
      }
    }

    // Only handle size if not UI.arg and dimensions are provided
    if (promptData.ui !== UI.arg && (width !== undefined || height !== undefined)) {
      const [currentWidth, currentHeight] = this.window?.getSize() || [];
      if ((width !== undefined && width !== currentWidth) || (height !== undefined && height !== currentHeight)) {
        this.window?.setSize(
          width !== undefined ? Math.round(Number(width)) : currentWidth,
          height !== undefined ? Math.round(Number(height)) : currentHeight,
        );
      }
    }
  };

  refocusPrompt = () => {
    const visible = this.isVisible();
    const waitForResize = this.ui === UI.arg || this.ui === UI.div;
    const dontWaitForResize = !waitForResize || this.promptData?.grid || kitState.isLinux;

    promptLog.info('👀 Attempting to refocus prompt', {
      hasBeenHidden: this.hasBeenHidden,
      isVisible: visible,
      isFocused: this?.window?.isFocused(),
      count: this.count,
      ui: this.ui,
      grid: this.promptData?.grid,
      scriptPath: this.promptData?.scriptPath,
    });

    // "grid" is currently an "arg" prompt that doesn't need a resize... Need to make grid it's own UI type...
    if (this.hasBeenHidden || (visible && !this?.window?.isFocused()) || (!visible && dontWaitForResize)) {
      promptLog.info(`👍 ${this.pid}: ${this.ui} ready. Focusing prompt.`);
      this.focusPrompt();
      this.hasBeenHidden = false;
    }
  };

  setPromptData = async (promptData: PromptData) => {
    // promptLog.silly(`🔥 Setting prompt data: ${promptData.scriptPath}`, JSON.stringify(promptData, null, 2));
    this.promptData = promptData;

    const setPromptDataHandler = debounce(
      (x, { ui }: { ui: UI }) => {
        promptLog.info(`${this.pid}: Received SET_PROMPT_DATA from renderer. ${ui} Ready!`);
        this.refocusPrompt();
      },
      100,
      {
        leading: true,
        trailing: false,
      },
    );

    this.window.webContents.ipc.removeHandler(Channel.SET_PROMPT_DATA);
    this.window.webContents.ipc.once(Channel.SET_PROMPT_DATA, setPromptDataHandler);

    if (promptData.ui === UI.term) {
      const termConfig = {
        // TODO: Fix termConfig/promptData type
        command: (promptData as any)?.command || '',
        cwd: promptData.cwd || '',
        shell: (promptData as any)?.shell || '',
        promptId: this.id || '',
        env: promptData.env || {},
      };

      // promptLog.info(`termConfig`, termConfig);
      this.sendToPrompt(AppChannel.SET_TERM_CONFIG, termConfig);
      createPty(this);
    }

    // if (promptData.ui !== UI.arg) {
    //   if (kitState.isMac) {
    //     makeWindow(this.window);
    //   }
    // }

    this.scriptPath = promptData?.scriptPath;
    this.clearFlagSearch();
    this.kitSearch.shortcodes.clear();
    this.kitSearch.triggers.clear();
    if (promptData?.hint) {
      for (const trigger of promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi) || []) {
        this.kitSearch.triggers.set(trigger, { name: trigger, value: trigger });
      }
    }

    this.kitSearch.commandChars = promptData.inputCommandChars || [];
    this.updateShortcodes();

    if (this.cacheScriptPromptData && !promptData.preload) {
      this.cacheScriptPromptData = false;
      promptData.name ||= this.script.name || '';
      promptData.description ||= this.script.description || '';
      promptLog.info(`💝 Caching prompt data: ${this?.scriptPath}`);
      preloadPromptDataMap.set(this.scriptPath, {
        ...promptData,
        input: promptData?.keyword ? '' : promptData?.input || '',
        keyword: '',
      });
    }

    if (promptData.flags) {
      promptLog.info(`🏳️‍🌈 Setting flags from setPromptData: ${Object.keys(promptData.flags)}`);
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
      promptLog.info(`📌 setPromptAlwaysOnTop from promptData: ${promptData.alwaysOnTop ? 'true' : 'false'}`);

      this.setPromptAlwaysOnTop(promptData.alwaysOnTop, true);
    }

    if (typeof promptData?.skipTaskbar === 'boolean') {
      this.setSkipTaskbar(promptData.skipTaskbar);
    }

    this.allowResize = promptData?.resize;
    kitState.shortcutsPaused = promptData.ui === UI.hotkey;

    log.verbose(`setPromptData ${promptData.scriptPath}`);

    this.id = promptData.id;
    this.ui = promptData.ui;

    if (this.kitSearch.keyword) {
      promptData.keyword = this.kitSearch.keyword || this.kitSearch.keyword;
    }

    this.sendToPrompt(Channel.SET_PROMPT_DATA, promptData);

    const isMainScript = getMainScriptPath() === promptData.scriptPath;

    if (this.firstPrompt && !isMainScript) {
      promptLog.info(`${this.pid} Before initBounds`);
      this.initBounds();
      promptLog.info(`${this.pid} After initBounds`);
      // TODO: STRONGLY consider waiting for SET_PROMPT_DATA to complete and the UI to change before focusing the prompt
      // this.focusPrompt();
      promptLog.info(`${this.pid} Disabling firstPrompt`);
      this.firstPrompt = false;
    }

    if (!isMainScript) {
      this.checkPromptDataBounds(promptData);
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

    const visible = this.isVisible();
    log.green(`${this.id}: visible ${visible ? 'true' : 'false'} 👀`);
    if (!visible && promptData?.show) {
      this.showAfterNextResize = true;
    } else if (visible && !promptData?.show) {
      this.actualHide();
    }

    if (!visible && promptData?.scriptPath.includes('.md#')) {
      this.focusPrompt();
    }
    if (boundsCheck) {
      clearTimeout(boundsCheck);
    }
    boundsCheck = setTimeout(async () => {
      if (!this.window) {
        return;
      }
      if (this.window?.isDestroyed()) {
        return;
      }
      const currentBounds = this.window?.getBounds();
      const validBounds = isBoundsWithinDisplays(currentBounds);

      if (validBounds) {
        promptLog.info('Prompt window in bounds.');
      } else {
        promptLog.info('Prompt window out of bounds. Clearing cache and resetting.');
        await clearPromptCacheFor(this.scriptPath);
        this.initBounds();
      }
    }, 1000);

    if (promptData?.scriptPath && this?.script) {
      trackEvent(TrackEvent.SetPrompt, {
        ui: promptData.ui,
        script: path.basename(promptData.scriptPath),
        name: promptData?.name || this?.script?.name || '',
        description: promptData?.description || this?.script?.description || '',
      });
    } else {
      // promptLog.warn({
      //   promptData,
      //   script: this?.script,
      // });
    }
  };

  hasBeenHidden = false;
  actualHide = () => {
    if (!this?.window) {
      return;
    }
    if (this.window.isDestroyed()) {
      return;
    }
    if (kitState.emojiActive) {
      // globalShortcut.unregister(getEmojiShortcut());
      kitState.emojiActive = false;
    }
    // if (kitState.isMac) {
    //   promptLog.info(`🙈 Hiding prompt window`);
    //   makeWindow(this.window);
    // }
    this.setPromptAlwaysOnTop(false);
    if (!this.isVisible()) {
      return;
    }

    promptLog.info('🙈 Hiding prompt window');

    this.hideInstant();
  };

  isVisible = () => {
    if (!this.window) {
      return false;
    }

    if (this.window.isDestroyed()) {
      return false;
    }
    const visible = this.window?.isVisible();
    // log.silly(`function: isVisible: ${visible ? 'true' : 'false'}`);
    return visible;
  };

  maybeHide = (reason: string) => {
    if (!(this.isVisible() && this.boundToProcess)) {
      return;
    }
    promptLog.info(`Attempt Hide: ${reason}`);

    if (reason === HideReason.NoScript || reason === HideReason.Escape || reason === HideReason.BeforeExit) {
      this.actualHide();

      this.clearSearch();
      invokeSearch(this, '', 'maybeHide, so clear');
      return;
    }

    if (reason === HideReason.PingTimeout) {
      promptLog.info('⛑ Attempting recover...');

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
      promptLog.info(`Hiding because ${reason}`);
      if (!kitState.preventClose) {
        this.actualHide();
      }
    }
  };

  saveCurrentPromptBounds = () => {
    if (!this?.window || this.window?.isDestroyed()) {
      promptLog.info(`${this.pid} Prompt window is destroyed. Not saving bounds for ${this.scriptPath}`);
      return;
    }
    // if (kitState.promptCount === 1) {
    const currentBounds = this.window?.getBounds();
    // promptLog.info(
    // 	`${this.pid}: 💾 Save Current Bounds: ${this.scriptPath}`,
    // 	currentBounds,
    // );
    this.savePromptBounds(this.scriptPath, currentBounds);

    this.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
      id: this.id,
      ...currentBounds,
    });
    // }
  };

  prepPromptForQuit = async () => {
    this.actualHide();
    await new Promise((resolve) => {
      prepForClose(this.window);
      setTimeout(() => {
        if (!this.window || this.window?.isDestroyed()) {
          resolve(null);
          return;
        }
        this?.close('prompt.prepPromptForQuit');
        resolve(null);
      });
    });
  };

  setVibrancy = (vibrancy: Parameters<typeof BrowserWindow.prototype.setVibrancy>[0]) => {
    if (this.window.isDestroyed()) {
      return;
    }
    if (kitState.isMac) {
      try {
        this.window.setVibrancy(vibrancy);
      } catch (error) {
        promptLog.error(error);
      }
    } else {
      promptLog.info('Custom vibrancy not supported on this platform');
    }
  };

  setPromptProp = (data: { prop: { key: string; value: any } }) => {
    const { key, value }: any = data.prop;
    (this.window as any)[key](value);
  };

  hasBeenFocused = false;
  focusPromptCoolingDown = false;
  focusPrompt = () => {
    if (this.focusPromptCoolingDown) {
      return;
    }
    this.focusPromptCoolingDown = true;
    setTimeout(() => {
      this.focusPromptCoolingDown = false;
    }, 1000);
    this.hasBeenFocused = true;
    if (!this.window.focusable) {
      promptLog.info(`${this.pid}: Setting focusable to true`);
      this.window?.setFocusable(true);
    }
    if (this.window && !this.window.isDestroyed() && !this.window?.isFocused()) {
      promptLog.info(`${this.pid}: focusPrompt`);
      try {
        this.setIgnoreMouseEvents(false);
        this.setOpacity(1);

        if (kitState.isMac) {
          // this.window?.showInactive();
          makeKeyPanel(this.window);
        } else {
          this.window?.showInactive();
          this.window?.focus();
        }
      } catch (error) {
        promptLog.error(error);
      }
    }
  };

  forceFocus = () => {
    promptLog.info(`${this.pid}: forceFocus`);
    this.window?.show();
    this.window?.focus();
  };

  setSkipTaskbar = (skipTaskBar: boolean) => {
    if (this.window?.isDestroyed()) {
      return;
    }
    this.window?.setSkipTaskbar(skipTaskBar);
  };

  setPromptAlwaysOnTop = (onTop: boolean, manual = false) => {
    if (kitState.isMac) {
      promptLog.info(`alwaysOnTop is disabled on mac`);
      return;
    }
    if (kitState?.kenvEnv?.KIT_ALWAYS_ON_TOP === 'true') {
      return;
    }
    if (kitState.isMac) {
      const allow = manual && onTop;
      if (!allow) {
        return;
      }
    }

    // promptLog.info(`function: setPromptAlwaysOnTop: ${onTop ? 'true' : 'false'}`);
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
        promptLog.info({ onTop });
        this.window.setAlwaysOnTop(true, 'screen-saver');
        setTimeout(() => {
          if (!this?.window || this.window?.isDestroyed()) {
            return;
          }
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
    log.silly('function: devToolsVisible');
    return this.window.webContents.isDevToolsOpened();
  };

  isFocused = () => {
    if (!this.window || this.window.isDestroyed()) {
      promptLog.warn(`${this.pid}: isFocused: window is destroyed`);
      return false;
    }
    const focused = this.window?.isFocused();
    log.silly(`function: isFocused: ${focused ? 'true' : 'false'}`);
    return focused;
  };

  getCurrentScreenFromMouse = (): Display => {
    if (this.window?.isVisible() && !this.firstPrompt) {
      const [x, y] = this.window?.getPosition();
      const currentScreen = screen.getDisplayNearestPoint({ x, y });
      promptLog.info(`Current screen from mouse: ${currentScreen.id}`, {
        visible: this.isVisible,
        firstPrompt: this.firstPrompt,
      });
    }
    const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    promptLog.info(`Current screen from mouse: ${currentScreen.id}`, {
      visible: this.isVisible,
      firstPrompt: this.firstPrompt,
    });
    return currentScreen;
  };

  forceRender = () => {
    this.sendToPrompt(AppChannel.RESET_PROMPT);
  };

  resetState = () => {
    this.boundToProcess = false;
    this.pid = 0;
    this.ui = UI.arg;
    this.count = 0;
    this.id = '';
    prompts.setIdle(this);

    promptLog.info(`${this.pid}: 🚀 Prompt re-initialized`);
    const idles = getIdles();
    promptLog.info(`${this.pid}: 🚀 Idles: ${idles.length}. Prompts: ${prompts.getPromptMap().size}`);
    // Logs all idle pids and prompts ids in a nice table format
    promptLog.info(
      `Idles: ${idles.map((idle) => `${idle.pid}: ${prompts.get(idle.pid)?.window?.id || 'none'}`).join(',')}`,
    );

    const browserWindows = BrowserWindow.getAllWindows();
    promptLog.info(`Browser windows: ${browserWindows.map((window) => window.id).join(',')}`);

    const allPrompts = [...prompts];
    promptLog.info(`Prompts: ${allPrompts.map((prompt) => `${prompt.pid}: ${prompt.window?.id}`).join('\n')}`);

    promptLog.info(`Prompt map: ${allPrompts.map((prompt) => `${prompt.pid}: ${prompt.window?.id}`).join('\n')}`);

    this.initMainPreview();
    this.initMainShortcuts();
    this.initMainChoices();
    this.initMainFlags();
    return;
    // this.initMain = true;
    // this.script = noScript;
    // this.scriptPath = '';
    // this.allowResize = true;
    // this.resizing = false;
    // this.isScripts = true;
    // this.promptData = null as null | PromptData;
    // this.firstPrompt = true;
    // this.justFocused = true;
    // this.ready = false;
    // this.shown = false;
    // this.alwaysOnTop = true;
    // this.hideOnEscape = false;
    // this.cacheScriptChoices = false;
    // this.cacheScriptPromptData = false;
    // this.cacheScriptPreview = false;
    // this.actionsOpen = false;
    // this.wasActionsJustOpen = false;

    // promptLog.info(`${this.pid}: 🚀 Prompt re-initialized`);
    // const idles = getIdles();
    // promptLog.info(`${this.pid}: 🚀 Idles: ${idles.length}. Prompts: ${prompts.getPromptMap().size}`);
    // // Logs all idle pids and prompts ids in a nice table format
    // promptLog.info(
    //   `Idles: ${idles.map((idle) => `${idle.pid}: ${prompts.get(idle.pid)?.window?.id || 'none'}`).join(',')}`,
    // );

    // const browserWindows = BrowserWindow.getAllWindows();
    // promptLog.info(`Browser windows: ${browserWindows.map((window) => window.id).join(',')}`);

    // const allPrompts = [...prompts];
    // promptLog.info(`Prompts: ${allPrompts.map((prompt) => `${prompt.pid}: ${prompt.window?.id}`).join('\n')}`);

    // promptLog.info(`Prompt map: ${allPrompts.map((prompt) => `${prompt.pid}: ${prompt.window?.id}`).join('\n')}`);

    // // const idleProcess = idles[0];
    // prompts.setIdle(this);
    // // prompts.attachIdlePromptToProcess('♻️ prompt reset state', idleProcess.pid, this);
    // // this.initPrompt();
  };

  scriptSet = false;

  setScript = (script: Script, pid: number, force = false): 'denied' | 'allowed' => {
    const { preview, scriptlet, inputs, tag, ...serializableScript } = script as Scriptlet;
    this.scriptSet = true;
    promptLog.info(`${this.pid}: ${pid} setScript`, serializableScript, {
      preloaded: this.preloaded || 'none',
    });
    performance.mark('script');
    kitState.resizePaused = false;
    const cache = Boolean(serializableScript?.cache);
    this.cacheScriptChoices = cache;
    this.cacheScriptPreview = cache;
    this.cacheScriptPromptData = cache;

    // if (script.filePath === prevScriptPath && pid === prevPid) {
    //   // Using a keyboard shortcut to launch a script will hit this scenario
    //   // Because the app will call `setScript` immediately, then the process will call it too
    //   promptLog.info(`${this.pid}: Script already set. Ignore`);
    //   return 'denied';
    // }

    // prevScriptPath = script.filePath;
    // prevPid = pid;

    // const { prompt } = processes.find((p) => p.pid === pid) as ProcessAndPrompt;
    // if (!prompt) return 'denied';

    this.sendToPrompt(Channel.SET_PID, pid);

    this.scriptPath = serializableScript.filePath;
    kitState.hasSnippet = Boolean(serializableScript?.snippet);
    // if (promptScript?.filePath === script?.filePath) return;

    this.script = serializableScript;

    // promptLog.info(`${this.pid}: sendToPrompt: ${Channel.SET_SCRIPT}`, serializableScript);
    this.sendToPrompt(Channel.SET_SCRIPT, serializableScript);

    if (serializableScript.filePath === getMainScriptPath()) {
      emitter.emit(KitEvent.MainScript, serializableScript);
    }

    promptLog.info('setScript done');

    return 'allowed';
  };

  private hideInstantCoolingDown = false;

  hideInstant = () => {
    // If we're currently cooling down, just ignore this call
    if (this.hideInstantCoolingDown) {
      promptLog.info(`${this.pid}: "hideInstant" still cooling down`);
      return;
    }

    // Start cooling down for 100ms
    this.hideInstantCoolingDown = true;
    setTimeout(() => {
      this.hideInstantCoolingDown = false;
    }, 100);

    // --- Original hide logic below ---
    if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) {
      return;
    }

    if (kitState.isWindows) {
      shims['@johnlindquist/node-window-manager'].windowManager.hideInstantly(this.window.getNativeWindowHandle());
      if (this.window.isFocused()) {
        this.window.emit('blur');
        this.window.emit('hide');
      }
    } else if (kitState.isMac) {
      shims['@johnlindquist/mac-panel-window'].hideInstant(this.window);
    } else if (kitState.isLinux) {
      this.window.hide();
    }
  };

  closed = false;
  closeCoolingDown = false;
  close = (reason = 'unknown') => {
    promptLog.info(`${this.pid}: "close" because ${reason}`);
    if (!kitState.allowQuit) {
      if (this.boundToProcess) {
        promptLog.info(`${this.pid}: "close" bound to process`);
        if (this.hasBeenFocused) {
          promptLog.info(`${this.pid}: "close" hasBeenFocused`);
        } else {
          promptLog.info(`${this.pid}: "close" !hasBeenFocused`);
          this.resetState();
          return;
        }
      } else {
        return;
      }
    }

    if (this.closeCoolingDown) {
      promptLog.info(`${this.pid}: "close" still cooling down`);
      return;
    }
    this.closeCoolingDown = true;
    setTimeout(() => {
      this.closeCoolingDown = false;
    }, 100);
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    promptLog.info(`${this.pid} ${this.window.id} 👋 Close prompt`);
    try {
      if (kitState.isMac) {
        this.hideInstant();
      }

      this.sendToPrompt = () => {};

      try {
        if (!kitState.isMac) {
          // This was causing nasty crashes on mac
          this.window.setClosable(true);
        }
        prepForClose(this.window); // Ensure class is reverted
        this.window.close();
        promptLog.info(`${this?.pid}: window ${this?.window?.id}: closed`);
      } catch (error) {
        promptLog.error(error);
      }

      setImmediate(() => {
        try {
          this.window.destroy();
        } catch (error) {
          promptLog.error(error);
        }
      });
    } catch (error) {
      promptLog.error(error);
    }

    const sinceLast = differenceInHours(Date.now(), kitState.previousDownload);
    promptLog.info(`Hours since sync: ${sinceLast}`);
    if (sinceLast > 6) {
      kitState.previousDownload = new Date();
    }

    return;
  };

  initPromptData = async () => {
    // TODO: Needed?
    // this.sendToPrompt(Channel.SET_PROMPT_DATA, kitCache.promptData);
  };

  initMainChoices = () => {
    // TODO: Reimplement cache?
    promptLog.info(`${this.pid}: Caching main scored choices: ${kitCache.choices.length}`);
    promptLog.info(
      'Most recent 3:',
      kitCache.choices.slice(1, 4).map((c) => c?.item?.name),
    );

    this.sendToPrompt(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, kitCache.choices);
    // this.sendToPrompt(Channel.SET_SCORED_CHOICES, kitCache.choices);
  };

  initMainPreview = () => {
    // promptLog.info({
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
    this.sendToPrompt(AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS, kitCache.scriptFlags);
    // this.sendToPrompt(Channel.SET_FLAGS, kitCache.flags);
  };

  initTheme = () => {
    themeLog.info(`${this.pid}: initTheme: ${kitState.themeName}`);
    this.sendToPrompt(Channel.SET_THEME, kitState.theme);
  };

  initPrompt = () => {
    this.sendToPrompt(AppChannel.INIT_PROMPT, {});
  };

  preloadPromptData = (promptData: PromptData) => {
    let input = '';
    if (this.kitSearch.keyword) {
      input = `${this.kitSearch.keyword} `;
    } else {
      input = this.kitSearch.input || '';
    }
    input = promptData.input || input;
    promptLog.info(`🏋️‍♂️ Preload promptData for ${promptData?.scriptPath} with input:${input}<<<`);
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
      for (const trigger of promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi) || []) {
        this.kitSearch.triggers.set(trigger, { name: trigger, value: trigger });
      }
    }
    this.updateShortcodes();
    if (promptData.flags) {
      promptLog.info(`🏴‍☠️ Setting flags from preloadPromptData: ${Object.keys(promptData.flags)}`);
      setFlags(this, promptData.flags);
    }
    this.alwaysOnTop = typeof promptData?.alwaysOnTop === 'boolean' ? promptData.alwaysOnTop : false;
    kitState.shortcutsPaused = promptData.ui === UI.hotkey;
    this.ui = promptData.ui;
    this.id = promptData.id;
    if (kitState.suspended || kitState.screenLocked) {
      return;
    }
    this.sendToPrompt(Channel.SET_OPEN, true);
  };

  attemptPreload = debounce(
    (promptScriptPath: string, show = true, init = true) => {
      const isMainScript = getMainScriptPath() === promptScriptPath;
      if (!promptScriptPath || isMainScript) {
        return;
      }
      // log out all the keys of preloadPromptDataMap
      this.preloaded = '';

      const cachedPromptData = preloadPromptDataMap.has(promptScriptPath);
      promptLog.info(`${this.pid}: 🏋️‍♂️ attemptPreload: ${promptScriptPath}`, {
        hasData: cachedPromptData ? 'true' : 'false',
      });

      if (isMainScript) {
      } else if (cachedPromptData) {
        promptLog.info(`🏋️‍♂️ Preload prompt: ${promptScriptPath}`, { init, show });

        if (init) {
          this.initBounds(promptScriptPath, show);
        }

        // kitState.preloaded = true;

        this.sendToPrompt(AppChannel.SCROLL_TO_INDEX, 0);
        this.sendToPrompt(Channel.SET_TAB_INDEX, 0);
        this.sendToPrompt(AppChannel.SET_PRELOADED, true);
        const promptData = preloadPromptDataMap.get(promptScriptPath) as PromptData;
        this.preloadPromptData(promptData);

        const hasCachedChoices = preloadChoicesMap.has(promptScriptPath);

        if (hasCachedChoices) {
          const choices = preloadChoicesMap.get(promptScriptPath) as Choice[];
          promptLog.info(`🏋️‍♂️ Preload choices: ${promptScriptPath}`, choices.length);
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
            promptLog.info(`${this.pid}: 🏋️‍♂️ Preload preview: ${promptScriptPath}`);
          }
          this.sendToPrompt(Channel.SET_PREVIEW, preview || closedDiv);

          this.preloaded = promptScriptPath;
        } else {
          promptLog.info(`No cached choices for ${promptScriptPath}`);
          this.preloaded = '';
        }
      }

      promptLog.info('end of attemptPreload. Assigning preloaded');
    },
    25,
    {
      leading: true,
    },
  );

  // Extracted and combined escape key handling into handleEscapePress
  private escapePressCount = 0;
  private lastEscapePressTime = 0;

  private handleEscapePress = () => {
    if (!this.scriptPath) {
      promptLog.error(
        `${this.pid}: ${this.scriptName}: Escape pressed, but no script path. Killing process and prompt.`,
      );
      processes.removeByPid(this.pid, 'prompt exit cleanup');
      emitter.emit(KitEvent.KillProcess, this.pid);
      this.hide();
      return;
    }

    const currentTime = Date.now();
    if (currentTime - this.lastEscapePressTime <= 300) {
      this.escapePressCount += 1;
      if (this.escapePressCount === 4) {
        promptLog.info('Escape pressed 4 times quickly, reloading');
        this.window.reload();
        this.escapePressCount = 0;
      }
    } else {
      this.escapePressCount = 1;
    }
    this.lastEscapePressTime = currentTime;
  };

  private shouldClosePromptOnInitialEscape = (isEscape: boolean): boolean => {
    return (this.firstPrompt || this.scriptPath === getMainScriptPath()) && isEscape && !this.wasActionsJustOpen;
  };

  private hideAndRemoveProcess = () => {
    this.hideInstant();
    processes.removeByPid(this.pid, 'prompt close cleanup');
  };

  private beforeInputHandler = (event, input: Input) => {
    if (input.type !== 'keyDown' || !input.key) {
      return;
    }

    // log.purple(`${this.pid}: ${this.scriptName}: before-input-event`, { input });

    const isW = input.key === 'w';
    const isEscape = input.key === 'Escape';

    if (isEscape) {
      promptLog.info(`${this.pid}: Escape received by prompt`);
      this.handleEscapePress();
    }

    const shouldCloseOnInitialEscape = this.shouldClosePromptOnInitialEscape(isEscape);
    // promptLog.info(`${this.pid}: shouldCloseOnInitialEscape: ${shouldCloseOnInitialEscape}`);
    if ((isW && (kitState.isMac ? input.meta : input.control)) || shouldCloseOnInitialEscape) {
      promptLog.info(`${this.pid}: Closing prompt window`);
      if (isW) {
        log.purple(`Closing prompt window with ${kitState.isMac ? '⌘' : '⌃'}+w`);
      } else if (isEscape) {
        log.purple('Closing prompt window with escape');
      }
      this.hideAndRemoveProcess();
      // I don't think these are needed anymore, but leaving them in for now
      promptLog.info(`✋ Removing process because of escape ${this.pid}`);

      // emitter.emit(KitEvent.KillProcess, this.pid);
      // event.preventDefault();
      return;
    }
  };
}

export const makeSplashWindow = (window?: BrowserWindow) => {
  if (!kitState.isMac) {
    return;
  }
  promptLog.info('👋 Prep for close');
  if (!window) {
    return;
  }

  prepForClose(window);
};
