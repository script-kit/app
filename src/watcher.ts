/* eslint-disable no-restricted-syntax */
import chokidar, { FSWatcher } from 'chokidar';
import log from 'electron-log';
import { debounce } from 'lodash';
import { appDbPath, info, kenvPath, shortcutsPath } from 'kit-bridge/cjs/util';
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

export const cacheMenu = debounce(async () => {
  await updateScripts();
}, 200);

const updateEventNames = ['add', 'change', 'unlink', 'ready'];
const onScriptsChanged = async (
  event: 'add' | 'change' | 'unlink' | 'ready',
  filePath: string
) => {
  if (event === 'unlink') {
    unlinkShortcuts(filePath);
    cancelSchedule(filePath);
    unlinkEvents(filePath);
    removeWatch(filePath);
    removeBackground(filePath);
  }
  if (event === 'add' || event === 'change') {
    const script = await info(filePath);

    shortcutScriptChanged(script);
    scheduleScriptChanged(script);
    systemScriptChanged(script);
    watchScriptChanged(script);
    backgroundScriptChanged(script);
  }

  if (updateEventNames.includes(event)) {
    await cacheMenu();
  }
};

export const onDbChanged = async (event: any, filePath: string) => {
  updateMainShortcut(filePath);
};

let watchers: FSWatcher[] = [];

export const setupWatchers = async () => {
  watchers = [];
  const shortcutsDbWatcher = chokidar.watch([shortcutsPath]);
  watchers.push(shortcutsDbWatcher);
  shortcutsDbWatcher.on('all', onDbChanged);

  const kenvScripts = kenvPath('scripts/*.js');

  const scriptsWatcher = chokidar.watch([kenvScripts], {
    depth: 1,
  });
  watchers.push(scriptsWatcher);

  const kenvsWatcher = chokidar.watch(kenvPath('kenvs/*'), {
    depth: 0,
  });

  kenvsWatcher.on('all', async (eventName, addPath) => {
    const scriptsPath = `${addPath}/scripts/*.js`;

    if (eventName.includes('addDir') && addPath.match(/kenvs\/[^/]+$/)) {
      log.info(`👀 Watch ${scriptsPath}`);
      scriptsWatcher.add([scriptsPath]);
    }

    if (eventName === 'unlinkDir') {
      log.info(`🧹 Unwatch ${scriptsPath}`);
      scriptsWatcher.unwatch([scriptsPath]);
    }
  });

  watchers.push(kenvsWatcher);

  const kitAppDbWatcher = chokidar.watch([appDbPath]);
  watchers.push(kitAppDbWatcher);

  kitAppDbWatcher.on('change', async () => {
    await cacheMenu();
  });

  scriptsWatcher.on('all', onScriptsChanged);
};

export const resetWatchers = async () => {
  for await (const watcher of watchers) {
    await watcher.close();
  }

  await setupWatchers();
};

emitter.on(KitEvent.SetKenv, async () => {
  await resetWatchers();
});
