import path from 'node:path';
import { userDbPath } from '@johnlindquist/kit/core/utils';
import chokidar from 'chokidar';
import { kitState } from './state';
import { createLogger } from '../shared/log-utils';
import { kitChokidarPath, kenvChokidarPath, pathChokidarResolve, slash } from './path-utils';
import { readdirSync } from 'node:fs';
import os from 'node:os';

const log = createLogger('chokidar.ts');

export type WatchEvent = 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir'
export type WatchSource = 'app' | 'kenv';
type WatcherCallback = (eventName: WatchEvent, filePath: string, source?: WatchSource) => Promise<void>;
export const startWatching = (callback: WatcherCallback) => {
  log.info(`🔍 Watching ${userDbPath}`);
  const userDbPathWatcher = chokidar.watch(slash(userDbPath));

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
    followSymlinks: true,
    depth: 0,
    ignored: (filePath) => {
      const relativePath = filePath.slice(kenvChokidarPath('kenvs').length);
      const depth = relativePath.split('/').filter((p) => p.length > 0).length;
      return depth > 1;
    },
  });

  const kenvsWatcherCallback = (filePath) => {
    const { name } = path.parse(filePath);
    if (name === 'kenvs') {
      return;
    }
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
  }

  kenvsWatcher.on('addDir', kenvsWatcherCallback);


  const watchedKenvs = readdirSync(kenvChokidarPath('kenvs'));
  for(const kenv of watchedKenvs) {
    const kenvPath = pathChokidarResolve(kenvChokidarPath('kenvs', kenv));
    log.info(`🕵️‍♀️ Watching ${kenvPath}`);
    kenvsWatcherCallback(kenvPath);
  }

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

  // Add this function to get app directories based on the OS
  function getAppDirectories(): string[] {
    if (process.platform === 'darwin') {
      return ['/Applications', path.join(os.homedir(), 'Applications')];
    }

    if (process.platform === 'win32') {
      return [
        path.join('C:', 'Program Files'),
        path.join('C:', 'Program Files (x86)'),
        path.join(os.homedir(), 'AppData', 'Local'),
        path.join(os.homedir(), 'AppData', 'Roaming'),
      ].map(slash);
    }
    return []; // For other platforms, return an empty array
  }

  // Replace the existing appWatcher code with this:
  const appDirectories = getAppDirectories();
  const appWatcher = chokidar.watch(appDirectories, {
    ignoreInitial: true,
    depth: 0, // Only watch the top-level of these directories
  });

  appWatcher.on('all', (event, filePath) => {
    log.info(`App change detected: ${event} ${filePath}`);
    if (!path.basename(filePath).startsWith('.')) {
      callback(event as WatchEvent, filePath, 'app');
    }
  });

  kitState.ignoreInitial = true;

  return [kenvScriptsWatcher, kenvsWatcher, userDbPathWatcher, kenvRootWatcher, runWatcher, pingWatcher, appWatcher];

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
