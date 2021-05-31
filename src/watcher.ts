/* eslint-disable no-restricted-syntax */
/* eslint-disable jest/no-export */
/* eslint-disable import/prefer-default-export */
import log from 'electron-log';
import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';

import { appScript } from './kit';
import { appDbPath, kenvPath, kitPath, shortcutsPath } from './helpers';
import {
  unlinkShortcuts,
  updateMainShortcut,
  updateShortcuts,
} from './shortcuts';

import { cancelSchedule, updateSchedule } from './schedule';
import { unlinkEvents, updateEvents } from './system-events';
import { removeWatch, checkWatch } from './watch';
import { removeBackground, updateBackground } from './background';
import { emitter, EVENT } from './events';

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

export const onDbChanged = async (event: any, filePath: string) => {
  updateMainShortcut(filePath);
};

export const cacheMenu = async () => {
  log.info(`caching menu`);
  await appScript(kitPath('cli', 'cache-menu.js'), []);
};

let watchers: FSWatcher[] = [];

export const setupWatchers = async () => {
  watchers = [];
  const shortcutsDbWatcher = chokidar.watch([shortcutsPath]);
  watchers.push(shortcutsDbWatcher);
  shortcutsDbWatcher.on('all', onDbChanged);

  const kenvScripts = `${kenvPath('scripts')}${path.sep}*.js`;
  const scriptsWatcher = chokidar.watch([kenvScripts], {
    depth: 0,
  });
  watchers.push(scriptsWatcher);

  const kitAppDbWatcher = chokidar.watch([appDbPath]);
  watchers.push(kitAppDbWatcher);

  kitAppDbWatcher.on('change', async () => {
    await cacheMenu();
  });

  scriptsWatcher.on('all', onScriptsChanged);

  scriptsWatcher.on('ready', async () => {
    await cacheMenu();

    scriptsWatcher.on('add', cacheMenu);
    scriptsWatcher.on('change', cacheMenu);
    scriptsWatcher.on('unlink', cacheMenu);
  });
};

export const resetWatchers = async () => {
  for await (const watcher of watchers) {
    await watcher.close();
  }

  await setupWatchers();
};

emitter.on(EVENT.SET_KENV, async () => {
  await resetWatchers();
});
