import path from 'path';
import chokidar from 'chokidar';
import {
  shortcutsPath,
  kenvPath,
  kitPath,
  appDbPath,
  userDbPath,
} from '@johnlindquist/kit/cjs/utils';

export type WatchEvent = 'add' | 'change' | 'unlink' | 'ready';
type WatcherCallback = (
  eventName: WatchEvent,
  filePath: string
) => Promise<void>;
export const startWatching = (callback: WatcherCallback) => {
  const kenvScriptsWatcher = chokidar.watch(
    path.resolve(kenvPath('scripts', '*')),
    {
      depth: 0,
    }
  );

  const jsonWatcher = chokidar
    .watch([appDbPath, shortcutsPath, userDbPath])
    .on('all', callback);

  kenvScriptsWatcher.on('all', callback);
  const kenvsWatcher = chokidar.watch(kenvPath('kenvs'), {
    ignoreInitial: false,
    depth: 0,
  });
  kenvsWatcher.on('addDir', (filePath) => {
    kenvScriptsWatcher.add(path.resolve(filePath, 'scripts', '*'));
  });
  kenvsWatcher.on('unlink', (filePath) => {
    kenvScriptsWatcher.unwatch(path.resolve(filePath, 'scripts', '*'));
  });

  const kenvEnvWatcher = chokidar.watch(kenvPath('.env'), {
    disableGlobbing: true,
    ignoreInitial: true,
  });

  kenvEnvWatcher.on('all', callback);

  const runWatcher = chokidar.watch(kitPath('run.txt'), {
    disableGlobbing: true,
    ignoreInitial: true,
  });

  runWatcher.on('all', callback);

  return [
    kenvScriptsWatcher,
    jsonWatcher,
    kenvsWatcher,
    kenvEnvWatcher,
    runWatcher,
  ];
};
