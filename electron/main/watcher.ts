/* eslint-disable no-restricted-syntax */
import log from 'electron-log';
import { add, assign, debounce } from 'lodash';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { snapshot } from 'valtio';
import dotenv from 'dotenv';
import { rm, readFile } from 'fs/promises';
import { getAppDb, getUserDb } from '@johnlindquist/kit/cjs/db';

import {
  parseScript,
  kitPath,
  kenvPath,
  resolveToScriptPath,
} from '@johnlindquist/kit/cjs/utils';

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
import { AppChannel, Trigger } from 'kit-common';
import { runScript } from './kit';

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

const logEvents: { event: WatchEvent; filePath: string }[] = [];

const logAllEvents = () => {
  const adds: string[] = [];
  const changes: string[] = [];
  const removes: string[] = [];

  logEvents.forEach(({ event, filePath }) => {
    if (event === 'add') adds.push(filePath);
    if (event === 'change') changes.push(filePath);
    if (event === 'unlink') removes.push(filePath);
  });

  if (add.length) log.info('adds', adds);
  if (changes.length) log.info('changes', changes);
  if (removes.length) log.info('removes', removes);

  adds.length = 0;
  changes.length = 0;
  removes.length = 0;

  logEvents.length = 0;
};

const debouncedLogAllEvents = debounce(logAllEvents, 1000);

const logQueue = (event: WatchEvent, filePath: string) => {
  logEvents.push({ event, filePath });
  debouncedLogAllEvents();
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

const unlinkBin = (filePath: string) => {
  const binPath = path.resolve(
    path.dirname(path.dirname(filePath)),
    'bin',
    path.basename(filePath)
  );

  // if binPath exists, remove it
  if (existsSync(binPath)) {
    unlink(binPath);
  }
};

export const onScriptsChanged = async (event: WatchEvent, filePath: string) => {
  if (event === 'unlink') {
    unlink(filePath);
    unlinkBin(filePath);
  }

  if (
    event === 'change' ||
    // event === 'ready' ||
    event === 'add'
  ) {
    logQueue(event, filePath);
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

  if (event === 'add') {
    if (kitState.ready) {
      log.info();
      setTimeout(async () => {
        try {
          const binDirPath = path.resolve(
            path.dirname(path.dirname(filePath)),
            'bin'
          );
          const command = path.parse(filePath).name;
          const binFilePath = path.resolve(binDirPath, command);
          if (!existsSync(binFilePath)) {
            log.info(`🔗 Creating bin for ${command}`);
            await runScript(kitPath('cli', 'create-bin'), 'scripts', filePath);
          }
        } catch (error) {
          log.error(error);
        }
      }, 1000);
    }
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
    if (!filePath.match(/\.(ts|js|json|txt|env)$/)) return;
    const { base } = path.parse(filePath);

    if (base === 'run.txt') {
      log.info(`run.txt ${eventName}`);
      const runPath = kitPath('run.txt');
      if (eventName === 'add' || eventName === 'change') {
        const runText = await readFile(runPath, 'utf8');
        const [scriptPath, ...args] = runText.trim().split(' ');
        log.info(`run.txt ${eventName}`, scriptPath, args);
        emitter.emit(KitEvent.RunPromptProcess, {
          scriptPath: resolveToScriptPath(scriptPath, kenvPath()),
          args: args || [],
          options: {
            force: true,
            trigger: Trigger.RunTxt,
          },
        });
      } else {
        log.info(`run.txt removed`);
      }
      return;
    }

    if (base === '.env') {
      log.info(`🌎 .env ${eventName}`);

      if (existsSync(filePath)) {
        kitState.kenvEnv = dotenv.parse(readFileSync(filePath));
      }

      return;
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
