/* eslint-disable no-restricted-syntax */
import log from 'electron-log';
import { debounce } from 'lodash';
import path from 'path';
import { existsSync } from 'fs';
import { ChildProcess, fork, ForkOptions } from 'child_process';
import { homedir } from 'os';

import { rm } from 'fs/promises';
import {
  parseScript,
  kenvPath,
  kitPath,
  KIT_FIRST_PATH,
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
import { kitState, updateScripts } from './state';
import { toggleTray } from './tray';
import { maybeSetLogin } from './settings';
import { buildScriptChanged } from './build';
import { addSnippet, removeSnippet } from './tick';
import { clearPromptCacheFor } from './prompt';

export const cacheMenu = debounce(async () => {
  await updateScripts();
}, 150);

const updateEventNames = ['add', 'change', 'unlink', 'ready'];

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
};

type WatchEvent = 'add' | 'change' | 'unlink' | 'ready';
const onScriptsChanged = async (event: WatchEvent, filePath: string) => {
  log.info(`${event}: ${filePath}`);
  if (event === 'unlink') {
    unlink(filePath);
  }
  if (event === 'add' || event === 'change') {
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
    clearPromptCacheFor(filePath);
  }

  if (updateEventNames.includes(event)) {
    await cacheMenu();
  }
};

export const onDbChanged = async (event: any, filePath: string) => {
  updateMainShortcut(filePath);
};

export const watchers = {
  childWatcher: null as ChildProcess | null,
};

export const teardownWatchers = async () => {
  if (watchers.childWatcher) {
    watchers.childWatcher.removeAllListeners();
    watchers.childWatcher.kill();
    watchers.childWatcher = null;
  }
};

export const setupWatchers = async () => {
  await teardownWatchers();

  const forkOptions: ForkOptions = {
    cwd: homedir(),
    env: {
      KIT: kitPath(),
      KENV: kenvPath(),
      PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
    },
  };

  const scriptPath = kitPath('setup', 'watcher.js');
  watchers.childWatcher = fork(
    kitPath('run', 'terminal.js'),
    [scriptPath],
    forkOptions
  );
  watchers.childWatcher.on(
    'message',
    async ({
      eventName,
      filePath,
    }: {
      eventName: WatchEvent;
      filePath: string;
    }) => {
      const { base } = path.parse(filePath);
      if (base === 'app.json') {
        if (eventName === 'change') await cacheMenu();
        await toggleTray();
        await maybeSetLogin();

        return;
      }

      if (base === 'shortcuts.json') {
        onDbChanged(eventName, filePath);
        return;
      }
      onScriptsChanged(eventName, filePath);
    }
  );

  log.info(`👁 Watch child: ${watchers.childWatcher.pid}`);
};
