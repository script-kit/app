/* eslint-disable jest/no-export */
/* eslint-disable import/prefer-default-export */
import log from 'electron-log';
import chokidar from 'chokidar';
import path from 'path';

import { existsSync } from 'fs';
import { appScript } from './kit';
import { kenvPath, kitPath, settingsFile } from './helpers';
import {
  unlinkShortcuts,
  updateMainShortcut,
  updateShortcuts,
} from './shortcuts';

import { cancelSchedule, updateSchedule } from './schedule';
import { unlinkEvents, updateEvents } from './system-events';
import { removeWatch, checkWatch } from './watch';
import { removeBackground, updateBackground } from './background';

const onScriptsChanged = async (
  event: 'add' | 'change' | 'unlink',
  filePath: string
) => {
  if (event === 'change') log.info({ event, filePath });
  if (event === 'unlink') {
    unlinkShortcuts(filePath);
    cancelSchedule(filePath);
    unlinkEvents(filePath);
    removeWatch(filePath);
    removeBackground(filePath);
  }
  if (event === 'add' || event === 'change') {
    updateShortcuts(filePath);
    updateSchedule(filePath);
    updateEvents(filePath);
    checkWatch(filePath);
    updateBackground(filePath, true);
  }
};

export const onDbChanged = async (event, filePath: string) => {
  updateMainShortcut(filePath);
};

export const cacheMenu = async () => {
  log.info(`caching menu`);
  await appScript(kitPath('cli', 'cache-menu.js'), []);
};

export const manageShortcuts = async () => {
  if (!existsSync(settingsFile)) {
    await appScript(kitPath('setup', 'create-settings.js'), []);
  }

  const dbWatcher = chokidar.watch([`${kenvPath('db')}${path.sep}*.json`], {
    depth: 0,
  });

  dbWatcher.on('all', onDbChanged);

  const scriptsWatcher = chokidar.watch(
    [`${kenvPath('scripts')}${path.sep}*.js`],
    {
      depth: 0,
    }
  );

  scriptsWatcher.on('all', onScriptsChanged);

  scriptsWatcher.on('ready', async () => {
    await cacheMenu();

    scriptsWatcher.on('add', cacheMenu);
    scriptsWatcher.on('change', cacheMenu);
    scriptsWatcher.on('unlink', cacheMenu);
  });
};
