import { ChildProcess } from 'child_process';
import { app } from 'electron';
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

export interface ChildInfo {
  scriptPath: string;
  child: ChildProcess;
  from: string;
  values: any[];
}

/* eslint-disable import/prefer-default-export */
export const processMap: Map<number, ChildInfo> = new Map();
