/**
 * BasePrompt - Abstract base class for all prompt types
 *
 * This class contains shared functionality used by both MainPrompt (app launcher)
 * and ScriptPrompt (user scripts). The polymorphic design eliminates isMainScript
 * conditionals throughout the codebase.
 */

import type { ChildProcess } from 'node:child_process';
import EventEmitter from 'node:events';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { getMainScriptPath, kenvPath, kitPath } from '@johnlindquist/kit/core/utils';
import type { Choice, PromptBounds, PromptData, Script, Scriptlet } from '@johnlindquist/kit/types/core';
import type { ChannelMap } from '@johnlindquist/kit/types/kitapp';
import { differenceInHours } from 'date-fns';
import type { Display, Input, Rectangle } from 'electron';
import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell, TouchBar } from 'electron';
import { debounce } from 'lodash-es';
import { closedDiv, noScript, ZOOM_LEVEL } from '../../shared/defaults';
import { AppChannel } from '../../shared/enums';
import { emitter, KitEvent } from '../../shared/events';
import type { ResizeData } from '../../shared/types';
import { sendToAllPrompts } from '../channel';
import { promptLog as log, perf, themeLog } from '../logs';
import { getIdles, processes, updateTheme } from '../process';
import { processWindowCoordinator, WindowOperation } from '../process-window-coordinator';
import { applyPromptBounds } from '../prompt.bounds-apply';
import { applyPromptDataBounds } from '../prompt.bounds-utils';
import { clearPromptCacheFor } from '../prompt.cache';
import { computeShouldCloseOnInitialEscape, isDevToolsShortcut } from '../prompt.focus-utils';
import { actualHideImpl, isVisibleImpl, maybeHideImpl } from '../prompt.hide-utils';
import { initPromptImpl, initThemeImpl } from '../prompt.init-main';
import {
  loadPromptHtml,
  setupDevtoolsHandlers,
  setupDomAndFinishLoadHandlers,
  setupNavigationHandlers,
  setupWindowLifecycleHandlers,
} from '../prompt.init-utils';
import { isCloseCombo } from '../prompt.input-utils';
import { clearLongRunningMonitorFlow, startLongRunningMonitorFlow } from '../prompt.long-running';
import { getPromptOptions, type PromptWindowMode } from '../prompt.options';
import {
  checkProcessAliveImpl,
  handleProcessGoneImpl,
  listenForProcessExitImpl,
  notifyProcessConnectionLostImpl,
  startProcessMonitoringImpl,
  stopProcessMonitoringImpl,
} from '../prompt.process-connection';
import { getLongRunningThresholdMs } from '../prompt.process-utils';
import { setupResizeAndMoveListeners } from '../prompt.resize-listeners';
import { calculateTargetDimensions, calculateTargetPosition } from '../prompt.resize-utils';
import {
  getAllScreens as utilGetAllScreens,
  getCurrentScreenFromMouse as utilGetCurrentScreenFromMouse,
  getCurrentScreenPromptCache as utilGetCurrentScreenPromptCache,
  pointOnMouseScreen as utilPointOnMouseScreen,
} from '../prompt.screen-utils';
import { setPromptDataImpl } from '../prompt.set-prompt-data';
import { writePromptState } from '../prompt.state-utils';
import { togglePromptEnvFlow } from '../prompt.toggle-env';
import { handleBlurVisibility } from '../prompt.visibility-utils';
import {
  blurPromptFlow,
  hideFlow,
  initBoundsFlow,
  initMainBoundsFlow,
  initShowPromptFlow,
  moveToMouseScreenFlow,
  onHideOnceFlow,
  showPromptFlow,
} from '../prompt.window-flow';
import { centerThenFocus } from '../prompt.window-utils';
import { prompts } from '../prompts';
import { getCurrentScreenFromBounds, isBoundsWithinDisplays } from '../screen';
import type { ScriptRunMeta } from '../script-lifecycle';
import { setChoices, setFlags } from '../search';
import shims from '../shims';
import {
  getEmojiShortcut,
  kitCache,
  kitState,
  preloadChoicesMap,
  preloadPreviewMap,
  preloadPromptDataMap,
  promptState,
  subs,
} from '../state';
import { TrackEvent, trackEvent } from '../track';
import { getVersion } from '../version';

export type ScriptTrigger = 'startup' | 'shortcut' | 'prompt' | 'background' | 'schedule' | 'snippet';
export type ScriptSource = 'runtime' | 'preload' | 'user';

export type SetScriptMeta = {
  pid?: number;
  runId?: string;
  source?: ScriptSource;
  force?: boolean;
};

enum Bounds {
  Position = 1 << 0,
  Size = 1 << 1,
}

// Re-export utilities for backward compatibility
export const getCurrentScreenFromMouse = utilGetCurrentScreenFromMouse;
export const getAllScreens = utilGetAllScreens;
export const getCurrentScreenPromptCache = utilGetCurrentScreenPromptCache;
export const pointOnMouseScreen = utilPointOnMouseScreen;

/**
 * initMain flag - used for backward compatibility.
 * When true, the prompt behaves like a main menu.
 * This flag is set externally by prompts.ts when attaching to a main script.
 */
export class BasePrompt {
  initMain = false;
  ui = UI.arg;
  count = 0;
  id = '';
  pid = 0;
  windowMode: PromptWindowMode = 'panel';
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
  private _activeRun?: ScriptRunMeta;

  private longRunningThresholdMs = 60000;

  birthTime = performance.now();

  lifeTime = () => {
    return (performance.now() - this.birthTime) / 1000 + 's';
  };
  preloaded = '';

  get activeRun() {
    return this._activeRun;
  }

  setActiveRun(run: ScriptRunMeta | undefined) {
    this._activeRun = run;
  }

  clearActiveRun() {
    this._activeRun = undefined;
  }

  get scriptName() {
    return this?.scriptPath?.split('/')?.pop() || '';
  }

  /**
   * Whether this prompt is for the main menu (app launcher).
   * Uses initMain flag for backward compatibility.
   * Subclasses can override this to define their behavior.
   */
  get isMainMenu(): boolean {
    // Backward compatible: use initMain flag or check scriptPath
    return this.initMain || this.scriptPath === getMainScriptPath() || (!this.scriptPath && this.pid === 0) || this.scriptPath === '';
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

    this.logInfo('Clearing search...');
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
  protected startLongRunningMonitor = () => {
    this.clearLongRunningMonitor();

    this.longRunningThresholdMs = getLongRunningThresholdMs(kitState?.kenvEnv as any, this.longRunningThresholdMs);

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

    if (!this.scriptPath || this.scriptPath === '' || !this.scriptName || this.scriptName === 'script-not-set') {
      this.logInfo('Skipping long-running monitor for idle prompt (no valid script)');
      return;
    }

    startLongRunningMonitorFlow(this as any);
  };

  protected clearLongRunningMonitor = () => {
    clearLongRunningMonitorFlow(this as any);
  };

  boundToProcess = false;
  processConnectionLost = false;
  processConnectionLostTimeout?: NodeJS.Timeout;

  bindToProcess = (pid: number) => {
    if (this.processConnectionLostTimeout) {
      clearTimeout(this.processConnectionLostTimeout);
      this.processConnectionLostTimeout = undefined;
    }
    this.processConnectionLost = false;

    if (this.boundToProcess) {
      return;
    }
    this.pid = pid;
    this.boundToProcess = true;
    this.processConnectionLost = false;
    this.logInfo(`${pid} -> ${this?.window?.id}: Binding prompt to process`);

    this.startLongRunningMonitor();
    this.startProcessMonitoring();
    this.listenForProcessExit();
  };

  hasLostProcessConnection = (): boolean => {
    return this.boundToProcess && this.processConnectionLost;
  };

  protected notifyProcessConnectionLost() {
    notifyProcessConnectionLostImpl(this as any);
  }

  protected startProcessMonitoring = () => {
    startProcessMonitoringImpl(this as any);
  };

  protected stopProcessMonitoring = () => {
    stopProcessMonitoringImpl(this as any);
  };

  protected checkProcessAlive(force = false) {
    checkProcessAliveImpl(this as any, force);
  }

  protected listenForProcessExit = () => {
    listenForProcessExitImpl(this as any);
  };

  protected handleProcessGone() {
    handleProcessGoneImpl(this as any);
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
        this.logInfo(`${this?.window?.id} Ready because ready emit`);
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

  logInfo = (...args: any[]) => {
    log.info(this.getLogPrefix(), ...args);
  };

  themeLogInfo = (...args: any[]) => {
    themeLog.info(this.getLogPrefix(), ...args);
  };

  logWarn = (...args: any[]) => {
    log.warn(this.getLogPrefix(), ...args);
  };

  logError = (...args: any[]) => {
    log.error(this.getLogPrefix(), ...args);
  };

  logVerbose = (...args: any[]) => {
    log.verbose(this.getLogPrefix(), ...args);
  };

  logSilly = (...args: any[]) => {
    log.silly(this.getLogPrefix(), ...args);
  };

  /**
   * Handle blur event. Subclasses can override onBlurMainMenu() for main-specific behavior.
   */
  onBlur = () => {
    if (this.devToolsOpening) {
      this.logInfo('Blur ignored early - DevTools are being opened');
      return;
    }

    if (this.window.webContents?.isDevToolsOpened()) {
      this.logInfo('Blur ignored early - DevTools are already open');
      return;
    }

    const blurOpId = processWindowCoordinator.registerOperation(this.pid, WindowOperation.Blur, this.window.id);

    try {
      if (typeof (prompts as any).handleWindowBlur === 'function') {
        (prompts as any).handleWindowBlur(this, 'window-blur');
      } else if (prompts.focused === this) {
        prompts.focused = null;
        prompts.prevFocused = this as any;
      }
    } catch (error) {
      this.logWarn('Error updating prompts focus state on blur', error);
    }

    if (this.windowMode === 'window') {
      this.logInfo('Standard window blurred - keeping window open');
      if (this.window.isVisible()) {
        this.sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
      }
      processWindowCoordinator.completeOperation(blurOpId);
      return;
    }

    this.logInfo('Prompt window blurred');

    this.logInfo(`${this.pid}:${this.scriptName}: Prompt window blurred. Emoji active: ${this.emojiActive}`, {
      emojiActive: this.emojiActive,
      focusedEmojiActive: prompts?.focused?.emojiActive,
    });

    try {
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (focusedWindow) {
        const focusedPrompt = [...prompts].find((p) => p.window === focusedWindow) || null;
        if (focusedPrompt && focusedPrompt !== this) {
          this.logInfo(
            `Blurred because another Kit prompt (${focusedPrompt.pid}:${focusedPrompt.scriptName}) is now focused - keeping this panel open`,
          );
          processWindowCoordinator.completeOperation(blurOpId);
          return;
        }
      }
    } catch (error) {
      this.logWarn('Error checking focused Kit window on blur', error);
    }

    handleBlurVisibility(this as any);

    const isSplashScreen = this.ui === UI.splash;
    const isIdle = !this.scriptPath || this.scriptPath === '';

    if (isSplashScreen) {
      this.logInfo('Splash screen blur - keeping window open');
      if (this.window.isVisible()) {
        this.sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
      }
      processWindowCoordinator.completeOperation(blurOpId);
      return;
    }

    if (isIdle) {
      this.logInfo('Idle process blur - keeping process alive');
      processWindowCoordinator.completeOperation(blurOpId);
      return;
    }

    // Delegate to subclass for main menu specific handling
    if (this.handleBlurForMainMenu(blurOpId)) {
      return;
    }

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
      processWindowCoordinator.completeOperation(blurOpId);
      return;
    }

    kitState.blurredByKit = false;
    processWindowCoordinator.completeOperation(blurOpId);
  };

  /**
   * Hook for main menu specific blur handling.
   * Returns true if blur was fully handled and should return early.
   */
  protected handleBlurForMainMenu(_blurOpId: string): boolean {
    return false;
  }

  attemptReadTheme = async () => {
    this.themeLogInfo('attemptReadTheme...');
    const cssPath = kenvPath('kit.css');
    try {
      const css = await readFile(cssPath, 'utf8');
      if (css) {
        this.themeLogInfo(`Found ${cssPath}. Sending to prompt ${this.pid}`);
        this.sendToPrompt(AppChannel.CSS_CHANGED, css);
        this.themeLogInfo(css);
      }
    } catch (error) {
      this.themeLogInfo(`No ${cssPath}. Sending empty css to prompt ${this.pid}`);
      this.sendToPrompt(AppChannel.CSS_CHANGED, '');
    }
    updateTheme();
  };

  protected cacheKeyFor = (scriptPath: string) => `${scriptPath}::${this.windowMode}`;

  constructor() {
    const getKitConfig = (event: any) => {
      event.returnValue = {
        kitPath: kitPath(),
        mainScriptPath: getMainScriptPath(),
        pid: this.pid,
      };
    };

    const isSplashScreen = this.ui === UI.splash;
    this.windowMode = isSplashScreen ? 'window' : process.env.KIT_PROMPT_WINDOW_MODE === 'window' ? 'window' : 'panel';

    const options = getPromptOptions(this.windowMode);
    this.window = new BrowserWindow(options);

    if (this.windowMode === 'window') this.window.setTitle('Script Kit');

    const createOpId = processWindowCoordinator.registerOperation(this.pid, WindowOperation.Create, this.window.id);
    processWindowCoordinator.completeOperation(createOpId);

    this.window.webContents.ipc.on(AppChannel.GET_KIT_CONFIG, getKitConfig);

    this.sendToPrompt = (channel: Channel | AppChannel, data) => {
      const dataSize = data && typeof data === 'object' && Array.isArray(data) ? data.length : 1;
      const endPerfSendToPrompt = perf.start('sendToPrompt', {
        channel: String(channel),
        dataSize,
      });

      log.silly(`sendToPrompt: ${String(channel)}`, data);

      if (
        channel === AppChannel.SET_CACHED_MAIN_STATE ||
        channel === AppChannel.SET_CACHED_MAIN_SCORED_CHOICES ||
        channel === AppChannel.SET_CACHED_MAIN_SHORTCUTS ||
        channel === AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS ||
        channel === AppChannel.SET_CACHED_MAIN_PREVIEW
      ) {
        this.logInfo(`[SCRIPTS RENDER] Prompt ${this.pid}:${this.id} sending ${String(channel)} to renderer`);
      }

      if (channel === AppChannel.TERM_CAPTURE_READY) {
        this.logInfo('[CAPTURE] sendToPrompt TERM_CAPTURE_READY:', {
          hasData: !!data,
          dataKeys: data ? Object.keys(data) : [],
          textLength: data?.text?.length || 0,
          pid: data?.pid,
          exitCode: data?.exitCode,
        });
      }

      if (!this?.window || this?.window?.isDestroyed()) {
        this.logError('sendToPrompt: Window is destroyed. Skipping sendToPrompt.');
        endPerfSendToPrompt();
        return;
      }

      if (this?.window?.webContents?.send) {
        if (!channel) {
          this.logError('channel is undefined', { data });
          endPerfSendToPrompt();
          return;
        }
        try {
          this.window?.webContents.send(String(channel), data);
        } catch (error) {
          const err = error as Error;
          const isSerializationError =
            typeof err?.message === 'string' && err.message.includes('Failed to serialize arguments');
          const dataSummary = (() => {
            const type = typeof data;
            if (data === null || type !== 'object') return { type, preview: String(data) };
            try {
              const keys = Object.keys(data as any);
              const sample: Record<string, string> = {};
              for (const k of keys.slice(0, 10)) {
                const v = (data as any)[k];
                const vt = typeof v;
                sample[k] = vt === 'object' ? v?.constructor?.name || 'object' : vt;
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

      endPerfSendToPrompt();
    };

    void this.beforeInputHandler;
    void this.notifyProcessConnectionLost;
    void this.checkProcessAlive;
    void this.handleProcessGone;

    this.logInfo(`Init appearance: ${kitState.appearance}`);

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

    setupNavigationHandlers(this as any);

    this.window.once('ready-to-show', async () => {
      this.logInfo('ready-to-show');
      if (!this.window || this.window.isDestroyed()) {
        this.logInfo('ready-to-show: window is destroyed');
        return;
      }

      if (kitState.isWindows && kitState.kenvEnv?.KIT_WINDOWS_OPACITY !== 'false') {
        this.setIgnoreMouseEvents(true);
        this.setOpacity(0.0);
        this.window.showInactive();
      }

      const handler = () => {
        this.logInfo('INPUT_READY');
      };

      this.window.webContents.ipc.on(AppChannel.INPUT_READY, handler);
      this.window.webContents.ipc.emit(AppChannel.INPUT_READY);

      this.themeLogInfo('Ready to show');
      await this.attemptReadTheme();
    });

    setupDomAndFinishLoadHandlers(this as any);
    setupWindowLifecycleHandlers(this as any);

    this.window.webContents?.setWindowOpenHandler(({ url }) => {
      this.logInfo(`Opening ${url}`);
      if (!url.startsWith('http')) {
        return { action: 'deny' };
      }
      shell.openExternal(url);
      return { action: 'deny' };
    });

    loadPromptHtml(this as any);

    this.window.webContents?.on('before-input-event', (_event, input) => {
      if (isDevToolsShortcut(input)) {
        this.logInfo(
          `DevTools shortcut detected: meta=${input.meta}, alt=${input.alt}, shift=${input.shift}, key=${input.key}`,
        );
        this.devToolsOpening = true;
        setTimeout(() => {
          this.devToolsOpening = false;
        }, 200);
      }
    });

    setupDevtoolsHandlers(this as any);

    this.window.on('focus', () => {
      this.logInfo('Prompt window focused');

      try {
        if (typeof (prompts as any).setFocusedPrompt === 'function') {
          (prompts as any).setFocusedPrompt(this, 'window-focus');
        } else {
          prompts.focused = this as any;
        }
      } catch (error) {
        this.logWarn('Error updating prompts focus state on focus', error);
      }

      handleBlurVisibility(this as any);

      if (!kitState.isLinux) {
        this.logVerbose('Registering emoji shortcut');
        kitState.emojiActive = true;
      }
    });

    this.window.on('hide', () => {
      this.logInfo('Prompt window hidden');
      if (!kitState.isLinux) kitState.emojiActive = false;
    });

    this.window.on('show', () => {
      this.logInfo('Prompt window shown');
    });

    setupResizeAndMoveListeners(this as any);
  }

  appearance: 'light' | 'dark' | 'auto' = 'auto';
  setAppearance = (appearance: 'light' | 'dark' | 'auto') => {
    if (this.appearance === appearance || this.window.isDestroyed()) {
      return;
    }
    this.logInfo(`${this.pid}:${this.scriptName}: Setting appearance to ${appearance}`);
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
    this.logError(`${this.pid}:${this.scriptName}: Prompt window is destroyed. Not getting bounds.`);
    return { x: 0, y: 0, width: 0, height: 0 };
  };

  hasFocus = () => {
    if (this?.window && !this.window.isDestroyed()) {
      return this.window.isFocused();
    }
    this.logError(`${this.pid}:${this.scriptName}: Prompt window is destroyed. Not getting focus.`);
    return false;
  };

  clearCache = () => {
    this.logInfo('--> CLEARING CACHE, Not main!');
    this.sendToPrompt(AppChannel.CLEAR_CACHE, {});
  };

  initShowPrompt = () => initShowPromptFlow(this as any);

  hide = () => hideFlow(this as any);

  onHideOnce = (fn: () => void) => onHideOnceFlow(this as any, fn);

  showAfterNextResize = false;
  skipInitBoundsForResize = false;
  boundsLockedForResize = false;
  boundsLockTimeout: NodeJS.Timeout | null = null;

  showPrompt = () => showPromptFlow(this as any);

  moveToMouseScreen = () => moveToMouseScreenFlow(this as any);

  initBounds = (forceScriptPath?: string, _show = false) => initBoundsFlow(this as any, forceScriptPath);

  blurPrompt = () => blurPromptFlow(this as any);

  /**
   * Initialize bounds for main menu.
   * Default implementation uses initMainBoundsFlow.
   */
  initMainBounds = (): void => {
    initMainBoundsFlow(this as any);
  };

  setBounds = (bounds: Partial<Rectangle>, reason = '') => {
    try {
      applyPromptBounds(this as any, bounds, reason);
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

  pingPrompt = async (channel: AppChannel, data?: any) =>
    (await import('../prompt.ipc-utils')).pingPrompt(this as any, channel, data);

  savePromptBounds = (scriptPath: string, bounds: Rectangle, b: number = Bounds.Position | Bounds.Size) => {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    if (kitState.kenvEnv?.KIT_CACHE_PROMPT === 'false') {
      this.logInfo('Cache prompt disabled. Ignore saving bounds');
      return;
    }
    const key = this.cacheKeyFor(scriptPath);
    this.logInfo(`${this.pid}: Save Initial Bounds: ${key}`, bounds);

    const centerPoint = { x: bounds.x + Math.floor(bounds.width / 2), y: bounds.y + Math.floor(bounds.height / 2) };
    if (!pointOnMouseScreen(centerPoint)) {
      return;
    }

    const currentScreen = getCurrentScreenFromBounds(this.window?.getBounds());

    try {
      const prevBounds = promptState?.screens?.[String(currentScreen.id)]?.[key];
      const size = b & Bounds.Size;
      const position = b & Bounds.Position;
      const { x, y } = position ? bounds : prevBounds || bounds;
      const { width, height } = size ? bounds : prevBounds || bounds;

      const promptBounds: PromptBounds = { x, y, width, height };
      writePromptState(this as any, String(currentScreen.id), key, promptBounds);
    } catch (error) {
      this.logError(error);
    }
  };

  isDestroyed = () => this.window?.isDestroyed();

  getFromPrompt = <K extends keyof ChannelMap>(child: ChildProcess, channel: K, data?: ChannelMap[K]) =>
    (async () => {
      const { getFromPrompt } = await import('../prompt.ipc-utils');
      getFromPrompt(this as any, child, channel, data);
    })();

  protected shouldApplyResize(resizeData: ResizeData): boolean {
    if (kitState.isLinux) return false;
    if (!(resizeData.forceHeight || this.allowResize || resizeData.forceResize)) return false;
    if (this.modifiedByUser) return false;
    if (this.window?.isDestroyed()) return false;
    return true;
  }

  protected handleSettle() {
    if (!this?.window || this.window?.isDestroyed()) return;
    this.logInfo(`${this.pid} Resize settled. Saving bounds`);
    this.saveCurrentPromptBounds();
  }

  protected calculateTargetDimensions(
    resizeData: ResizeData,
    currentBounds: Rectangle,
  ): Pick<Rectangle, 'width' | 'height'> {
    return calculateTargetDimensions(resizeData, currentBounds);
  }

  protected calculateTargetPosition(
    currentBounds: Rectangle,
    targetDimensions: Pick<Rectangle, 'width' | 'height'>,
    cachedBounds?: Partial<Rectangle>,
  ): Pick<Rectangle, 'x' | 'y'> {
    return calculateTargetPosition(currentBounds, targetDimensions, cachedBounds);
  }

  protected saveBoundsIfInitial(resizeData: ResizeData, bounds: Rectangle) {
    if (this.firstPrompt && !resizeData.inputChanged && resizeData.justOpened) {
      this.savePromptBounds(this.scriptPath, bounds);
    }
  }

  /**
   * Get cached bounds for resize. Subclasses can override for main-specific behavior.
   */
  protected getCachedBoundsForResize(_resizeData: ResizeData): Partial<Rectangle> | undefined {
    return undefined;
  }

  resize = async (resizeData: ResizeData) => {
    const shouldShowAfterResize = this.showAfterNextResize;
    if (shouldShowAfterResize) {
      this.showAfterNextResize = false;
    }

    if (!this.shouldApplyResize(resizeData)) {
      if (shouldShowAfterResize) {
        this.logInfo('Showing prompt (resize skipped)...');
        this.showPrompt();
      }
      return;
    }

    if (resizeData.reason === 'SETTLE') {
      setTimeout(() => this.handleSettle(), 50);
    }

    const currentBounds = this.window.getBounds();

    this.logInfo(`Resize main height: ${resizeData.mainHeight}`);
    this.logInfo('ResizeData summary', {
      id: resizeData.id,
      pid: resizeData.pid,
      ui: resizeData.ui,
      mode: resizeData.mode,
      topHeight: resizeData.topHeight,
      footerHeight: resizeData.footerHeight,
      hasPanel: resizeData.hasPanel,
      hasPreview: resizeData.hasPreview,
      placeholderOnly: resizeData.placeholderOnly,
      totalChoices: resizeData.totalChoices,
      forceResize: resizeData.forceResize,
      forceHeight: resizeData.forceHeight,
      forceWidth: resizeData.forceWidth,
      isMainScript: resizeData.isMainScript,
      isWindow: resizeData.isWindow,
      justOpened: resizeData.justOpened,
      reason: resizeData.reason,
      scriptPath: resizeData.scriptPath,
    });

    const targetDimensions = this.calculateTargetDimensions(resizeData, currentBounds);
    this.logInfo('Calculated targetDimensions', targetDimensions);

    if (currentBounds.height === targetDimensions.height && currentBounds.width === targetDimensions.width) {
      if (shouldShowAfterResize) {
        const mouseScreen = this.getCurrentScreenFromMouse();
        const { x: workX, y: workY } = mouseScreen.workArea;
        const { width: screenWidth, height: screenHeight } = mouseScreen.workAreaSize;
        const isAtWorkOrigin = Math.abs(currentBounds.x - workX) < 4 && Math.abs(currentBounds.y - workY) < 4;

        if (isAtWorkOrigin) {
          const centeredX = Math.round(workX + (screenWidth - targetDimensions.width) / 2);
          const centeredY = Math.round(workY + screenHeight / 8);
          this.logInfo('Showing prompt (dimensions unchanged, centering from work origin)...', {
            from: { x: currentBounds.x, y: currentBounds.y },
            to: { x: centeredX, y: centeredY },
          });
          this.setBounds({ x: centeredX, y: centeredY, ...targetDimensions }, 'CENTER_BEFORE_SHOW');
        } else {
          this.logInfo('Showing prompt (dimensions unchanged)...');
        }
        this.showPrompt();
      }
      return;
    }

    const cachedBounds = this.getCachedBoundsForResize(resizeData);
    if (cachedBounds) {
      this.logInfo('Using cachedBounds for position/width defaults', cachedBounds);
    }

    const targetPosition = this.calculateTargetPosition(currentBounds, targetDimensions, cachedBounds);
    this.logInfo('Calculated targetPosition', targetPosition);

    const bounds: Rectangle = { ...targetPosition, ...targetDimensions };

    this.setBounds(bounds, resizeData.reason);
    this.saveBoundsIfInitial(resizeData, bounds);

    if (shouldShowAfterResize) {
      this.logInfo('Showing prompt after resize complete...');
      this.showPrompt();
      this.skipInitBoundsForResize = false;
    }
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

    this.logInfo('Attempting to refocus prompt', {
      hasBeenHidden: this.hasBeenHidden,
      isVisible: visible,
      isFocused: this?.window?.isFocused(),
      count: this.count,
      ui: this.ui,
      grid: this.promptData?.grid,
      scriptPath: this.promptData?.scriptPath,
    });

    if (this.hasBeenHidden || (visible && !this?.window?.isFocused()) || (!visible && dontWaitForResize)) {
      this.logInfo(`${this.pid}: ${this.ui} ready. Focusing prompt.`);
      this.focusPrompt();
      this.hasBeenHidden = false;
    }
  };

  setPromptData = async (promptData: PromptData) => {
    await setPromptDataImpl(this as any, promptData);
    let boundsCheck: NodeJS.Timeout | null = null;
    if (boundsCheck) {
      clearTimeout(boundsCheck);
    }
    boundsCheck = setTimeout(async () => {
      if (!this.window) return;
      if (this.window?.isDestroyed()) return;
      const currentBounds = this.window?.getBounds();
      const validBounds = isBoundsWithinDisplays(currentBounds);
      if (!validBounds) {
        this.logInfo('Prompt window out of bounds. Clearing cache and resetting.');
        await clearPromptCacheFor(this.scriptPath);
        this.initBounds();
      } else {
        this.logInfo('Prompt window in bounds.');
      }
    }, 1000);
    if (promptData?.scriptPath && this?.script) {
      trackEvent(TrackEvent.SetPrompt, {
        ui: promptData.ui,
        script: path.basename(promptData.scriptPath),
        name: promptData?.name || this?.script?.name || '',
        description: promptData?.description || this?.script?.description || '',
      });
    }
  };

  hasBeenHidden = false;
  actualHide = () => {
    actualHideImpl(this as any);
  };

  isVisible = () => isVisibleImpl(this as any);

  maybeHide = (reason: string) => {
    maybeHideImpl(this as any, reason);
  };

  saveCurrentPromptBounds = () => {
    if (!this?.window || this.window?.isDestroyed()) {
      this.logInfo(`${this.pid} Prompt window is destroyed. Not saving bounds for ${this.scriptPath}`);
      return;
    }
    const currentBounds = this.window?.getBounds();
    this.savePromptBounds(this.scriptPath, currentBounds);

    this.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
      id: this.id,
      ...currentBounds,
    });
  };

  prepPromptForQuit = async () => {
    this.actualHide();
    await new Promise((resolve) => {
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
    if (this.window.isDestroyed()) return;
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
    const focusOpId = processWindowCoordinator.registerOperation(this.pid, WindowOperation.Focus, this.window.id);

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

        if (this.ui === UI.splash) {
          this.window?.show();
          this.window?.focus();
        } else if (kitState.isMac) {
          this.window.show();
        } else {
          this.window?.showInactive();
          this.window?.focus();
        }

        processWindowCoordinator.completeOperation(focusOpId);
      } catch (error) {
        this.logError(error);
        processWindowCoordinator.completeOperation(focusOpId);
      }
    } else {
      processWindowCoordinator.completeOperation(focusOpId);
    }
  };

  forceFocus = () => {
    this.logInfo(`${this.pid}: forceFocus`);

    if (this.window?.webContents?.isDevToolsOpened()) {
      this.logInfo('DevTools are open - skipping forceFocus');
      return;
    }

    this.window?.show();
    this.window?.focus();
  };

  setSkipTaskbar = (skipTaskBar: boolean) => {
    if (this.window?.isDestroyed()) return;
    this.window?.setSkipTaskbar(skipTaskBar);
  };

  setPromptAlwaysOnTop = (onTop: boolean, manual = false) => {
    if (this.ui === UI.splash) {
      this.logInfo('alwaysOnTop disabled for splash screen (regular window)');
      return;
    }

    if (this.windowMode === 'window') {
      if (manual && this.window && !this.window.isDestroyed()) {
        this.alwaysOnTop = onTop;
        this.window.setAlwaysOnTop(onTop, 'normal');
      }
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
      if (!allow) return;
    }

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

  /**
   * Reset prompt state. Subclasses can override onResetState() for type-specific behavior.
   */
  resetState = () => {
    this.showAfterNextResize = false;
    this.skipInitBoundsForResize = false;
    if (this.boundsLockTimeout) {
      clearTimeout(this.boundsLockTimeout);
      this.boundsLockTimeout = null;
    }
    this.boundsLockedForResize = false;

    this.boundToProcess = false;
    this.pid = 0;
    this.ui = UI.arg;
    this.count = 0;
    this.id = '';
    this.clearActiveRun();

    this.clearLongRunningMonitor();
    this.stopProcessMonitoring();

    if (!(this.closed || this.window?.isDestroyed()) && prompts.idle === null) {
      prompts.setIdle(this as any);
    }

    this.logInfo(`${this.pid}: Prompt re-initialized`);
    const idles = getIdles();
    this.logInfo(`${this.pid}: Idles: ${idles.length}. Prompts: ${prompts.getPromptMap().size}`);
    this.logInfo(
      `Idles: ${idles.map((idle) => `${idle.pid}: ${prompts.get(idle.pid)?.window?.id || 'none'}`).join(',')}`,
    );

    const browserWindows = BrowserWindow.getAllWindows();
    this.logInfo(`Browser windows: ${browserWindows.map((window) => window.id).join(',')}`);

    const allPrompts = [...prompts];
    this.logInfo(`Prompts: ${allPrompts.map((prompt) => `${prompt.pid}: ${prompt.window?.id}`).join('\n')}`);
    this.logInfo(`Prompt map: ${allPrompts.map((prompt) => `${prompt.pid}: ${prompt.window?.id}`).join('\n')}`);

    // Hook for subclass-specific reset
    this.onResetState();
    return;
  };

  /**
   * Hook for subclass-specific reset state logic.
   */
  protected onResetState(): void {
    // Default: no-op. Subclasses can override.
  }

  scriptSet = false;

  setScript = (script: Script, meta: SetScriptMeta = {}): 'denied' | 'allowed' => {
    const { pid, runId, source = 'runtime' } = meta;
    const targetPid = pid ?? this.pid;
    const activeRun = this._activeRun;
    const { preview, scriptlet, inputs, tag, ...serializableScript } = script as Scriptlet;

    log.info(`${this.pid}: setScript`, serializableScript, {
      runId: runId ?? activeRun?.runId,
      source,
    });

    if (activeRun) {
      if (targetPid && activeRun.pid !== targetPid) {
        this.logWarn('[Prompt.setScript] Dropping script from mismatched pid', {
          expected: activeRun.pid,
          received: targetPid,
        });
        return 'denied';
      }

      if (runId && activeRun.runId !== runId) {
        this.logWarn('[Prompt.setScript] Dropping script from mismatched runId', {
          expected: activeRun.runId,
          received: runId,
        });
        return 'denied';
      }

      if (source === 'preload') {
        this.logInfo('[Prompt.setScript] Ignoring preload script during active run', {
          activeRunId: activeRun.runId,
        });
        return 'denied';
      }
    }

    if (typeof script?.prompt === 'boolean' && script.prompt === false) {
      this.hideInstant();
      this.resetState();
      return 'denied';
    }

    this.scriptSet = true;
    this.logInfo(`${this.pid}: ${targetPid} setScript`, serializableScript, {
      preloaded: this.preloaded || 'none',
      runId: runId ?? activeRun?.runId,
      source,
    });
    performance.mark('script');
    kitState.resizePaused = false;
    const cache = Boolean(serializableScript?.cache);
    this.cacheScriptChoices = cache;
    this.cacheScriptPreview = cache;
    this.cacheScriptPromptData = cache;

    this.sendToPrompt(Channel.SET_PID, targetPid);

    this.scriptPath = serializableScript.filePath;
    kitState.hasSnippet = Boolean(serializableScript?.snippet || serializableScript?.expand);

    this.script = serializableScript;

    this.sendToPrompt(Channel.SET_SCRIPT, {
      script: serializableScript,
      runId: runId ?? activeRun?.runId ?? null,
      pid: targetPid ?? null,
      source,
    });

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

  protected hideInstantCoolingDown = false;

  hideInstant = (forceHide = false) => {
    if (this.hideInstantCoolingDown && !forceHide) {
      this.logInfo(`${this.pid}: "hideInstant" still cooling down`);
      return;
    }

    if (!forceHide) {
      this.hideInstantCoolingDown = true;
      setTimeout(() => {
        this.hideInstantCoolingDown = false;
      }, 100);
    }

    if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) {
      return;
    }

    if (kitState.isWindows) {
      shims['@johnlindquist/node-window-manager'].windowManager.hideInstantly(this.window.getNativeWindowHandle());
      if (this.window.isFocused()) {
        this.window.emit('blur');
        this.window.emit('hide');
      }
    } else {
      this.window.hide();
    }
  };

  closed = false;
  close = (reason = 'unknown') => {
    this.logInfo(`${this.pid}: "close" because ${reason}`);

    const closeOpId = processWindowCoordinator.registerOperation(this.pid, WindowOperation.Close, this.window?.id || 0);

    this.clearLongRunningMonitor();
    this.stopProcessMonitoring();

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

    this.logInfo(`${this.pid} ${this.window.id} Close prompt`);
    try {
      if (kitState.isMac) {
        this.hideInstant(isProcessExit);
      }

      this.sendToPrompt = () => {};

      try {
        if (!kitState.isMac) {
          this.window.setClosable(true);
        }
        this.window.close();
        this.logInfo(`${this?.pid}: window ${this?.window?.id}: closed`);
      } catch (error) {
        this.logError(error);
      }

      setImmediate(() => {
        try {
          const destroyOpId = processWindowCoordinator.registerOperation(
            this.pid,
            WindowOperation.Destroy,
            this.window?.id || 0,
          );
          this.window.destroy();
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

    processWindowCoordinator.completeOperation(closeOpId);
    return;
  };

  initPromptData = async () => {
    // Placeholder - subclasses may override
  };

  /**
   * Initialize main menu choices.
   * Default implementation uses initMainChoicesImpl.
   */
  initMainChoices = (): void => {
    initMainChoicesImpl(this as any);
  };

  /**
   * Initialize main menu preview.
   * Default implementation uses initMainPreviewImpl.
   */
  initMainPreview = (): void => {
    initMainPreviewImpl(this as any);
  };

  /**
   * Initialize main menu shortcuts.
   * Default implementation uses initMainShortcutsImpl.
   */
  initMainShortcuts = (): void => {
    initMainShortcutsImpl(this as any);
  };

  /**
   * Initialize main menu flags.
   * Default implementation uses initMainFlagsImpl.
   */
  initMainFlags = (): void => {
    initMainFlagsImpl(this as any);
  };

  initTheme = () => {
    initThemeImpl(this as any);
  };

  initPrompt = () => {
    initPromptImpl(this as any);
  };

  /**
   * Initialize the full main menu prompt with all components.
   * This is the main entry point for setting up the main menu.
   */
  initMainPrompt = (reason = 'unknown') => {
    this.logInfo(
      `initMainPrompt CALLED: reason="${reason}", scriptPath="${this.scriptPath}", initMain=${this.initMain}`,
    );
    this.initPromptData();
    this.initMainChoices();
    this.initMainPreview();
    this.initMainShortcuts();
    this.initMainFlags();
    this.initTheme();
    this.logInfo(`Prompt init: ${reason}`);
    this.initPrompt();
  };

  /**
   * Clear cached main menu content. Override in MainPrompt.
   */
  clearCachedMainContent = () => {
    this.logInfo(`${this.pid}: Clearing cached main menu content`);
    if (this.window && !this.window.isDestroyed()) {
      this.sendToPrompt(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, []);
      this.sendToPrompt(AppChannel.SET_CACHED_MAIN_PREVIEW, closedDiv);
      this.sendToPrompt(Channel.SET_PREVIEW, closedDiv);
    }
  };

  preloadPromptData = (promptData: PromptData) => {
    let input = '';
    if (this.kitSearch.keyword) {
      input = `${this.kitSearch.keyword} `;
    } else {
      input = this.kitSearch.input || '';
    }
    input = promptData.input || input;
    this.logInfo(`Preload promptData for ${promptData?.scriptPath} with input:${input}`);
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
      this.logInfo(`Setting flags from preloadPromptData: ${Object.keys(promptData.flags)}`);
      setFlags(this as any, promptData.flags);
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

  /**
   * Attempt to preload script. Subclasses can customize behavior.
   */
  attemptPreload = debounce(
    (promptScriptPath: string, show = true, init = true) => {
      this.logInfo(
        `attemptPreload CALLED: promptScriptPath="${promptScriptPath}", current prompt.scriptPath="${this.scriptPath}"`,
      );
      const isMainScript = getMainScriptPath() === promptScriptPath;
      if (!promptScriptPath || isMainScript) {
        this.logInfo(`attemptPreload: EARLY RETURN - promptScriptPath empty or isMainScript`);
        return;
      }
      this.preloaded = '';

      const cachedPromptData = preloadPromptDataMap.has(promptScriptPath);
      this.logInfo(`${this.pid}: attemptPreload: ${promptScriptPath}`, {
        hasData: cachedPromptData ? 'true' : 'false',
      });

      if (cachedPromptData) {
        this.logInfo(`Preload prompt: ${promptScriptPath}`, { init, show });

        if (init) {
          this.initBounds(promptScriptPath, show);
        }

        this.sendToPrompt(AppChannel.SCROLL_TO_INDEX, 0);
        this.sendToPrompt(Channel.SET_TAB_INDEX, 0);
        this.sendToPrompt(AppChannel.SET_PRELOADED, true);
        const promptData = preloadPromptDataMap.get(promptScriptPath) as PromptData;
        this.preloadPromptData(promptData);

        const hasCachedChoices = preloadChoicesMap.has(promptScriptPath);

        if (hasCachedChoices) {
          const choices = preloadChoicesMap.get(promptScriptPath) as Choice[];
          this.logInfo(`Preload choices: ${promptScriptPath}`, choices.length);
          setChoices(this as any, choices, {
            preload: true,
            generated: false,
            skipInitialSearch: true,
          });

          const preview = preloadPreviewMap.get(promptScriptPath) as string;
          if (preview) {
            this.logInfo(`${this.pid}: Preload preview: ${promptScriptPath}`);
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
    { leading: true },
  );

  // Escape key handling
  private escapePressCount = 0;
  private lastEscapePressTime = 0;

  protected handleEscapePress = () => {
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

  protected shouldClosePromptOnInitialEscape = (isEscape: boolean): boolean => {
    return computeShouldCloseOnInitialEscape(this.firstPrompt, this.isMainMenu, isEscape, this.wasActionsJustOpen);
  };

  protected hideAndRemoveProcess = () => {
    this.hideInstant();
    processes.removeByPid(this.pid, 'prompt close cleanup');
  };

  protected beforeInputHandler = (_event: any, input: Input) => {
    if (input.type !== 'keyDown' || !input.key) {
      return;
    }

    const isW = input.key === 'w';
    const isEscape = input.key === 'Escape';

    if (isEscape) {
      this.logInfo(`${this.pid}: Escape received by prompt`);
      this.handleEscapePress();
    }

    const isCmdOrCtrlW =
      input.type === 'keyDown' &&
      (isW || input.code === 'KeyW') &&
      (kitState.isMac ? input.meta : input.control) &&
      !input.shift &&
      !input.alt;

    const isCloseShortcut = isCloseCombo(input as any, kitState.isMac) || isCmdOrCtrlW;

    const shouldCloseOnInitialEscape = this.shouldClosePromptOnInitialEscape(isEscape);
    if (isCloseShortcut || shouldCloseOnInitialEscape) {
      if (isCmdOrCtrlW) {
        const windowIsFocused = this.window?.isFocused();
        const electronFocused = BrowserWindow.getFocusedWindow();
        const registryFocusedIsThis = !prompts.focused || prompts.focused === this;
        const actuallyFocused = !!windowIsFocused && electronFocused === this.window && registryFocusedIsThis;

        if (!actuallyFocused) {
          this.logInfo('Ignoring Cmd/Ctrl+W because prompt is not actually focused', {
            windowIsFocused,
            electronFocusedId: electronFocused?.id,
            registryFocusedIsThis,
          });
          return;
        }
      }

      this.logInfo(`${this.pid}: Closing prompt window`);

      if (isCmdOrCtrlW) {
        this.logInfo(`Closing prompt window with ${kitState.isMac ? '\u2318' : '\u2303'}+w`);
      } else if (isEscape) {
        this.logInfo('Closing prompt window with escape');
      }

      _event.preventDefault();

      this.hideAndRemoveProcess();
      this.logInfo(`Removing process because of escape ${this.pid}`);
      return;
    }
  };

  protected async collectRendererState(): Promise<any> {
    return new Promise((resolve) => {
      if (!this.window || this.window.isDestroyed()) return resolve({});
      const RESPONSE_CHANNEL = `RENDERER_STATE_RESPONSE_${this.window.id}`;
      const t = setTimeout(() => {
        ipcMain.removeAllListeners(RESPONSE_CHANNEL);
        resolve({});
      }, 2000);
      ipcMain.once(RESPONSE_CHANNEL, (_e, state) => {
        clearTimeout(t);
        resolve(state || {});
      });
      this.sendToPrompt(AppChannel.REQUEST_RENDERER_STATE, { responseChannel: RESPONSE_CHANNEL });
    });
  }

  async recreateWindow(nextMode: PromptWindowMode) {
    if (nextMode === this.windowMode) return;

    this.stopProcessMonitoring?.();
    this.clearLongRunningMonitor?.();
    const devtools = this.window?.webContents?.isDevToolsOpened() ?? false;
    const zoom = this.window?.webContents?.getZoomLevel?.() ?? 0;
    const ignoreMouse = this.ignoreMouseEvents;
    const opacity = this.opacity;
    const bounds = this.window?.getBounds();

    const rendererState = await this.collectRendererState();

    const currentPromptData = this.promptData
      ? {
          ...this.promptData,
          ...(rendererState?.input !== undefined && { input: rendererState.input }),
          ...(rendererState?.value !== undefined && { value: rendererState.value }),
          ...(rendererState?.description !== undefined && { description: rendererState.description }),
        }
      : null;

    try {
      this.window?.removeListener('blur', this.onBlur);
    } catch {}

    const oldWindow = this.window;
    this.windowMode = nextMode;
    const options = getPromptOptions(this.windowMode);
    this.window = new BrowserWindow(options);

    const getKitConfig = (event: any) => {
      event.returnValue = {
        kitPath: kitPath(),
        mainScriptPath: getMainScriptPath(),
        pid: this.pid,
      };
    };
    this.window.webContents.ipc.on(AppChannel.GET_KIT_CONFIG, getKitConfig);

    const createOpId = processWindowCoordinator.registerOperation(this.pid, WindowOperation.Create, this.window.id);
    processWindowCoordinator.completeOperation(createOpId);

    this.sendToPrompt = (channel: Channel | AppChannel, data) => {
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
          this.logError('sendToPrompt error', {
            channel: String(channel),
            message: (error as Error)?.message,
          });
        }
      }
    };

    setupNavigationHandlers(this as any);
    setupDomAndFinishLoadHandlers(this as any);
    setupWindowLifecycleHandlers(this as any);
    this.window.webContents?.on('before-input-event', (_event, input: Input) => {
      if (isDevToolsShortcut(input)) {
        this.logInfo(
          `DevTools shortcut detected (reinit): meta=${input.meta}, alt=${input.alt}, shift=${input.shift}, key=${input.key}`,
        );
        this.devToolsOpening = true;
        setTimeout(() => {
          this.devToolsOpening = false;
        }, 200);
      }
    });
    setupDevtoolsHandlers(this as any);
    loadPromptHtml(this as any);
    setupResizeAndMoveListeners(this as any);

    if (this.windowMode === 'window') this.window.setTitle(this.scriptName || 'Script Kit');

    this.window?.webContents?.setZoomLevel(ZOOM_LEVEL);

    await this.waitForReady();

    if (typeof zoom === 'number' && zoom !== ZOOM_LEVEL) {
      this.window.webContents?.setZoomLevel(zoom);
    }
    if (bounds) this.setBounds(bounds, 'mode-transform');
    this.setIgnoreMouseEvents(ignoreMouse);
    this.setOpacity(opacity);

    if (this.scriptSet && this.script) {
      this.setScript(this.script as any, {
        pid: this.pid,
        runId: this._activeRun?.runId,
      });
    }
    if (currentPromptData) {
      this.promptData = currentPromptData;
      await this.setPromptData(currentPromptData);
    }

    this.sendToPrompt(AppChannel.RESTORE_RENDERER_STATE, rendererState);

    if (devtools) this.window.webContents?.openDevTools({ mode: 'detach' });

    this.showPrompt();

    setTimeout(() => {
      try {
        oldWindow?.destroy();
      } catch {}
    }, 120);

    this.startProcessMonitoring?.();
    this.startLongRunningMonitor?.();
  }

  async toggleWindowMode(next?: PromptWindowMode) {
    const target = next || (this.windowMode === 'panel' ? 'window' : 'panel');
    await this.recreateWindow(target);
  }
}
