/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-nested-ternary */
import { Config } from '@johnlindquist/kit/types/kitapp';
import { proxy } from 'valtio/vanilla';
import { subscribeKey } from 'valtio/utils';
import log from 'electron-log';
import path from 'path';
import os from 'os';
import { ChildProcess, execSync } from 'child_process';
import { app, nativeTheme } from 'electron';
import schedule, { Job } from 'node-schedule';
import { readdir } from 'fs/promises';
import { Script } from '@johnlindquist/kit/types/core';
import { getScripts, getAppDb } from '@johnlindquist/kit/cjs/db';

import {
  parseScript,
  kitPath,
  isParentOfDir,
  mainScriptPath,
  tmpClipboardDir,
} from '@johnlindquist/kit/cjs/utils';
import { UI } from '@johnlindquist/kit/cjs/enum';
import { noScript, MIN_HEIGHT } from './defaults';
import { ProcessInfo } from './types';

export const makeRestartNecessary = async () => {
  const appDb = await getAppDb();
  appDb.needsRestart = true;
  await appDb.write();
};
export const restartIfNecessary = async () => {
  const appDb = await getAppDb();
  if (appDb.needsRestart) {
    appDb.needsRestart = false;
    await appDb.write();
    app.exit(0);
  }
};

export const serverState = {
  running: false,
  host: '',
  port: 0,
};

export interface Background {
  child: ChildProcess;
  start: string;
}
export const backgroundMap = new Map<string, Background>();

export const getBackgroundTasks = () => {
  const tasks = Array.from(backgroundMap.entries()).map(
    ([filePath, { child, start }]: [string, Background]) => {
      return {
        filePath,
        process: {
          spawnargs: child?.spawnargs,
          pid: child?.pid,
          start,
        },
      };
    }
  );

  return tasks;
};

export const scheduleMap = new Map<string, Job>();

export const getSchedule = () => {
  return Array.from(scheduleMap.entries())
    .filter(([filePath, job]) => {
      return (
        schedule.scheduledJobs?.[filePath] === job &&
        !isParentOfDir(kitPath(), filePath)
      );
    })
    .map(([filePath, job]: [string, Job]) => {
      return {
        filePath,
        date: job.nextInvocation(),
      };
    });
};

let scripts: Script[] = [];

export const updateScripts = async () => {
  scripts = await getScripts(false);
};

export const getScriptsMemory = (): Script[] => {
  return scripts.filter((script) => !script?.exclude);
};

const kitScripts: Script[] = [];

export const cacheKitScripts = async () => {
  const kitMainPath = kitPath('main');
  const kitMainScripts = await readdir(kitMainPath);

  for await (const main of kitMainScripts) {
    const mainScript = await parseScript(kitPath('main', main));
    kitScripts.push(mainScript);
  }

  const kitCliPath = kitPath('cli');
  const kitCliDir = await readdir(kitCliPath);
  const kitCliScripts = kitCliDir.filter((f) => f.endsWith('.js'));
  for await (const cli of kitCliScripts) {
    const cliScript = await parseScript(kitPath('cli', cli));
    kitScripts.push(cliScript);
  }
};

export const getKitScripts = (): Script[] => {
  return kitScripts;
};

export const getKitScript = (filePath: string): Script => {
  return kitScripts.find((script) => script.filePath === filePath) as Script;
};

const addP = (pi: Partial<ProcessInfo>) => {
  kitState.ps.push(pi);
};

const removeP = (pid: number) => {
  const index = kitState.ps.findIndex((p) => p.pid === pid);
  if (index > -1) {
    kitState.ps.splice(index, 1);
  }
};

const checkTransparencyEnabled = () => {
  if (
    os.platform() === 'darwin' &&
    parseInt(os.release().split('.')[0], 10) < 10
  ) {
    return false;
  }

  try {
    const enabled = !parseInt(
      Buffer.from(
        execSync('defaults read com.apple.universalaccess reduceTransparency', {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
        })
      )
        .toString()
        .trim(),
      10
    );
    log.info(`transparency enabled: ${enabled}`);
    return enabled;
  } catch (error) {
    return false;
  }
};

const initState = {
  hidden: false,
  ps: [] as Partial<ProcessInfo>[],
  addP,
  removeP,
  pid: 0,
  script: noScript,
  ui: UI.arg,
  blurredByKit: false,
  modifiedByUser: false,
  ignoreBlur: false,
  minHeight: MIN_HEIGHT,
  resize: false,
  prevResize: false,
  promptProcess: undefined as ProcessInfo | undefined,
  isScripts: false,
  isMainScript: () => kitState.script.filePath === mainScriptPath,
  promptCount: -1,
  isTyping: false,
  snippet: ``,
  socketURL: '',
  termLatest: '',
  termPrev: '',
  isShiftDown: false,
  isMac: os.platform() === 'darwin',
  isWindows: os.platform() === 'win32',
  isLinux: os.platform() === 'linux',
  transparencyEnabled: checkTransparencyEnabled(),
  starting: true,
  suspended: false,
  screenLocked: false,
  isKeyWindow: false,
  installing: false,
  // checkingForUpdate: false,
  updateInstalling: false,
  // updateDownloading: false,
  updateDownloaded: false,
  // updateError: false,
  updateState: null as { message: string; color: trayColor } | null,
  ready: false,
  settled: false,
  authorized: false,
  notifyAuthFail: false,
  mainShortcut: ``,
  isDark: nativeTheme.shouldUseDarkColors,
  red: ``,
  orange: ``,
  green: ``,
  childWatcher: null as ChildProcess | null,
  notifications: [] as { message: string; color: 'red' | 'orange' | 'green' }[],
};

nativeTheme.addListener('updated', () => {
  kitState.isDark = nativeTheme.shouldUseDarkColors;
  kitState.transparencyEnabled = checkTransparencyEnabled();
});

const initConfig: Config = {
  imagePath: tmpClipboardDir,
  deleteSnippet: true,
};

export const kitConfig: Config = proxy(initConfig);
export const kitState: typeof initState = proxy(initState);
export type kitStateType = typeof initState;

export function isSameScript(promptScriptPath: string) {
  const same =
    path.resolve(kitState.script.filePath || '') ===
      path.resolve(promptScriptPath) && kitState.promptCount === 0;

  return same;
}

export const colors = ['green', 'red', 'orange'] as const;
export const trayColors = [...colors, 'default'] as const;
export type trayColor = typeof trayColors[number];

for (const color of colors) {
  subscribeKey(kitState, color, (message) => {
    if (message) {
      kitState.notifications.push({
        message: message as string,
        color,
      });
    }
  });
}
