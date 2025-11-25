# Prompt Window Resize Flash Expert Bundle

## Executive Summary

Script Kit prompts flash at incorrect dimensions before resizing to their correct size. When a user triggers a script via keyboard shortcut that uses `micro()` (a small prompt with limited choices), the window briefly appears at the default height (480px) before shrinking to the correct calculated height (~155px for 3 choices). This creates a jarring visual experience.

The root cause is a complex race condition between multiple code paths that can show the prompt window or set its bounds, with competing timing between:
1. `setPromptData` → shows prompt via `showAfterNextResize` mechanism
2. `resize()` → applies correct dimensions from renderer
3. `attemptPreload` → calls `initBounds()` which resets to cached (wrong) dimensions

### Key Problems:

1. **Race condition in show/resize timing**: The `showPrompt()` call can happen before `setBounds()` applies the correct dimensions, or `initBounds()` can overwrite correct dimensions after resize.

2. **Multiple code paths compete to set bounds**:
   - `initBounds()` in `prompt.window-flow.ts` uses cached bounds (often 480px height)
   - `resize()` in `prompt.ts` calculates correct dimensions from renderer content
   - `attemptPreload()` calls `initBounds()` which can overwrite resize-calculated dimensions

3. **Flag coordination issues**: The `showAfterNextResize` flag is consumed by `resize()` before `attemptPreload` runs, so `skipInitBoundsForResize` was added but timing is still problematic.

### Log Evidence (Timeline of the Bug):

```
13:55:22.527 - shouldDeferShow=true, sets showAfterNextResize=true
13:55:22.527 - resize() calculates targetDimensions height:155 ✓
13:55:22.527 - "dimensions unchanged" check triggers showPrompt() EARLY
13:55:22.527 - initShowPrompt called (window potentially shown)
13:55:22.547 - attemptPreload runs (20ms later!)
13:55:22.548 - initBounds() applies cached height:480 ✗ OVERWRITES!
13:55:22.555 - "😳 Prompt window shown" at WRONG height
13:55:22.559 - Another resize finally applies correct height:155
```

### Required Fixes:

1. **Ensure `showPrompt()` only runs AFTER bounds are definitively set**: The "dimensions unchanged" check at line ~1228 in `prompt.ts` can trigger `showPrompt()` when the first resize event arrives, but `attemptPreload` hasn't run yet.

2. **Prevent `initBounds()` from running when waiting for resize**: The `skipInitBoundsForResize` flag must persist until the resize cycle completes, including after `attemptPreload` runs.

3. **Consider a "bounds lock" mechanism**: When `shouldDeferShow` is true, lock bounds changes until the correct resize is applied and prompt is shown.

### Files Included:

- `app/src/main/prompt.ts`: Core prompt class with `resize()`, `showPrompt()`, `attemptPreload()`, and `skipInitBoundsForResize` flag
- `app/src/main/prompt.set-prompt-data.ts`: Sets `shouldDeferShow`, `showAfterNextResize`, and `skipInitBoundsForResize`
- `app/src/main/prompt.window-flow.ts`: Contains `initBoundsFlow()` and `initShowPromptFlow()`
- `app/src/main/kit.ts`: Entry point that calls `attemptPreload()` for non-main scripts
- `app/src/main/prompt.bounds-utils.ts`: Bounds application utilities
- `app/src/renderer/src/state/controllers/ResizeController.tsx`: Renderer-side resize event emitter

### Key Code Locations:

1. **`prompt.ts` line ~1174**: `resize()` function - handles showAfterNextResize
2. **`prompt.ts` line ~1228**: "dimensions unchanged" early return with showPrompt()
3. **`prompt.ts` line ~1909**: `attemptPreload` checks `skipInitBoundsForResize`
4. **`prompt.set-prompt-data.ts` line ~190**: Sets `showAfterNextResize` and `skipInitBoundsForResize`
5. **`kit.ts` line ~284**: Calls `attemptPreload()` for non-main scripts

---
[Original packx output follows]

# Packx Output

This file contains 6 filtered files from the repository.

## Files

### app/src/main/prompt.window-flow.ts

```ts
import path from 'node:path';
import type { Rectangle } from 'electron';
import { Channel, PROMPT } from '@johnlindquist/kit/core/enum';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import type { KitPrompt } from './prompt';
import { processWindowCoordinator, WindowOperation } from './process-window-coordinator';
import { ensureIdleProcess } from './process';
import { kitState } from './state';
import { getCurrentScreenPromptCache, getCurrentScreenFromMouse } from './prompt.screen-utils';
import shims from './shims';

export function initShowPromptFlow(prompt: KitPrompt) {
  prompt.logInfo(`${prompt.pid}:🎪 initShowPrompt: ${prompt.id} ${prompt.scriptPath}`);
  if (!kitState.isMac) {
    if ((kitState?.kenvEnv as any)?.KIT_PROMPT_RESTORE === 'true') {
      prompt.window?.restore();
    }
  }

  prompt.setPromptAlwaysOnTop(true);
  if (prompt.window && !prompt.window.isDestroyed()) {
    (prompt as any).handleBlurVisibility?.(prompt);
  }
  prompt.focusPrompt();
  prompt.sendToPrompt(Channel.SET_OPEN, true);
  const topTimeout = (prompt as any).topTimeout;
  if (topTimeout) clearTimeout(topTimeout);
  setTimeout(() => {
    ensureIdleProcess();
  }, 10);
}

export function hideFlow(prompt: KitPrompt) {
  if (prompt.window.isVisible()) {
    prompt.hasBeenHidden = true as any;
  }
  prompt.logInfo('Hiding prompt window...');
  if (prompt.window.isDestroyed()) {
    prompt.logWarn('Prompt window is destroyed. Not hiding.');
    return;
  }
  const hideOpId = processWindowCoordinator.registerOperation(prompt.pid, WindowOperation.Hide, prompt.window.id);
  (prompt as any).actualHide();
  processWindowCoordinator.completeOperation(hideOpId);
}

export function onHideOnceFlow(prompt: KitPrompt, fn: () => void) {
  let id: null | NodeJS.Timeout = null;
  if (prompt.window) {
    const handler = () => {
      if (id) clearTimeout(id);
      prompt.window.removeListener('hide', handler);
      fn();
    };
    id = setTimeout(() => {
      if (!prompt?.window || prompt.window?.isDestroyed()) return;
      prompt.window?.removeListener('hide', handler);
    }, 1000);
    prompt.window?.once('hide', handler);
  }
}

export function showPromptFlow(prompt: KitPrompt) {
  if (prompt.window.isDestroyed()) return;
  const showOpId = processWindowCoordinator.registerOperation(prompt.pid, WindowOperation.Show, prompt.window.id);
  initShowPromptFlow(prompt);
  prompt.sendToPrompt(Channel.SET_OPEN, true);
  if (!prompt?.window || prompt.window?.isDestroyed()) {
    processWindowCoordinator.completeOperation(showOpId);
    return;
  }
  prompt.shown = true as any;
  processWindowCoordinator.completeOperation(showOpId);
}

export function moveToMouseScreenFlow(prompt: KitPrompt) {
  if (prompt?.window?.isDestroyed()) {
    prompt.logWarn('moveToMouseScreen. Window already destroyed', prompt?.id);
    return;
  }
  const mouseScreen = getCurrentScreenFromMouse();
  prompt.window.setPosition(mouseScreen.workArea.x, mouseScreen.workArea.y);
}

export function initBoundsFlow(prompt: KitPrompt, forceScriptPath?: string) {
  if (prompt?.window?.isDestroyed()) {
    prompt.logWarn('initBounds. Window already destroyed', prompt?.id);
    return;
  }
  const bounds = prompt.window.getBounds();
  const cacheKey = `${forceScriptPath || (prompt as any).scriptPath}::${(prompt as any).windowMode || 'panel'}`;
  const cachedBounds = getCurrentScreenPromptCache(cacheKey, {
    ui: (prompt as any).ui,
    resize: (prompt as any).allowResize,
    bounds: { width: bounds.width, height: bounds.height },
  });
  const currentBounds = prompt?.window?.getBounds();
  prompt.logInfo(`${prompt.pid}:${path.basename((prompt as any)?.scriptPath || '')}: ↖ Init bounds: ${(prompt as any).ui} ui`, {
    currentBounds,
    cachedBounds,
  });
  const { x, y, width, height } = prompt.window.getBounds();
  if (cachedBounds.width !== width || cachedBounds.height !== height) {
    prompt.logVerbose(`Started resizing: ${prompt.window?.getSize()}. First prompt?: ${(prompt as any).firstPrompt ? 'true' : 'false'}`);
    (prompt as any).resizing = true;
  }
  if ((prompt as any).promptData?.scriptlet) cachedBounds.height = (prompt as any).promptData?.inputHeight;
  if (prompt?.window?.isFocused()) {
    cachedBounds.x = x;
    cachedBounds.y = y;
  }
  (prompt as any).setBounds(cachedBounds, 'initBounds');
}

export function blurPromptFlow(prompt: KitPrompt) {
  prompt.logInfo(`${prompt.pid}: blurPrompt`);
  if (prompt.window.isDestroyed()) return;
  if (prompt.window) {
    prompt.window.blur();
  }
}

export function initMainBoundsFlow(prompt: KitPrompt) {
  const cached = getCurrentScreenPromptCache(getMainScriptPath());
  if (!cached.height || cached.height < PROMPT.HEIGHT.BASE) cached.height = PROMPT.HEIGHT.BASE;
  (prompt as any).setBounds(cached as Partial<Rectangle>, 'initMainBounds');
}



```

### app/src/main/prompt.ts

```ts
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { ipcMain } from 'electron';
import type { Choice, PromptBounds, PromptData, Script, Scriptlet } from '@johnlindquist/kit/types/core';
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
  screen,
  shell,
} from 'electron';
import type { Display } from 'electron';
import { setupPromptContextMenu } from './prompt.context-menu';
import { debounce } from 'lodash-es';

import type { ChildProcess } from 'node:child_process';
import EventEmitter from 'node:events';
import { closedDiv, noScript } from '../shared/defaults';
import { ZOOM_LEVEL } from '../shared/defaults';
import { AppChannel } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import type { ResizeData } from '../shared/types';
import { sendToAllPrompts } from './channel';
import { getIdles, processes, updateTheme } from './process';
import { getPromptOptions, type PromptWindowMode } from './prompt.options';
import { prompts } from './prompts';
import {
  getCurrentScreenFromBounds,
  isBoundsWithinDisplays,
} from './screen';
import { setChoices, setFlags } from './search';
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
import { centerThenFocus } from './prompt.window-utils';
import { initShowPromptFlow, hideFlow, onHideOnceFlow, showPromptFlow, moveToMouseScreenFlow, initBoundsFlow, blurPromptFlow, initMainBoundsFlow } from './prompt.window-flow';
import { clearPromptCacheFor } from './prompt.cache';
import { calculateTargetDimensions, calculateTargetPosition } from './prompt.resize-utils';
import { applyPromptDataBounds } from './prompt.bounds-utils';
import { getLongRunningThresholdMs } from './prompt.process-utils';
import { setupDevtoolsHandlers, setupDomAndFinishLoadHandlers, setupNavigationHandlers, loadPromptHtml, setupWindowLifecycleHandlers } from './prompt.init-utils';
import { setupResizeAndMoveListeners } from './prompt.resize-listeners';
import { togglePromptEnvFlow } from './prompt.toggle-env';
import { startLongRunningMonitorFlow, clearLongRunningMonitorFlow } from './prompt.long-running';
import {
  getAllScreens as utilGetAllScreens,
  getCurrentScreenFromMouse as utilGetCurrentScreenFromMouse,
  getCurrentScreenPromptCache as utilGetCurrentScreenPromptCache,
  pointOnMouseScreen as utilPointOnMouseScreen,
} from './prompt.screen-utils';
import { writePromptState } from './prompt.state-utils';
import { isDevToolsShortcut, computeShouldCloseOnInitialEscape } from './prompt.focus-utils';
import { isCloseCombo } from './prompt.input-utils';
import type { ScriptRunMeta } from './script-lifecycle';

import { promptLog as log, themeLog, perf } from './logs';
import { handleBlurVisibility } from './prompt.visibility-utils';
import { applyPromptBounds } from './prompt.bounds-apply';
import { setPromptDataImpl } from './prompt.set-prompt-data';
import { notifyProcessConnectionLostImpl, startProcessMonitoringImpl, stopProcessMonitoringImpl, listenForProcessExitImpl, checkProcessAliveImpl, handleProcessGoneImpl } from './prompt.process-connection';
import { initMainChoicesImpl, initMainPreviewImpl, initMainShortcutsImpl, initMainFlagsImpl, initThemeImpl, initPromptImpl } from './prompt.init-main';
import { actualHideImpl, isVisibleImpl, maybeHideImpl } from './prompt.hide-utils';

setupPromptContextMenu();



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

// moved to prompt.state-utils.ts

export type ScriptTrigger = 'startup' | 'shortcut' | 'prompt' | 'background' | 'schedule' | 'snippet';
export type ScriptSource = 'runtime' | 'preload' | 'user';

export type SetScriptMeta = {
  pid?: number;
  runId?: string;
  source?: ScriptSource;
  force?: boolean;
};

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
  windowMode: PromptWindowMode = 'panel'; // default
  initMain = false;
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

  private longRunningThresholdMs = 60000; // 1 minute default

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
  private notifyProcessConnectionLost() { notifyProcessConnectionLostImpl(this); }


  private startProcessMonitoring = () => { startProcessMonitoringImpl(this); };

  private stopProcessMonitoring = () => { stopProcessMonitoringImpl(this); };

  private checkProcessAlive(force = false) { checkProcessAliveImpl(this, force); }

  private listenForProcessExit = () => { listenForProcessExitImpl(this); };

  private handleProcessGone() { handleProcessGoneImpl(this); }

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

  onBlur = () => {
    // Early check: if DevTools are being opened or already open, ignore blur entirely
    if (this.devToolsOpening) {
      this.logInfo('🙈 Blur ignored early - DevTools are being opened');
      return;
    }

    // Also check if DevTools are already open (handles race conditions)
    if (this.window.webContents?.isDevToolsOpened()) {
      this.logInfo('🙈 Blur ignored early - DevTools are already open');
      return;
    }

    // Register blur operation
    const blurOpId = processWindowCoordinator.registerOperation(
      this.pid,
      WindowOperation.Blur,
      this.window.id
    );

    // Keep prompts registry in sync with actual window blur
    try {
      if (typeof (prompts as any).handleWindowBlur === 'function') {
        (prompts as any).handleWindowBlur(this, 'window-blur');
      } else if (prompts.focused === this) {
        // Fallback for older builds
        prompts.focused = null;
        prompts.prevFocused = this;
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

    this.logInfo('🙈 Prompt window blurred');

    this.logInfo(`${this.pid}:${this.scriptName}: 🙈 Prompt window blurred. Emoji active: ${this.emojiActive}`, {
      emojiActive: this.emojiActive,
      focusedEmojiActive: prompts?.focused?.emojiActive,
    });

    // If blur immediately goes to another Kit prompt window, keep this panel open
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

    // Use visibility controller to handle blur
    handleBlurVisibility(this);

    const mainScriptPath = getMainScriptPath();
    const isMainScript = mainScriptPath === this.scriptPath;
    const isSplashScreen = this.ui === UI.splash;
    const isIdle = !this.scriptPath || this.scriptPath === '';

    this.logInfo(`/Users/johnlindquist/dev/kit-container/app/src/main/prompt.ts:562 - Blur check: scriptPath="${this.scriptPath}", mainPath="${mainScriptPath}", isMain=${isMainScript}, isIdle=${isIdle}`);

    // Don't hide splash screen on blur - it's a regular window now
    if (isSplashScreen) {
      this.logInfo('Splash screen blur - keeping window open');
      if (this.window.isVisible()) {
        this.sendToPrompt(Channel.SET_PROMPT_BLURRED, true);
      }
      processWindowCoordinator.completeOperation(blurOpId);
      return;
    }

    // Don't remove idle processes on blur
    if (isIdle) {
      this.logInfo('Idle process blur - keeping process alive');
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
      this.logInfo('Main script. Hiding and removing process');
      this.hideAndRemoveProcess();
      processWindowCoordinator.completeOperation(blurOpId);
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
      // Complete the blur operation before returning
      processWindowCoordinator.completeOperation(blurOpId);
      return;
    }

    kitState.blurredByKit = false;

    // Complete the blur operation
    processWindowCoordinator.completeOperation(blurOpId);
  };

  initMainPrompt = (reason = 'unknown') => {
    this.logInfo(`🚀🚀🚀 initMainPrompt CALLED: reason="${reason}", scriptPath="${this.scriptPath}", initMain=${this.initMain}`);
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

  private cacheKeyFor = (scriptPath: string) => `${scriptPath}::${this.windowMode}`;

  constructor() {
    const getKitConfig = (event) => {
      event.returnValue = {
        kitPath: kitPath(),
        mainScriptPath: getMainScriptPath(),
        pid: this.pid,
      };
    };

    const isSplashScreen = this.ui === UI.splash;
    // Splash is a normal window; otherwise honor env override if provided
    this.windowMode = isSplashScreen ? 'window' :
      (process.env.KIT_PROMPT_WINDOW_MODE === 'window' ? 'window' : 'panel');
    
    const options = getPromptOptions(this.windowMode);
    this.window = new BrowserWindow(options);
    
    if (this.windowMode === 'window') this.window.setTitle('Script Kit');

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
      // Calculate data size for perf logging (approximate)
      const dataSize = data && typeof data === 'object' && Array.isArray(data) ? data.length : 1;
      const endPerfSendToPrompt = perf.start('sendToPrompt', {
        channel: String(channel),
        dataSize,
      });

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

      endPerfSendToPrompt();
    };

    // mark handlers as used to satisfy linter after extraction
    void this.beforeInputHandler;

    // Ensure methods referenced by external monitor helpers are marked as used for linter
    void this.notifyProcessConnectionLost;
    void this.checkProcessAlive;
    void this.handleProcessGone;

    this.logInfo(`🎬 Init appearance: ${kitState.appearance}`);

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
        this.logInfo(`🔧 DevTools shortcut detected: meta=${input.meta}, alt=${input.alt}, shift=${input.shift}, key=${input.key}`);
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
      this.logInfo('👓 Prompt window focused');

      // Keep prompts registry in sync with actual window focus
      try {
        if (typeof (prompts as any).setFocusedPrompt === 'function') {
          (prompts as any).setFocusedPrompt(this, 'window-focus');
        } else {
          // Fallback for older builds if needed
          prompts.focused = this;
        }
      } catch (error) {
        this.logWarn('Error updating prompts focus state on focus', error);
      }

      // Use visibility controller to handle focus-related visibility
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
  // Flag to prevent initBounds from overwriting resize-calculated dimensions
  // Set when deferring show for resize, cleared after the resize-triggered show completes
  skipInitBoundsForResize = false;

  showPrompt = () => showPromptFlow(this);

  moveToMouseScreen = () => moveToMouseScreenFlow(this);

  initBounds = (forceScriptPath?: string, _show = false) => initBoundsFlow(this, forceScriptPath);

  blurPrompt = () => blurPromptFlow(this);

  initMainBounds = () => initMainBoundsFlow(this);

  setBounds = (bounds: Partial<Rectangle>, reason = '') => {
    try {
      applyPromptBounds(this, bounds, reason);
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
    const key = this.cacheKeyFor(scriptPath);
    this.logInfo(`${this.pid}: 💾 Save Initial Bounds: ${key}`, bounds);
    // const isMain = scriptPath.includes('.kit') && scriptPath.includes('cli');
    // if (isMain) return;

    const centerPoint = { x: bounds.x + Math.floor(bounds.width / 2), y: bounds.y + Math.floor(bounds.height / 2) };
    if (!pointOnMouseScreen(centerPoint)) {
      return;
    }

    const currentScreen = getCurrentScreenFromBounds(this.window?.getBounds());

    try {
      const prevBounds = promptState?.screens?.[String(currentScreen.id)]?.[key];

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

      writePromptState(this, String(currentScreen.id), key, promptBounds);
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
    // Track if we need to show after this resize completes
    const shouldShowAfterResize = this.showAfterNextResize;
    if (shouldShowAfterResize) {
      this.showAfterNextResize = false;
      // Keep skipInitBoundsForResize=true until after showPrompt completes
      // This prevents attemptPreload->initBounds from overwriting resize dimensions
    }

    if (!this.shouldApplyResize(resizeData)) {
      // Even if we skip resize, still show the prompt if requested
      // This handles edge cases like resize being disabled (e.g., on Linux)
      if (shouldShowAfterResize) {
        this.logInfo('🎤 Showing prompt (resize skipped)...');
        this.showPrompt();
        // Clear the flag after showing - initBounds can now run normally
        this.skipInitBoundsForResize = false;
      }
      return;
    }

    // refactor: removed prevResizeData tracking

    if (resizeData.reason === 'SETTLE') {
      setTimeout(() => this.handleSettle(), 50);
    }

    const currentBounds = this.window.getBounds();

    this.logInfo(`📐 Resize main height: ${resizeData.mainHeight}`);
    this.logInfo('📏 ResizeData summary', {
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
    this.logInfo('📐 Calculated targetDimensions', targetDimensions);

    // Skip resize if dimensions haven't changed
    if (currentBounds.height === targetDimensions.height && currentBounds.width === targetDimensions.width) {
      // Still show the prompt if requested, even though dimensions match
      if (shouldShowAfterResize) {
        this.logInfo('🎤 Showing prompt (dimensions unchanged)...');
        this.showPrompt();
        // Clear the flag after showing - initBounds can now run normally
        this.skipInitBoundsForResize = false;
      }
      return;
    }

    const cachedBounds = resizeData.isMainScript ? getCurrentScreenPromptCache(getMainScriptPath()) : undefined;
    if (cachedBounds) {
      this.logInfo('🗂️ Using cachedBounds for position/width defaults', cachedBounds);
    }

    const targetPosition = this.calculateTargetPosition(currentBounds, targetDimensions, cachedBounds);
    this.logInfo('🎯 Calculated targetPosition', targetPosition);

    const bounds: Rectangle = { ...targetPosition, ...targetDimensions };

    this.setBounds(bounds, resizeData.reason);
    this.saveBoundsIfInitial(resizeData, bounds);

    // Show the prompt AFTER bounds have been applied
    if (shouldShowAfterResize) {
      this.logInfo('🎤 Showing prompt after resize complete...');
      this.showPrompt();
      // Clear the flag after showing - initBounds can now run normally
      this.skipInitBoundsForResize = false;
    }

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
    await setPromptDataImpl(this, promptData);
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
  actualHide = () => { actualHideImpl(this); };

  isVisible = () => isVisibleImpl(this);

  maybeHide = (reason: string) => { maybeHideImpl(this, reason); };

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
        if (this.ui === UI.splash) {
          this.window?.show();
          this.window?.focus();
        } else if (kitState.isMac) {
          this.window.show();
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

    if (this.windowMode === 'window') {
      // Only honor explicit requests for standard windows
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
    this.clearActiveRun();

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
    } else {
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

  initMainChoices = () => { initMainChoicesImpl(this); };

  initMainPreview = () => { initMainPreviewImpl(this); };

  initMainShortcuts = () => { initMainShortcutsImpl(this); };

  initMainFlags = () => { initMainFlagsImpl(this); };

  initTheme = () => { initThemeImpl(this); };

  initPrompt = () => { initPromptImpl(this); };

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
      this.logInfo(`🏋️🏋️🏋️ attemptPreload CALLED: promptScriptPath="${promptScriptPath}", current prompt.scriptPath="${this.scriptPath}", prompt.initMain=${this.initMain}`);
      const isMainScript = getMainScriptPath() === promptScriptPath;
      if (!promptScriptPath || isMainScript) {
        this.logInfo(`🏋️ attemptPreload: EARLY RETURN - promptScriptPath empty or isMainScript`);
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

        // Skip initBounds if we're waiting for resize to set proper dimensions
        // This prevents cached bounds from overwriting the correct resize height
        if (init && !this.skipInitBoundsForResize) {
          this.initBounds(promptScriptPath, show);
        } else if (this.skipInitBoundsForResize) {
          this.logInfo(`🏋️‍♂️ Skipping initBounds in attemptPreload - waiting for resize`);
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

    // Treat both ESC + "close combos" (including Cmd/Ctrl+W) as potential closes
    const isCmdOrCtrlW =
      input.type === 'keyDown' &&
      (isW || input.code === 'KeyW') &&
      (kitState.isMac ? input.meta : input.control) &&
      !input.shift &&
      !input.alt;

    const isCloseShortcut = isCloseCombo(input as any, kitState.isMac) || isCmdOrCtrlW;

    const shouldCloseOnInitialEscape = this.shouldClosePromptOnInitialEscape(isEscape);
    // this.logInfo(`${this.pid}: shouldCloseOnInitialEscape: ${shouldCloseOnInitialEscape}`);
    if (isCloseShortcut || shouldCloseOnInitialEscape) {
      // For Cmd/Ctrl+W, only close when this prompt truly has focus
      if (isCmdOrCtrlW) {
        const windowIsFocused = this.window?.isFocused();
        const electronFocused = BrowserWindow.getFocusedWindow();
        const registryFocusedIsThis = !prompts.focused || prompts.focused === this;
        const actuallyFocused =
          !!windowIsFocused && electronFocused === this.window && registryFocusedIsThis;

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
        this.logInfo(`Closing prompt window with ${kitState.isMac ? '⌘' : '⌃'}+w`);
      } else if (isEscape) {
        this.logInfo('Closing prompt window with escape');
      }

      // Stop the key from reaching the renderer / default handlers
      _event.preventDefault();

      this.hideAndRemoveProcess();
      // I don't think these are needed anymore, but leaving them in for now
      this.logInfo(`✋ Removing process because of escape ${this.pid}`);

      // emitter.emit(KitEvent.KillProcess, this.pid);
      return;
    }
  };

  private async collectRendererState(): Promise<any> {
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

    // Pause monitors & capture state
    this.stopProcessMonitoring?.();
    this.clearLongRunningMonitor?.();
    const devtools = this.window?.webContents?.isDevToolsOpened() ?? false;
    const zoom = this.window?.webContents?.getZoomLevel?.() ?? 0;
    const ignoreMouse = this.ignoreMouseEvents;
    const opacity = this.opacity;
    const bounds = this.window?.getBounds();
    
    // Capture current renderer state including input/editor content
    const rendererState = await this.collectRendererState();
    
    // Store the current promptData with renderer state merged in
    const currentPromptData = this.promptData ? {
      ...this.promptData,
      // Merge in any input/value from renderer state
      ...(rendererState?.input !== undefined && { input: rendererState.input }),
      ...(rendererState?.value !== undefined && { value: rendererState.value }),
      ...(rendererState?.description !== undefined && { description: rendererState.description }),
    } : null;

    // Detach listeners from old window (avoid leaks)
    try {
      this.window?.removeListener('blur', this.onBlur);
    } catch {}

    // Build the new window
    const oldWindow = this.window;
    this.windowMode = nextMode;
    const options = getPromptOptions(this.windowMode);
    this.window = new BrowserWindow(options);

    // Setup GET_KIT_CONFIG handler for the new window
    const getKitConfig = (event) => {
      event.returnValue = {
        kitPath: kitPath(),
        mainScriptPath: getMainScriptPath(),
        pid: this.pid,
      };
    };
    this.window.webContents.ipc.on(AppChannel.GET_KIT_CONFIG, getKitConfig);

    // Register window creation operation
    const createOpId = processWindowCoordinator.registerOperation(
      this.pid,
      WindowOperation.Create,
      this.window.id
    );
    processWindowCoordinator.completeOperation(createOpId);

    // Re-setup sendToPrompt method
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

    // Re-bind all handlers for the new window
    setupNavigationHandlers(this);
    setupDomAndFinishLoadHandlers(this);
    setupWindowLifecycleHandlers(this);
    this.window.webContents?.on('before-input-event', (_event, input: Input) => {
      if (isDevToolsShortcut(input)) {
        this.logInfo(`🔧 DevTools shortcut detected (reinit): meta=${input.meta}, alt=${input.alt}, shift=${input.shift}, key=${input.key}`);
        this.devToolsOpening = true;
        setTimeout(() => { this.devToolsOpening = false; }, 200);
      }
    });
    setupDevtoolsHandlers(this);
    loadPromptHtml(this);
    setupResizeAndMoveListeners(this);

    if (this.windowMode === 'window') this.window.setTitle(this.scriptName || 'Script Kit');

    // Set initial zoom level (important for prompt sizing)
    this.window?.webContents?.setZoomLevel(ZOOM_LEVEL);

    // Wait for renderer
    await this.waitForReady();

    // Restore window props
    if (typeof zoom === 'number' && zoom !== ZOOM_LEVEL) {
      this.window.webContents?.setZoomLevel(zoom);
    }
    if (bounds) this.setBounds(bounds, 'mode-transform');
    this.setIgnoreMouseEvents(ignoreMouse);
    this.setOpacity(opacity);

    // Re-send script & prompt data (with current state merged)
    if (this.scriptSet && this.script) {
      this.setScript(this.script as any, {
        pid: this.pid,
        runId: this._activeRun?.runId,
      });
    }
    if (currentPromptData) {
      // Update our stored promptData with the current state
      this.promptData = currentPromptData;
      await this.setPromptData(currentPromptData);
    }

    // Send any additional renderer state not handled by setPromptData
    // This includes things like scroll position, selection, etc.
    this.sendToPrompt(AppChannel.RESTORE_RENDERER_STATE, rendererState);

    // Keep DevTools stance
    if (devtools) this.window.webContents?.openDevTools({ mode: 'detach' });

    // Swap visibility
    this.showPrompt();

    // Destroy old window
    setTimeout(() => {
      try { oldWindow?.destroy(); } catch {}
    }, 120);

    // Resume monitors
    this.startProcessMonitoring?.();
    this.startLongRunningMonitor?.();
  }

  async toggleWindowMode(next?: PromptWindowMode) {
    const target = next || (this.windowMode === 'panel' ? 'window' : 'panel');
    await this.recreateWindow(target);
  }
}

export const makeSplashWindow = (_window?: BrowserWindow) => {
  // No longer needed - splash screen is now a regular window
  // that doesn't need special handling when closing
  log.info('👋 Splash window close - no special handling needed');
};

```

### app/src/main/prompt.set-prompt-data.ts

```ts
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import type { PromptData } from '@johnlindquist/kit/types/core';
import { debounce } from 'lodash-es';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import { AppChannel } from '../shared/enums';
import { kitState, preloadPromptDataMap, promptState } from './state';
import { setFlags } from './search';
import { createPty } from './pty';
import { applyPromptDataBounds } from './prompt.bounds-utils';
import { getCurrentScreen } from './screen';

export const setPromptDataImpl = async (prompt: any, promptData: PromptData): Promise<void> => {
  prompt.promptData = promptData;

  const setPromptDataHandler = debounce(
    (_x: unknown, { ui }: { ui: UI }) => {
      prompt.logInfo(`${prompt.pid}: Received SET_PROMPT_DATA from renderer. ${ui} Ready!`);
      prompt.refocusPrompt();
    },
    100,
    {
      leading: true,
      trailing: false,
    },
  );

  prompt.window.webContents.ipc.removeHandler(Channel.SET_PROMPT_DATA);
  prompt.window.webContents.ipc.once(Channel.SET_PROMPT_DATA, setPromptDataHandler);

  if (promptData.ui === UI.term) {
    const termConfig = {
      command: (promptData as any)?.command || '',
      cwd: promptData.cwd || '',
      shell: (promptData as any)?.shell || '',
      promptId: prompt.id || '',
      env: promptData.env || {},
      args: (promptData as any)?.args || [],
      closeOnExit: typeof (promptData as any)?.closeOnExit === 'boolean' ? (promptData as any).closeOnExit : undefined,
      pid: prompt.pid,
    };
    prompt.sendToPrompt(AppChannel.SET_TERM_CONFIG, termConfig);
    createPty(prompt);
  }

  prompt.scriptPath = promptData?.scriptPath;
  prompt.clearFlagSearch();
  prompt.kitSearch.shortcodes.clear();
  prompt.kitSearch.triggers.clear();
  if (promptData?.hint) {
    for (const trigger of promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi) || []) {
      prompt.kitSearch.triggers.set(trigger, { name: trigger, value: trigger });
    }
  }

  prompt.kitSearch.commandChars = promptData.inputCommandChars || [];
  prompt.updateShortcodes();

  if (prompt.cacheScriptPromptData && !promptData.preload) {
    prompt.cacheScriptPromptData = false;
    promptData.name ||= prompt.script.name || '';
    promptData.description ||= prompt.script.description || '';
    prompt.logInfo(`💝 Caching prompt data: ${prompt?.scriptPath}`);
    preloadPromptDataMap.set(prompt.scriptPath, {
      ...promptData,
      input: promptData?.keyword ? '' : promptData?.input || '',
      keyword: '',
    });
  }

  if (promptData.flags && typeof promptData.flags === 'object') {
    prompt.logInfo(`🏳️‍🌈 Setting flags from setPromptData: ${Object.keys(promptData.flags)}`);
    setFlags(prompt, promptData.flags);
  }

  kitState.hiddenByUser = false;

  if (typeof promptData?.alwaysOnTop === 'boolean') {
    prompt.logInfo(`📌 setPromptAlwaysOnTop from promptData: ${promptData.alwaysOnTop ? 'true' : 'false'}`);
    prompt.setPromptAlwaysOnTop(promptData.alwaysOnTop, true);
  }

  if (typeof promptData?.skipTaskbar === 'boolean') {
    prompt.setSkipTaskbar(promptData.skipTaskbar);
  }

  prompt.allowResize = promptData?.resize;
  kitState.shortcutsPaused = promptData.ui === UI.hotkey;

  prompt.logVerbose(`setPromptData ${promptData.scriptPath}`);

  prompt.id = promptData.id;
  prompt.ui = promptData.ui;

  if (prompt.kitSearch.keyword) {
    promptData.keyword = prompt.kitSearch.keyword || prompt.kitSearch.keyword;
  }

  // Send user data BEFORE prompt data only if we haven't bootstrapped this prompt yet
  const userSnapshot = (await import('valtio')).snapshot(kitState.user);
  prompt.logInfo(`Early user data considered: ${userSnapshot?.login || 'not logged in'}`);
  if (!(prompt as any).__userBootstrapped) {
    prompt.sendToPrompt(AppChannel.USER_CHANGED, userSnapshot);
    (prompt as any).__userBootstrapped = true;
  }
  
  prompt.sendToPrompt(Channel.SET_PROMPT_DATA, promptData);

  const isMainScript = getMainScriptPath() === promptData.scriptPath;

  // Determine if we need to defer showing for resize BEFORE calling initBounds
  // This prevents initBounds from overwriting the correct resize dimensions
  const visible = prompt.isVisible();
  const shouldShow = promptData?.show !== false;

  // Check if we have explicit dimensions that will cause a resize
  // In these cases, wait for resize before showing to avoid flash
  const hasExplicitDimensions =
    typeof promptData?.width === 'number' ||
    typeof promptData?.height === 'number' ||
    typeof promptData?.inputHeight === 'number';

  // Compare against current bounds to see if resize is actually needed
  const currentBounds = prompt.window?.getBounds();
  const targetWidth = promptData?.width ?? currentBounds?.width;
  const targetHeight = promptData?.height ?? promptData?.inputHeight ?? currentBounds?.height;
  const significantSizeDifference = currentBounds && (
    Math.abs(currentBounds.width - targetWidth) > 20 ||
    Math.abs(currentBounds.height - targetHeight) > 20
  );

  // Check if this script has cached bounds from a previous run
  // If not, the first resize will establish the correct size
  const currentScreen = getCurrentScreen();
  const screenId = String(currentScreen.id);
  const scriptPath = promptData?.scriptPath;
  const hasCachedBounds = Boolean(
    scriptPath &&
    !isMainScript &&
    promptState?.screens?.[screenId]?.[scriptPath]
  );

  // Defer showing when:
  // 1. Explicit dimensions that differ significantly from current bounds, OR
  // 2. First run of a non-main script (no cached bounds) - need resize to calculate height
  const shouldDeferForExplicitDimensions = hasExplicitDimensions && significantSizeDifference;
  const shouldDeferForFirstRun = !hasCachedBounds && !isMainScript && promptData?.ui === UI.arg;
  const shouldDeferShow = !visible && shouldShow && (shouldDeferForExplicitDimensions || shouldDeferForFirstRun);

  prompt.logInfo(`${prompt.id}: shouldDeferShow=${shouldDeferShow}`, {
    visible,
    shouldShow,
    hasExplicitDimensions,
    significantSizeDifference,
    hasCachedBounds,
    shouldDeferForExplicitDimensions,
    shouldDeferForFirstRun,
    currentBounds: currentBounds ? { w: currentBounds.width, h: currentBounds.height } : null,
    target: { w: targetWidth, h: targetHeight },
  });

  // Only call initBounds if NOT deferring for resize
  // When deferring, let the first resize set the correct dimensions
  if (prompt.firstPrompt && !isMainScript) {
    if (shouldDeferShow) {
      prompt.logInfo(`${prompt.pid} Skipping initBounds - deferring for resize`);
    } else {
      prompt.logInfo(`${prompt.pid} Before initBounds`);
      prompt.initBounds();
      prompt.logInfo(`${prompt.pid} After initBounds`);
    }
    prompt.logInfo(`${prompt.pid} Disabling firstPrompt`);
    prompt.firstPrompt = false;
  }

  if (!isMainScript) {
    applyPromptDataBounds(prompt.window, promptData);
  }

  if (kitState.hasSnippet) {
    const timeout = prompt.script?.snippetdelay || 0;
    await new Promise((r) => setTimeout(r, timeout));
    kitState.hasSnippet = false;
  }

  prompt.logInfo(`${prompt.id}: visible ${visible ? 'true' : 'false'} 👀`);

  if (!visible && shouldShow) {
    prompt.logInfo(`${prompt.id}: Prompt not visible but should show`);

    if (shouldDeferShow) {
      prompt.showAfterNextResize = true;
      // Prevent attemptPreload->initBounds from overwriting resize-calculated dimensions
      prompt.skipInitBoundsForResize = true;
      // Safety fallback: if resize doesn't happen within 200ms, show anyway
      // This handles edge cases like resize being disabled or already at target size
      setTimeout(() => {
        if (prompt.showAfterNextResize && !prompt.window?.isDestroyed()) {
          prompt.logWarn(`${prompt.id}: showAfterNextResize fallback triggered`);
          prompt.showAfterNextResize = false;
          prompt.skipInitBoundsForResize = false;
          prompt.showPrompt();
        }
      }, 200);
    } else if (!prompt.firstPrompt) {
      prompt.showPrompt();
    } else {
      prompt.showAfterNextResize = true;
    }
  } else if (visible && !shouldShow) {
    prompt.actualHide();
  }

  if (!visible && promptData?.scriptPath.includes('.md#')) {
    prompt.focusPrompt();
  }
};


```

### app/src/main/prompt.bounds-utils.ts

```ts
import type { Rectangle, BrowserWindow } from 'electron';
import { PROMPT } from '@johnlindquist/kit/core/enum';
import { promptLog as log } from './logs';
import type { PromptData } from '@johnlindquist/kit/types/core';

export function adjustBoundsToAvoidOverlap(
    peers: Array<{ id: string; bounds: Rectangle }>,
    selfId: string,
    target: Rectangle,
): Rectangle {
    const finalBounds = { ...target };

    let hasMatch = true;
    while (hasMatch) {
        hasMatch = false;
        for (const peer of peers) {
            if (!peer.id || peer.id === selfId) continue;

            const bounds = peer.bounds;
            if (bounds.x === finalBounds.x) {
                finalBounds.x += 40;
                hasMatch = true;
            }
            if (bounds.y === finalBounds.y) {
                finalBounds.y += 40;
                hasMatch = true;
            }
            if (hasMatch) break;
        }
    }

    return finalBounds;
}

export function getTitleBarHeight(window: BrowserWindow): number {
    const normalBounds = window.getNormalBounds();
    const contentBounds = window.getContentBounds();
    const windowBounds = window.getBounds();
    const size = window.getSize();
    const contentSize = window.getContentSize();
    const minimumSize = window.getMinimumSize();

    const titleBarHeight = windowBounds.height - contentBounds.height;
    log.info('titleBarHeight', {
        normalBounds,
        contentBounds,
        windowBounds,
        size,
        contentSize,
        minimumSize,
    });
    return titleBarHeight;
}

export function ensureMinWindowHeight(height: number, titleBarHeight: number): number {
    if (height < PROMPT.INPUT.HEIGHT.XS + titleBarHeight) {
        return PROMPT.INPUT.HEIGHT.XS + titleBarHeight;
    }
    return height;
}

export function applyPromptDataBounds(window: BrowserWindow, promptData: PromptData) {
    const { x, y, width, height, ui } = promptData as any;

    // Handle position
    if (x !== undefined || y !== undefined) {
        const [currentX, currentY] = window?.getPosition() || [];
        if ((x !== undefined && x !== currentX) || (y !== undefined && y !== currentY)) {
            window?.setPosition(
                x !== undefined ? Math.round(Number(x)) : currentX,
                y !== undefined ? Math.round(Number(y)) : currentY,
            );
        }
    }

    // Only handle size if not UI.arg and dimensions are provided
    if (ui !== 'arg' && (width !== undefined || height !== undefined)) {
        const [currentWidth, currentHeight] = window?.getSize() || [];
        if ((width !== undefined && width !== currentWidth) || (height !== undefined && height !== currentHeight)) {
            window?.setSize(
                width !== undefined ? Math.round(Number(width)) : currentWidth,
                height !== undefined ? Math.round(Number(height)) : currentHeight,
            );
        }
    }
}



```

### app/src/main/kit.ts

```ts
import path from 'node:path';
import { app, shell } from 'electron';

import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import minimist from 'minimist';
import { pathExistsSync, readJson } from './cjs-exports';

import type { ProcessInfo } from '@johnlindquist/kit';
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import {
  getLogFromScriptPath,
  getMainScriptPath,
  kitPath,
  parseScript,
  scriptsDbPath,
} from '@johnlindquist/kit/core/utils';
import type { Script } from '@johnlindquist/kit/types/core';

import { refreshScripts } from '@johnlindquist/kit/core/db';
import { subscribeKey } from 'valtio/utils';
import { Trigger } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import { createForkOptions } from './fork.options';
import { pathsAreEqual } from './helpers';
import { errorLog, kitLog as log, mainLogPath } from './logs';
import { getIdles, processes } from './process';
import { prompts } from './prompts';
import { setShortcodes } from './search';
import { getKitScript, kitCache, kitState, kitStore, sponsorCheck } from './state';
import { TrackEvent, trackEvent } from './track';
import { createRunMeta } from './script-lifecycle';

app.on('second-instance', (_event, argv) => {
  log.info('second-instance', argv);
  const { _ } = minimist(argv);
  const [, , argScript, ...argArgs] = _;

  // on windows, the protocol is passed as the argScript
  const maybeProtocol = argv?.[2];
  if (maybeProtocol?.startsWith('kit:')) {
    log.info('Detected kit: protocol:', maybeProtocol);
    app.emit('open-url', null, maybeProtocol);
  }

  if (!(argScript && pathExistsSync(argScript))) {
    log.info(`${argScript} does not exist. Ignoring.`);
    return;
  }
  runPromptProcess(argScript, argArgs, {
    force: false,
    trigger: Trigger.Kit,
    sponsorCheck: false,
  });
});

app.on('activate', async (_event, _hasVisibleWindows) => {
  kitState.isActivated = true;
  runPromptProcess(getMainScriptPath(), [], {
    force: true,
    trigger: Trigger.Kit,
    sponsorCheck: false,
  });
});

// process.on('unhandledRejection', (reason, p) => {
//   log.warn('Unhandled Rejection at: Promise', p, 'reason:', reason);

//   // application specific logging, throwing an error, or other logic here
// });

process.on('uncaughtException', (error) => {
  log.warn(`Uncaught Exception: ${error.message}`);
  log.warn(error);
  errorLog.error(`Uncaught Exception: ${error.message}`, error);
});

emitter.on(
  KitEvent.RunPromptProcess,
  (
    scriptOrScriptAndData:
      | {
        scriptPath: string;
        args: string[];
        options: {
          force: boolean;
          trigger: Trigger;
          cwd?: string;
        };
      }
      | string,
  ) => {
    if (!kitState.ready) {
      log.warn('Kit not ready. Ignoring prompt process:', scriptOrScriptAndData);
      if (typeof scriptOrScriptAndData === 'object' && 'scriptPath' in scriptOrScriptAndData) {
        if (scriptOrScriptAndData.args[2].includes('Shortcut')) {
          return;
        }
        const { scriptPath, args, options } = scriptOrScriptAndData;
        if (path.basename(scriptPath) === 'info.js') {
          log.info('Opening main log:', mainLogPath);
          shell.openPath(mainLogPath);

          app.quit();
          process.exit(0);
        }
      }
      return;
    }
    const { scriptPath, args, options } =
      typeof scriptOrScriptAndData === 'string'
        ? {
          scriptPath: scriptOrScriptAndData,
          args: [],
          options: {
            force: false,
            trigger: Trigger.Kit,
            sponsorCheck: true,
            cwd: '',
          },
        }
        : scriptOrScriptAndData;

    // TODO: Each prompt will need its own "ignoreBlur"
    // if (isVisible()) {
    //   kitState.ignoreBlur = false;
    //   // hideAppIfNoWindows(HideReason.RunPromptProcess);
    // } else {
    //   log.info(`Show App: ${scriptPath}`);
    // }

    log.info('Running prompt process', { scriptPath, args, options });
    runPromptProcess(scriptPath, args, options);
  },
);

emitter.on(KitEvent.RunBackgroundProcess, (scriptPath: string) => {
  runPromptProcess(scriptPath, [], {
    force: false,
    trigger: Trigger.Background,
    sponsorCheck: false,
    cwd: '',
  });
});

export const getScriptFromDbWithFallback = async (scriptPath: string) => {
  try {
    const db = await readJson(scriptsDbPath);
    const script = db?.scripts?.find((s: Script) => s.filePath === scriptPath);
    if (script) {
      log.info(`Found script in db: ${scriptPath}`, script);
      return script;
    }
  } catch (error) {
    log.warn(error);
  }

  return await parseScript(scriptPath);
};

// TODO: Consider removing the "parseScript" and just reading from the scripts db?
const findScript = async (scriptPath: string) => {
  if (scriptPath === getMainScriptPath()) {
    log.info('findScript found main script');
    return await getKitScript(getMainScriptPath());
  }

  if (scriptPath.startsWith(kitPath()) && !scriptPath.startsWith(kitPath('tmp'))) {
    log.info('findScript found kit script');
    return await getKitScript(scriptPath);
  }

  let script = kitState.scripts.get(scriptPath);
  log.info('find script found');
  if (script) {
    return script;
  }

  log.error('find script not found', scriptPath);
  script = await parseScript(scriptPath);
  kitState.scripts.set(scriptPath, script);
  return script;
};

export const runPromptProcess = async (
  promptScriptPath: string,
  args: string[] = [],
  options: {
    force: boolean;
    trigger: Trigger;
    main?: boolean;
    headers?: Record<string, string>;
    sponsorCheck: boolean;
    cwd?: string;
  } = {
      force: false,
      trigger: Trigger.App,
      main: false,
      sponsorCheck: false,
      headers: {},
      cwd: '',
    },
): Promise<ProcessInfo | null> => {
  const chainId = Math.random().toString(36).slice(2, 10);
  const runId = randomUUID();
  if (!kitState.ready) {
    log.warn(`[SC_CHAIN ${chainId}] Kit not ready. Ignoring prompt process:`, { promptScriptPath, args, options });
    return null;
  }
  log.info(`[SC_CHAIN ${chainId}] runPromptProcess:start`, { promptScriptPath, args, options, runId });
  // log.info(`->>> Prompt script path: ${promptScriptPath}`);

  const count = prompts.getVisiblePromptCount();
  if (count >= 3 && options?.sponsorCheck) {
    const isSponsor = await sponsorCheck('Unlimited Active Prompts');
    if (!isSponsor) {
      prompts.bringAllPromptsToFront();
      return null;
    }
  }

  const isMain = options?.main || pathsAreEqual(promptScriptPath || '', getMainScriptPath());

  if (kitState.isSplashShowing) {
    emitter.emit(KitEvent.CloseSplash);
  }

  // readJson(kitPath('db', 'mainShortcuts.json'))
  //   .then(setShortcuts)
  //   .catch((error) => {});

  // If the window is already open, interrupt the process with the new script

  // TODO: Handle Schedule/Background/etc without prompts?
  // Quickly firing schedule processes would create WAY too many prompts
  const promptInfo = processes.findIdlePromptProcess();
  log.info(`[SC_CHAIN ${chainId}] pickedIdlePrompt`, {
    pid: promptInfo?.pid,
    scriptPath: promptInfo?.scriptPath,
    runId,
  });

  promptInfo.launchedFromMain = isMain;
  if (!kitState.hasOpenedMainMenu && isMain) {
    kitState.hasOpenedMainMenu = true;
  }
  const { prompt, pid, child } = promptInfo;
  log.info(`🔑🔑🔑 runPromptProcess: pid=${pid}, promptScriptPath="${promptScriptPath}", isMain=${isMain}, prompt.initMain=${prompt.initMain}, prompt.scriptPath="${prompt.scriptPath}"`);
  const runMeta = createRunMeta(pid, runId);
  promptInfo.runId = runId;
  promptInfo.runStartedAt = runMeta.startedAt;
  prompt?.setActiveRun(runMeta);

  const isSplash = prompt.ui === UI.splash;
  log.info(`>>>

  ${pid}:${prompt.window?.id}: 🧤 Show and focus ${promptScriptPath}

  <<<`);
  // if (options?.main) {
  //   prompt.cacheMainChoices();
  //   prompt.cacheMainPreview();
  // }

  prompt.alwaysOnTop = true;
  if (isMain) {
    log.info(`${pid}: 🏠 Main script: ${promptScriptPath}`);
    log.info(`[SC_CHAIN ${chainId}] mainInitBoundsAndShow`);
    // Initialize main menu data (cached choices, preview, etc.) for instant display
    prompt.initMain = true;
    prompt.initMainPrompt('runPromptProcess-isMain');
    prompt.initMainBounds();
    prompt.initShowPrompt();
  } else if (options.trigger === Trigger.Snippet) {
    log.info(`${pid}: 📝 Snippet trigger: Preparing prompt`);
    log.info(`[SC_CHAIN ${chainId}] snippetInitBounds`);
    // For snippets, prepare the prompt bounds but don't show it yet
    // The script will call setPromptData if it needs to show a prompt
    prompt.initBounds();
    // Don't call initShowPrompt() here - let the script decide
  } else {
    log.info(`${pid}: 🖱️ Moving prompt to mouse screen`);
    log.info(`[SC_CHAIN ${chainId}] attemptPreloadAndMoveToMouseScreen`);
    prompt.attemptPreload(promptScriptPath);
    prompt.moveToMouseScreen();
  }

  log.info(`${prompt.pid} 🐣 Alive for ${prompt.lifeTime()}`);

  const idlesLength = getIdles().length;
  log.info(`🗿 ${idlesLength} idles`);

  if (isSplash && isMain) {
    log.info('💦 Splash install screen visible. Preload Main Menu...');
    try {
      prompt.scriptPath = getMainScriptPath();
      prompt.preloaded = '';
    } catch (error) {
      log.error(error);
    }
  }

  // ensureIdleProcess();

  log.info(`🏃‍♀️ Run ${promptScriptPath}`);

  // Add another to the process pool when exhausted.

  // log.info(`${pid}: 🏎 ${promptScriptPath} `);
  promptInfo.scriptPath = promptScriptPath;
  promptInfo.date = Date.now();

  trackEvent(TrackEvent.ScriptTrigger, {
    script: path.basename(promptScriptPath),
    trigger: options.trigger,
    force: options.force,
  });

  const scriptlet = kitState.scriptlets.get(promptScriptPath);
  if (scriptlet) {
    log.info('Found scriptlet', { scriptlet });
  }

  let script: Script | undefined;
  try {
    script = scriptlet || (await findScript(promptScriptPath));
    log.info(`[SC_CHAIN ${chainId}] findScript:success`, { name: script?.name, filePath: script?.filePath });
  } catch (error) {
    log.warn(`[SC_CHAIN ${chainId}] findScript:error`, error as any);
  }
  if (!script) {
    log.error(`[SC_CHAIN ${chainId}] Couldn't find script, blocking run: `, promptScriptPath);
    prompt.clearActiveRun();
    promptInfo.runId = undefined;
    promptInfo.runStartedAt = undefined;
    return null;
  }
  const visible = prompt?.isVisible();
  log.info(`${pid}: ${visible ? '👀 visible' : '🙈 not visible'} before setScript ${script?.name}`);
  log.info(`[SC_CHAIN ${chainId}] beforeSetScript`, { visible, scriptName: script?.name });

  if (visible) {
    setShortcodes(prompt, kitCache.scripts);
  }

  const status = await prompt.setScript(script, {
    pid,
    runId,
    source: 'runtime',
    force: options?.force,
  });
  log.info(`[SC_CHAIN ${chainId}] afterSetScript`, { status });
  if (status === 'denied') {
    log.info(`[SC_CHAIN ${chainId}] deniedUIControl ${path.basename(promptScriptPath)}`);
  }

  // processes.assignScriptToProcess(promptScriptPath, pid);
  // alwaysOnTop(true);
  // if (!pathsAreEqual(promptScriptPath || '', getMainScriptPath())) {
  //   log.info(`Enabling ignore blur: ${promptScriptPath}`);
  //   kitState.ignoreBlur = true;
  // }

  const argsWithTrigger = [
    ...args,
    '--trigger',
    options?.trigger ? options.trigger : 'unknown',
    '--force',
    options?.force ? 'true' : 'false',
    '--cwd',
    options?.cwd || '',
  ];

  log.info(`[SC_CHAIN ${chainId}] beforeChildSend`, { pid, promptScriptPath, argsWithTrigger });
  try {
    child?.send({
      channel: Channel.VALUE_SUBMITTED,
      input: '',
      value: {
        script: promptScriptPath,
        args: argsWithTrigger,
        trigger: options?.trigger,
        choices: scriptlet ? [scriptlet] : [],
        name: script?.name,
        headers: options?.headers,
        scriptlet,
        runId,
        runStartedAt: runMeta.startedAt,
      },
    });
    log.info(`[SC_CHAIN ${chainId}] afterChildSend:success`, { pid });
  } catch (error) {
    log.error(`[SC_CHAIN ${chainId}] afterChildSend:error`, error as any);
  }

  return promptInfo;
};

export const runScript = (...args: string[]) => {
  log.info('Run', ...args);

  return new Promise((resolve, reject) => {
    try {
      const child = fork(kitPath('run', 'terminal.js'), args, createForkOptions());

      child.on('message', (data) => {
        const dataString = data.toString();
        log.info(args[0], dataString);
      });

      child.on('exit', () => {
        resolve('success');
      });

      child.on('error', (error: Error) => {
        reject(error);
      });
    } catch (error) {
      log.warn(`Failed to run script ${args}`);
      errorLog.error(`Failed to run script ${args}`, error);
    }
  });
};

subscribeKey(kitState, 'isSponsor', (isSponsor) => {
  log.info('🎨 Sponsor changed:', isSponsor);

  // Sets the env var for when scripts parse to exclude main sponsor script
  runScript(kitPath('config', 'toggle-sponsor.js'), isSponsor ? 'true' : 'false');

  kitStore.set('sponsor', isSponsor);

  refreshScripts();
});

emitter.on(KitEvent.OpenLog, async (scriptPath) => {
  const logPath = getLogFromScriptPath(scriptPath);
  await runPromptProcess(kitPath('cli/edit-file.js'), [logPath], {
    force: true,
    trigger: Trigger.Kit,
    sponsorCheck: false,
  });
});

emitter.on(KitEvent.OpenScript, async (scriptPath) => {
  await runPromptProcess(kitPath('cli/edit-file.js'), [scriptPath], {
    force: true,
    trigger: Trigger.App,
    sponsorCheck: false,
  });
});

export const cliFromParams = async (cli: string, params: URLSearchParams) => {
  const name = params.get('name');
  const newUrl = params.get('url');
  if (name && newUrl) {
    await runPromptProcess(kitPath(`cli/${cli}.js`), [name, '--url', newUrl], {
      force: true,
      trigger: Trigger.Protocol,
      sponsorCheck: false,
    });
    return true;
  }

  const content = params.get('content');

  if (content) {
    await runPromptProcess(kitPath(`cli/${cli}.js`), [name || '', '--content', content], {
      force: true,
      trigger: Trigger.Protocol,
      sponsorCheck: false,
    });
    return true;
  }
  return false;
};

```

### app/src/renderer/src/state/controllers/ResizeController.tsx

```tsx
// src/renderer/src/state/controllers/ResizeController.tsx

import React, { useLayoutEffect, useRef, useCallback, useEffect } from 'react';
import { useAtomValue, useStore } from 'jotai';

// Import necessary enums, types, constants, and utils
import { AppChannel } from '../../../../shared/enums';
import { Channel, Mode, UI, PROMPT } from '@johnlindquist/kit/core/enum';
import type { ResizeData, PromptData } from '../../../../shared/types';
import { createLogger } from '../../log-utils';
import { resizeInflightAtom } from '../resize/scheduler';
import { resizeInputsAtom } from '../selectors/resizeInputs';
import { performResize } from '../services/resize';

// Import from facade for gradual migration
import {
  _mainHeight, // The trigger atom
  channelAtom,
  promptDataAtom,
  scriptAtom,
  inputAtom,
  isSplashAtom,
  isMainScriptAtom,
} from '../../jotai';

import { prevMh, resizeTickAtom } from '../atoms/ui-elements';
import { _inputChangedAtom } from '../atoms/input';
import { _open } from '../atoms/lifecycle';
import { _tabIndex } from '../atoms/tabs';
import { _script } from '../atoms/script-state';

const log = createLogger('ResizeController.ts');
const { ipcRenderer } = window.electron;

// Restore IPC helpers
const sendResize = (data: ResizeData) => ipcRenderer.send(AppChannel.RESIZE, data);

const isDebugResizeEnabled = (): boolean => {
  try {
    return Boolean((window as any).DEBUG_RESIZE);
  } catch {
    return false;
  }
};

export const ResizeController: React.FC = () => {
  const store = useStore();
  const lastSigRef = useRef<string>('');
  const framePendingRef = useRef(false);
  const lastReasonRef = useRef<string>('INIT');
  const lastPromptIdRef = useRef<string | undefined>(undefined);
  const lastScriptPathRef = useRef<string | undefined>(undefined);
  const recheckCountsRef = useRef<Record<string, number>>({});
  const lastChoicesLengthRef = useRef<number | undefined>(undefined);
  const pendingChoicesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChoicesScheduleKeyRef = useRef<string>('');

  // Subscribe to the trigger atom. Updates to this atom signal a resize check is needed.
  const mainHeightTrigger = useAtomValue(_mainHeight);
  // Also re-run when other atoms request a recompute
  const tick = useAtomValue(resizeTickAtom);

  // Ensure we run at least once on each new prompt/script even if heights are identical.
  const promptDataForKey = useAtomValue(promptDataAtom) as Partial<PromptData> | undefined;
  const scriptForKey = useAtomValue(scriptAtom) as any;
  const promptChangeKey = `${promptDataForKey?.id ?? ''}|${scriptForKey?.script?.filePath ?? ''}`;

  // Define the resize execution using useCallback for a stable reference.
  // Called by scheduleResizeExecution to run at most once per animation frame
  const executeResize = useCallback(
    (reason = 'UNSET') => {
      log.info(`ResizeController.executeResize called with reason: ${reason}`);
      const g = store.get;
      const debug = isDebugResizeEnabled();
      const input = g(resizeInputsAtom);

      if (input.promptResizedByHuman) {
        g(channelAtom)(Channel.SET_BOUNDS, input.promptBounds);
        return;
      }

      if (!input.promptActive) return;

      const promptData = input.promptData as Partial<PromptData>;
      if (!promptData?.scriptPath) return;

      const currentPromptId = promptData.id as string | undefined;
      const currentScriptPath = g(_script)?.script?.filePath as string | undefined;

      if (
        lastPromptIdRef.current !== currentPromptId ||
        lastScriptPathRef.current !== currentScriptPath
      ) {
        if (debug) {
          log.info('ResizeController: prompt/script changed', {
            prevPromptId: lastPromptIdRef.current,
            prevScript: lastScriptPathRef.current,
            promptId: currentPromptId,
            script: currentScriptPath,
          });
        }
        lastSigRef.current = '';
        lastPromptIdRef.current = currentPromptId;
        lastScriptPathRef.current = currentScriptPath;
        lastChoicesLengthRef.current = undefined;
        lastChoicesScheduleKeyRef.current = '';
        if (pendingChoicesTimeoutRef.current) {
          clearTimeout(pendingChoicesTimeoutRef.current);
          pendingChoicesTimeoutRef.current = null;
        }
      }

      const ui = input.ui;
      const scoredChoicesLength = input.scoredChoicesLength;
      const choicesHeight = input.choicesHeight;
      const choicesReady = input.choicesReady;
      const prevMainHeightValue = input.prevMainHeight;
      const hasPanel = input.hasPanel;

      if (promptData?.grid && input.mainDomHeight > 10) {
        return;
      }

      const currentChoicesLength = scoredChoicesLength;
      const previousChoicesLength = lastChoicesLengthRef.current;

      const shrinkAgainstPrevMain =
        ui === UI.arg &&
        !choicesReady &&
        prevMainHeightValue > 0 &&
        choicesHeight >= 0 &&
        choicesHeight < prevMainHeightValue;

      const shrinkAgainstPrevChoices =
        ui === UI.arg &&
        !choicesReady &&
        typeof previousChoicesLength === 'number' &&
        currentChoicesLength < previousChoicesLength &&
        choicesHeight >= 0;

      const allowPreReadyShrink = shrinkAgainstPrevChoices || shrinkAgainstPrevMain;

      if (ui === UI.arg && !choicesReady && !allowPreReadyShrink) {
        if (typeof currentChoicesLength === 'number') {
          lastChoicesLengthRef.current = currentChoicesLength;
        }
        return;
      }

      const resizeResult = performResize(input);
      let mh = resizeResult.mainHeight;
      let forceHeight = resizeResult.forceHeight;
      let forceResize = resizeResult.forceResize;
      const urgentShrink = resizeResult.urgentShrink;
      const forceWidth =
        typeof promptData?.width === 'number' ? (promptData.width as number) : undefined;

      if (ui === UI.debugger) {
        forceHeight = 128;
      }

      if (mh === 0 && promptData?.preventCollapse) {
        const fallbackMain = Math.max(
          input.mainHeightCurrent || 0,
          Math.max(
            0,
            (promptData?.height ?? PROMPT.HEIGHT.BASE) -
              input.topHeight -
              input.footerHeight,
          ),
        );
        mh = fallbackMain;
        forceResize = true;
      }

      const data: ResizeData = {
        id: promptData?.id || 'missing',
        pid: (window as any).pid || 0,
        reason,
        scriptPath: currentScriptPath,
        placeholderOnly: input.placeholderOnly,
        topHeight: input.topHeight,
        ui,
        mainHeight: mh + (input.isWindow ? 24 : 0) + 1,
        footerHeight: input.footerHeight,
        mode: promptData?.mode || Mode.FILTER,
        hasPanel,
        hasInput: g(inputAtom)?.length > 0,
        previewEnabled: input.previewEnabled,
        open: g(_open),
        tabIndex: g(_tabIndex),
        isSplash: g(isSplashAtom),
        hasPreview: input.hasPreview,
        inputChanged: g(_inputChangedAtom),
        forceResize,
        forceHeight,
        forceWidth,
        isWindow: input.isWindow,
        justOpened: input.justOpened as any,
        totalChoices: scoredChoicesLength as any,
        isMainScript: g(isMainScriptAtom) as any,
      } as ResizeData;

      try {
        const sigObj = {
          ui,
          mh,
          topHeight: input.topHeight,
          footerHeight: input.footerHeight,
          hasPanel: input.hasPanel,
          hasPreview: input.hasPreview,
          forceHeight: forceHeight || 0,
          forceWidth: forceWidth || 0,
        };
        const sig = JSON.stringify(sigObj);
        const justOpened = Boolean(input.justOpened);
        if (
          !justOpened &&
          !urgentShrink &&
          sig === lastSigRef.current &&
          !forceResize &&
          !forceHeight &&
          !forceWidth
        ) {
          if (debug) log.info('ResizeController: signature unchanged; skipping send');
          return;
        }
        lastSigRef.current = sig;
      } catch (e) {
        if (debug) {
          log.info('ResizeController: signature check error', {
            message: (e as Error)?.message,
          });
        }
      }

      const inflight = g(resizeInflightAtom);
      if (inflight && !(urgentShrink || forceResize || forceHeight || forceWidth)) {
        if (debug) {
          log.info('ResizeController: inflight, skipping non-urgent resize', {
            inflight,
            urgentShrink,
            forceResize,
            forceHeight,
            forceWidth,
          });
        }
        return;
      }

      store.set(resizeInflightAtom, true);
      log.info('ResizeController: sending resize', { pid: data.pid, id: data.id, mainHeight: data.mainHeight, reason: data.reason });
      sendResize(data);
      store.set(prevMh, mh);

      try {
        const prevChoicesLength = lastChoicesLengthRef.current;
        const nextChoicesLength = typeof scoredChoicesLength === 'number' ? scoredChoicesLength : 0;
        lastChoicesLengthRef.current = nextChoicesLength;
        const choicesChanged =
          typeof prevChoicesLength === 'number' && prevChoicesLength !== nextChoicesLength;
        if (choicesChanged) {
          const direction = nextChoicesLength < prevChoicesLength ? 'SHRINK' : 'GROW';
          const scheduleKey = `${currentPromptId ?? ''}|${nextChoicesLength}|${direction}`;
          if (lastChoicesScheduleKeyRef.current !== scheduleKey) {
            if (pendingChoicesTimeoutRef.current) {
              clearTimeout(pendingChoicesTimeoutRef.current);
              pendingChoicesTimeoutRef.current = null;
            }
            lastChoicesScheduleKeyRef.current = scheduleKey;
            const delay = direction === 'SHRINK' ? 48 : 96;
            if (debug) {
              log.info('ResizeController: scheduling follow-up for choices length change', {
                direction,
                delay,
                from: prevChoicesLength,
                to: nextChoicesLength,
                scheduleKey,
              });
            }
            pendingChoicesTimeoutRef.current = setTimeout(() => {
              pendingChoicesTimeoutRef.current = null;
              if (lastChoicesScheduleKeyRef.current === scheduleKey) {
                lastChoicesScheduleKeyRef.current = '';
              }
              try {
                scheduleResizeExecution(`CHOICES_LENGTH_${direction}`);
              } catch (error) {
                if (debug) {
                  log.info('ResizeController: follow-up resize threw', {
                    message: (error as Error)?.message,
                  });
                }
              }
            }, delay);
          }
          if (debug) {
            log.info('ResizeController: recorded choices length change', {
              prevChoicesLength,
              nextChoicesLength,
              direction,
              scheduleKey,
            });
          }
        }
        if (!choicesChanged && debug) {
          log.info('ResizeController: choices length unchanged after send', {
            prevChoicesLength,
            nextChoicesLength,
          });
        }
      } catch {}

      try {
        const isArg = ui === UI.arg;
        const isJustOpened = Boolean(input.justOpened);
        const key = `${currentPromptId ?? ''}`;
        if (isArg && isJustOpened) {
          const count = recheckCountsRef.current[key] || 0;
          if (count < 2) {
            recheckCountsRef.current[key] = count + 1;
            const delay = count === 0 ? 50 : 120;
            log.info('ResizeController: scheduling recheck', { delayMs: delay, attempt: recheckCountsRef.current[key], promptId: key });
            setTimeout(() => {
              try { scheduleResizeExecution('RECHECK'); } catch {}
            }, delay);
          }
        } else if (!isJustOpened && currentPromptId) {
          recheckCountsRef.current[currentPromptId] = 0;
        }
      } catch {}

      setTimeout(() => {
        try { store.set(resizeInflightAtom, false); } catch {}
      }, 300);
    },
    [store]
  );

  const scheduleResizeExecution = useCallback(
    (reason: string) => {
      lastReasonRef.current = reason;
      if (framePendingRef.current) return;

      framePendingRef.current = true;
      requestAnimationFrame(() => {
        framePendingRef.current = false;
        executeResize(lastReasonRef.current);
      });
    },
    [executeResize],
  );

  // Trigger the execution when the mainHeightTrigger value changes or tick increments
  // Use layout effect so DOM measurements + IPC happen before paint
  useLayoutEffect(() => {
    log.info('ResizeController: tick/mainHeight trigger');
    scheduleResizeExecution('CONTROLLER_TRIGGER');
  }, [scheduleResizeExecution, mainHeightTrigger, tick]);

  // Also trigger once when the prompt/script changes to avoid missing the first shrink
  useLayoutEffect(() => {
    log.info('ResizeController: promptChangeKey trigger', { promptChangeKey });
    scheduleResizeExecution('PROMPT_CHANGED');
    // no cleanup needed
  }, [scheduleResizeExecution, promptChangeKey]);

  useEffect(() => {
    return () => {
      if (pendingChoicesTimeoutRef.current) {
        clearTimeout(pendingChoicesTimeoutRef.current);
        pendingChoicesTimeoutRef.current = null;
      }
      lastChoicesScheduleKeyRef.current = '';
    };
  }, []);

  return null; // Controller components don't render anything
};

export default ResizeController;

```


---
## Implementation Guide

### The Core Problem

The issue is that multiple async operations compete to show the window and set its bounds:

1. `setPromptData` detects `shouldDeferShow=true` and sets flags
2. Renderer sends resize events with correct calculated dimensions
3. `resize()` processes events and may call `showPrompt()` on "dimensions unchanged"
4. `attemptPreload` (debounced 25ms) runs and calls `initBounds()` with CACHED bounds
5. Window ends up shown at wrong size, then another resize fixes it

### Proposed Solution: Bounds Lock Mechanism

Instead of just flags, implement a "bounds lock" that prevents ANY bounds modification until the deferred show completes:

### Step 1: Add bounds lock state

```typescript
// File: app/src/main/prompt.ts
// Location: After line ~1041 (near skipInitBoundsForResize)

showAfterNextResize = false;
// Flag to prevent initBounds from overwriting resize-calculated dimensions
skipInitBoundsForResize = false;
// NEW: Lock that prevents ALL bounds changes until deferred show completes
boundsLockedForResize = false;
```

### Step 2: Modify setBounds to respect the lock

```typescript
// File: app/src/main/prompt.ts
// Location: In the setBounds method (find it and add check at start)

setBounds = (bounds: Partial<Rectangle>, reason: string) => {
  // NEW: Skip bounds changes when locked (except from resize with correct dimensions)
  if (this.boundsLockedForResize && reason !== 'CONTROLLER_TRIGGER' && reason !== 'PROMPT_CHANGED') {
    this.logInfo(`🔒 Bounds locked, skipping setBounds from: ${reason}`);
    return;
  }
  // ... rest of existing setBounds code
};
```

### Step 3: Set lock in setPromptData when deferring

```typescript
// File: app/src/main/prompt.set-prompt-data.ts
// Location: Line ~190 (in shouldDeferShow block)

if (shouldDeferShow) {
  prompt.showAfterNextResize = true;
  prompt.skipInitBoundsForResize = true;
  prompt.boundsLockedForResize = true;  // NEW: Lock bounds
  // Safety fallback...
  setTimeout(() => {
    if (prompt.showAfterNextResize && !prompt.window?.isDestroyed()) {
      prompt.logWarn(`${prompt.id}: showAfterNextResize fallback triggered`);
      prompt.showAfterNextResize = false;
      prompt.skipInitBoundsForResize = false;
      prompt.boundsLockedForResize = false;  // NEW: Unlock
      prompt.showPrompt();
    }
  }, 200);
}
```

### Step 4: Clear lock after successful resize-triggered show

```typescript
// File: app/src/main/prompt.ts
// Location: In resize() after showPrompt() calls (3 places)

// After each showPrompt() in resize():
this.showPrompt();
this.skipInitBoundsForResize = false;
this.boundsLockedForResize = false;  // NEW: Unlock after show
```

### Alternative Solution: Delay attemptPreload

A simpler fix might be to delay `attemptPreload` until after the resize cycle:

```typescript
// File: app/src/main/kit.ts
// Location: Line ~284

} else {
  log.info(`${pid}: 🖱️ Moving prompt to mouse screen`);
  log.info(`[SC_CHAIN ${chainId}] attemptPreloadAndMoveToMouseScreen`);
  // Delay preload to let resize complete first
  setTimeout(() => {
    prompt.attemptPreload(promptScriptPath);
  }, 50);
  prompt.moveToMouseScreen();
}
```

### Testing

1. Create a test script:
```typescript
// Name: Testing Micro Resize
// Shortcut: opt m
import "@johnlindquist/kit"
await micro("Pick one", ["One", "Two", "Three"])
```

2. Clear any cached bounds:
   - Delete `~/.kit/db/prompt-state.json` or remove the specific script entry

3. Trigger the script via keyboard shortcut (not from main menu)

4. Watch the window - it should appear at the correct small size immediately

5. Check logs at `~/Library/Logs/ScriptKit/window.log` for:
   - `shouldDeferShow=true`
   - `Skipping initBounds` or `🔒 Bounds locked`
   - `🎤 Showing prompt after resize complete`
   - NO `initBounds` applying height:480 after resize applies height:155

---

## Instructions For The Next AI Agent

You are reading the "Prompt Window Resize Flash Expert Bundle". This file is self-contained and includes all the context you should assume you have.

Your job:

* Design and describe the minimal, safe changes needed to fully resolve the prompt window flash issue.
* Operate **only** on the files and code snippets included in this bundle.

When you propose changes, follow these rules strictly:

1. Always provide **precise code snippets** that can be copy-pasted directly into the repo.
2. Always include **exact file paths** (e.g. `app/src/main/prompt.ts`) and line numbers or clear location descriptions.
3. Never describe code changes only in prose. Show the full function or block as it should look **after** the change.
4. Keep instructions **unmistakable and unambiguous**.
5. Assume you cannot see any files outside this bundle.

### Key Constraints:

- The fix must not break the main menu (which uses `initMain=true` flow)
- The fix must work for keyboard shortcut triggered scripts
- The fix must handle both cached and uncached scripts
- The fix must not introduce race conditions or deadlocks

### The Core Timeline to Fix:

```
CURRENT (broken):
setPromptData → showAfterNextResize=true → resize() shows prompt → attemptPreload→initBounds(480px) → FLASH

DESIRED (fixed):
setPromptData → showAfterNextResize=true → resize() calculates 155px → setBounds(155px) → showPrompt() → NO initBounds override
```

Work directly with the code and return a clear, step-by-step plan plus exact code edits.
