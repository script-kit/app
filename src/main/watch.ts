import type { FSWatcher } from 'node:fs';
import path from 'node:path';
import type { Script } from '@johnlindquist/kit/types/core';
import chokidar from 'chokidar';
import { app } from 'electron';
/* eslint-disable no-nested-ternary */
import log from 'electron-log';
import { Trigger } from '../shared/enums';
import { runPromptProcess } from './kit';
import { kitState } from './state';

export const watchMap = new Map();

export const removeWatch = (filePath: string) => {
  const watcher = watchMap.get(filePath) as FSWatcher;
  if (watcher) {
    log.info(`🗑 Remove watch: ${filePath}`);
    watcher.close();
    watchMap.delete(filePath);
  }
};

const normalizePath = (scriptPath: string) => (filePath: string) => {
  const resolvedPath = () => {
    if (filePath?.startsWith('~')) {
      return filePath.replace('~', app.getPath('home'));
    }

    if (filePath?.startsWith(path.sep)) {
      return filePath;
    }

    return path.resolve(path.dirname(scriptPath), filePath);
  };
  return path.normalize(resolvedPath());
};

const validWatchEvents = ['add', 'change', 'unlink'];

const addWatch = (watchString: string, scriptPath: string) => {
  try {
    log.info(`Watch: ${watchString} - from - ${scriptPath}`);

    const [pathsString] = watchString.split('|');

    const paths = pathsString.startsWith('[')
      ? JSON.parse(pathsString).map(normalizePath(scriptPath))
      : normalizePath(scriptPath)(pathsString);

    log.info('Watched paths:', { paths });

    const watcher = chokidar.watch(paths, {
      ignoreInitial: true,
    });

    watcher.on('all', (eventName: string, filePath: string) => {
      log.info({ eventName, filePath });
      if (validWatchEvents.includes(eventName)) {
        log.info(`👀 ${paths} changed`);
        runPromptProcess(scriptPath, [filePath, eventName], {
          force: false,
          trigger: Trigger.Watch,
          sponsorCheck: false,
        });
      }
    });

    watchMap.set(scriptPath, watcher);
  } catch (error) {
    removeWatch(scriptPath);
    log.warn(error?.message);
  }
};

export const watchScriptChanged = ({ filePath, kenv, watch: watchString }: Script) => {
  if (!watchString && watchMap.get(filePath)) {
    removeWatch(filePath);
    return;
  }

  if (kenv !== '' && !kitState.trustedKenvs.includes(kenv)) {
    if (watchString) {
      log.info(`Ignoring ${filePath} // Background metadata because it's not trusted in a trusted kenv.`);
      log.info(`Add "${kitState.trustedKenvsKey}=${kenv}" to your .env file to trust it.`);
    }

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
