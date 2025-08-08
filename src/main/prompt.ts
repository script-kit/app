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
  Notification,
  type Point,
  type Rectangle,
  TouchBar,
  app,
  globalShortcut,
  ipcMain,
  screen,
  shell,
} from 'electron';
import type { Display } from 'electron';
import contextMenu from 'electron-context-menu';
import { debounce } from 'lodash-es';

import type { ChildProcess } from 'node:child_process';
import EventEmitter from 'node:events';
import { fileURLToPath } from 'node:url';
import { closedDiv, noScript } from '../shared/defaults';
import { ZOOM_LEVEL } from '../shared/defaults';
import { AppChannel, HideReason } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import type { ResizeData } from '../shared/types';
import { sendToAllPrompts } from './channel';
import { cliFromParams, runPromptProcess } from './kit';
import { getIdles, processes, updateTheme } from './process';
import { getPromptOptions } from './prompt.options';
import { prompts } from './prompts';
import { createPty } from './pty';
import {
  getCurrentScreen,
  getCurrentScreenFromBounds,
  isBoundsWithinDisplayById,
  isBoundsWithinDisplays,
} from './screen';
import { invokeSearch, setChoices, setFlags } from './search';
import { processWindowCoordinator, WindowOperation } from './process-window-coordinator';
import shims from './shims';
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
import { makeKeyPanel, makeWindow, prepForClose, setAppearance } from './window/utils';
import { setPromptBounds as applyWindowBounds, centerThenFocus } from './prompt.window-utils';
import { initShowPromptFlow, hideFlow, onHideOnceFlow, showPromptFlow, moveToMouseScreenFlow, initBoundsFlow, blurPromptFlow, initMainBoundsFlow } from './prompt.window-flow';
import { clearPromptCacheFor } from './prompt.cache';
import { calculateTargetDimensions, calculateTargetPosition } from './prompt.resize-utils';
import { adjustBoundsToAvoidOverlap, getTitleBarHeight, ensureMinWindowHeight, applyPromptDataBounds } from './prompt.bounds-utils';
import { shouldMonitorProcess, getProcessCheckInterval, getLongRunningThresholdMs } from './prompt.process-utils';
import { startProcessMonitoring as monitorStart, stopProcessMonitoring as monitorStop, listenForProcessExit as monitorListen, checkProcessAlive as monitorCheck } from './prompt.process-monitor';
import { setupDevtoolsHandlers, setupDomAndFinishLoadHandlers, setupNavigationHandlers, loadPromptHtml, setupWindowLifecycleHandlers } from './prompt.init-utils';
import { setupResizeAndMoveListeners } from './prompt.resize-listeners';
import { togglePromptEnvFlow } from './prompt.toggle-env';
import { buildProcessConnectionLostOptions, buildProcessDebugInfo } from './prompt.notifications';
import { startLongRunningMonitorFlow, clearLongRunningMonitorFlow, showLongRunningNotificationFlow, terminateLongRunningScriptFlow } from './prompt.long-running';
import {
  getAllScreens as utilGetAllScreens,
  getCurrentScreenFromMouse as utilGetCurrentScreenFromMouse,
  getCurrentScreenPromptCache as utilGetCurrentScreenPromptCache,
  pointOnMouseScreen as utilPointOnMouseScreen,
} from './prompt.screen-utils';
import { isDevToolsShortcut, computeShouldCloseOnInitialEscape } from './prompt.focus-utils';
import { isCloseCombo } from './prompt.input-utils';

import { promptLog as log, themeLog } from './logs';
import { handleBlurVisibility } from './prompt.visibility-utils';

// TODO: Hack context menu to avoid "object destroyed" errors
contextMenu({
  showInspectElement: true,
  showSearchWithGoogle: false,
  showLookUpSelection: false,
  append: (_defaultActions, _params, browserWindow) => [
    {
      label: 'Detach Dev Tools',
      click: async () => {
        // Type check to ensure browserWindow is a BrowserWindow
        if (browserWindow && 'id' in browserWindow && typeof (browserWindow as BrowserWindow).id === 'number') {
          const bw = browserWindow as BrowserWindow;
          log.info(`Inspect prompt: ${bw.id}`, {
            browserWindow,
          });
          const prompt = prompts.find((p) => p?.window?.id === bw.id);
          if (prompt) {
            // Set flag to prevent main menu from closing
            prompt.devToolsOpening = true;
            setTimeout(() => {
              prompt.devToolsOpening = false;
            }, 200);
            prompt.window?.webContents?.openDevTools({
              mode: 'detach',
            });
          }
        }
      },
    },
    {
      label: 'Close',
      click: async () => {
        // Type check to ensure browserWindow is a BrowserWindow
        if (browserWindow && 'id' in browserWindow && typeof (browserWindow as BrowserWindow).id === 'number') {
          const bw = browserWindow as BrowserWindow;
          log.info(`Close prompt: ${bw.id}`, {
            browserWindow,
          });
          prompts.find((prompt) => prompt?.window?.id === bw.id)?.close('detach dev tools');
        }
      },
    },
  ],
});

// legacy width helper removed; use prompt.resize-utils for calculations

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

export { logPromptStateFlow as logPromptState } from './prompt.log-state';

// TODO: Move this into a screen utils
export const getCurrentScreenFromMouse = utilGetCurrentScreenFromMouse;

export const getAllScreens = utilGetAllScreens;

export const getCurrentScreenPromptCache = utilGetCurrentScreenPromptCache;

// Removed unused resize tracking variables as part of refactor

// TODO: Needs refactor to include unique ids, or conflicts will happen

enum Bounds {
  Position = 1 << 0,
  Size = 1 << 1,
}

export const pointOnMouseScreen = utilPointOnMouseScreen as (p: Point) => boolean;

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
const subEmoji = subscribeKey(
  kitState,
  'emojiActive',
  debounce(
    (emoji) => {
      if (prevEmoji === emoji) {
        return;
      }
      prevEmoji = emoji;
      log.info(`👆 Emoji changed: ${emoji ? 'on' : 'off'}`);
      const emojiShortcut = getEmojiShortcut();
      if (emoji) {
        globalShortcut.register(emojiShortcut, () => {
          if (prompts.focused) {
            log.info('👆 Emoji shortcut pressed. 😘. Setting emojiActive to true on focused prompt', {
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
  log.info('🎨 Sponsor changed:', isSponsor);
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

// moved to prompt.cache.ts; keep export for backward compatibility
export { clearPromptCacheFor } from './prompt.cache';

export const clearPromptTimers = async () => {
  try {
    if (boundsCheck) {
      clearTimeout(boundsCheck);
    }
    if (topTimeout) {
      clearTimeout(topTimeout);
    }
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
  ready = false;
  shown = false;
  alwaysOnTop = true;
  hideOnEscape = false;
  cacheScriptChoices = false;
  cacheScriptPromptData = false;
  cacheScriptPreview = false;
  actionsOpen = false;
  wasActionsJustOpen = false;
  devToolsOpening = false;

  // Long-running script monitoring
  private longRunningTimer?: NodeJS.Timeout;
  private hasShownLongRunningNotification = false;
  private longRunningThresholdMs = 60000; // 1 minute default
  private scriptStartTime?: number;

  birthTime = performance.now();

  lifeTime = () => {
    return (performance.now() - this.birthTime) / 1000 + 's';
  };
  preloaded = '';

  get scriptName() {
    return this?.scriptPath?.split('/')?.pop() || '';
  }

  get isMainMenu() {
    // Consolidated logic to identify main menu:
    // 1. Script path matches the main script path
    // 2. No script path and pid is 0 (uninitialized main menu)
    // 3. Empty script path (idle process that shows main menu)
    return this.scriptPath === getMainScriptPath() ||
      (!this.scriptPath && this.pid === 0) ||
      this.scriptPath === '';
  }

  public window: BrowserWindow;
  public sendToPrompt: (channel: Channel | AppChannel, data?: any) => void = (channel, data) => {
    this.logWarn('sendToPrompt not set', { channel, data });
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
    filterRegex: undefined as undefined | RegExp,
    filteredChoices: undefined as undefined | Choice[],
    keyword: '',
    keywordCleared: false,
    generated: false,
    flaggedValue: '',
    choices: kitCache.scripts as Choice[],
    scripts: kitCache.scripts as Script[],
    triggers: new Map<string, Choice>(kitCache.triggers),
    postfixes: new Map<string, Choice>(kitCache.postfixes),
    keywords: new Map<string, Choice>(kitCache.keywords),
    shortcodes: new Map<string, Choice>(kitCache.shortcodes),
    hasGroup: false,
    commandChars: [] as string[],
    keys: kitCache.keys,
  };

  clearSearch = () => {
    if ((kitState.kenvEnv as any)?.KIT_NO_CLEAR_SEARCH === 'true') {
      return;
    }

    this.logInfo('🧹 Clearing search...');
    this.kitSearch.keyword = '';
    this.kitSearch.choices = [];
    this.kitSearch.input = '';
    this.kitSearch.keywords.clear();
    this.kitSearch.triggers.clear();
    this.kitSearch.postfixes.clear();
    this.kitSearch.shortcodes.clear();
    this.updateShortcodes();
    this.kitSearch.hasGroup = false;
    this.kitSearch.commandChars = [];
    this.kitSearch.keys = ['name', 'keyword', 'tag'];
  };

  flagSearch = {
    input: '',
    choices: [] as Choice[],
    hasGroup: false,
  };

  clearFlagSearch = () => {
    this.flagSearch.input = '';
    this.flagSearch.choices = [];
    this.flagSearch.hasGroup = false;
  };

  // Long-running script monitoring methods
  private startLongRunningMonitor = () => {
    // Clear any existing timer first to avoid duplicates
    this.clearLongRunningMonitor();

    // Check for custom threshold from environment variables
    this.longRunningThresholdMs = getLongRunningThresholdMs(kitState?.kenvEnv as any, this.longRunningThresholdMs);

    // Skip monitoring for main script or if disabled
    if (
      this.isMainMenu ||
      (kitState?.kenvEnv as any)?.KIT_DISABLE_LONG_RUNNING_MONITOR === 'true' ||
      this.script?.longRunning === true
    ) {
      this.logInfo(
        `Skipping long-running monitor for ${this.scriptName} (main script, disabled, or longRunning metadata)`,
      );
      return;
    }

    // Skip monitoring for idle prompts or prompts without valid scripts
    if (!this.scriptPath || this.scriptPath === '' || !this.scriptName || this.scriptName === 'script-not-set') {
      this.logInfo('Skipping long-running monitor for idle prompt (no valid script)');
      return;
    }

    startLongRunningMonitorFlow(this as any);
  };

  private clearLongRunningMonitor = () => {
    clearLongRunningMonitorFlow(this as any);
  };

  private showLongRunningNotification = () => {
    showLongRunningNotificationFlow(this as any);
  };

  private terminateLongRunningScript = () => {
    terminateLongRunningScriptFlow(this as any);
  };

  boundToProcess = false;
  // Process monitoring
  private processMonitorTimer?: NodeJS.Timeout;
  private processMonitoringEnabled = true;
  private processCheckInterval = 5000; // Check every 5 seconds
  private processConnectionLost = false;
  private lastProcessCheckTime = 0;

  bindToProcess = (pid: number) => {
    if (this.boundToProcess) {
      return;
    }
    this.pid = pid;
    this.boundToProcess = true;
    this.processConnectionLost = false;
    this.lastProcessCheckTime = Date.now();
    this.logInfo(`${pid} -> ${this?.window?.id}: 🔗 Binding prompt to process`);

    // Start monitoring for long-running scripts
    this.startLongRunningMonitor();

    // Start process monitoring
    this.startProcessMonitoring();

    // Listen for process exit events
    this.listenForProcessExit();
  };

  /**
   * Check if this prompt has lost connection to its process
   */
  hasLostProcessConnection = (): boolean => {
    return this.boundToProcess && this.processConnectionLost;
  };

  /**
   * Send notification about lost process connection
   */
  private notifyProcessConnectionLost() {
    if (!this.scriptName || this.scriptName === 'unknown' || this.scriptName === 'script-not-set') {
      this.logWarn(`Process connection lost for unknown script (PID: ${this.pid}) - skipping notification`);
      return;
    }

    // Don't notify for idle prompts or prompts without valid scripts
    if (!this.scriptPath || this.scriptPath === '') {
      this.logWarn(`Process connection lost for idle prompt (PID: ${this.pid}) - skipping notification`);
      return;
    }

    this.logInfo(`Showing process connection lost notification for ${this.scriptName} (PID: ${this.pid})`);

    const connectionLostOptions = buildProcessConnectionLostOptions(
      this.scriptName,
      this.pid,
      process.platform === 'win32',
    );

    const notification = new Notification(connectionLostOptions);

    notification.on('action', (_event, index) => {
      if (index === 0) {
        // Close Prompt
        this.logInfo(`User chose to close disconnected prompt: ${this.scriptName}`);
        this.close('user requested close after connection lost');
      } else if (index === 1) {
        // Keep Open
        this.logInfo(`User chose to keep disconnected prompt open: ${this.scriptName}`);
      } else if (index === 2) {
        // Show Debug Info
        this.logInfo(`User requested debug info for disconnected prompt: ${this.scriptName}`);
        this.showProcessDebugInfo();
      }
    });

    notification.on('click', () => {
      this.focusPrompt();
    });

    notification.show();
  }

  /**
   * Show debug information about the process connection
   */
  private showProcessDebugInfo = () => {
    const debugInfo = buildProcessDebugInfo({
      promptId: this.id,
      windowId: this.window?.id,
      pid: this.pid,
      scriptPath: this.scriptPath,
      scriptName: this.scriptName,
      boundToProcess: this.boundToProcess,
      processConnectionLost: this.processConnectionLost,
      lastProcessCheckTimeIso: new Date(this.lastProcessCheckTime).toISOString(),
      timeSinceLastCheck: Date.now() - this.lastProcessCheckTime,
      isVisible: this.isVisible(),
      isFocused: this.isFocused(),
      isDestroyed: this.isDestroyed(),
    });

    this.logInfo('Process Debug Info:', debugInfo);

    // Also send to all prompts so it can be displayed in any open debug panels
    sendToAllPrompts(AppChannel.DEBUG_INFO, {
      type: 'process-connection-lost',
      data: debugInfo,
    });
  };

  private startProcessMonitoring = () => {
    if (!this.processMonitoringEnabled || this.processMonitorTimer) {
      return;
    }

    // Check if monitoring is disabled via environment variable
    if (!shouldMonitorProcess({ scriptPath: this.scriptPath, scriptName: this.scriptName, kenvEnv: kitState?.kenvEnv as any })) {
      this.logInfo('Skipping process monitoring (disabled or no valid script)');
      return;
    }

    // Get custom check interval if set
    this.processCheckInterval = getProcessCheckInterval(kitState?.kenvEnv as any, this.processCheckInterval);

    monitorStart(this);
  };

  private stopProcessMonitoring = () => {
    monitorStop(this);
  };

  private checkProcessAlive(force = false) {
    this.lastProcessCheckTime = Date.now();
    monitorCheck(this, force);
  }

  private listenForProcessExit = () => {
    monitorListen(this);
  };

  private handleProcessGone() {
    if (!this.boundToProcess) {
      return; // Already handled
    }

    this.logInfo(`Process ${this.pid} is gone. Cleaning up prompt.`);

    // Stop monitoring
    this.stopProcessMonitoring();
    this.clearLongRunningMonitor();

    // Mark as no longer bound
    this.boundToProcess = false;

    // Force close the prompt for process exit scenarios
    // This bypasses all the normal checks that might prevent closing
    if (!this.isDestroyed()) {
      this.close('ProcessGone - force close');

      // If close didn't work (due to cooldowns or other checks), force hide
      if (!(this.closed || this.isDestroyed())) {
        this.hideInstant();
        // Set a short timeout to try closing again
        setTimeout(() => {
          if (!(this.closed || this.isDestroyed())) {
            this.close('ProcessGone - retry force close');
          }
        }, 100);
      }
    }

    // Remove from processes if it's still there (defensive cleanup)
    processes.removeByPid(this.pid, 'process gone - prompt cleanup');

    // Reset the prompt state
    this.resetState();
  }

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
        this.logInfo(`${this?.window?.id} 🎉 Ready because ready emit`);
        resolve();
      });
    });
  };

  emojiActive = false;
  mainMenuPreventCloseOnBlur = false;

  getLogPrefix = () => {
    const scriptName = this.scriptName || 'script-not-set';
    const pid = this.pid || 'pid-not-set';
    const id = this.window?.id || 'window-id-not-set';
    return `${pid}:${id}:${scriptName}:`;
  };

  logInfo = (...args: Parameters<typeof this.logInfo>) => {
    log.info(this.getLogPrefix(), ...args);
  };

  themeLogInfo = (...args: Parameters<typeof themeLog.info>) => {
    themeLog.info(this.getLogPrefix(), ...args);
  };

  logWarn = (...args: Parameters<typeof this.logWarn>) => {
    log.warn(this.getLogPrefix(), ...args);
  };

  logError = (...args: Parameters<typeof this.logError>) => {
    log.error(this.getLogPrefix(), ...args);
  };

  logVerbose = (...args: Parameters<typeof this.logVerbose>) => {
    log.verbose(this.getLogPrefix(), ...args);
  };

  logSilly = (...args: Parameters<typeof log.silly>) => {
    log.silly(this.getLogPrefix(), ...args);
  };

  isWindow = false;

  makeWindow = () => {
    if (kitState.isMac && !this.isWindow) {
      makeWindow(this.window);
      this.isWindow = true;
      this.sendToPrompt(AppChannel.TRIGGER_RESIZE, 'makeWindow');
    }
  };

  onBlur = () => {
    // Register blur operation
    const blurOpId = processWindowCoordinator.registerOperation(
      this.pid,
      WindowOperation.Blur,
      this.window.id
    );

    this.logInfo('🙈 Prompt window blurred');

    this.logInfo(`${this.pid}:${this.scriptName}: 🙈 Prompt window blurred. Emoji active: ${this.emojiActive}`, {
      emojiActive: this.emojiActive,
      focusedEmojiActive: prompts?.focused?.emojiActive,
    });

    // Use visibility controller to handle blur
    handleBlurVisibility(this);

    const isMainScript = getMainScriptPath() === this.scriptPath;
    const isSplashScreen = this.ui === UI.splash;

    // Don't hide splash screen on blur - it's a regular window now
    if (isSplashScreen) {
      this.logInfo('Splash screen blur - keeping window open');
      if (this.window.isVisible()) {
        this.sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
      }
      processWindowCoordinator.completeOperation(blurOpId);
      return;
    }

    if (isMainScript && !this.mainMenuPreventCloseOnBlur) {
      // Don't close main menu if DevTools are being opened
      if (this.devToolsOpening) {
        this.logInfo('Main menu blur ignored - DevTools are opening');
        processWindowCoordinator.completeOperation(blurOpId);
        return;
      }
      this.logInfo('Main script. Make window');
      this.hideAndRemoveProcess();
      processWindowCoordinator.completeOperation(blurOpId);
      return;
    }

    this.makeWindow();

    if (!kitState.isLinux) {
      kitState.emojiActive = false;
    }

    if (!this.shown) {
      processWindowCoordinator.completeOperation(blurOpId);
      return;
    }

    if (this.window.isDestroyed()) {
      processWindowCoordinator.completeOperation(blurOpId);
      return;
    }

    if (this.window.isVisible()) {
      this.sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
    }

    if (os.platform().startsWith('win')) {
      // Complete the blur operation before returning
      processWindowCoordinator.completeOperation(blurOpId);
      return;
    }

    kitState.blurredByKit = false;

    // Complete the blur operation
    processWindowCoordinator.completeOperation(blurOpId);
  };

  initMainPrompt = (reason = 'unknown') => {
    this.initPromptData();
    this.initMainChoices();
    this.initMainPreview();
    this.initMainShortcuts();
    this.initMainFlags();
    this.initTheme();
    this.logInfo(`🚀 Prompt init: ${reason}`);
    this.initPrompt();
  };

  attemptReadTheme = async () => {
    this.themeLogInfo('attemptReadTheme...');
    const cssPath = kenvPath('kit.css');
    try {
      const css = await readFile(cssPath, 'utf8');
      if (css) {
        this.themeLogInfo(`👍 Found ${cssPath}. Sending to prompt ${this.pid}`);
        this.sendToPrompt(AppChannel.CSS_CHANGED, css);
        this.themeLogInfo(css);
      }
    } catch (error) {
      this.themeLogInfo(`👍 No ${cssPath}. Sending empty css to prompt ${this.pid}`);
      this.sendToPrompt(AppChannel.CSS_CHANGED, '');
    }
    updateTheme();
  };

  constructor() {
    const getKitConfig = (event) => {
      event.returnValue = {
        kitPath: kitPath(),
        mainScriptPath: getMainScriptPath(),
        pid: this.pid,
      };
    };

    const isSplashScreen = this.ui === UI.splash;
    const options = getPromptOptions(isSplashScreen);
    this.window = new BrowserWindow(options);

    // In development, wrap webContents.send to capture serialization issues from any sender
    if (process.env.NODE_ENV === 'development') {
      try {
        const originalSend = this.window.webContents.send.bind(this.window.webContents);
        (this.window.webContents as any).send = (channel: unknown, data?: unknown) => {
          // Validate structured cloneability before actually sending
          try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore Node 18+ provides structuredClone; Electron main also supports it
            structuredClone?.(data);
          } catch (cloneError) {
            const err = cloneError as Error;
            const summarize = (value: unknown) => {
              const t = typeof value;
              if (value === null || t !== 'object') return { type: t, preview: String(value) };
              try {
                const ctor = (value as any)?.constructor?.name || 'object';
                const keys = Object.keys(value as any).slice(0, 20);
                const sample: Record<string, string> = {};
                for (const k of keys) {
                  const v = (value as any)[k];
                  sample[k] = typeof v === 'object' ? ((v as any)?.constructor?.name || 'object') : typeof v;
                }
                return { type: ctor, keys, sampleTypes: sample };
              } catch {
                return { type: 'object', note: 'Could not inspect keys' };
              }
            };
            this.logError('webContents.send: Failed to serialize arguments', {
              channel: String(channel),
              message: err?.message,
              dataSummary: summarize(data),
            });
            throw cloneError;
          }
          return originalSend(String(channel), data);
        };
      } catch (error) {
        this.logWarn('Failed to wrap webContents.send for dev diagnostics', { error: (error as Error)?.message });
      }
    }

    // Register window creation
    const createOpId = processWindowCoordinator.registerOperation(
      this.pid,
      WindowOperation.Create,
      this.window.id
    );
    // Complete immediately as window is created
    processWindowCoordinator.completeOperation(createOpId);

    this.window.webContents.ipc.on(AppChannel.GET_KIT_CONFIG, getKitConfig);

    this.sendToPrompt = (channel: Channel | AppChannel, data) => {
      log.silly(`sendToPrompt: ${String(channel)}`, data);

      // Log [SCRIPTS RENDER] events
      if (
        channel === AppChannel.SET_CACHED_MAIN_STATE ||
        channel === AppChannel.SET_CACHED_MAIN_SCORED_CHOICES ||
        channel === AppChannel.SET_CACHED_MAIN_SHORTCUTS ||
        channel === AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS ||
        channel === AppChannel.SET_CACHED_MAIN_PREVIEW
      ) {
        this.logInfo(`[SCRIPTS RENDER] Prompt ${this.pid}:${this.id} sending ${String(channel)} to renderer`);
      }

      // Special logging for TERM_CAPTURE_READY
      if (channel === AppChannel.TERM_CAPTURE_READY) {
        this.logInfo('🔍 [CAPTURE] sendToPrompt TERM_CAPTURE_READY:', {
          hasData: !!data,
          dataKeys: data ? Object.keys(data) : [],
          textLength: data?.text?.length || 0,
          pid: data?.pid,
          exitCode: data?.exitCode,
        });
      }

      if (!this?.window || this?.window?.isDestroyed()) {
        this.logError('sendToPrompt: Window is destroyed. Skipping sendToPrompt.');
        return;
      }

      if (this?.window?.webContents?.send) {
        if (!channel) {
          this.logError('channel is undefined', { data });
          return;
        }
        try {
          this.window?.webContents.send(String(channel), data);
        } catch (error) {
          const err = error as Error;
          const isSerializationError = typeof err?.message === 'string' && err.message.includes('Failed to serialize arguments');
          const dataSummary = (() => {
            const type = typeof data;
            if (data === null || type !== 'object') return { type, preview: String(data) };
            try {
              const keys = Object.keys(data as any);
              const sample: Record<string, string> = {};
              for (const k of keys.slice(0, 10)) {
                const v = (data as any)[k];
                const vt = typeof v;
                sample[k] = vt === 'object' ? (v?.constructor?.name || 'object') : vt;
              }
              return { type: 'object', keys: keys.slice(0, 50), sampleTypes: sample };
            } catch {
              return { type: 'object', note: 'Could not inspect keys' };
            }
          })();
          this.logError(isSerializationError ? 'sendToPrompt: Failed to serialize arguments' : 'sendToPrompt error', {
            channel: String(channel),
            message: err?.message,
            dataSummary,
          });
        }
      }
    };

    // mark handlers as used to satisfy linter after extraction
    void this.beforeInputHandler;

    // Ensure methods referenced by external monitor helpers are marked as used for linter
    void this.notifyProcessConnectionLost;
    void this.checkProcessAlive;
    void this.handleProcessGone;

    this.logInfo(`🎬 Init appearance: ${kitState.appearance}`);
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
        this.logError(error);
      }
    }

    setupNavigationHandlers(this);

    this.window.once('ready-to-show', async () => {
      this.logInfo('👍 ready-to-show');
      if (!this.window || this.window.isDestroyed()) {
        this.logInfo('👍 ready-to-show: window is destroyed');
        return;
      }

      if (kitState.isWindows && kitState.kenvEnv?.KIT_WINDOWS_OPACITY !== 'false') {
        this.setIgnoreMouseEvents(true);
        this.setOpacity(0.0);
        this.window.showInactive();
      }

      const handler = () => {
        this.logInfo('👍 INPUT_READY');
      };

      this.window.webContents.ipc.on(AppChannel.INPUT_READY, handler);
      this.window.webContents.ipc.emit(AppChannel.INPUT_READY);

      this.themeLogInfo('👍 Ready to show');
      await this.attemptReadTheme();
    });

    setupDomAndFinishLoadHandlers(this);

    setupWindowLifecycleHandlers(this);

    this.window.webContents?.setWindowOpenHandler(({ url }) => {
      this.logInfo(`Opening ${url}`);

      // Only allow websites to open in the browser
      if (!url.startsWith('http')) {
        return { action: 'deny' };
      }

      shell.openExternal(url);

      return { action: 'deny' };
    });

    loadPromptHtml(this);

    // Intercept DevTools keyboard shortcuts to set flag before blur happens
    this.window.webContents?.on('before-input-event', (_event, input) => {
      if (isDevToolsShortcut(input)) {
        this.devToolsOpening = true;
        // Reset flag after a short delay
        setTimeout(() => {
          this.devToolsOpening = false;
        }, 200);
      }
    });

    setupDevtoolsHandlers(this);

    // lifecycle handlers moved

    this.window.on('focus', () => {
      this.logInfo('👓 Focus bounds:');

      // Use visibility controller to handle focus
      handleBlurVisibility(this);

      if (!kitState.isLinux) {
        this.logVerbose('👓 Registering emoji shortcut');
        kitState.emojiActive = true;
      }
    });

    this.window.on('hide', () => {
      this.logInfo('🫣 Prompt window hidden');
      if (!kitState.isLinux) kitState.emojiActive = false;
    });

    this.window.on('show', () => {
      this.logInfo('😳 Prompt window shown');
    });

    setupResizeAndMoveListeners(this);
  }

  appearance: 'light' | 'dark' | 'auto' = 'auto';
  setAppearance = (appearance: 'light' | 'dark' | 'auto') => {
    if (this.appearance === appearance || this.window.isDestroyed()) {
      return;
    }
    this.logInfo(`${this.pid}:${this.scriptName}: 👀 Setting appearance to ${appearance}`);
    setAppearance(this.window, appearance);
    this.appearance = appearance;
  };

  forcePromptToCenter = () => {
    this.window?.setPosition(0, 0);
    this.window?.center();
    this.focusPrompt();
  };

  reload = () => {
    this.logInfo('Reloading prompt window...');
    if (this.window.isDestroyed()) {
      this.logWarn('Prompt window is destroyed. Not reloading.');
      return;
    }

    this.window.reload();
  };

  getBounds = () => {
    if (this?.window && !this.window.isDestroyed()) {
      return this.window.getBounds();
    }
    this.logError(`${this.pid}:${this.scriptName}: 🫣 Prompt window is destroyed. Not getting bounds.`);
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
    this.logError(`${this.pid}:${this.scriptName}: 🫣 Prompt window is destroyed. Not getting focus.`);
    return false;
  };

  clearCache = () => {
    this.logInfo('--> 📦 CLEARING CACHE, Not main!');
    this.sendToPrompt(AppChannel.CLEAR_CACHE, {});
  };

  initShowPrompt = () => initShowPromptFlow(this);

  hide = () => hideFlow(this);

  onHideOnce = (fn: () => void) => onHideOnceFlow(this, fn);

  showAfterNextResize = false;

  showPrompt = () => showPromptFlow(this);

  moveToMouseScreen = () => moveToMouseScreenFlow(this);

  initBounds = (forceScriptPath?: string, _show = false) => initBoundsFlow(this, forceScriptPath);

  blurPrompt = () => blurPromptFlow(this);

  initMainBounds = () => initMainBoundsFlow(this);

  setBounds = (bounds: Partial<Rectangle>, reason = '') => {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    this.logInfo(`${this.pid}: 🆒 Attempt ${this.scriptName}: setBounds reason: ${reason}`, bounds);
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
          this.logInfo(`🔀 Prompt ${prompt.id} has same x and y as ${this.id}. Scooching x and y!`);
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
      this.logInfo('📐 No change in bounds, ignoring', {
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

    this.logInfo(
      `${this.pid}: boundsScreen.id ${boundsScreen.id} mouseScreen.id ${mouseScreen.id} boundsOnMouseScreen ${boundsOnMouseScreen ? 'true' : 'false'} isVisible: ${this.isVisible() ? 'true' : 'false'}`,
    );

    let currentScreen = boundsScreen;
    if (boundsScreen.id !== mouseScreen.id && boundsOnMouseScreen) {
      this.logInfo('🔀 Mouse screen is different, but bounds are within display. Using mouse screen.');
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

    // this.logInfo(`📐 setBounds: ${reason}`, {
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

      this.logInfo(`${this.pid}: Apply ${this.scriptName}: setBounds reason: ${reason}`, bounds);

      const rounded = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };

      const peers = Array.from(prompts).map((p) => ({ id: p.id, bounds: p.getBounds() }));
      const finalBounds = adjustBoundsToAvoidOverlap(peers, this.id, rounded);

      // this.logInfo(`Final bounds:`, finalBounds);

      // TODO: Windows prompt behavior
      // if (kitState.isWindows) {
      //   if (!this.window?.isFocusable()) {
      //     finalBounds.x = OFFSCREEN_X;
      //     finalBounds.y = OFFSCREEN_Y;
      //   }
      // }

      this.logInfo('setBounds', finalBounds);

      const titleBarHeight = getTitleBarHeight(this.window);
      const minHeight = ensureMinWindowHeight(finalBounds.height, titleBarHeight);
      if (minHeight !== finalBounds.height) {
        this.logInfo('too small, setting to min height', PROMPT.INPUT.HEIGHT.XS);
        finalBounds.height = minHeight;
      }

      applyWindowBounds(this.window, this.id, finalBounds, this.sendToPrompt as any);
      this.promptBounds = { id: this.id, ...this.window.getBounds() } as any;
    } catch (error) {
      this.logInfo(`setBounds error ${reason}`, error);
    }
  };

  togglePromptEnv = (envName: string) => togglePromptEnvFlow(this as any, envName);

  centerPrompt = () => {
    this.window.center();
  };

  getPromptBounds = () => {
    return this.window?.getBounds();
  };

  resetWindow = () => {
    centerThenFocus(this.window, this.focusPrompt);
  };

  pingPrompt = async (channel: AppChannel, data?: any) => (await import('./prompt.ipc-utils')).pingPrompt(this as any, channel, data);

  savePromptBounds = (scriptPath: string, bounds: Rectangle, b: number = Bounds.Position | Bounds.Size) => {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    if (kitState.kenvEnv?.KIT_CACHE_PROMPT === 'false') {
      this.logInfo('Cache prompt disabled. Ignore saving bounds');
      return;
    }
    this.logInfo(`${this.pid}: 💾 Save Initial Bounds: ${scriptPath}`, bounds);
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
      this.logError(error);
    }
  };

  isDestroyed = () => this.window?.isDestroyed();

  getFromPrompt = <K extends keyof ChannelMap>(child: ChildProcess, channel: K, data?: ChannelMap[K]) => (async () => {
    const { getFromPrompt } = await import('./prompt.ipc-utils');
    getFromPrompt(this as any, child, channel, data);
  })();

  private shouldApplyResize(resizeData: ResizeData): boolean {
    if (kitState.isLinux) {
      return false;
    }
    if (!(resizeData.forceHeight || this.allowResize || resizeData.forceResize)) {
      return false;
    }
    if (this.modifiedByUser) {
      return false;
    }
    if (this.window?.isDestroyed()) {
      return false;
    }
    return true;
  }

  private handleSettle() {
    if (!this?.window || this.window?.isDestroyed()) {
      return;
    }

    this.logInfo(`📬 ${this.pid} 📐 Resize settled. Saving bounds`);
    this.saveCurrentPromptBounds();
  }

  private calculateTargetDimensions(
    resizeData: ResizeData,
    currentBounds: Electron.Rectangle,
  ): Pick<Rectangle, 'width' | 'height'> {
    return calculateTargetDimensions(resizeData, currentBounds);
  }

  private calculateTargetPosition(
    currentBounds: Electron.Rectangle,
    targetDimensions: Pick<Rectangle, 'width' | 'height'>,
    cachedBounds?: Partial<Electron.Rectangle>,
  ): Pick<Rectangle, 'x' | 'y'> {
    return calculateTargetPosition(currentBounds, targetDimensions, cachedBounds);
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

    // refactor: removed prevResizeData tracking

    if (this.showAfterNextResize) {
      this.logInfo('🎤 Showing prompt after next resize...');
      this.showAfterNextResize = false;
      this.showPrompt();
    }

    if (resizeData.reason === 'SETTLE') {
      setTimeout(() => this.handleSettle(), 50);
    }

    const currentBounds = this.window.getBounds();

    this.logInfo(`📐 Resize main height: ${resizeData.mainHeight}`);

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

    // refactor: removed hadPreview tracking
  };

  updateShortcodes = () => {
    const shortcodes = [
      ...Array.from(this.kitSearch.shortcodes.keys(), (k) => `${k} `),
      ...this.kitSearch.triggers.keys(),
    ];

    this.logInfo({
      shortcodesSize: shortcodes.length,
      triggersSize: this.kitSearch.triggers.size,
    });

    this.logInfo(`${this.pid}: Shortcodes:`, shortcodes.join(', '));

    this.sendToPrompt(Channel.SET_SHORTCODES, shortcodes);
  };

  checkPromptDataBounds = (promptData: PromptData) => {
    applyPromptDataBounds(this.window, promptData);
  };

  refocusPrompt = () => {
    const visible = this.isVisible();
    const waitForResize = this.ui === UI.arg || this.ui === UI.div;
    const dontWaitForResize = !waitForResize || this.promptData?.grid || kitState.isLinux;

    this.logInfo('👀 Attempting to refocus prompt', {
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
      this.logInfo(`👍 ${this.pid}: ${this.ui} ready. Focusing prompt.`);
      this.focusPrompt();
      this.hasBeenHidden = false;
    }
  };

  setPromptData = async (promptData: PromptData) => {
    // log.silly(`🔥 Setting prompt data: ${promptData.scriptPath}`, JSON.stringify(promptData, null, 2));
    this.promptData = promptData;

    const setPromptDataHandler = debounce(
      (_x, { ui }: { ui: UI }) => {
        this.logInfo(`${this.pid}: Received SET_PROMPT_DATA from renderer. ${ui} Ready!`);
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

      // this.logInfo(`termConfig`, termConfig);
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
      this.logInfo(`💝 Caching prompt data: ${this?.scriptPath}`);
      preloadPromptDataMap.set(this.scriptPath, {
        ...promptData,
        input: promptData?.keyword ? '' : promptData?.input || '',
        keyword: '',
      });
    }

    if (promptData.flags && typeof promptData.flags === 'object') {
      this.logInfo(`🏳️‍🌈 Setting flags from setPromptData: ${Object.keys(promptData.flags)}`);
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
      this.logInfo(`📌 setPromptAlwaysOnTop from promptData: ${promptData.alwaysOnTop ? 'true' : 'false'}`);

      this.setPromptAlwaysOnTop(promptData.alwaysOnTop, true);
    }

    if (typeof promptData?.skipTaskbar === 'boolean') {
      this.setSkipTaskbar(promptData.skipTaskbar);
    }

    this.allowResize = promptData?.resize;
    kitState.shortcutsPaused = promptData.ui === UI.hotkey;

    this.logVerbose(`setPromptData ${promptData.scriptPath}`);

    this.id = promptData.id;
    this.ui = promptData.ui;

    if (this.kitSearch.keyword) {
      promptData.keyword = this.kitSearch.keyword || this.kitSearch.keyword;
    }

    this.sendToPrompt(Channel.SET_PROMPT_DATA, promptData);

    const isMainScript = getMainScriptPath() === promptData.scriptPath;

    if (this.firstPrompt && !isMainScript) {
      this.logInfo(`${this.pid} Before initBounds`);
      this.initBounds();
      this.logInfo(`${this.pid} After initBounds`);
      // TODO: STRONGLY consider waiting for SET_PROMPT_DATA to complete and the UI to change before focusing the prompt
      // this.focusPrompt();
      this.logInfo(`${this.pid} Disabling firstPrompt`);
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
      // Since we now properly wait for backspaces to complete in deleteText(),
      // we only need a minimal delay for UI stabilization
      const timeout = this.script?.snippetdelay || 0; // Reduced from 280ms to 50ms

      this.logInfo(`Snippet delay: ${timeout}ms for snippet: ${this.script?.expand || this.script?.snippet || ''}`);
      // eslint-disable-next-line promise/param-names
      await new Promise((r) => setTimeout(r, timeout));
      kitState.hasSnippet = false;
    }

    const visible = this.isVisible();
    this.logInfo(`${this.id}: visible ${visible ? 'true' : 'false'} 👀`);

    // Default behavior: show the prompt unless explicitly told not to
    const shouldShow = promptData?.show !== false;

    if (!visible && shouldShow) {
      this.logInfo(`${this.id}: Prompt not visible but should show`);
      // For snippets and other triggers that don't pre-show the prompt,
      // we need to show it immediately when setPromptData is called
      if (!this.firstPrompt) {
        this.showPrompt();
      } else {
        this.showAfterNextResize = true;
      }
    } else if (visible && !shouldShow) {
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
        this.logInfo('Prompt window in bounds.');
      } else {
        this.logInfo('Prompt window out of bounds. Clearing cache and resetting.');
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
      // this.logWarn({
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
    //   this.logInfo(`🙈 Hiding prompt window`);
    //   makeWindow(this.window);
    // }
    this.setPromptAlwaysOnTop(false);
    if (!this.isVisible()) {
      return;
    }

    this.logInfo('🙈 Hiding prompt window');

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
    this.logInfo(`Attempt Hide: ${reason}`);

    if (reason === HideReason.NoScript || reason === HideReason.Escape || reason === HideReason.BeforeExit) {
      this.actualHide();

      this.clearSearch();
      invokeSearch(this, '', 'maybeHide, so clear');
      return;
    }

    if (reason === HideReason.PingTimeout) {
      this.logInfo('⛑ Attempting recover...');

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
      this.logInfo(`Hiding because ${reason}`);
      if (!kitState.preventClose) {
        this.actualHide();
      }
    }
  };

  saveCurrentPromptBounds = () => {
    if (!this?.window || this.window?.isDestroyed()) {
      this.logInfo(`${this.pid} Prompt window is destroyed. Not saving bounds for ${this.scriptPath}`);
      return;
    }
    // if (kitState.promptCount === 1) {
    const currentBounds = this.window?.getBounds();
    // this.logInfo(
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
        this.logError(error);
      }
    } else {
      this.logInfo('Custom vibrancy not supported on this platform');
    }
  };

  setPromptProp = (data: { prop: { key: string; value: any } }) => {
    const { key, value }: any = data.prop;
    log.info(`${this.pid}: setPromptProp`, { key, value });
    log.info(`this.window[${key}](${JSON.stringify(value)})`);
    (this.window as any)[key](value);
  };

  hasBeenFocused = false;
  focusPrompt = () => {
    // Register focus operation
    const focusOpId = processWindowCoordinator.registerOperation(
      this.pid,
      WindowOperation.Focus,
      this.window.id
    );

    this.hasBeenFocused = true;
    if (!this.window.focusable) {
      this.logInfo(`${this.pid}: Setting focusable to true`);
      this.window?.setFocusable(true);
    }
    if (this.window && !this.window.isDestroyed() && !this.window?.isFocused()) {
      this.logInfo(`${this.pid}: focusPrompt`);
      try {
        this.setIgnoreMouseEvents(false);
        this.setOpacity(1);

        // Splash screen is a regular window, use normal focus
        if (this.ui === UI.splash || this.isWindow) {
          this.window?.show();
          this.window?.focus();
        } else if (kitState.isMac) {
          makeKeyPanel(this.window);
        } else {
          this.window?.showInactive();
          this.window?.focus();
        }

        // Complete the focus operation
        processWindowCoordinator.completeOperation(focusOpId);
      } catch (error) {
        this.logError(error);
        // Complete the operation even on error
        processWindowCoordinator.completeOperation(focusOpId);
      }
    } else {
      // Complete the operation if we didn't need to focus
      processWindowCoordinator.completeOperation(focusOpId);
    }
  };

  forceFocus = () => {
    this.logInfo(`${this.pid}: forceFocus`);

    // Don't steal focus when DevTools are open
    if (this.window?.webContents?.isDevToolsOpened()) {
      this.logInfo('DevTools are open - skipping forceFocus');
      return;
    }

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
    // Never set alwaysOnTop for splash screen - it's a regular window now
    if (this.ui === UI.splash) {
      this.logInfo('alwaysOnTop disabled for splash screen (regular window)');
      return;
    }

    if (kitState.isMac) {
      this.logInfo('alwaysOnTop is disabled on mac');
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

    // this.logInfo(`function: setPromptAlwaysOnTop: ${onTop ? 'true' : 'false'}`);
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
        this.logInfo({ onTop });
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
    this.logSilly('function: devToolsVisible');
    return this.window.webContents.isDevToolsOpened();
  };

  isFocused = () => {
    if (!this.window || this.window.isDestroyed()) {
      this.logWarn(`${this.pid}: isFocused: window is destroyed`);
      return false;
    }
    const focused = this.window?.isFocused();
    this.logSilly(`function: isFocused: ${focused ? 'true' : 'false'}`);
    return focused;
  };

  getCurrentScreenFromMouse = (): Display => {
    if (this.window?.isVisible() && !this.firstPrompt) {
      const position = this.window?.getPosition();
      if (position) {
        const [x, y] = position;
        const currentScreen = screen.getDisplayNearestPoint({ x, y });
        this.logInfo(`Current screen from mouse: ${currentScreen.id}`, {
          visible: this.isVisible,
          firstPrompt: this.firstPrompt,
        });
      }
    }
    const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.logInfo(`Current screen from mouse: ${currentScreen.id}`, {
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

    // Clear long-running monitor when resetting
    this.clearLongRunningMonitor();

    // Stop process monitoring when resetting
    this.stopProcessMonitoring();

    // Only set as idle if we're not currently in the process of being destroyed
    // and if there isn't already an idle prompt
    if (!(this.closed || this.window?.isDestroyed()) && prompts.idle === null) {
      prompts.setIdle(this);
    }

    this.logInfo(`${this.pid}: 🚀 Prompt re-initialized`);
    const idles = getIdles();
    this.logInfo(`${this.pid}: 🚀 Idles: ${idles.length}. Prompts: ${prompts.getPromptMap().size}`);
    // Logs all idle pids and prompts ids in a nice table format
    this.logInfo(
      `Idles: ${idles.map((idle) => `${idle.pid}: ${prompts.get(idle.pid)?.window?.id || 'none'}`).join(',')}`,
    );

    const browserWindows = BrowserWindow.getAllWindows();
    this.logInfo(`Browser windows: ${browserWindows.map((window) => window.id).join(',')}`);

    const allPrompts = [...prompts];
    this.logInfo(`Prompts: ${allPrompts.map((prompt) => `${prompt.pid}: ${prompt.window?.id}`).join('\n')}`);

    this.logInfo(`Prompt map: ${allPrompts.map((prompt) => `${prompt.pid}: ${prompt.window?.id}`).join('\n')}`);

    this.initMainPreview();
    this.initMainShortcuts();
    this.initMainChoices();
    this.initMainFlags();
    return;
  };

  scriptSet = false;

  setScript = (script: Script, pid: number, _force = false): 'denied' | 'allowed' => {
    const { preview, scriptlet, inputs, tag, ...serializableScript } = script as Scriptlet;

    log.info(`${this.pid}: setScript`, serializableScript, JSON.stringify(script));

    if (typeof script?.prompt === 'boolean' && script.prompt === false) {
      this.hideInstant();
      this.resetState();
      return 'denied';
    }

    this.scriptSet = true;
    this.logInfo(`${this.pid}: ${pid} setScript`, serializableScript, {
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
    //   this.logInfo(`${this.pid}: Script already set. Ignore`);
    //   return 'denied';
    // }

    // prevScriptPath = script.filePath;
    // prevPid = pid;

    // const { prompt } = processes.find((p) => p.pid === pid) as ProcessAndPrompt;
    // if (!prompt) return 'denied';

    this.sendToPrompt(Channel.SET_PID, pid);

    this.scriptPath = serializableScript.filePath;
    kitState.hasSnippet = Boolean(serializableScript?.snippet || serializableScript?.expand);
    // if (promptScript?.filePath === script?.filePath) return;

    this.script = serializableScript;

    // this.logInfo(`${this.pid}: sendToPrompt: ${Channel.SET_SCRIPT}`, serializableScript);
    this.sendToPrompt(Channel.SET_SCRIPT, serializableScript);

    // Now that we have the script name and path, start long-running monitoring if bound to a process
    if (this.boundToProcess && this.pid) {
      this.logInfo(`Starting long-running monitor after script set: ${this.scriptName}`);
      this.startLongRunningMonitor();
    }

    if (serializableScript.filePath === getMainScriptPath()) {
      emitter.emit(KitEvent.MainScript, serializableScript);
    }

    this.logInfo('setScript done');

    return 'allowed';
  };

  private hideInstantCoolingDown = false;

  hideInstant = (forceHide = false) => {
    // If we're currently cooling down, just ignore this call unless forced
    if (this.hideInstantCoolingDown && !forceHide) {
      this.logInfo(`${this.pid}: "hideInstant" still cooling down`);
      return;
    }

    // Start cooling down for 100ms (skip if forced)
    if (!forceHide) {
      this.hideInstantCoolingDown = true;
      setTimeout(() => {
        this.hideInstantCoolingDown = false;
      }, 100);
    }

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
  close = (reason = 'unknown') => {
    this.logInfo(`${this.pid}: "close" because ${reason}`);

    // Register close operation
    const closeOpId = processWindowCoordinator.registerOperation(
      this.pid,
      WindowOperation.Close,
      this.window?.id || 0
    );

    // Clear long-running monitor when closing
    this.clearLongRunningMonitor();

    // Stop process monitoring when closing
    this.stopProcessMonitoring();

    // Skip focus checks if closing due to process exit
    const isProcessExit =
      reason.includes('process-exit') ||
      reason.includes('TERM_KILL') ||
      reason.includes('removeByPid') ||
      reason.includes('ProcessGone');

    if (!(kitState.allowQuit || isProcessExit)) {
      if (this.boundToProcess) {
        this.logInfo(`${this.pid}: "close" bound to process`);
        if (this.hasBeenFocused) {
          this.logInfo(`${this.pid}: "close" hasBeenFocused`);
        } else {
          this.logInfo(`${this.pid}: "close" !hasBeenFocused`);
          this.resetState();
          processWindowCoordinator.completeOperation(closeOpId);
          return;
        }
      } else {
        processWindowCoordinator.completeOperation(closeOpId);
        return;
      }
    }

    if (this.closed) {
      processWindowCoordinator.completeOperation(closeOpId);
      return;
    }
    this.closed = true;
    if (!this.window || this.window.isDestroyed()) {
      processWindowCoordinator.completeOperation(closeOpId);
      return;
    }

    this.logInfo(`${this.pid} ${this.window.id} 👋 Close prompt`);
    try {
      if (kitState.isMac) {
        this.hideInstant(isProcessExit);
      }

      this.sendToPrompt = () => { };

      try {
        if (!kitState.isMac) {
          // This was causing nasty crashes on mac
          this.window.setClosable(true);
        }
        prepForClose(this.window); // Ensure class is reverted
        this.window.close();
        this.logInfo(`${this?.pid}: window ${this?.window?.id}: closed`);
      } catch (error) {
        this.logError(error);
      }

      setImmediate(() => {
        try {
          // Register destroy operation
          const destroyOpId = processWindowCoordinator.registerOperation(
            this.pid,
            WindowOperation.Destroy,
            this.window?.id || 0
          );

          this.window.destroy();

          // Complete the destroy operation
          processWindowCoordinator.completeOperation(destroyOpId);
        } catch (error) {
          this.logError(error);
        }
      });
    } catch (error) {
      this.logError(error);
    }

    const sinceLast = differenceInHours(Date.now(), kitState.previousDownload);
    this.logInfo(`Hours since sync: ${sinceLast}`);
    if (sinceLast > 6) {
      kitState.previousDownload = new Date();
    }

    // Complete the close operation
    processWindowCoordinator.completeOperation(closeOpId);

    return;
  };

  initPromptData = async () => {
    // TODO: Needed?
    // this.sendToPrompt(Channel.SET_PROMPT_DATA, kitCache.promptData);
  };

  initMainChoices = () => {
    // TODO: Reimplement cache?
    this.logInfo(`${this.pid}: Caching main scored choices: ${kitCache.choices.length}`);
    this.logInfo(
      'Most recent 3:',
      kitCache.choices.slice(1, 4).map((c) => c?.item?.name),
    );

    if (this.window && !this.window.isDestroyed()) {
      this.sendToPrompt(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, kitCache.choices);
    }
    // this.sendToPrompt(Channel.SET_SCORED_CHOICES, kitCache.choices);
  };

  initMainPreview = () => {
    if (!this.window || this.window.isDestroyed()) {
      this.logWarn('initMainPreview: Window is destroyed. Skipping sendToPrompt.');
      return;
    }
    // this.logInfo({
    //   preview: kitCache.preview,
    // });
    this.sendToPrompt(AppChannel.SET_CACHED_MAIN_PREVIEW, kitCache.preview);
    // this.sendToPrompt(Channel.SET_PREVIEW, kitCache.preview);
  };

  initMainShortcuts = () => {
    if (this.window && !this.window.isDestroyed()) {
      this.sendToPrompt(AppChannel.SET_CACHED_MAIN_SHORTCUTS, kitCache.shortcuts);
    }
    // this.sendToPrompt(Channel.SET_SHORTCUTS, kitCache.shortcuts);
  };

  initMainFlags = () => {
    if (this.window && !this.window.isDestroyed()) {
      this.sendToPrompt(AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS, kitCache.scriptFlags);
    }
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
    this.logInfo(`🏋️‍♂️ Preload promptData for ${promptData?.scriptPath} with input:${input}`);
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
    if (promptData.flags && typeof promptData.flags === 'object') {
      this.logInfo(`🏴‍☠️ Setting flags from preloadPromptData: ${Object.keys(promptData.flags)}`);
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
      this.logInfo(`${this.pid}: 🏋️‍♂️ attemptPreload: ${promptScriptPath}`, {
        hasData: cachedPromptData ? 'true' : 'false',
      });

      if (isMainScript) {
      } else if (cachedPromptData) {
        this.logInfo(`🏋️‍♂️ Preload prompt: ${promptScriptPath}`, { init, show });

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
          this.logInfo(`🏋️‍♂️ Preload choices: ${promptScriptPath}`, choices.length);
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
            this.logInfo(`${this.pid}: 🏋️‍♂️ Preload preview: ${promptScriptPath}`);
          }
          this.sendToPrompt(Channel.SET_PREVIEW, preview || closedDiv);

          this.preloaded = promptScriptPath;
        } else {
          this.logInfo(`No cached choices for ${promptScriptPath}`);
          this.preloaded = '';
        }
      }

      this.logInfo('end of attemptPreload. Assigning preloaded');
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
      this.logError(`${this.pid}: ${this.scriptName}: Escape pressed, but no script path. Killing process and prompt.`);
      processes.removeByPid(this.pid, 'prompt exit cleanup');
      emitter.emit(KitEvent.KillProcess, this.pid);
      this.hide();
      return;
    }

    const currentTime = Date.now();
    if (currentTime - this.lastEscapePressTime <= 300) {
      this.escapePressCount += 1;
      if (this.escapePressCount === 4) {
        this.logInfo('Escape pressed 4 times quickly, reloading');
        this.window.reload();
        this.escapePressCount = 0;
      }
    } else {
      this.escapePressCount = 1;
    }
    this.lastEscapePressTime = currentTime;
  };

  private shouldClosePromptOnInitialEscape = (isEscape: boolean): boolean => {
    return computeShouldCloseOnInitialEscape(this.firstPrompt, this.isMainMenu, isEscape, this.wasActionsJustOpen);
  };

  private hideAndRemoveProcess = () => {
    this.hideInstant();
    processes.removeByPid(this.pid, 'prompt close cleanup');
  };

  private beforeInputHandler = (_event, input: Input) => {
    if (input.type !== 'keyDown' || !input.key) {
      return;
    }

    // this.logInfo(`${this.pid}: ${this.scriptName}: before-input-event`, { input });

    const isW = input.key === 'w';
    const isEscape = input.key === 'Escape';

    if (isEscape) {
      this.logInfo(`${this.pid}: Escape received by prompt`);
      this.handleEscapePress();
    }

    const shouldCloseOnInitialEscape = this.shouldClosePromptOnInitialEscape(isEscape);
    // this.logInfo(`${this.pid}: shouldCloseOnInitialEscape: ${shouldCloseOnInitialEscape}`);
    if (isCloseCombo(input as any, kitState.isMac) || shouldCloseOnInitialEscape) {
      this.logInfo(`${this.pid}: Closing prompt window`);
      if (isW) {
        this.logInfo(`Closing prompt window with ${kitState.isMac ? '⌘' : '⌃'}+w`);
      } else if (isEscape) {
        this.logInfo('Closing prompt window with escape');
      }
      this.hideAndRemoveProcess();
      // I don't think these are needed anymore, but leaving them in for now
      this.logInfo(`✋ Removing process because of escape ${this.pid}`);

      // emitter.emit(KitEvent.KillProcess, this.pid);
      // event.preventDefault();
      return;
    }
  };
}

export const makeSplashWindow = (_window?: BrowserWindow) => {
  // No longer needed - splash screen is now a regular window
  // that doesn't need special handling when closing
  log.info('👋 Splash window close - no special handling needed');
};
