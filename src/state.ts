/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-nested-ternary */
import { ChildProcess } from 'child_process';
import { app } from 'electron';
import log from 'electron-log';
import schedule, { Job } from 'node-schedule';
import { readdir, readFile } from 'fs/promises';
import { Script } from 'kit-bridge/cjs/type';
import { getScripts } from 'kit-bridge/cjs/db';
import { info, kitPath, mainScriptPath } from 'kit-bridge/cjs/util';
import { appDb } from './helpers';

export const makeRestartNecessary = () => {
  appDb.set('needsRestart', true);
};
export const restartIfNecessary = () => {
  if (appDb.get('needsRestart').value()) {
    appDb.set('needsRestart', false).write();
    app.exit(0);
  }
};

export const storeVersion = (version: string) => {
  appDb.set('version', version).write();
};

export const getStoredVersion = () => {
  return appDb.get('version').value();
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

export const scheduleMap = new Map();

export const getSchedule = () => {
  return Array.from(scheduleMap.entries())
    .filter(([filePath, job]) => {
      return schedule.scheduledJobs?.[filePath] === job;
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

export const getScriptsSync = (): Script[] => {
  return scripts;
};

export const getKenvScript = (filePath: string): Script => {
  log.info(`💉 getKenvScript ${filePath}`);
  return scripts.find((script) => script.filePath === filePath) as Script;
};

const kitScripts: Script[] = [];

export const cacheKitScripts = async () => {
  const mainScript = await info(mainScriptPath);
  kitScripts.push(mainScript);

  const kitCliPath = kitPath('cli');
  const kitCliScripts = await readdir(kitCliPath);
  for await (const cli of kitCliScripts) {
    const cliScript = await info(kitPath('cli', cli));
    kitScripts.push(cliScript);
  }
};

export const getKitScripts = (): Script[] => {
  return kitScripts;
};

export const getKitScript = (filePath: string): Script => {
  return kitScripts.find((script) => script.filePath === filePath) as Script;
};
