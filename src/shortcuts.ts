import { globalShortcut, Notification } from 'electron';
import log from 'electron-log';
import { readFile } from 'fs/promises';
import { Script } from '@johnlindquist/kit/types/core';
import { keyboard, Key } from '@nut-tree/nut-js';

import {
  mainScriptPath,
  shortcutsPath,
  shortcutNormalizer,
} from '@johnlindquist/kit/cjs/utils';
import { runPromptProcess } from './kit';
import { emitter, KitEvent } from './events';
import { focusPrompt } from './prompt';

const registerShortcut = (shortcut: string, filePath: string) => {
  const success = globalShortcut.register(shortcut, async () => {
    runPromptProcess(filePath);
    focusPrompt();
  });

  if (!success) {
    log.info(`Failed to register: ${shortcut} to ${filePath}`);
  }

  return success;
};

export const shortcutMap = new Map();

export const unlinkShortcuts = (filePath: string) => {
  const oldShortcut = shortcutMap.get(filePath);

  if (oldShortcut) {
    globalShortcut.unregister(oldShortcut);
    shortcutMap.delete(filePath);
  }
};

export const shortcutScriptChanged = ({ shortcut, filePath }: Script) => {
  const oldShortcut = shortcutMap.get(filePath);
  const sameScript = oldShortcut === shortcut;

  // Handle existing shortcuts

  const exists = [...shortcutMap.entries()].find(([, s]) => s === shortcut);
  if (exists && !sameScript) {
    const title = `Shortcut already registered. Skipping...`;
    log.info(title);
    const n = new Notification({
      title,
      body: `${shortcut} registered to ${exists[0]}`,
      silent: false,
    });

    n.show();

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

export const updateMainShortcut = async (filePath: string) => {
  log.info(`Updating main shortcut for ${filePath}`);
  if (filePath === shortcutsPath) {
    log.info(`SHORTCUTS DB CHANGED:`, filePath);
    const settings = JSON.parse(await readFile(filePath, 'utf-8'));
    const rawShortcut = settings?.shortcuts?.[mainScriptPath];

    const shortcut = rawShortcut ? shortcutNormalizer(rawShortcut) : '';

    if (shortcut) {
      const oldShortcut = shortcutMap.get(mainScriptPath);

      if (shortcut === oldShortcut) return;

      if (oldShortcut) {
        globalShortcut.unregister(oldShortcut);
        shortcutMap.delete(mainScriptPath);
      }

      const ret = globalShortcut.register(shortcut, async () => {
        log.info(`🏚  main shortcut`);

        await runPromptProcess(mainScriptPath);
      });

      if (!ret) {
        log.warn(`Failed to register: ${shortcut} to ${mainScriptPath}`);
      }

      if (ret && globalShortcut.isRegistered(shortcut)) {
        log.info(`Registered ${shortcut} to ${mainScriptPath}`);
        shortcutMap.set(mainScriptPath, shortcut);
      }
    }
  }
};

let shortcutsPaused = false;
const pauseShortcuts = () => {
  log.info(`PAUSING GLOBAL SHORTCUTS`);
  shortcutsPaused = true;
  globalShortcut.unregisterAll();
};

const resumeShortcuts = () => {
  if (shortcutsPaused) {
    shortcutsPaused = false;

    log.info(`RESUMING GLOBAL SHORTCUTS`);

    shortcutMap.forEach(registerShortcut);
  }
};

emitter.on(KitEvent.PauseShortcuts, pauseShortcuts);
emitter.on(KitEvent.ResumeShortcuts, resumeShortcuts);
