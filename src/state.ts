/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-nested-ternary */
import { Config } from '@johnlindquist/kit/types/kitapp';
import { proxy } from 'valtio/vanilla';
import path from 'path';
import os from 'os';
import { ChildProcess } from 'child_process';
import { app } from 'electron';
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
  starting: true,
  suspended: false,
  screenLocked: false,
  isKeyWindow: false,
  installing: false,
  updateInstalling: false,
  updateDownloading: false,
  updateDownloaded: false,
  ready: false,
};

const initConfig: Config = {
  imagePath: tmpClipboardDir,
  deleteSnippet: true,
};

export const kitConfig: Config = proxy(initConfig);
export const kitState: typeof initState = proxy(initState);

export function isSameScript(promptScriptPath: string) {
  const same =
    path.resolve(kitState.script.filePath || '') ===
      path.resolve(promptScriptPath) && kitState.promptCount === 0;

  return same;
}
