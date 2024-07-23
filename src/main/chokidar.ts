import path from 'node:path';
import { kenvPath, kitPath, userDbPath } from '@johnlindquist/kit/core/utils';
import chokidar from 'chokidar';
import { kitState } from './state';
import { createLogger } from '../shared/log-utils';

const log = createLogger('chokidar.ts');

const kitChokidarPath = (...parts: string[]) => {
  return kitPath(...parts).replaceAll('\\', '/');
};

const kenvChokidarPath = (...parts: string[]) => {
  return kenvPath(...parts).replaceAll('\\', '/');
};

const pathChokidarResolve = (...parts: string[]) => {
  return path.resolve(...parts).replaceAll('\\', '/');
};

export type WatchEvent = 'add' | 'change' | 'unlink' | 'ready';
type WatcherCallback = (eventName: WatchEvent, filePath: string) => Promise<void>;
export const startWatching = (callback: WatcherCallback) => {
  log.info(`🔍 Watching ${userDbPath}`);
  const userDbPathWatcher = chokidar.watch(userDbPath.replaceAll('\\', '/'));

  userDbPathWatcher.on('all', (eventName, filePath) => {
    log.info(`🔍 Watching ${userDbPath} -> ${eventName} ${filePath}`);
    callback(eventName as WatchEvent, filePath);
  });

  const kenvScriptsWatcher = chokidar.watch(
    [
      pathChokidarResolve(kenvChokidarPath('snippets', '*')),
      pathChokidarResolve(kenvChokidarPath('scripts', '*')),
      pathChokidarResolve(kenvChokidarPath('scriptlets', '*')),
    ],
    {
      depth: 0,
      // ignore dotfiles
      ignored: (filePath) => path.basename(filePath).startsWith('.'),
      ignoreInitial: kitState.ignoreInitial,
    },
  );

  kenvScriptsWatcher.on('all', callback);
  const kenvsWatcher = chokidar.watch(kenvChokidarPath('kenvs'), {
    ignoreInitial: kitState.ignoreInitial,
    depth: 0,
    ignored: (filePath) => {
      const relativePath = filePath.slice(kenvChokidarPath('kenvs').length);
      const depth = relativePath.split('/').filter((p) => p.length > 0).length;
      return depth > 1;
    },
  });
  kenvsWatcher.on('addDir', (filePath) => {
    log.info(`🕵️‍♀️ Detected new dir in "kenvs": ${filePath}`);

    const globs = [
      pathChokidarResolve(filePath, 'snippets', '*'),
      pathChokidarResolve(filePath, 'scripts', '*'),
      pathChokidarResolve(filePath, 'scriptlets', '*'),
      pathChokidarResolve(filePath, '*'),
    ];

    setTimeout(() => {
      log.info(`Adding globs: ${globs}`);
      kenvScriptsWatcher.add(globs);
    }, 1000);
  });

  kenvsWatcher.on('unlinkDir', (filePath) => {
    log.info(`🕵️‍♂️ Detected removed dir in "kenvs": ${filePath}`);

    const globs = [
      pathChokidarResolve(filePath, 'snippets', '*'),
      pathChokidarResolve(filePath, 'scripts', '*'),
      pathChokidarResolve(filePath, 'scriptlets', '*'),
      pathChokidarResolve(filePath, '*'),
    ];

    setTimeout(() => {
      log.info(`Removing globs: ${globs}`);
      kenvScriptsWatcher.unwatch(globs);
    }, 1000);
  });

  kenvsWatcher.on('unlink', (filePath) => {
    kenvScriptsWatcher.unwatch(pathChokidarResolve(filePath, 'scripts', '*'));
  });

  const kenvRootWatcher = chokidar.watch(kenvChokidarPath('*'), {
    depth: 0,
    ignoreInitial: kitState.ignoreInitial,
  });

  kenvRootWatcher.on('all', callback);

  const runWatcher = chokidar.watch(kitChokidarPath('run.txt'), {
    ignoreInitial: true,
  });

  runWatcher.on('all', callback);

  const pingTxtPath = kitChokidarPath('ping.txt');
  log.green({ pingTxtPath });
  const pingWatcher = chokidar.watch(pingTxtPath, {
    ignoreInitial: true,
  });

  pingWatcher.on('all', callback);

  kitState.ignoreInitial = true;

  return [kenvScriptsWatcher, kenvsWatcher, userDbPathWatcher, kenvRootWatcher, runWatcher, pingWatcher];

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
