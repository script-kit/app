import path from 'node:path';
import os from 'node:os';
import { readdirSync, statSync } from 'node:fs';
import chokidar, { type FSWatcher } from 'chokidar';

import { createLogger } from '../shared/log-utils';
import { kenvChokidarPath, kitChokidarPath, slash } from './path-utils';

// Types
export type WatchEvent = 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir';
export type WatchSource = 'app' | 'kenv';

export interface WatchOptions {
  ignoreInitial?: boolean;
}

type WatcherCallback = (eventName: WatchEvent, filePath: string, source?: WatchSource) => Promise<void>;

const log = createLogger('chokidar.ts');

// For sub-kenvs, we specifically watch only {subKenv}/scripts, {subKenv}/snippets, and {subKenv}/scriptlets
// so we do NOT watch node_modules/.git/etc at all.

function getConfigFiles(): string[] {
  return ['globals.ts', 'package.json'];
}

/**
 * Create watchers for a *single* sub-kenv (for its scripts/snippets/scriptlets).
 */
function createSubKenvWatchers(subKenvDir: string, callback: WatcherCallback, options: WatchOptions): FSWatcher[] {
  const watchers: FSWatcher[] = [];
  // We only watch {subKenv}/scripts, {subKenv}/snippets, {subKenv}/scriptlets
  // That's it, no node_modules, no ignoring required, since we never watch them.
  const subKenvScripts = path.join(subKenvDir, 'scripts');
  const subKenvSnippets = path.join(subKenvDir, 'snippets');
  const subKenvScriptlets = path.join(subKenvDir, 'scriptlets');

  // Helper: Start a watcher for a directory if it exists
  const watchIfExists = (dirPath: string): FSWatcher | null => {
    try {
      const stats = statSync(dirPath);
      if (!stats.isDirectory()) return null;

      const w = chokidar.watch(dirPath, {
        ignoreInitial: options.ignoreInitial,
        depth: 0, // Only watch root level
        followSymlinks: true,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/*/[^/]*', // Ignore anything in subdirectories
        ],
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

  const scriptsWatcher = watchIfExists(subKenvScripts);
  if (scriptsWatcher) watchers.push(scriptsWatcher);

  const snippetsWatcher = watchIfExists(subKenvSnippets);
  if (snippetsWatcher) watchers.push(snippetsWatcher);

  const scriptletsWatcher = watchIfExists(subKenvScriptlets);
  if (scriptletsWatcher) watchers.push(scriptletsWatcher);

  return watchers;
}

export const startWatching = (
  callback: WatcherCallback,
  options: WatchOptions = { ignoreInitial: true },
): FSWatcher[] => {
  log.info(`🚀 Starting watchers (specific) with ignoreInitial=${options.ignoreInitial ?? false}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // Collect watchers in an array so we can return them
  const allWatchers: FSWatcher[] = [];

  // We'll track each sub-kenv's watchers so we can remove them if the sub-kenv is deleted
  const subKenvWatchers = new Map<string, FSWatcher[]>();

  // ─────────────────────────────────────────────────────────────────────────────
  // 1) Watch kit/db (only top level => depth=0)
  // ─────────────────────────────────────────────────────────────────────────────
  const dbPath = kitChokidarPath('db');
  log.info(`🔍 Watching kit db folder: ${dbPath}`);
  const dbWatcher = chokidar.watch(dbPath, {
    ignoreInitial: options.ignoreInitial,
    depth: 0,
    followSymlinks: true,
  });
  dbWatcher.on('all', (event, filePath) => {
    callback(event as WatchEvent, filePath);
  });
  dbWatcher.on('ready', () => {
    log.info(`📁 DB Watcher ready`);
  });
  allWatchers.push(dbWatcher);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2) Watch run.txt + ping.txt in kitPath
  // ─────────────────────────────────────────────────────────────────────────────
  const runTxt = kitChokidarPath('run.txt');
  const pingTxt = kitChokidarPath('ping.txt');
  log.info(`🔍 Watching run.txt & ping.txt: ${[runTxt, pingTxt].join(', ')}`);
  const runPingWatcher = chokidar.watch([runTxt, pingTxt], {
    ignoreInitial: options.ignoreInitial,
    followSymlinks: true,
  });
  runPingWatcher.on('all', (event, filePath) => {
    callback(event as WatchEvent, filePath);
  });
  runPingWatcher.on('ready', () => {
    log.info(`📁 Run/Ping Watcher ready`);
  });
  allWatchers.push(runPingWatcher);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3) Watch kenv root for config files (.env, globals.ts, package.json)
  // ─────────────────────────────────────────────────────────────────────────────
  const configFiles = getConfigFiles();
  const envPattern = '.env';
  log.info(`🔍 Watching kenv root for config files: ${configFiles.join(', ')}`);
  const kenvRootWatcher = chokidar.watch(kenvChokidarPath(), {
    ignoreInitial: options.ignoreInitial,
    depth: 0,
    followSymlinks: true,
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
  allWatchers.push(kenvRootWatcher);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4) Watch scripts, snippets, scriptlets in the main kenv (depth=∞)
  // ─────────────────────────────────────────────────────────────────────────────
  const mainKenvScripts = kenvChokidarPath('scripts');
  const mainKenvSnippets = kenvChokidarPath('snippets');
  const mainKenvScriptlets = kenvChokidarPath('scriptlets');

  function watchDir(dirPath: string, label: string) {
    const w = chokidar.watch(dirPath, {
      ignoreInitial: options.ignoreInitial,
      depth: 0, // Only watch root level
      followSymlinks: true,
    });
    w.on('all', (event, filePath) => {
      callback(event as WatchEvent, filePath);
    });
    w.on('ready', () => {
      log.info(`📁 Main Kenv ${label} watcher ready: ${dirPath}`);
    });
    allWatchers.push(w);
  }

  watchDir(mainKenvScripts, 'Scripts');
  watchDir(mainKenvSnippets, 'Snippets');
  watchDir(mainKenvScriptlets, 'Scriptlets');

  // ─────────────────────────────────────────────────────────────────────────────
  // 5) Watch the kenvs root directory (depth=0)
  //    - On addDir => create watchers for that sub-kenv's scripts/snippets/scriptlets
  //    - On unlinkDir => remove watchers
  // ─────────────────────────────────────────────────────────────────────────────
  const kenvsRoot = kenvChokidarPath('kenvs');
  log.info(`🔍 Watching kenvs root: ${kenvsRoot}`);
  const kenvsWatcher = chokidar.watch(kenvsRoot, {
    ignoreInitial: options.ignoreInitial,
    depth: 0, // only see top-level kenv names
    followSymlinks: true,
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
          const watchers = createSubKenvWatchers(subKenvDir, callback, options);
          subKenvWatchers.set(subKenvDir, watchers);
        }
      }
    } catch (err) {
      log.warn(`Error scanning existing sub-kenvs: ${err}`);
    }
  });

  kenvsWatcher.on('addDir', (subKenvDir) => {
    log.info(`📁 New sub-kenv folder detected: ${subKenvDir}`);
    callback('addDir', subKenvDir); // so tests can see this
    if (!subKenvWatchers.has(subKenvDir)) {
      const watchers = createSubKenvWatchers(subKenvDir, callback, options);
      subKenvWatchers.set(subKenvDir, watchers);
    }
  });

  kenvsWatcher.on('unlinkDir', async (subKenvDir) => {
    log.info(`🗑 Removed sub-kenv folder: ${subKenvDir}`);
    callback('unlinkDir', subKenvDir);
    if (subKenvWatchers.has(subKenvDir)) {
      const watchers = subKenvWatchers.get(subKenvDir) || [];
      for (const w of watchers) {
        try {
          await w.close();
        } catch (err) {
          log.warn(`Error closing watchers for sub-kenv ${subKenvDir}: ${err}`);
        }
      }
      subKenvWatchers.delete(subKenvDir);
    }
  });

  allWatchers.push(kenvsWatcher);

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
    const appWatcher = chokidar.watch(appDirs, {
      ignoreInitial: true,
      depth: 0,
      followSymlinks: true,
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
    allWatchers.push(appWatcher);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Return all watchers
  // ─────────────────────────────────────────────────────────────────────────────
  log.info('✅ All watchers set up. Returning references.');
  return allWatchers;
};
