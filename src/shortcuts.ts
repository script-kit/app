import { app, globalShortcut } from 'electron';
import log from 'electron-log';
import path from 'path';
import { readFile } from 'fs/promises';
import { Script } from '@johnlindquist/kit/types/core';
import { subscribeKey } from 'valtio/utils';

import {
  mainScriptPath,
  shortcutsPath,
  shortcutNormalizer,
  kitPath,
} from '@johnlindquist/kit/cjs/utils';
import { runPromptProcess } from './kit';
import { emitter, KitEvent } from './events';
import { focusPrompt, isFocused, isVisible, reload } from './prompt';
import { convertKey, kitState, subs } from './state';
import { Trigger } from './enums';

const modifiers = /^(Command|Cmd|Control|Ctrl|CommandOrControl|CmdOrCtrl|Alt|Option|AltGr|Shift|Super)$/;
const keyCodes = /^([0-9A-Z)!@#$%^&*(:+<_>?~{|}";=,\-./`[\\\]']|F1*[1-9]|F10|F2[0-4]|Plus|Space|Tab|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc|VolumeUp|VolumeDown|VolumeMute|MediaNextTrack|MediaPreviousTrack|MediaStop|MediaPlayPause|PrintScreen)$/;

const validateAccelerator = (shortcut: string) => {
  const parts = shortcut.split('+');
  let keyFound = false;
  return parts.every((val, index) => {
    const isKey = keyCodes.test(val);
    const isModifier = modifiers.test(val);
    if (isKey) {
      // Key must be unique
      if (keyFound) return false;
      keyFound = true;
    }
    // Key is required
    if (index === parts.length - 1 && !keyFound) return false;
    return isKey || isModifier;
  });
};

const infoScript = kitPath('cli', 'info.js');

const defaultFail = (
  shortcut: string,
  filePath: string
) => `# Shortcut Conversion Failed

Attempted to convert to a valid shortcut, but result was invalid:

<code>${shortcut}</code>

Please open ${path.basename(
  filePath
)} and try again or ask a question in our [Github Discussions](https://github.com/johnlindquist/kit/discussions)
`;

const registerFail = (shortcut: string, filePath: string) =>
  `# Shortcut Registration Failed

<code>${shortcut}</code> is already registered to ${path.basename(filePath)}
`;

const mainFail = (shortcut: string, filePath: string) =>
  `# Failed to Register Main Shortcut

<code>${shortcut}</code> failed to register. May already be registered to another app.`;

const shortcutInfo = async (
  shortcut: string,
  filePath: string,
  md = defaultFail
) => {
  runPromptProcess(
    infoScript,
    [path.basename(filePath), shortcut, md(shortcut, filePath)],
    {
      force: true,
      trigger: Trigger.Info,
    }
  );
};

const registerShortcut = (shortcut: string, filePath: string) => {
  // use convertKey to convert the final character in the shortcut to the correct key

  const finalShortcut = convertShortcut(shortcut, filePath);
  log.verbose(`Converted shortcut from ${shortcut} to ${finalShortcut}`);
  if (!finalShortcut) return false;

  try {
    const success = globalShortcut.register(finalShortcut, async () => {
      runPromptProcess(filePath, [], {
        force: true,
        trigger: Trigger.Shortcut,
      });
      focusPrompt();
    });

    if (!success) {
      log.info(`Failed to register: ${shortcut} to ${filePath}`);
      shortcutInfo(shortcut, filePath, registerFail);
    }

    return success;
  } catch (error) {
    return false;
  }
};

export const registerTrayShortcut = () => {
  const semicolon = convertKey(';');
  const success = globalShortcut.register(
    `CommandOrControl+Shift+${semicolon}`,
    () => {
      emitter.emit(KitEvent.TrayClick);
    }
  );

  if (process.env.NODE_ENV === 'development') {
    globalShortcut.register(`Option+${semicolon}`, async () => {
      reload();
      // wait for reload to finish
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await runPromptProcess(mainScriptPath, [], {
        force: true,
        trigger: Trigger.Menu,
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

export const shortcutMap = new Map<string, string>();

export const unlinkShortcuts = (filePath: string) => {
  const oldShortcut = shortcutMap.get(filePath);

  if (oldShortcut) {
    globalShortcut.unregister(oldShortcut);
    shortcutMap.delete(filePath);
  }
};

export const shortcutScriptChanged = ({
  shortcut,
  filePath,
  friendlyShortcut,
}: Script) => {
  const oldShortcut = shortcutMap.get(filePath);
  const sameScript = oldShortcut === shortcut;

  // Handle existing shortcuts

  const exists = [...shortcutMap.entries()].find(([, s]) => s === shortcut);
  if (exists && !sameScript) {
    shortcutInfo(shortcut, exists[0], registerFail);

    return;
  }

  if (oldShortcut) {
    // No change
    if (sameScript) {
      const message = `${shortcut} is already registered to ${filePath}`;
      log.info(message);

      return;
    }

    // User removed an existing shortcut
    globalShortcut.unregister(oldShortcut);
    shortcutMap.delete(filePath);
    log.info(`Unregistered ${oldShortcut} from ${filePath}`);
  }

  if (!shortcut) return;
  // At this point, we know it's a new shortcut, so register it

  const registerSuccess = registerShortcut(shortcut, filePath);

  if (registerSuccess && globalShortcut.isRegistered(shortcut)) {
    log.info(`Registered ${shortcut} to ${filePath}`);
    shortcutMap.set(filePath, shortcut);
  }
};

const convertShortcut = (shortcut: string, filePath: string): string => {
  const sourceKey = shortcut?.split('+')?.pop();
  log.info(`Shortcut main key: ${sourceKey}`);

  if (!sourceKey) {
    shortcutInfo(shortcut, filePath);
    return '';
  }

  if (sourceKey?.length > 1) {
    if (!validateAccelerator(shortcut)) {
      shortcutInfo(shortcut, filePath);
      return '';
    }

    return shortcut;
  }

  const convertedKey = convertKey(sourceKey).toUpperCase();
  const mods = shortcut?.split('+')?.slice(0, -1).join('+');
  const finalShortcut = `${mods}+${convertedKey}`;

  if (!validateAccelerator(finalShortcut)) {
    shortcutInfo(shortcut, filePath);
    return '';
  }

  if (!validateAccelerator(finalShortcut)) {
    shortcutInfo(shortcut, filePath);
    return '';
  }

  return finalShortcut;
};

export const updateMainShortcut = async (filePath: string) => {
  log.info(`Updating main shortcut for ${filePath}`);
  if (filePath === shortcutsPath) {
    log.info(`SHORTCUTS DB CHANGED:`, filePath);
    const settings = JSON.parse(await readFile(filePath, 'utf-8'));
    const rawShortcut = settings?.shortcuts?.[mainScriptPath];

    const shortcut = rawShortcut ? shortcutNormalizer(rawShortcut) : '';
    const finalShortcut = convertShortcut(shortcut, filePath);
    if (!finalShortcut) return;

    log.verbose(`Converted main shortcut from ${shortcut} to ${finalShortcut}`);

    const oldShortcut = shortcutMap.get(mainScriptPath);

    if (finalShortcut === oldShortcut) return;

    if (oldShortcut) {
      globalShortcut.unregister(oldShortcut);
      shortcutMap.delete(mainScriptPath);
    }

    const ret = globalShortcut.register(finalShortcut, async () => {
      log.info(`🏚  main shortcut`);
      if (isVisible() && !isFocused()) {
        focusPrompt();
        app.focus({
          steal: true,
        });
      } else {
        await runPromptProcess(mainScriptPath, [], {
          force: true,
          trigger: Trigger.Menu,
        });
      }
    });

    if (!ret) {
      log.warn(`Failed to register: ${finalShortcut} to ${mainScriptPath}`);
      shortcutInfo(finalShortcut, mainScriptPath, mainFail);
    }

    if (ret && globalShortcut.isRegistered(finalShortcut)) {
      kitState.mainShortcut = finalShortcut;
      log.info(`Registered ${finalShortcut} to ${mainScriptPath}`);
      shortcutMap.set(mainScriptPath, finalShortcut);
    }
  }
};

const pauseShortcuts = () => {
  log.info(`PAUSING GLOBAL SHORTCUTS`);
  globalShortcut.unregisterAll();
};

const resumeShortcuts = () => {
  log.info(`RESUMING GLOBAL SHORTCUTS`);
  shortcutMap.forEach(registerShortcut);
};

const subShortcutsPaused = subscribeKey(
  kitState,
  'shortcutsPaused',
  (shortcutsPaused) => {
    if (shortcutsPaused) {
      pauseShortcuts();
    } else {
      resumeShortcuts();
    }
  }
);

subs.push(subShortcutsPaused);

// sub to keymap
let prevKeymap: any = null;

const subKeymap = subscribeKey(kitState, 'keymap', async (keymap) => {
  log.info(`🔑 Keymap changed: ${JSON.stringify(keymap)}`);
  if (prevKeymap) {
    pauseShortcuts();
    await new Promise((resolve) => setTimeout(resolve, 500));
    resumeShortcuts();
  }

  prevKeymap = keymap;
});

subs.push(subKeymap);
