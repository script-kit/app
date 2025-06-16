import path from 'node:path';
import type { WatchOptions as ChokidarWatchOptions, FSWatcher, Stats } from 'chokidar';
import chokidar from 'chokidar';
import type { EventName } from 'chokidar/types/index';
import type { WatchEvent, WatchOptions, WatchSource } from './chokidar';
import { createLogger } from './log-utils';

const log = createLogger('watcher-manager.ts');

type WatcherCallback = (eventName: WatchEvent, filePath: string, source?: WatchSource) => Promise<void>;

interface WatcherInfo {
  watcher: FSWatcher;
  paths: Set<string>;
  rootPaths: Set<string>; // Track root paths for better filtering
  options: ChokidarWatchOptions; // Store options for resurrection
}

// Default ignored patterns
const DEFAULT_IGNORED = ['**/node_modules/**', '**/.git/**', '**/node_modules', '**/.git'];

export class WatcherManager {
  readonly watchers = new Map<string, WatcherInfo>();
  private options: WatchOptions;
  private callback: WatcherCallback;

  constructor(callback: WatcherCallback, options: WatchOptions = { ignoreInitial: true }) {
    this.callback = callback;
    this.options = options;
  }

  private normalizePath(p: string): string {
    return path.normalize(p);
  }

  private isPathWithinRoot(filePath: string, rootPath: string): boolean {
    const normalizedFile = this.normalizePath(filePath);
    const normalizedRoot = this.normalizePath(rootPath);
    return normalizedFile === normalizedRoot || normalizedFile.startsWith(normalizedRoot + path.sep);
  }

  private isPathWithinAnyRoot(filePath: string): boolean {
    for (const { rootPaths } of this.watchers.values()) {
      for (const rootPath of rootPaths) {
        if (this.isPathWithinRoot(filePath, rootPath)) {
          return true;
        }
      }
    }
    return false;
  }

  private isPathExplicitlyWatched(filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    for (const { paths } of this.watchers.values()) {
      if (paths.has(normalizedPath)) {
        return true;
      }
    }
    return false;
  }

  addWatcher(key: string, watcher: FSWatcher, paths: string | string[], options: ChokidarWatchOptions = {}) {
    const pathSet = new Set(Array.isArray(paths) ? paths : [paths]);
    const rootPaths = new Set(Array.from(pathSet).map((p) => this.normalizePath(p)));
    this.watchers.set(key, { watcher, paths: pathSet, rootPaths, options });
  }

  getWatcher(key: string): FSWatcher | undefined {
    return this.watchers.get(key)?.watcher;
  }

  removeWatcher(key: string) {
    const watcherInfo = this.watchers.get(key);
    if (watcherInfo) {
      watcherInfo.watcher.close();
      this.watchers.delete(key);
    }
  }

  isPathWatched(filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    log.debug(`Checking if path is watched: ${normalizedPath}`);

    // First check if the path is explicitly watched
    for (const { paths } of this.watchers.values()) {
      if (paths.has(normalizedPath)) {
        log.debug(`Path ${normalizedPath} is explicitly watched`);
        return true;
      }
    }

    // Then check if it's within a watched directory AND matches expected patterns
    for (const { rootPaths } of this.watchers.values()) {
      for (const rootPath of rootPaths) {
        const relativePath = path.relative(rootPath, normalizedPath);

        // Skip if path is not under this root
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          continue;
        }

        const pathParts = relativePath.split(path.sep);

        // Handle .kenv paths
        if (pathParts[0] === '.kenv') {
          // Only allow specific directories and their immediate children
          if (pathParts.length === 2) {
            // Allow root level config files
            if (['package.json', '.env', 'globals.ts'].includes(pathParts[1])) {
              return true;
            }
          }

          if (pathParts.length === 3) {
            // Allow files only in specific directories
            const [, dir, file] = pathParts;
            if (['scripts', 'snippets', 'scriptlets'].includes(dir) && file) {
              return true;
            }
            // Allow files in kenvs directory
            if (dir === 'kenvs' && file) {
              return true;
            }
          }
        }

        // Handle .kit paths
        if (pathParts[0] === '.kit') {
          // Allow only specific files/dirs in .kit
          if (pathParts.length === 2 && ['run.txt', 'ping.txt'].includes(pathParts[1])) {
            return true;
          }
          if (pathParts[1] === 'db') {
            // Allow db directory and its immediate children
            if (pathParts.length <= 3) {
              return true;
            }
          }
        }
      }
    }

    log.debug(`Path ${normalizedPath} is not watched`);
    return false;
  }

  createWatcher(key: string, paths: string | string[], options: ChokidarWatchOptions = {}): FSWatcher {
    // Check if we're already watching any of these paths
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    for (const p of pathsArray) {
      if (this.isPathWatched(p)) {
        log.warn(`Path ${p} is already being watched. Skipping duplicate watch.`);
      }
    }

    // Merge default ignored patterns with any custom ones
    const ignored = [
      ...(options.ignored ? (Array.isArray(options.ignored) ? options.ignored : [options.ignored]) : []),
      ...DEFAULT_IGNORED,
    ];

    const watcher = chokidar.watch(paths, {
      ignoreInitial: true, // Always true?
      followSymlinks: true,
      ignored,
      ...options,
    });

    // Set up event handlers
    watcher.on('all', (eventName: EventName, filePath: string, _stats?: Stats) => {
      const normalizedPath = this.normalizePath(filePath);

      // First check if the path is explicitly watched or matches our allowed patterns
      if (!this.isPathWatched(normalizedPath)) {
        log.debug(`Ignoring event for path outside watched paths: ${filePath}`);
        return;
      }

      // Then check against ignored patterns
      if (
        DEFAULT_IGNORED.some((pattern) => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(filePath);
        })
      ) {
        log.debug(`Ignoring event for excluded path: ${filePath}`);
        return;
      }

      // Cast eventName to WatchEvent since we know it's compatible
      this.callback(eventName as WatchEvent, filePath).catch((err) => {
        log.error(`Error in watcher callback: ${err}`);
      });
    });

    this.addWatcher(key, watcher, paths, options);
    return watcher;
  }

  async closeAll() {
    const closePromises = Array.from(this.watchers.values()).map(({ watcher }) => watcher.close());
    await Promise.all(closePromises);
    this.watchers.clear();
  }

  getWatchers(): FSWatcher[] {
    return Array.from(this.watchers.values()).map(({ watcher }) => watcher);
  }

  getWatchedPaths(): string[] {
    const paths = new Set<string>();
    for (const { paths: watcherPaths } of this.watchers.values()) {
      for (const p of watcherPaths) {
        paths.add(p);
      }
    }
    return Array.from(paths);
  }

  /** Kill + recreate one watcher in place */
  restartWatcher(key: string): FSWatcher | undefined {
    const rec = this.watchers.get(key);
    if (!rec) {
      return undefined;
    }

    try {
      rec.watcher.removeAllListeners();
      rec.watcher.close();
    } catch (err) {
      log.warn(`Error closing watcher ${key}:`, err);
    }

    const pathsArray = Array.from(rec.paths);
    const newWatcher = this.createWatcher(key, pathsArray, rec.options);
    return newWatcher;
  }

  /** Find the key for a given FSWatcher instance */
  keyFor(target: FSWatcher): string | undefined {
    for (const [k, v] of this.watchers) {
      if (v.watcher === target) {
        return k;
      }
    }
    return undefined;
  }
}
