import path from 'node:path';
import os from 'node:os';
import { readdirSync, statSync } from 'node:fs';
import type { FSWatcher } from 'chokidar';

import { createLogger } from './log-utils';
import { kenvChokidarPath, kitChokidarPath, slash } from './path-utils';
import { WatcherManager } from './watcher-manager';

// Types
export type WatchEvent = 'add' | 'addDir' | 'change' | 'changeDir' | 'unlink' | 'unlinkDir';
export type WatchSource = 'app' | 'kenv';

export interface WatchOptions {
  ignoreInitial?: boolean;
}

type WatcherCallback = (eventName: WatchEvent, filePath: string, source?: WatchSource) => Promise<void>;

const log = createLogger('chokidar.ts');

const ignored = [
  '**/node_modules/**',
  '**/node_modules',
  '**/.git/**',
  '**/.git',
  '**/*/[^/]*', // Ignore anything in subdirectories beyond depth 1
  '**/.cache/**',
  '**/tmp/**',
  '**/logs/**',
];

// For sub-kenvs, we specifically watch only {subKenv}/scripts, {subKenv}/snippets, and {subKenv}/scriptlets
// so we do NOT watch node_modules/.git/etc at all

function getConfigFiles(): string[] {
  return ['globals.ts', 'package.json'];
}

/**
 * Create watchers for a *single* sub-kenv (for its scripts/snippets/scriptlets).
 */
function createSubKenvWatchers(
  manager: WatcherManager,
  subKenvDir: string,
  callback: WatcherCallback,
  options: WatchOptions,
): FSWatcher[] {
  const watchers: FSWatcher[] = [];
  // We only watch {subKenv}/scripts, {subKenv}/snippets, {subKenv}/scriptlets
  // That's it, no node_modules, no ignoring required, since we never watch them.
  const subKenvScripts = path.join(subKenvDir, 'scripts');
  const subKenvSnippets = path.join(subKenvDir, 'snippets');
  const subKenvScriptlets = path.join(subKenvDir, 'scriptlets');

  // Helper: Start a watcher for a directory if it exists
  const watchIfExists = (dirPath: string, type: string): FSWatcher | null => {
    try {
      const stats = statSync(dirPath);
      if (!stats.isDirectory()) return null;

      const key = `subkenv:${subKenvDir}:${type}`;
      if (manager.getWatcher(key)) {
        log.info(`Watcher already exists for ${dirPath}, skipping`);
        return null;
      }

      const w = manager.createWatcher(key, dirPath, {
        depth: 0, // Only watch root level
        ignoreInitial: true,
        ignored,
        alwaysStat: true,
      });

      w.on('all', (event, changedPath) => {
        // Only emit events for files directly in the watched directory
        if (path.dirname(changedPath) === dirPath) {
          callback(event as WatchEvent, changedPath);
        }
      });
      w.on('ready', () => {
        log.info('📁 Sub-Kenv Watcher ready for:', dirPath);
      });
      return w;
    } catch (err) {
      // If directory doesn't exist, that's fine
      return null;
    }
  };

  const scriptsWatcher = watchIfExists(subKenvScripts, 'scripts');
  if (scriptsWatcher) {
    watchers.push(scriptsWatcher);
  }

  const snippetsWatcher = watchIfExists(subKenvSnippets, 'snippets');
  if (snippetsWatcher) {
    watchers.push(snippetsWatcher);
  }

  const scriptletsWatcher = watchIfExists(subKenvScriptlets, 'scriptlets');
  if (scriptletsWatcher) {
    watchers.push(scriptletsWatcher);
  }

  return watchers;
}

export const startWatching = (
  callback: WatcherCallback,
  options: WatchOptions = { ignoreInitial: true },
): FSWatcher[] => {
  log.info(`🚀 Starting watchers (specific) with ignoreInitial=${options.ignoreInitial ?? false}`);

  const manager = new WatcherManager(callback, options);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1) Watch kit/db (only top level => depth=0)
  // ─────────────────────────────────────────────────────────────────────────────
  const dbPath = kitChokidarPath('db');
  log.info(`🔍 Watching kit db folder: ${dbPath}`);
  const dbWatcher = manager.createWatcher('db', dbPath, {
    depth: 0,
    alwaysStat: true,
  });
  dbWatcher.on('all', (event, filePath) => {
    callback(event as WatchEvent, filePath);
  });
  dbWatcher.on('ready', () => {
    log.info(`📁 DB Watcher ready`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2) Watch run.txt + ping.txt in kitPath
  // ─────────────────────────────────────────────────────────────────────────────
  const runTxt = kitChokidarPath('run.txt');
  const pingTxt = kitChokidarPath('ping.txt');
  const kitPath = path.dirname(runTxt);
  log.info(`🔍 Watching run.txt & ping.txt: ${[runTxt, pingTxt].join(', ')}`);
  const runPingWatcher = manager.createWatcher('run-ping', kitPath, {
    depth: 0,
    alwaysStat: true,
    ignored: (path: string) => {
      // Don't ignore the parent directory
      if (path === kitPath) return false;

      // Only watch run.txt and ping.txt
      const basename = path.split('/').pop();
      return basename !== 'run.txt' && basename !== 'ping.txt';
    },
  });
  runPingWatcher.on('all', (event, filePath) => {
    // Only emit events for run.txt and ping.txt
    const basename = path.basename(filePath);
    if (basename === 'run.txt' || basename === 'ping.txt') {
      callback(event as WatchEvent, filePath);
    }
  });
  runPingWatcher.on('ready', () => {
    log.info(`📁 Run/Ping Watcher ready`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3) Watch kenv root for config files (.env, globals.ts, package.json)
  // ─────────────────────────────────────────────────────────────────────────────
  const configFiles = getConfigFiles();
  const envPattern = '.env';
  log.info(`🔍 Watching kenv root for config files: ${configFiles.join(', ')}`);
  const kenvRootWatcher = manager.createWatcher('kenv-root', kenvChokidarPath(), {
    depth: 0,
    alwaysStat: true,
    ignored,
  });

  kenvRootWatcher.on('all', (event, filePath) => {
    const filename = path.basename(filePath);
    if (configFiles.includes(filename) || filename.startsWith(envPattern)) {
      callback(event as WatchEvent, filePath);
    }
  });

  kenvRootWatcher.on('ready', () => {
    log.info(`📁 Kenv Root Watcher ready`);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4) Watch scripts, snippets, scriptlets in the main kenv (depth=∞)
  // ─────────────────────────────────────────────────────────────────────────────
  const mainKenvScripts = kenvChokidarPath('scripts');
  const mainKenvSnippets = kenvChokidarPath('snippets');
  const mainKenvScriptlets = kenvChokidarPath('scriptlets');

  function watchDir(dirPath: string, label: string) {
    const key = `main-kenv-${label.toLowerCase()}`;
    if (manager.getWatcher(key)) {
      log.info(`Watcher already exists for ${dirPath}, skipping`);
      return;
    }

    const w = manager.createWatcher(key, dirPath, {
      depth: 0, // Only watch root level
      ignored,
      alwaysStat: true,
    });
    w.on('all', (event, filePath) => {
      callback(event as WatchEvent, filePath);
    });
    w.on('ready', () => {
      log.info(`📁 Main Kenv ${label} watcher ready: ${dirPath}`);
    });
  }

  watchDir(mainKenvScripts, 'Scripts');
  watchDir(mainKenvSnippets, 'Snippets');
  watchDir(mainKenvScriptlets, 'Scriptlets');

  // ─────────────────────────────────────────────────────────────────────────────
  // 5) Watch the kenvs root directory (depth=1)
  //    - On addDir => create watchers for that sub-kenv's scripts/snippets/scriptlets
  //    - On unlinkDir => remove watchers
  // ─────────────────────────────────────────────────────────────────────────────
  const kenvsRoot = kenvChokidarPath('kenvs');
  log.info(`🔍 Watching kenvs root: ${kenvsRoot}`);
  const kenvsWatcher = manager.createWatcher('kenvs-root', kenvsRoot, {
    depth: 1, // Watch both kenvs root and immediate subdirectories
    alwaysStat: true, // Ensure we get proper directory events during renames
    ignoreInitial: true,
    ignored,
  });

  kenvsWatcher.on('ready', () => {
    log.info(`📁 Kenvs Root Watcher ready: ${kenvsRoot}`);
    // On startup, watch existing sub-kenvs
    try {
      const entries = readdirSync(kenvsRoot, { withFileTypes: true });
      for (const dirent of entries) {
        if (dirent.isDirectory()) {
          const subKenvDir = path.join(kenvsRoot, dirent.name);
          // create watchers now
          log.info(`🚀 Found existing sub-kenv: ${subKenvDir}`);
          createSubKenvWatchers(manager, subKenvDir, callback, options);
        }
      }
    } catch (err) {
      log.warn(`Error scanning existing sub-kenvs: ${err}`);
    }
  });

  kenvsWatcher.on('addDir', (subKenvDir) => {
    log.info(`📁 New sub-kenv folder detected: ${subKenvDir}`);
    callback('addDir', subKenvDir); // so tests can see this
    createSubKenvWatchers(manager, subKenvDir, callback, options);
  });

  kenvsWatcher.on('unlinkDir', (subKenvDir) => {
    log.info(`📁 Sub-kenv folder removed: ${subKenvDir}`);
    callback('unlinkDir', subKenvDir); // so tests can see this
    // Remove all watchers for this subkenv
    const prefix = `subkenv:${subKenvDir}`;
    for (const [key] of manager.watchers.entries()) {
      if (key.startsWith(prefix)) {
        manager.removeWatcher(key);
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6) Optional: watch application directories on Mac/Win
  // ─────────────────────────────────────────────────────────────────────────────
  function getAppDirectories(): string[] {
    if (process.platform === 'darwin') {
      return ['/Applications', path.join(os.homedir(), 'Applications')];
    } else if (process.platform === 'win32') {
      return [
        path.join('C:', 'Program Files'),
        path.join('C:', 'Program Files (x86)'),
        path.join(os.homedir(), 'AppData', 'Local'),
        path.join(os.homedir(), 'AppData', 'Roaming'),
      ].map(slash);
    }
    return [];
  }

  const appDirs = getAppDirectories();
  if (appDirs.length) {
    const appWatcher = manager.createWatcher('apps', appDirs, {
      ignoreInitial: true,
      depth: 0,
      alwaysStat: true,
      ignored,
    });
    appWatcher.on('all', (event, filePath) => {
      log.info(`App change detected: ${event} ${filePath}`);
      if (!path.basename(filePath).startsWith('.')) {
        callback(event as WatchEvent, filePath, 'app');
      }
    });
    appWatcher.on('ready', () => {
      log.info(`📁 App Watcher ready`);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Return all watchers
  // ─────────────────────────────────────────────────────────────────────────────
  log.info('✅ All watchers set up. Returning references.');
  return Array.from(manager.watchers.values()).map(({ watcher }) => watcher);
};
