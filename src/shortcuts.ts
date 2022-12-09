import { app, globalShortcut } from 'electron';
import log from 'electron-log';
import path from 'path';
import { readFile } from 'fs/promises';
import { subscribeKey } from 'valtio/utils';
import { debounce } from 'lodash';

import {
  mainScriptPath,
  shortcutsPath,
  kitPath,
  shortcutNormalizer,
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

const conversionFail = (
  shortcut: string,
  filePath: string,
  otherPath = ''
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

const alreadyFail = (shortcut: string, filePath: string, otherPath = '') =>
  `# Shortcut Registration Failed

Attempting to assign <code>${shortcut}</code> to ${filePath}...

<code>${shortcut}</code> is already registered to ${path.basename(otherPath)}
`;

const mainFail = (shortcut: string, filePath: string) =>
  `# Failed to Register Main Shortcut

<code>${shortcut}</code> failed to register. May already be registered to another app.`;

const shortcutInfo = async (
  shortcut: string,
  targetScriptPath: string,
  md = conversionFail,
  otherScriptPath = ''
) => {
  const markdown = md(shortcut, targetScriptPath, otherScriptPath);
  log.info(markdown);
  runPromptProcess(
    infoScript,
    [path.basename(targetScriptPath), shortcut, markdown],
    {
      force: true,
      trigger: Trigger.Info,
    }
  );
};

const registerShortcut = (shortcut: string, filePath: string) => {
  try {
    const success = globalShortcut.register(shortcut, async () => {
      runPromptProcess(filePath, [], {
        force: true,
        trigger: Trigger.Shortcut,
      });
      focusPrompt();
    });

    if (!success) {
      log.info(`Failed to register: ${shortcut} to ${filePath}`);
      shortcutInfo(shortcut, filePath, registerFail);
    } else {
      log.info(`Registered: ${shortcut} to ${filePath}`);
    }

    return success;
  } catch (error) {
    return false;
  }
};

export const registerKillLatestShortcut = () => {
  const semicolon = convertKey(';');
  const success = globalShortcut.register(
    `CommandOrControl+Shift+${semicolon}`,
    () => {
      emitter.emit(KitEvent.RemoveMostRecent);
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
  filePath,
  shortcut,
}: {
  filePath: string;
  shortcut: string;
}) => {
  const convertedShortcut = convertShortcut(shortcut || '', filePath);
  const oldShortcut = shortcutMap.get(filePath);
  const sameScript = oldShortcut === convertedShortcut;

  // Handle existing shortcuts

  const exists = [...shortcutMap.entries()].find(
    ([, s]) => s === convertedShortcut
  );
  if (exists && !sameScript) {
    log.info(
      `Shortcut ${convertedShortcut} already registered to ${exists[0]}`
    );
    shortcutInfo(convertedShortcut, filePath, alreadyFail, exists[0]);

    return;
  }

  if (oldShortcut) {
    // No change
    if (sameScript) {
      const message = `${convertedShortcut} is already registered to ${filePath}`;
      log.info(message);

      return;
    }

    // User removed an existing shortcut
    globalShortcut.unregister(oldShortcut);
    shortcutMap.delete(filePath);
    log.info(`Unregistered ${oldShortcut} from ${filePath}`);
  }

  if (!convertedShortcut) {
    // log.info(`No shortcut found for ${filePath}`);
    return;
  }

  log.info(`Found shortcut: ${convertedShortcut} for ${filePath}`);
  // At this point, we know it's a new shortcut, so register it

  const registerSuccess = registerShortcut(convertedShortcut, filePath);

  if (registerSuccess && globalShortcut.isRegistered(convertedShortcut)) {
    log.info(`Registered ${convertedShortcut} to ${filePath}`);
    shortcutMap.set(filePath, convertedShortcut);
  }
};

const convertShortcut = (shortcut: string, filePath: string): string => {
  if (!shortcut?.length) return '';
  const normalizedShortcut = shortcutNormalizer(shortcut);
  log.info({ shortcut, normalizedShortcut });
  const [sourceKey, ...mods] = normalizedShortcut
    .trim()
    ?.split(/\+| /)
    .reverse();
  // log.info(`Shortcut main key: ${sourceKey}`);

  if (!mods.length || !sourceKey?.length) {
    if (!mods.length) log.info('No modifiers found');
    if (!sourceKey?.length) log.info('No main key found');
    // shortcutInfo(normalizedShortcut, filePath);
    return '';
  }

  if (sourceKey?.length > 1) {
    if (!validateAccelerator(normalizedShortcut)) {
      log.info(`Invalid shortcut: ${normalizedShortcut}`);
      shortcutInfo(normalizedShortcut, filePath);
      return '';
    }

    return normalizedShortcut;
  }

  const convertedKey = convertKey(sourceKey).toUpperCase();
  const finalShortcut = `${mods.reverse().join('+')}+${convertedKey}`;

  if (!validateAccelerator(finalShortcut)) {
    shortcutInfo(finalShortcut, filePath);
    return '';
  }

  return finalShortcut;
};

export const updateMainShortcut = async (filePath: string) => {
  log.info(`Updating main shortcut for ${filePath}`);
  if (filePath === shortcutsPath) {
    log.info(`SHORTCUTS DB CHANGED:`, filePath);
    const settings = JSON.parse(await readFile(filePath, 'utf-8'));
    const shortcut = settings?.shortcuts?.[mainScriptPath];

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
  shortcutMap.forEach((shortcut, filePath) => {
    const convertedShortcut = convertShortcut(shortcut, filePath);
    log.info({
      filePath,
      shortcut,
      convertedShortcut,
    });
    registerShortcut(convertedShortcut, filePath);
  });
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

const subKeymap = subscribeKey(
  kitState,
  'keymap',
  debounce(async (keymap) => {
    log.info(`Handling keymap change...`);
    if (prevKeymap) {
      pauseShortcuts();
      await new Promise((resolve) => setTimeout(resolve, 200));
      resumeShortcuts();
    }

    prevKeymap = keymap;
  }, 200)
);

subs.push(subKeymap);
