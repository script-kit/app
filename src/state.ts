import { ChildProcess } from 'child_process';
import { app } from 'electron';
import schedule, { Job } from 'node-schedule';
import { readFile } from 'fs/promises';
import log from 'electron-log';
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

export interface ProcessInfo {
  pid: number;
  scriptPath: string;
  child: ChildProcess;
  type: ProcessType;
  values: any[];
  date: Date;
}

/* eslint-disable import/prefer-default-export */
class Processes extends Array<ProcessInfo> {
  public add(child: ChildProcess, type: ProcessType, scriptPath = '') {
    this.push({
      pid: child.pid,
      child,
      type,
      scriptPath,
      values: [],
      date: new Date(),
    });
  }

  public findPromptProcess() {
    const promptProcess = this.find(
      (processInfo) => processInfo.type === ProcessType.Prompt
    );
    if (promptProcess) return promptProcess;

    throw new Error(`☠️ Can't find Prompt Process`);
  }

  public getByPid(pid: number) {
    return this.find((processInfo) => processInfo.pid === pid);
  }

  public removeByPid(pid: number) {
    this.find(
      (processInfo) => processInfo.pid === pid
    )?.child?.removeAllListeners();

    this.splice(
      this.findIndex((processInfo) => processInfo.pid === pid),
      1
    );
  }

  public ifPid(pid: number, callback: (info: ProcessInfo) => void) {
    const processInfo = this.getByPid(pid);
    if (processInfo) {
      callback(processInfo);
    } else {
      log.warn(`⚠️ Can't find ${pid}`);
    }
  }

  public patchByPid(pid: number, patch: { scriptPath?: string }) {
    const index = this.findIndex((processInfo) => processInfo.pid === pid);
    if (index !== -1) {
      this[index] = { ...this[index], ...patch };
    } else {
      log.warn(`⚠️ pid ${pid} not found. Can't patch`, patch);
    }
  }
}

export const processes = new Processes();
// export const processesGetByBy = (pid: number) => {
//   return processes.find((processInfo) => processInfo.pid === pid);
// };
// export const processesRemoveByPid = (pid: number) => {
//   processes
//     .find((processInfo) => processInfo.pid === pid)
//     ?.child?.removeAllListeners();

//   processes.splice(
//     processes.findIndex((processInfo) => processInfo.pid === pid),
//     1
//   );
// };

export const ifProcess = (
  pid: number,
  callback: (info: ProcessInfo) => void
) => {
  const processInfo = processes.getByPid(pid);
  if (processInfo) {
    callback(processInfo);
  } else {
    log.warn(`⚠️ Can't find ${pid}`);
  }
};

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
