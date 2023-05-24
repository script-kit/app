import path from 'path';
import chokidar from 'chokidar';
import log from 'electron-log';
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
    [
      path.resolve(kenvPath('scripts', '*')),
      path.resolve(kenvPath('lib', '**', '*')),
    ],
    {
      depth: 0,
      // ignore dotfiles
      ignored: (filePath) => path.basename(filePath).startsWith('.'),
    }
  );

  const jsonWatcher = chokidar
    .watch([appDbPath, shortcutsPath, userDbPath])
    .on('all', callback);

  kenvScriptsWatcher.on('all', callback);
  const kenvsWatcher = chokidar.watch(kenvPath('kenvs'), {
    ignoreInitial: false,
    depth: 0,
    ignored: (filePath) => {
      const relativePath = filePath.slice(kenvPath('kenvs').length);
      const depth = relativePath.split(path.sep).filter((p) => p.length > 0)
        .length;
      return depth > 1;
    },
  });
  kenvsWatcher.on('addDir', (filePath) => {
    log.info(`🕵️‍♀️ Detected new dir in "kenvs": ${filePath}`);

    const globs = [
      path.resolve(filePath, 'scripts', '*'),
      path.resolve(filePath, 'lib', '**', '*'),
    ];

    setTimeout(() => {
      log.info(`Adding globs: ${globs}`);
      kenvScriptsWatcher.add(globs);
    }, 1000);
  });

  kenvsWatcher.on('unlinkDir', (filePath) => {
    log.info(`🕵️‍♂️ Detected removed dir in "kenvs": ${filePath}`);

    const globs = [
      path.resolve(filePath, 'scripts', '*'),
      path.resolve(filePath, 'lib', '**', '*'),
    ];

    setTimeout(() => {
      log.info(`Removing globs: ${globs}`);
      kenvScriptsWatcher.unwatch(globs);
    }, 1000);
  });

  kenvsWatcher.on('unlink', (filePath) => {
    kenvScriptsWatcher.unwatch(path.resolve(filePath, 'scripts', '*'));
  });

  const kenvEnvWatcher = chokidar.watch(kenvPath('.env'), {
    disableGlobbing: true,
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
