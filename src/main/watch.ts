import type { Stats } from 'node:fs';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import type { Script } from '@johnlindquist/kit/types/core';
import chokidar from 'chokidar';
import { app } from 'electron';
import { Trigger } from '../shared/enums';
import { runPromptProcess } from './kit';
import { metadataWatcherLog as log } from './logs';
import { slash } from './path-utils';
import { kitState } from './state';

export const watchMap = new Map();

type FSWatcher = ReturnType<typeof chokidar.watch>;

export const removeWatch = async (filePath: string) => {
  const watcher = watchMap.get(filePath) as FSWatcher;
  if (watcher) {
    log.info(`🗑 Remove watch: ${filePath}`);
    // If it's a glob pattern, unwatch the resolved paths
    if (filePath.includes('*')) {
      const resolvedPaths = await Array.fromAsync(glob(filePath));
      watcher.unwatch(resolvedPaths);
    }
    await watcher.close();
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
  return slash(path.normalize(resolvedPath()));
};

const validWatchEvents = ['add', 'change', 'unlink'];

const addWatch = async (watchString: string, scriptPath: string) => {
  try {
    log.info(`Watch: ${watchString} - from - ${scriptPath}`);

    const [pathsString] = watchString.split('|');

    // Handle the path(s) to watch
    let paths: string | string[];
    let watchOptions: Parameters<typeof chokidar.watch>[1] = { ignoreInitial: true };

    if (pathsString.startsWith('[')) {
      // Handle array of paths
      const pathArray = JSON.parse(pathsString).map(normalizePath(scriptPath));

      // If any path contains a glob pattern, resolve it
      if (pathArray.some((p) => p.includes('*'))) {
        const expandedPaths = await Promise.all(
          pathArray.map(async (p) => {
            if (p.includes('*')) {
              return await glob(p);
            }
            return [p];
          }),
        );
        paths = expandedPaths.flat();
      } else {
        paths = pathArray;
      }
    } else {
      const normalizedPath = normalizePath(scriptPath)(pathsString);

      // If it's a glob pattern, resolve it first
      if (pathsString.includes('*')) {
        const dir = path.dirname(normalizedPath);
        paths = dir;

        // For patterns like ~/Downloads/*.js, filter by extension
        const ext = path.extname(pathsString);
        if (ext) {
          watchOptions = {
            ...watchOptions,
            ignored: (path: string, stats?: Stats) => (stats?.isFile() ?? false) && !path.endsWith(ext),
          };
        }
      } else {
        paths = normalizedPath;
      }
    }

    log.info('Watched paths:', { paths });

    const watcher = chokidar.watch(paths, watchOptions);

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
    await removeWatch(scriptPath);
    if (error instanceof Error) {
      log.warn(error.message);
    } else {
      log.warn('Unknown error in addWatch');
    }
  }
};

export const watchScriptChanged = async ({ filePath, kenv, watch: watchString }: Script) => {
  if (!watchString && watchMap.get(filePath)) {
    await removeWatch(filePath);
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
    await addWatch(watchString, filePath);
    return;
  }

  if (watchString && watchMap.get(filePath)) {
    await removeWatch(filePath);
    await addWatch(watchString, filePath);
  }
};
