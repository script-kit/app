import path from 'node:path';
import { kenvPath, kitPath, userDbPath } from '@johnlindquist/kit/core/utils';
import chokidar from 'chokidar';
import log from 'electron-log';
import { kitState } from './state';

export type WatchEvent = 'add' | 'change' | 'unlink' | 'ready';
type WatcherCallback = (eventName: WatchEvent, filePath: string) => Promise<void>;
export const startWatching = (callback: WatcherCallback) => {
  const kenvScriptsWatcher = chokidar.watch(
    [path.resolve(kenvPath('snippets', '*')), path.resolve(kenvPath('scripts', '*'))],
    {
      depth: 0,
      // ignore dotfiles
      ignored: (filePath) => path.basename(filePath).startsWith('.'),
      ignoreInitial: kitState.ignoreInitial,
    },
  );

  kenvScriptsWatcher.on('all', callback);
  const kenvsWatcher = chokidar.watch(kenvPath('kenvs'), {
    ignoreInitial: kitState.ignoreInitial,
    depth: 0,
    ignored: (filePath) => {
      const relativePath = filePath.slice(kenvPath('kenvs').length);
      const depth = relativePath.split(path.sep).filter((p) => p.length > 0).length;
      return depth > 1;
    },
  });
  kenvsWatcher.on('addDir', (filePath) => {
    log.info(`🕵️‍♀️ Detected new dir in "kenvs": ${filePath}`);

    const globs = [path.resolve(filePath, 'snippets', '*'), path.resolve(filePath, 'scripts', '*')];

    setTimeout(() => {
      log.info(`Adding globs: ${globs}`);
      kenvScriptsWatcher.add(globs);
    }, 1000);
  });

  kenvsWatcher.on('unlinkDir', (filePath) => {
    log.info(`🕵️‍♂️ Detected removed dir in "kenvs": ${filePath}`);

    const globs = [path.resolve(filePath, 'scripts', '*')];

    setTimeout(() => {
      log.info(`Removing globs: ${globs}`);
      kenvScriptsWatcher.unwatch(globs);
    }, 1000);
  });

  kenvsWatcher.on('unlink', (filePath) => {
    kenvScriptsWatcher.unwatch(path.resolve(filePath, 'scripts', '*'));
  });

  const fileWatcher = chokidar.watch([userDbPath, kenvPath('.env'), kenvPath('kit.css'), kenvPath('package.json')], {
    disableGlobbing: true,
    ignoreInitial: kitState.ignoreInitial,
  });

  fileWatcher.on('all', callback);

  const runWatcher = chokidar.watch(kitPath('run.txt'), {
    disableGlobbing: true,
    ignoreInitial: true,
  });

  runWatcher.on('all', callback);

  kitState.ignoreInitial = true;

  return [kenvScriptsWatcher, kenvsWatcher, fileWatcher, runWatcher];

  // TODO: Do I need to watch scripts.json?
  // const scriptsJsonWatcher = chokidar.watch(kitPath('db', 'scripts.json'), {
  //   disableGlobbing: true,
  //   ignoreInitial: true,
  // });
  // scriptsJsonWatcher.on('all', callback);
  // return [
  //   kenvScriptsWatcher,
  //   kenvsWatcher,
  //   fileWatcher,
  //   runWatcher,
  //   scriptsJsonWatcher,
  // ];
};
