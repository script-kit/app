/* eslint-disable no-restricted-syntax */
import log from 'electron-log';
import { assign } from 'lodash';
import path from 'path';
import { existsSync } from 'fs';
import { ChildProcess, fork, ForkOptions } from 'child_process';
import { homedir } from 'os';

import { rm } from 'fs/promises';
import { getAppDb } from '@johnlindquist/kit/cjs/db';

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
import { appDb, kitState, scriptChanged, scriptRemoved } from './state';
import { buildScriptChanged } from './build';
import { addSnippet, removeSnippet } from './tick';
import { clearPromptCacheFor } from './prompt';

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

type WatchEvent = 'add' | 'change' | 'unlink' | 'ready';
export const onScriptsChanged = async (event: WatchEvent, filePath: string) => {
  if (event === 'unlink') {
    unlink(filePath);
  }

  if (
    event === 'change' ||
    event === 'ready' ||
    (event === 'add' && !kitState.scripts.find((s) => s.filePath === filePath))
  ) {
    log.verbose(`${event}: ${filePath}`);
    const script = await parseScript(filePath);
    shortcutScriptChanged(script);
    scheduleScriptChanged(script);
    systemScriptChanged(script);
    watchScriptChanged(script);
    backgroundScriptChanged(script);
    buildScriptChanged(script);
    addSnippet(script);

    if (event !== 'ready') scriptChanged(filePath);
  }

  if (event === 'change') {
    clearPromptCacheFor(filePath);
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
    }
  );

  log.info(`👁 Watch child: ${watchers.childWatcher.pid}`);
};
