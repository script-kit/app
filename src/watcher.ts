/* eslint-disable no-restricted-syntax */
import log from 'electron-log';
import { assign } from 'lodash';
import path from 'path';
import { existsSync } from 'fs';

import { rm } from 'fs/promises';
import { getAppDb } from '@johnlindquist/kit/cjs/db';

import { parseScript } from '@johnlindquist/kit/cjs/utils';

import { FSWatcher } from 'chokidar';
import {
  unlinkShortcuts,
  updateMainShortcut,
  shortcutScriptChanged,
} from './shortcuts';

import { cancelSchedule, scheduleScriptChanged } from './schedule';
import { unlinkEvents, systemScriptChanged } from './system-events';
import { removeWatch, watchScriptChanged } from './watch';
import { backgroundScriptChanged, removeBackground } from './background';
import { appDb, kitState, scriptChanged, scriptRemoved } from './state';
import { buildScriptChanged } from './build';
import { addSnippet, removeSnippet } from './tick';
import { clearPromptCacheFor } from './prompt';
import { startWatching, WatchEvent } from './chokidar';

// export const cacheMenu = debounce(async () => {
//   await updateScripts();
// }, 150);

const unlink = (filePath: string) => {
  unlinkShortcuts(filePath);
  cancelSchedule(filePath);
  unlinkEvents(filePath);
  removeWatch(filePath);
  removeBackground(filePath);
  removeSnippet(filePath);

  const binPath = path.resolve(
    path.dirname(path.dirname(filePath)),
    'bin',
    path
      .basename(filePath)
      .replace(new RegExp(`\\${path.extname(filePath)}$`), '')
  );

  if (existsSync(binPath)) rm(binPath);

  scriptRemoved();
};

export const onScriptsChanged = async (event: WatchEvent, filePath: string) => {
  if (event === 'unlink') {
    unlink(filePath);
  }

  if (
    event === 'change' ||
    // event === 'ready' ||
    event === 'add'
  ) {
    log.info(`👀 Watcher ${event}: ${filePath}`);
    const script = await parseScript(filePath);
    shortcutScriptChanged(script);
    scheduleScriptChanged(script);
    systemScriptChanged(script);
    watchScriptChanged(script);
    backgroundScriptChanged(script);
    buildScriptChanged(script);
    addSnippet(script);
  }

  if (event === 'change') {
    scriptChanged(filePath);
    clearPromptCacheFor(filePath);
  }
};

export const onDbChanged = async (event: any, filePath: string) => {
  updateMainShortcut(filePath);
};

let watchers = [] as FSWatcher[];

export const teardownWatchers = async () => {
  if (watchers.length) {
    watchers.forEach((watcher) => watcher.close());
    watchers.length = 0;
  }
};

export const setupWatchers = async () => {
  await teardownWatchers();

  log.info('--- 👀 Watching Scripts ---');

  watchers = startWatching(async (eventName: WatchEvent, filePath: string) => {
    if (!filePath.match(/\.(ts|js|json)$/)) return;
    const { base } = path.parse(filePath);
    if (base === 'app.json') {
      log.info(`app.json changed`);
      const currentAppDb = (await getAppDb()).data;
      assign(appDb, currentAppDb);

      return;
    }

    if (base === 'shortcuts.json') {
      onDbChanged(eventName, filePath);
      return;
    }
    onScriptsChanged(eventName, filePath);
  });
};
