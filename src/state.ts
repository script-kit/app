import { ChildProcess } from 'child_process';
import { app } from 'electron';
import schedule, { Job } from 'node-schedule';
import { readFile } from 'fs/promises';
import { ProcessType } from './enums';
import { appDb, info, kenvPath, mainScriptPath } from './helpers';
import { Script } from './types';

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

export interface ChildInfo {
  scriptPath: string;
  child: ChildProcess;
  type: ProcessType;
  values: any[];
}

/* eslint-disable import/prefer-default-export */
export const processMap: Map<number, ChildInfo> = new Map();

let currentPromptScript: Script;
export const setCurrentPromptScript = (script: Script) => {
  currentPromptScript = script;
};

export const getCurrentPromptScript = () => {
  return currentPromptScript;
};

let scripts: Script[] = [];

export const updateScripts = async () => {
  const scriptsJSON = JSON.parse(
    await readFile(kenvPath('db', 'scripts.json'), 'utf-8')
  );
  scripts = scriptsJSON.scripts;
};

export const getScripts = (): Script[] => {
  return scripts;
};

export const getScript = (filePath: string): Script => {
  return scripts.find((script) => script.filePath === filePath) as Script;
};

const kitScripts: Script[] = [];

export const cacheKitScripts = async () => {
  const mainScript = await info(mainScriptPath);
  kitScripts.push(mainScript);
};

export const getKitScripts = (): Script[] => {
  return kitScripts;
};

export const getKitScript = (filePath: string): Script => {
  return kitScripts.find((script) => script.filePath === filePath) as Script;
};
