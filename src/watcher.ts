/* eslint-disable no-restricted-syntax */
import chokidar, { FSWatcher } from 'chokidar';
import log from 'electron-log';
import { debounce } from 'lodash';
import os from 'os';
import path from 'path';
import { existsSync } from 'fs';

import { rm } from 'fs/promises';
import {
  appDbPath,
  parseScript,
  kenvPath,
  shortcutsPath,
} from '@johnlindquist/kit/cjs/utils';
import {
  unlinkShortcuts,
  updateMainShortcut,
  shortcutScriptChanged,
} from './shortcuts';

import { cancelSchedule, scheduleScriptChanged } from './schedule';
import { unlinkEvents, systemScriptChanged } from './system-events';
import { removeWatch, watchScriptChanged } from './watch';
import { backgroundScriptChanged, removeBackground } from './background';
import { emitter, KitEvent } from './events';
import { updateScripts } from './state';
import { toggleTray } from './tray';
import { maybeSetLogin } from './settings';
import { buildScriptChanged } from './build';

export const cacheMenu = debounce(async () => {
  await updateScripts();
}, 150);

const updateEventNames = ['add', 'change', 'unlink', 'ready'];
const onScriptsChanged = async (
  event: 'add' | 'change' | 'unlink' | 'ready',
  filePath: string
) => {
  log.info(`${event}: ${filePath}`);
  if (event === 'unlink') {
    unlinkShortcuts(filePath);
    cancelSchedule(filePath);
    unlinkEvents(filePath);
    removeWatch(filePath);
    removeBackground(filePath);

    const binPath = path.resolve(
      path.dirname(path.dirname(filePath)),
      'bin',
      path
        .basename(filePath)
        .replace(new RegExp(`\\${path.extname(filePath)}$`), '')
    );

    if (existsSync(binPath)) rm(binPath);
  }
  if (event === 'add' || event === 'change') {
    const script = await parseScript(filePath);
    shortcutScriptChanged(script);
    scheduleScriptChanged(script);
    systemScriptChanged(script);
    watchScriptChanged(script);
    backgroundScriptChanged(script);
    buildScriptChanged(script);
  }

  if (updateEventNames.includes(event)) {
    await cacheMenu();
  }
};

export const onDbChanged = async (event: any, filePath: string) => {
  updateMainShortcut(filePath);
};

let watchers: FSWatcher[] = [];

export const teardownWatchers = async () => {
  for await (const watcher of watchers) {
    await watcher.close();
    watcher.removeAllListeners();
  }
  watchers = [];
};

export const setupWatchers = async () => {
  await teardownWatchers();

  const accountForWin = (watchPath: string) => {
    if (os.platform() === 'win32') {
      return watchPath.replace(/\\/g, '/');
    }
    return watchPath;
  };

  const shortcutsDbWatcher = chokidar.watch([accountForWin(shortcutsPath)]);
  watchers.push(shortcutsDbWatcher);
  shortcutsDbWatcher.on('all', onDbChanged);

  const kenvScripts = kenvPath('scripts');

  const scriptsWatcher = chokidar.watch([accountForWin(kenvScripts)], {
    depth: 1,
  });
  watchers.push(scriptsWatcher);

  const kenvsWatcher = chokidar.watch(accountForWin(kenvPath('kenvs', '*')), {
    depth: 0,
  });

  kenvsWatcher.on('all', async (eventName, addPath) => {
    const scriptsPath = `${addPath}/scripts`;

    if (eventName.includes('addDir') && addPath.includes('kenvs')) {
      log.info(`👀 Watch ${scriptsPath}`);
      scriptsWatcher.add([scriptsPath]);
    }

    if (eventName === 'unlinkDir') {
      log.info(`🧹 Unwatch ${scriptsPath}`);
      scriptsWatcher.unwatch([scriptsPath]);
    }
  });

  watchers.push(kenvsWatcher);

  const kitAppDbWatcher = chokidar.watch([accountForWin(appDbPath)]);
  watchers.push(kitAppDbWatcher);

  kitAppDbWatcher.on('change', async () => {
    await cacheMenu();
    await toggleTray();
    await maybeSetLogin();
  });

  scriptsWatcher.on('all', onScriptsChanged);
};

export const resetWatchers = async () => {
  await teardownWatchers();
  await setupWatchers();
};

emitter.on(KitEvent.SetKenv, async () => {
  await resetWatchers();
});
