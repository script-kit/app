/* eslint-disable no-nested-ternary */
import log from 'electron-log';
import chokidar from 'chokidar';
import { FSWatcher } from 'fs';
import { app } from 'electron';
import { Script } from '@johnlindquist/kit/types/core';
import { ProcessType } from '@johnlindquist/kit/cjs/enum';
import { processes } from './process';

export const watchMap = new Map();

export const removeWatch = (filePath: string) => {
  log.info(`Remove watch: ${filePath}`);
  const watcher = watchMap.get(filePath) as FSWatcher;
  if (watcher) {
    watcher.close();
    watchMap.delete(filePath);
  }
};

const resolvePath = (path: string) => {
  if (path.startsWith('~')) {
    return path.replace('~', app.getPath('home'));
  }

  return path;
};

const addWatch = (watchString: string, filePath: string) => {
  try {
    log.info(`Watch: ${watchString} - from - ${filePath}`);

    const [pathsString] = watchString.split('|');
    const paths = pathsString.startsWith('[')
      ? JSON.parse(pathsString).map(resolvePath)
      : resolvePath(pathsString);

    const watcher = chokidar.watch(paths);
    watcher.on('change', (path) => {
      log.info(`👀 ${paths} changed`);
      processes.add(ProcessType.Watch, filePath, [path]);
    });

    const watched = watcher.getWatched();

    log.info(`Watching: ${Object.keys(watched).join(', ')}`);
    watchMap.set(filePath, watcher);
  } catch (error: any) {
    removeWatch(filePath);
    log.warn(error?.message);
  }
};

export const watchScriptChanged = ({
  filePath,
  watch: watchString,
}: Script) => {
  if (!watchString && watchMap.get(filePath)) {
    removeWatch(filePath);
    return;
  }

  if (watchString && !watchMap.get(filePath)) {
    addWatch(watchString, filePath);
    return;
  }

  if (watchString && watchMap.get(filePath)) {
    removeWatch(filePath);
    addWatch(watchString, filePath);
  }
};
