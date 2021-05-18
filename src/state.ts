import { ChildProcess } from 'child_process';
import { app } from 'electron';
import Store from 'electron-store';

const NEEDS_RESTART = 'NEEDS_RESTART';
const STORE_VERSION = 'version';

const state = new Store({ name: 'state' });

export const makeRestartNecessary = () => {
  state.set(NEEDS_RESTART, true);
};
export const restartIfNecessary = () => {
  if (state.get(NEEDS_RESTART)) {
    state.set(NEEDS_RESTART, false);
    app.exit(0);
  }
};

export const storeVersion = (version: string) => {
  state.set(STORE_VERSION, version);
};

export const getStoredVersion = () => {
  return state.get(STORE_VERSION, '0.0.0');
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
