import path from 'node:path';
import { globalShortcut } from 'electron';
import { debounce } from 'lodash-es';
import { subscribeKey } from 'valtio/utils';

import { getMainScriptPath, parseScript, parseScriptletsFromPath } from '@johnlindquist/kit/core/utils';

import { KitEvent, emitter } from '../shared/events';
import { runPromptProcess } from './kit';

import { Trigger } from '../shared/enums';
import { convertShortcut, shortcutInfo } from './helpers';
import { processes, spawnShebang } from './process';
import { prompts } from './prompts';
import { convertKey, kitState, subs } from './state';
import { createLogger } from '../shared/log-utils';

const log = createLogger('shortcuts.ts');

const registerFail = (shortcut: string, filePath: string) =>
  `# Shortcut Registration Failed

<code>${shortcut}</code> is already registered to ${path.basename(filePath)}
`;

const alreadyFail = (shortcut: string, filePath: string, otherPath = '') =>
  `# Shortcut Registration Failed

Attempting to assign <code>${shortcut}</code> to ${filePath}...

<code>${shortcut}</code> is already registered to ${path.basename(otherPath)}
`;

const mainFail = (shortcut: string, filePath: string) =>
  `# Failed to Register Main Shortcut

<code>${shortcut}</code> failed to register. May already be registered to another app.`;

const registerShortcut = (shortcut: string, filePath: string, shebang = '') => {
  try {
    const shortcutAction = debounce(
      () => {
        kitState.shortcutPressed = shortcut;

        if (shebang) {
          // split shebang into command and args
          log.info(`Running shebang: ${shebang} for ${filePath}`);
          spawnShebang({ shebang, filePath });

          return;
        }

        // I attempted to use "attemptPreload" here, but I need to check if the same script is already running...

        log.info(`
----------------------------------------
🏡  Shortcut pressed: ${shortcut} -> ${filePath}`);

        runPromptProcess(filePath, [], {
          force: true,
          trigger: Trigger.Shortcut,
          sponsorCheck: true,
        });
      },
      250,
      {
        leading: true,
      },
    );
    const success = globalShortcut.register(shortcut, shortcutAction);

    if (success) {
      // log.info(`Registered: ${shortcut} to ${filePath}`);
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

export const shortcutMap = new Map<
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
  worker
}: {
  filePath: string;
  shortcut?: string;
  shebang?: string;
  worker?: boolean;
  kenv: string;
}) => {
  log.info(`shortcutScriptChanged: ${filePath} ${shortcut} ${shebang} ${kenv}`);
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
  log.purple({ sameScript, exists });
  if (exists && !sameScript) {
    const otherPath = exists[0];
    let script;
    if (otherPath.includes('#')) {
      log.green(`Checking scriptlets in ${otherPath}`);
      const scripts = await parseScriptletsFromPath(otherPath);
      script = scripts.find((s) => s.filePath === otherPath);
    } else {
      script = await parseScript(otherPath);
    }

    log.green(`Checking if ${convertedShortcut} is still registered to ${otherPath}`, script);

    const validateStillRegistered = convertShortcut(script?.shortcut, script?.filePath) === convertedShortcut;

    if (validateStillRegistered) {
      log.info(`Shortcut ${convertedShortcut} already registered to ${otherPath}`);
      shortcutInfo(convertedShortcut, filePath, alreadyFail, otherPath);

      return;
    }
    log.purple(`Shortcut ${convertedShortcut} is no longer registered to ${otherPath}`);
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

  const mainShortcutAction = async () => {
    kitState.shortcutPressed = finalShortcut;

    const isFocusedPromptMainScript = prompts.focused?.scriptPath === getMainScriptPath();

    log.info(`🏡 Main shortcut pressed. Focused prompt script: ${prompts?.focused?.scriptPath}`);

    if (isFocusedPromptMainScript) {
      if (prompts?.focused?.isFocused() && prompts?.focused?.isVisible()) {
        log.info(
          '🔍 Main shortcut pressed while focused prompt main script. Hiding focused prompt.',
          prompts.focused?.id,
          prompts.focused?.pid,
        );
        // prompts.focused?.hideInstant();
        processes.removeByPid(prompts.focused?.pid);
        prompts.focused = null;
        return;
      }
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

    await runPromptProcess(getMainScriptPath(), [], {
      force: true,
      trigger: Trigger.Menu,
      sponsorCheck: true,
    });
  };

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
};

const resumeShortcuts = () => {
  log.info('RESUMING GLOBAL SHORTCUTS');
  shortcutMap.forEach(({ shortcut }, filePath) => {
    const convertedShortcut = convertShortcut(shortcut, filePath);
    log.info({
      filePath,
      shortcut,
      convertedShortcut,
    });
    registerShortcut(convertedShortcut, filePath);
  });
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

const subKeymap = subscribeKey(
  kitState,
  'keymap',
  debounce(async (keymap) => {
    log.info('Handling keymap change...');
    if (prevKeymap) {
      pauseShortcuts();
      await new Promise((resolve) => setTimeout(resolve, 200));
      resumeShortcuts();
    }

    prevKeymap = keymap;
  }, 200),
);

subs.push(subKeymap);
