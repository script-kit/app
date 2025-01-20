import path from 'node:path';
import os from 'node:os';
import { readdirSync } from 'node:fs';
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
export const TIMEOUT_MS = 1000;

// For sub-kenvs, we only care about deeply nested "scripts", "snippets", or "scriptlets" folders.
// We'll ignore "node_modules" (and anything else you want to skip)
const IGNORED_FOLDERS = ['node_modules', '.git', '.DS_Store'];
const maxSubKenvDepth = 20; // or 99 if you expect extremely deep nesting

// Add memory tracking utilities
const getMemoryUsage = () => {
  const used = process.memoryUsage();
  return {
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
  };
};

const watcherStats = (watcher: FSWatcher, label: string) => {
  const watched = watcher.getWatched();
  const paths = Object.entries(watched).reduce((acc, [dir, files]) => {
    return acc + files.length;
  }, 0);

  log.info(`📊 Watcher Stats [${label}]:
    - Total paths watched: ${paths}
    - Memory: ${JSON.stringify(getMemoryUsage(), null, 2)}
  `);

  // Log all watched paths at debug level
  Object.entries(watched).forEach(([dir, files]) => {
    log.info(`📂 [${label}] Watching dir: ${dir}
      Files: ${files.join(', ')}
    `);
  });
};

// Add new function to log all watchers' paths
const logAllWatcherPaths = (watchers: FSWatcher[]) => {
  log.info(`🔍 All Watcher Paths:`);
  watchers.forEach((watcher, index) => {
    const watched = watcher.getWatched();
    log.info(`\n📺 Watcher ${index}:`);
    Object.entries(watched).forEach(([dir, files]) => {
      log.info(`  📁 ${dir}:`);
      files.forEach((file) => log.info(`    - ${file}`));
    });
  });
};

// Utility: gather .env and .env.* files from the main kenv
function getEnvFiles(): string[] {
  const results: string[] = [];
  try {
    const listing = readdirSync(kenvChokidarPath());
    for (const item of listing) {
      if (item.startsWith('.env')) {
        results.push(kenvChokidarPath(item));
      }
    }
  } catch (error) {
    log.warn(`Failed reading .env files: ${error}`);
  }
  return results;
}

export const startWatching = (
  callback: WatcherCallback,
  options: WatchOptions = { ignoreInitial: true },
): FSWatcher[] => {
  log.info(`🚀 Starting watchers with memory usage:`, getMemoryUsage());

  // We'll collect references so we can unwatch sub-kenvs
  const subKenvWatchers: Map<string, FSWatcher> = new Map();

  // ─────────────────────────────────────────────────────────────────────────────
  // 1) Watch kit/db (db folder), user.json, scripts.json changes
  // ─────────────────────────────────────────────────────────────────────────────
  const kitDbPath = kitChokidarPath('db'); // This folder has user.json, scripts.json, etc.
  log.info(`🔍 Watching kit db folder: ${kitDbPath}`);
  const dbWatcher = chokidar.watch(kitDbPath, {
    ignoreInitial: options.ignoreInitial,
    depth: 0,
  });

  dbWatcher.on('ready', () => {
    watcherStats(dbWatcher, 'DB Watcher');
  });

  dbWatcher.on('all', (event, filePath) => {
    callback(event as WatchEvent, filePath);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2) Watch run.txt + ping.txt in kitPath
  // ─────────────────────────────────────────────────────────────────────────────
  const runTxt = kitChokidarPath('run.txt');
  const pingTxt = kitChokidarPath('ping.txt');
  log.info(`🔍 Watching run.txt & ping.txt: [${runTxt}, ${pingTxt}]`);

  const runPingWatcher = chokidar.watch([runTxt, pingTxt], {
    ignoreInitial: options.ignoreInitial,
  });

  runPingWatcher.on('ready', () => {
    watcherStats(runPingWatcher, 'Run/Ping Watcher');
  });

  runPingWatcher.on('all', (event, filePath) => {
    callback(event as WatchEvent, filePath);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3) Watch .env (and .env.*), globals.ts, package.json in main kenv
  // ─────────────────────────────────────────────────────────────────────────────
  const singleKenvFiles = [
    kenvChokidarPath('globals.ts'),
    kenvChokidarPath('package.json'),
    ...getEnvFiles(), // gather .env & .env.whatever
  ];
  log.info(`🔍 Watching main kenv individual files: ${singleKenvFiles}`);

  const kenvFilesWatcher = chokidar.watch(singleKenvFiles, {
    ignoreInitial: options.ignoreInitial,
  });

  kenvFilesWatcher.on('ready', () => {
    watcherStats(kenvFilesWatcher, 'Kenv Files Watcher');
  });

  kenvFilesWatcher.on('all', (event, filePath) => {
    callback(event as WatchEvent, filePath);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4) Watch scripts, snippets, scriptlets in the main kenv at top-level
  // ─────────────────────────────────────────────────────────────────────────────
  const mainKenvDirs = [kenvChokidarPath('scripts'), kenvChokidarPath('snippets'), kenvChokidarPath('scriptlets')];
  log.info(`🔍 Watching main kenv dirs: ${mainKenvDirs.join(', ')}`);

  const mainKenvWatcher = chokidar.watch(mainKenvDirs, {
    ignoreInitial: options.ignoreInitial,
    depth: 0,
    ignored: (filePath) => {
      // skip hidden items like .DS_Store
      const base = path.basename(filePath);
      return base.startsWith('.') || IGNORED_FOLDERS.includes(base);
    },
  });

  mainKenvWatcher.on('ready', () => {
    watcherStats(mainKenvWatcher, 'Main Kenv Watcher');
  });

  mainKenvWatcher.on('all', (event, filePath) => {
    callback(event as WatchEvent, filePath);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5) Handle sub-kenvs inside kenvChokidarPath('kenvs')
  // ─────────────────────────────────────────────────────────────────────────────
  const kenvsRoot = kenvChokidarPath('kenvs');
  log.info(`🔍 Watching kenvs root: ${kenvsRoot}`);

  // This watcher is just for noticing new or removed sub-kenv directories
  const kenvsWatcher = chokidar.watch(kenvsRoot, {
    ignoreInitial: options.ignoreInitial,
    depth: 0, // only see "kenvs/my-kenv"
  });

  kenvsWatcher.on('addDir', async (subKenvDir) => {
    // subKenvDir => e.g. ~/.kenv/kenvs/test-kenv
    log.info(`📁 New sub-kenv folder detected: ${subKenvDir}`);
    callback('addDir', subKenvDir); // so the test sees addDir with path===subKenvDir

    // Create a dedicated watcher for that sub-kenv, focusing on scripts/snippets/scriptlets
    if (subKenvWatchers.has(subKenvDir)) {
      log.info(`Watcher for ${subKenvDir} already exists. Skipping re-init.`);
      return;
    }

    // Start a sub-watcher that can see deeply nested "scripts" or "snippets" or "scriptlets"
    const subKenvWatcher = chokidar.watch(subKenvDir, {
      ignoreInitial: false, // or your preference
      depth: maxSubKenvDepth,
      ignored: (filePath, stats) => {
        if (!stats) return false;
        // Skip node_modules, .git, etc.
        if (stats.isDirectory()) {
          const base = path.basename(filePath);
          if (IGNORED_FOLDERS.includes(base)) return true;
        }
        return false;
      },
    });

    // Forward all events from sub-kenv to the callback, but only if it's in
    // "scripts", "snippets", or "scriptlets" somewhere in the path:
    subKenvWatcher.on('all', (event, changedPath) => {
      // If the user puts "scripts" deeper, e.g. "deeply/nested/scripts",
      // the below check ensures we only yield events for files/folders
      // within some directory named "scripts", "snippets", or "scriptlets":
      const lowerPath = changedPath.toLowerCase();
      const isScripts = lowerPath.includes(`${path.sep}scripts${path.sep}`) || lowerPath.endsWith(`${path.sep}scripts`);
      const isSnippets =
        lowerPath.includes(`${path.sep}snippets${path.sep}`) || lowerPath.endsWith(`${path.sep}snippets`);
      const isScriptlets =
        lowerPath.includes(`${path.sep}scriptlets${path.sep}`) || lowerPath.endsWith(`${path.sep}scriptlets`);

      if (isScripts || isSnippets || isScriptlets) {
        callback(event as WatchEvent, changedPath);
      }
    });

    subKenvWatchers.set(subKenvDir, subKenvWatcher);
  });

  kenvsWatcher.on('unlinkDir', async (subKenvDir) => {
    // e.g. sub-kenv is removed
    log.info(`🗑 Removed sub-kenv folder: ${subKenvDir}`);
    callback('unlinkDir', subKenvDir);

    const existing = subKenvWatchers.get(subKenvDir);
    if (existing) {
      log.info(`Closing watcher for removed kenv: ${subKenvDir}`);
      await existing.close().catch((err) => {
        log.warn(`Error closing subKenvWatcher: ${err}`);
      });
      subKenvWatchers.delete(subKenvDir);
    }
  });

  // On init, watch existing sub-kenvs so we catch scripts in them too
  try {
    const subDirs = readdirSync(kenvsRoot, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => path.join(kenvsRoot, dirent.name));

    for (const existingSubKenvDir of subDirs) {
      // Manually emit addDir so the code above re-uses the same logic
      // We do a small trick with kenvsWatcher.emit if you want, or just call directly:
      log.info(`🚀 Found existing sub-kenv folder: ${existingSubKenvDir}`);
      kenvsWatcher.emit('addDir', existingSubKenvDir);
    }
  } catch (error) {
    log.warn(`Reading existing sub-kenvs failed: ${error}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6) Optional: watch app directories (macOS/Windows)
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
  const appWatcher = chokidar.watch(appDirs, {
    ignoreInitial: true,
    depth: 0,
  });
  appWatcher.on('ready', () => {
    watcherStats(appWatcher, 'App Watcher');
  });

  appWatcher.on('all', (event, filePath) => {
    log.info(`App change detected: ${event} ${filePath}`);
    if (!path.basename(filePath).startsWith('.')) {
      callback(event as WatchEvent, filePath, 'app');
    }
  });

  // Add periodic memory checks
  const memoryCheckInterval = setInterval(() => {
    log.info('💾 Memory check:', getMemoryUsage());
  }, 60000); // Check every minute

  // Add logging after all watchers are created
  const watchers = [dbWatcher, runPingWatcher, kenvFilesWatcher, mainKenvWatcher, kenvsWatcher, appWatcher];

  // Log all paths after setup
  log.info(`\n📋 Initial Watcher Setup Complete`);
  logAllWatcherPaths(watchers);

  // Add periodic path logging
  const pathCheckInterval = setInterval(() => {
    log.info(`\n🔄 Periodic Watcher Path Check`);
    logAllWatcherPaths(watchers);
  }, 60000); // Check every minute

  // Return cleanup function with watchers
  return watchers.map((watcher) => {
    const originalClose = watcher.close;
    watcher.close = async () => {
      clearInterval(pathCheckInterval);
      clearInterval(memoryCheckInterval);
      return originalClose.call(watcher);
    };
    return watcher;
  });
};
