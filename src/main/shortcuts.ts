import path from 'node:path';
import { getMainScriptPath, parseScript, parseScriptletsFromPath } from '@johnlindquist/kit/core/utils';
import { BrowserWindow, globalShortcut } from 'electron';
import { debounce } from 'lodash-es';
import { subscribeKey } from 'valtio/utils';
import { Trigger } from '../shared/enums';
import { emitter, KitEvent } from '../shared/events';
import { isReservedShortcut } from '../shared/shortcuts';
import { LoggedMap } from './compare';
import { convertShortcut, shortcutInfo } from './helpers';
import { createUiohookToName } from './io';
import { runPromptProcess } from './kit';
import { keymapLog, shortcutsLog as log } from './logs';
import { runMainScript } from './main-script';
import { processes, spawnShebang } from './process';
import { prompts } from './prompts';
import { convertKey, kitState, subs } from './state';

const registerFail = (shortcut: string, filePath: string) =>
  `# Shortcut Registration Failed

<code>${shortcut}</code> is already registered to ${path.basename(filePath)}
`;

const alreadyFail = (shortcut: string, filePath: string, otherPath = '') =>
  `# Shortcut Registration Failed

Attempting to assign <code>${shortcut}</code> to ${filePath}...

<code>${shortcut}</code> is already registered to ${path.basename(otherPath)}
`;

const mainFail = (shortcut: string, _filePath: string) =>
  `# Failed to Register Main Shortcut

<code>${shortcut}</code> failed to register. May already be registered to another app.`;

const reservedFail = (shortcut: string, filePath: string) =>
  `# Reserved Shortcut Blocked

<code>${shortcut}</code> is a reserved system shortcut and cannot be registered by scripts.

The script ${path.basename(filePath)} attempted to register this shortcut, but it was blocked to prevent breaking essential OS functionality like copy, paste, undo, etc.
`;

interface ProcessHandlerOptions {
  debounceMs?: number;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

const createProcessHandler = (fn: () => Promise<void> | void, options: ProcessHandlerOptions = {}) => {
  const { debounceMs = 250, pollIntervalMs = 100, maxWaitMs = 5000 } = options;

  const ignoreFlag = { value: false };
  let currentTimeout: NodeJS.Timeout | null = null;

  const waitForProcess = async (): Promise<void> => {
    if (processes.hasAvailableProcess) {
      return;
    }

    ignoreFlag.value = true;
    const startTime = Date.now();

    // Log current process state when waiting starts
    log.info('Waiting for available process. Current processes:', processes.getAllProcessInfo());

    try {
      await new Promise((resolve, reject) => {
        let checkCount = 0;
        const interval = setInterval(() => {
          checkCount++;
          const hasAvailable = processes.hasAvailableProcess;

          if (checkCount % 10 === 0) {
            // Log every second
            log.info(`Still waiting for process. Check #${checkCount}, hasAvailable: ${hasAvailable}`, {
              processes: processes.getAllProcessInfo(),
              elapsed: Date.now() - startTime,
            });
          }

          if (hasAvailable) {
            clearInterval(interval);
            resolve(true);
            return;
          }

          if (Date.now() - startTime > maxWaitMs) {
            clearInterval(interval);
            log.error('Timeout waiting for process. Final state:', {
              processes: processes.getAllProcessInfo(),
              hasAvailable,
              elapsed: Date.now() - startTime,
            });
            reject(new Error('Timeout waiting for available process'));
          }
        }, pollIntervalMs);

        currentTimeout = interval;
      });
    } finally {
      ignoreFlag.value = false;
      if (currentTimeout) {
        clearInterval(currentTimeout);
        currentTimeout = null;
      }
    }
  };

  return debounce(
    async () => {
      if (ignoreFlag.value) {
        return;
      }

      try {
        await waitForProcess();
        return await fn();
      } catch (error) {
        log.error('Process handler error:', error);
        // Could emit an event here if needed
      }
    },
    debounceMs,
    { leading: true },
  );
};

const registerShortcut = (shortcut: string, filePath: string, shebang = '') => {
  // Security: Block reserved system shortcuts to prevent breaking OS functionality
  if (isReservedShortcut(shortcut)) {
    log.warn(`Blocked reserved shortcut: ${shortcut} for ${filePath}`);
    shortcutInfo(shortcut, filePath, reservedFail);
    return false;
  }

  try {
    const shortcutAction = createProcessHandler(() => {
      const traceId = Math.random().toString(36).slice(2, 10);
      log.info(`[SC ${traceId}] Shortcut handler start`, { shortcut, filePath, shebang: !!shebang });
      kitState.shortcutPressed = shortcut;

      if (shebang) {
        // split shebang into command and args
        log.info(`[SC ${traceId}] Running shebang: ${shebang} for ${filePath}`);
        spawnShebang({ shebang, filePath });

        return;
      }

      log.info(`
----------------------------------------
🏡  Shortcut pressed: ${shortcut} -> ${filePath}`);
      log.info(`[SC ${traceId}] runPromptProcess`, { shortcut, filePath });

      runPromptProcess(filePath, [], {
        force: true,
        trigger: Trigger.Shortcut,
        sponsorCheck: true,
      });
      log.info(`[SC ${traceId}] runPromptProcess:dispatched`, { shortcut, filePath });
    });
    const success = globalShortcut.register(shortcut, shortcutAction);

    if (success) {
      log.info(`Registered: ${shortcut} to ${filePath}`);
    } else {
      log.info(`Failed to register: ${shortcut} to ${filePath}`);
      shortcutInfo(shortcut, filePath, registerFail);
    }

    return success;
  } catch (error) {
    return false;
  }
};

export const registerKillLatestShortcut = () => {
  const semicolon = convertKey(';');
  const killLatestShortcut = `CommandOrControl+Shift+${semicolon}`;
  const success = globalShortcut.register(killLatestShortcut, () => {
    kitState.shortcutPressed = killLatestShortcut;
    emitter.emit(KitEvent.RemoveMostRecent);
  });

  if (process.env.NODE_ENV === 'development') {
    globalShortcut.register(`Option+${semicolon}`, async () => {
      prompts?.prevFocused?.reload();
      // wait for reload to finish
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await runPromptProcess(getMainScriptPath(), [], {
        force: true,
        trigger: Trigger.Menu,
        main: true,
        sponsorCheck: true,
      });
    });
  }

  log.verbose(`Tray shortcut registered: ${success ? 'success' : 'fail'}`);
};

// const success = globalShortcut.register(``, async () => {
//   runPromptProcess(filePath);
//   focusPrompt();
// });

// if (!success) {
//   log.info(`Failed to register: ${shortcut} to ${filePath}`);
// }

// return success;

/**
 * A Map that holds shortcuts with automatic diff logging on add/delete operations.
 */
export const shortcutMap = new LoggedMap<
  string,
  {
    shortcut: string;
    shebang: string;
  }
>();

export const unlinkShortcuts = (filePath: string) => {
  const old = shortcutMap.get(filePath);

  if (old?.shortcut) {
    globalShortcut.unregister(old.shortcut);
    shortcutMap.delete(filePath);
  }
};

export const shortcutScriptChanged = async ({
  filePath,
  shortcut,
  shebang,
  kenv,
}: {
  filePath: string;
  shortcut?: string;
  shebang?: string;
  kenv: string;
}) => {
  const convertedShortcut = convertShortcut(shortcut || '', filePath);
  const old = shortcutMap.get(filePath);
  // TODO: Bring back trusted kenvs
  if (kenv !== '' && !kitState.trustedKenvs.includes(kenv)) {
    if (shortcut) {
      log.info(`Ignoring ${filePath} // Shortcut metadata because it's not trusted.`);
      log.info(`Add "${kitState.trustedKenvsKey}=${kenv}" to your .env file to trust it.`);
    }

    if (old) {
      globalShortcut.unregister(old.shortcut);
      shortcutMap.delete(filePath);
    }
    return;
  }
  const sameScript = old?.shortcut === convertedShortcut;

  // Handle existing shortcuts

  const exists = [...shortcutMap.entries()].find(([, s]) => s?.shortcut === convertedShortcut);
  // log.info({ sameScript, exists });
  if (exists && !sameScript) {
    const otherPath = exists[0];
    let script;
    if (otherPath.includes('#')) {
      log.info(`Checking scriptlets in ${otherPath}`);
      let scripts;

      try {
        scripts = await parseScriptletsFromPath(otherPath);
      } catch (error) {
        log.error(`Error parsing scriptlets from ${otherPath}:`, error);
        scripts = [
          {
            filePath: otherPath,
            shortcut: '',
            shebang: '',
            kenv: '',
          },
        ];
      }
      script = scripts.find((s) => s.filePath === otherPath);
      if (!script) {
        log.error(`Script ${otherPath} not found. Skipping shortcut unregistration.`);
      }
    } else {
      script = await parseScript(otherPath);
    }

    log.info(`Checking if ${convertedShortcut} is still registered to ${otherPath}`, script);

    const validateStillRegistered = convertShortcut(script?.shortcut, script?.filePath) === convertedShortcut;

    if (validateStillRegistered) {
      log.info(`Shortcut ${convertedShortcut} already registered to ${otherPath}`);
      shortcutInfo(convertedShortcut, filePath, alreadyFail, otherPath);

      return;
    }
    log.info(`Shortcut ${convertedShortcut} is no longer registered to ${otherPath}`);
    try {
      globalShortcut.unregister(convertedShortcut);
      shortcutMap.delete(otherPath);
    } catch (error) {
      log.error(error);
    }
  }

  if (old?.shortcut) {
    // No change
    if (sameScript) {
      const message = `${convertedShortcut} is already registered to ${filePath}`;
      log.info(message);

      return;
    }

    // User removed an existing shortcut
    globalShortcut.unregister(old.shortcut);
    shortcutMap.delete(filePath);
    log.info(`Unregistered ${old.shortcut} from ${filePath}`);
  }

  if (!convertedShortcut) {
    // log.info(`No shortcut found for ${filePath}`);
    return;
  }

  log.info(`Found shortcut: ${convertedShortcut} for ${filePath}`);
  // At this point, we know it's a new shortcut, so register it

  const registerSuccess = registerShortcut(convertedShortcut, filePath, shebang);

  if (registerSuccess && globalShortcut.isRegistered(convertedShortcut)) {
    log.info(`Registered ${convertedShortcut} to ${filePath}`);
    shortcutMap.set(filePath, {
      shortcut: convertedShortcut,
      shebang: shebang || '',
    });
  } else {
    log.error(`Failed to register ${convertedShortcut} to ${filePath}`);
  }
};

export const updateMainShortcut = (shortcut?: string) => {
  const checkShortcut = shortcut ? shortcut : kitState.isMac ? 'cmd ;' : 'ctrl ;';
  log.info(`updateMainShortcut with ${checkShortcut}`);

  const finalShortcut = convertShortcut(checkShortcut, getMainScriptPath());
  if (!finalShortcut) {
    return;
  }

  log.info(`Converted main shortcut from ${shortcut} to ${finalShortcut}`);

  const old = shortcutMap.get(getMainScriptPath());

  if (finalShortcut === old?.shortcut) {
    return;
  }

  if (old?.shortcut) {
    log.info(`Unregistering old main shortcut: ${old?.shortcut}`);
    globalShortcut.unregister(old?.shortcut);
    shortcutMap.delete(getMainScriptPath());
  }

  const mainShortcutAction = createProcessHandler(async () => {
    kitState.shortcutPressed = finalShortcut;

    const isFocusedPromptMainScript = prompts.focused?.isMainMenu;

    log.info(`🏡 Main shortcut pressed. Focused prompt script: ${prompts?.focused?.scriptPath}`);

    if (isFocusedPromptMainScript && prompts.focused) {
      const win = prompts.focused.window;
      const electronFocused = BrowserWindow.getFocusedWindow();

      const windowIsFocused = !!win && !win.isDestroyed() && win.isFocused();
      const windowIsVisible = !!win && !win.isDestroyed() && win.isVisible();
      const electronThinksFocused = !!win && electronFocused === win;

      const actuallyFocused = windowIsFocused && windowIsVisible && electronThinksFocused;

      if (actuallyFocused) {
        log.info(
          '🔍 Main shortcut pressed while focused prompt main script. Hiding focused prompt.',
          prompts.focused.id,
          prompts.focused.pid,
        );
        processes.removeByPid(prompts.focused.pid, 'shortcuts focused prompt cleanup');
        prompts.focused = null;
        return;
      }

      log.info('⚠️ Main shortcut: main menu prompt is marked focused but window focus is inconsistent', {
        windowIsFocused,
        windowIsVisible,
        electronThinksFocused,
        electronFocusedId: electronFocused?.id,
      });
    }

    log.info(`

----------------------------------------
🏚  Main shortcut pressed: ${finalShortcut}`);

    if (kitState.kenvEnv?.KIT_MAIN_SHORTCUT_RETURN_FOCUS) {
      log.info(
        '🔍 Because KIT_MAIN_SHORTCUT_RETURN_FOCUS is set, attempting to return focus to the previous focused prompt',
      );

      if (prompts?.prevFocused) {
        prompts.prevFocused.window?.focus();
        return;
      }
    }

    await runMainScript();
  });
  const ret = globalShortcut.register(finalShortcut, mainShortcutAction);

  if (!ret) {
    log.warn(`Failed to register: ${finalShortcut} to ${getMainScriptPath(process.env.KIT_MAIN_SCRIPT)}`);
    shortcutInfo(finalShortcut, getMainScriptPath(), mainFail);
  }

  if (ret && globalShortcut.isRegistered(finalShortcut)) {
    kitState.mainShortcut = finalShortcut;
    log.info(`Registered ${finalShortcut} to ${getMainScriptPath(process.env.KIT_MAIN_SCRIPT)}`);
    shortcutMap.set(getMainScriptPath(), {
      shortcut: finalShortcut,
      shebang: '',
    });
  }
};

const pauseShortcuts = () => {
  log.info('PAUSING GLOBAL SHORTCUTS');
  globalShortcut.unregisterAll();
  shortcutMap.clear();
};

const resumeShortcuts = () => {
  log.info('RESUMING GLOBAL SHORTCUTS');
  updateMainShortcut(kitState.kenvEnv?.KIT_MAIN_SHORTCUT || kitState.mainShortcut || '');
  for (const [filePath, script] of kitState.scripts) {
    // log.info(`🤦‍♂️ Checking script: ${filePath}`, script?.shortcut);
    if (script.shortcut) {
      shortcutScriptChanged(script);
    }
  }
};

let paused = false;
const subShortcutsPaused = subscribeKey(kitState, 'shortcutsPaused', (shortcutsPaused) => {
  if (paused === shortcutsPaused) {
    return;
  }
  log.info('✂️ shortcutsPaused change...', {
    oldPaused: paused,
    newPaused: shortcutsPaused,
  });
  paused = shortcutsPaused;
  if (shortcutsPaused) {
    pauseShortcuts();
  } else {
    resumeShortcuts();
  }
});

subs.push(subShortcutsPaused);

// sub to keymap
let prevKeymap: any = null;

export const handleKeymapChange = async () => {
  keymapLog.info('Handling keymap change...', kitState.keymap);
  if (prevKeymap) {
    pauseShortcuts();
    await new Promise((resolve) => setTimeout(resolve, 200));

    resumeShortcuts();
  }

  createUiohookToName();

  prevKeymap = kitState.keymap;
};

export async function shortcutsSelfCheck() {
  const shouldBeRegistered = new Set<string>();

  // For each script in kitState.scripts
  for (const [filePath, script] of kitState.scripts) {
    const hasShortcut = Boolean(script.shortcut);
    const isTrusted = !script.kenv || script.kenv === '' || kitState.trustedKenvs.includes(script.kenv);

    if (hasShortcut && isTrusted) {
      shouldBeRegistered.add(filePath);

      if (shortcutMap.has(filePath)) {
        const current = shortcutMap.get(filePath)?.shortcut;
        const scriptShortcut = script.shortcut;

        if (current !== scriptShortcut) {
          log.info(
            `[watchShortcuts] Shortcut mismatch. Re-registering ${filePath}. Old: ${current} | New: ${scriptShortcut}`,
          );
          await shortcutScriptChanged(script);
        }
      } else {
        log.info(`[watchShortcuts] Missing registered shortcut for ${filePath}. Re-registering...`);
        await shortcutScriptChanged(script);
      }
    }
  }

  // Unregister shortcuts that are in shortcutMap but shouldn't be.
  for (const [filePath, { shortcut }] of shortcutMap.entries()) {
    // Always keep the main shortcut registered.
    if (filePath === getMainScriptPath()) {
      continue;
    }
    if (!shouldBeRegistered.has(filePath)) {
      log.info(`[watchShortcuts] No longer needs shortcut for ${filePath}. Un-registering "${shortcut}"...`);
      unlinkShortcuts(filePath);
    }
  }

  checkMainShortcutRegistered();
}

export function checkMainShortcutRegistered() {
  // The main script is basically "getMainScriptPath()"
  // We'll rely on kitState.mainShortcut or the environment variable
  const mainShortcut = kitState.mainShortcut || kitState.kenvEnv?.KIT_MAIN_SHORTCUT;
  if (!mainShortcut) {
    log.info('[watchShortcuts] No main shortcut set in kitState.kenvEnv or kitState. Doing nothing.');
    return;
  }

  // If the main shortcut is not actually registered, re-register it
  const isRegistered = globalShortcut.isRegistered(mainShortcut);
  if (!isRegistered) {
    log.info(`[watchShortcuts] Main shortcut "${mainShortcut}" is missing. Re-registering...`);
    updateMainShortcut(mainShortcut);
  }

  // Also check "kill latest" shortcut if you want:
  const semicolon = kitState.isMac ? ';' : ';'; // or use convertKey(';') if needed
  const killLatestShortcut = `CommandOrControl+Shift+${semicolon}`;
  if (!globalShortcut.isRegistered(killLatestShortcut)) {
    log.info(`[watchShortcuts] Kill-latest "${killLatestShortcut}" missing. Re-registering...`);
    registerKillLatestShortcut();
  }
}

const debouncedHandleKeymapChange = debounce(handleKeymapChange, 200);
const subKeymap = subscribeKey(kitState, 'keymap', debouncedHandleKeymapChange);

subs.push(subKeymap);
