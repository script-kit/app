/* eslint-disable no-restricted-syntax */
import log from 'electron-log';
import { assign, debounce } from 'lodash';
import path from 'path';
import { existsSync } from 'fs';
import { snapshot } from 'valtio';

import { rm } from 'fs/promises';
import { getAppDb, getUserDb } from '@johnlindquist/kit/cjs/db';

import { parseScript, kitPath, kenvPath } from '@johnlindquist/kit/cjs/utils';

import { FSWatcher } from 'chokidar';
import { fork } from 'child_process';
import {
  unlinkShortcuts,
  updateMainShortcut,
  shortcutScriptChanged,
} from './shortcuts';

import { cancelSchedule, scheduleScriptChanged } from './schedule';
import { unlinkEvents, systemScriptChanged } from './system-events';
import { removeWatch, watchScriptChanged } from './watch';
import { backgroundScriptChanged, removeBackground } from './background';
import {
  appDb,
  kitState,
  scriptChanged,
  scriptRemoved,
  sponsorCheck,
} from './state';
import { addSnippet, removeSnippet } from './tick';
import { appToPrompt, clearPromptCacheFor } from './prompt';
import { startWatching, WatchEvent } from './chokidar';
import { emitter, KitEvent } from './events';
import { AppChannel } from './enums';
import { destroyAllProcesses, ensureTwoIdleProcesses } from './process';

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

const buildScriptChanged = debounce((filePath: string) => {
  if (filePath.endsWith('.ts')) {
    log.info(`🏗️ Build ${filePath}`);
    const child = fork(kitPath('build', 'ts.js'), [filePath], {
      env: assign({}, process.env, {
        KIT: kitPath(),
        KENV: kenvPath(),
      }),
    });

    // log error
    child.on('error', (error: any) => {
      log.error(error);
    });

    // log exit
    child.on('exit', (code) => {
      log.info(`🏗️ Build ${filePath} exited with code ${code}`);
    });
  }
}, 150);

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
    buildScriptChanged(script?.filePath);
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
    watchers.forEach((watcher) => {
      try {
        watcher.removeAllListeners();
        watcher.close();
      } catch (error) {
        log.error(error);
      }
    });
    watchers.length = 0;
  }
};

export const checkUserDb = async (eventName: string) => {
  kitState.isSponsor = false;
  log.info(`user.json ${eventName}`);

  const currentUserDb = (await getUserDb()).data;
  kitState.user = currentUserDb;

  if (eventName === 'unlink') return;
  if (kitState?.user?.login) {
    sponsorCheck('Login', false);
  }

  log.info(`Send user.json to prompt`, snapshot(kitState.user));

  appToPrompt(AppChannel.USER_CHANGED, snapshot(kitState.user));
};

export const setupWatchers = async () => {
  await teardownWatchers();

  log.info('--- 👀 Watching Scripts ---');

  watchers = startWatching(async (eventName: WatchEvent, filePath: string) => {
    if (!filePath.match(/\.(ts|js|json)$/)) return;
    const { base } = path.parse(filePath);

    if (base === '.env') {
      log.info(`🌎 .env ${eventName}`);

      destroyAllProcesses();
      ensureTwoIdleProcesses();
    }

    if (base === 'app.json') {
      log.info(`app.json changed`);
      const currentAppDb = (await getAppDb()).data;
      assign(appDb, currentAppDb);

      return;
    }

    if (base === 'user.json') {
      checkUserDb(eventName);
      return;
    }

    if (base === 'shortcuts.json') {
      onDbChanged(eventName, filePath);
      return;
    }
    onScriptsChanged(eventName, filePath);
  });
};

emitter.on(KitEvent.TeardownWatchers, teardownWatchers);

emitter.on(KitEvent.RestartWatcher, async () => {
  try {
    await setupWatchers();
  } catch (error) {
    log.error(error);
  }
});
