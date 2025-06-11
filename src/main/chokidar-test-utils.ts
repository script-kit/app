import path from 'node:path';
import type { FSWatcher } from 'chokidar';
import { ensureDir, readdir, writeFile } from 'fs-extra';
import { type WatchEvent, type WatchSource, startWatching } from './chokidar';

// Constants for test timing - optimized for speed
export const WATCHER_SETTLE_TIME = 50; // Reduced from 200ms
export const KENV_GLOB_TIMEOUT = 250; // Reduced from 1000ms

export const log = {
  debug: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
  test: (_testName: string, ..._args: any[]) => {},
  watcher: (..._args: any[]) => {},
  event: (..._args: any[]) => {},
  dir: (..._args: any[]) => {},
};

export interface TestEvent {
  event: WatchEvent;
  path: string;
  source?: WatchSource;
}

export interface TestDirs {
  root: string;
  kit: string;
  kenv: string;
  scripts: string;
  snippets: string;
  scriptlets: string;
  kenvs: string;
  dbDir: string;
  userJsonPath: string;
  runTxtPath: string;
  pingTxtPath: string;
  envFilePath: string;
  cleanup?: () => Promise<void>;
}

/**
 * Create isolated test directories for a specific test to prevent interference
 * between concurrent tests
 */
export async function createIsolatedTestDirs(testName: string): Promise<TestDirs> {
  const { dir } = await import('tmp-promise');
  const tmpDir = await dir({ unsafeCleanup: true, prefix: `chokidar-${testName}-` });

  const isolatedDirs: TestDirs = {
    root: tmpDir.path,
    kit: path.join(tmpDir.path, '.kit'),
    kenv: path.join(tmpDir.path, '.kenv'),
    scripts: path.join(tmpDir.path, '.kenv', 'scripts'),
    snippets: path.join(tmpDir.path, '.kenv', 'snippets'),
    scriptlets: path.join(tmpDir.path, '.kenv', 'scriptlets'),
    kenvs: path.join(tmpDir.path, '.kenv', 'kenvs'),
    dbDir: path.join(tmpDir.path, '.kit', 'db'),
    userJsonPath: path.join(tmpDir.path, '.kit', 'db', 'user.json'),
    runTxtPath: path.join(tmpDir.path, '.kit', 'run.txt'),
    pingTxtPath: path.join(tmpDir.path, '.kit', 'ping.txt'),
    envFilePath: path.join(tmpDir.path, '.kenv', '.env'),
    cleanup: tmpDir.cleanup,
  };

  // Create directory structure
  await Promise.all([
    ensureDir(isolatedDirs.kit),
    ensureDir(isolatedDirs.kenv),
    ensureDir(isolatedDirs.scripts),
    ensureDir(isolatedDirs.snippets),
    ensureDir(isolatedDirs.scriptlets),
    ensureDir(isolatedDirs.kenvs),
    ensureDir(isolatedDirs.dbDir),
  ]);

  // Create initial user.json
  await writeFile(isolatedDirs.userJsonPath, JSON.stringify({ initial: true }, null, 2));

  return isolatedDirs;
}

/**
 * Wait for all watchers to emit their "ready" event.
 * This helps ensure we don't miss any file changes
 * occurring shortly after watchers start.
 */
export async function waitForWatchersReady(watchers: FSWatcher[]) {
  log.debug('Waiting for watchers to be ready:', watchers.length);
  const readyPromises = watchers.map(
    (w, i) =>
      new Promise<void>((resolve) => {
        // If the watcher has no paths, it's already ready
        if (w.getWatched && Object.keys(w.getWatched()).length === 0) {
          log.debug(`Watcher ${i} has no paths, considering it ready`);
          resolve();
          return;
        }

        log.debug(`Setting up ready handler for watcher ${i}`);
        w.on('ready', () => {
          log.debug(`Watcher ${i} is ready`);
          resolve();
        });
      }),
  );
  await Promise.all(readyPromises);
  log.debug('All watchers are ready');
}

export async function logDirectoryState(dir: string, depth = 0) {
  try {
    const contents = await readdir(dir, { withFileTypes: true });
    log.dir(
      `Directory ${dir} contents:`,
      contents.map((d) => d.name),
    );
    if (depth > 0) {
      for (const entry of contents) {
        if (entry.isDirectory()) {
          await logDirectoryState(path.join(dir, entry.name), depth - 1);
        }
      }
    }
  } catch (error) {
    log.dir(`Error reading directory ${dir}:`, error);
  }
}

/**
 * Isolated collectEvents that uses separate directories for parallel test safety
 */
export async function collectEventsIsolated(
  duration: number,
  action: (events: TestEvent[], dirs: TestDirs) => Promise<void> | void,
  testName: string,
): Promise<TestEvent[]> {
  const events: TestEvent[] = [];
  const isolatedDirs = await createIsolatedTestDirs(testName);

  // Temporarily override environment variables for this test
  const originalKIT = process.env.KIT;
  const originalKENV = process.env.KENV;
  process.env.KIT = isolatedDirs.kit;
  process.env.KENV = isolatedDirs.kenv;

  try {
    log.test(testName, `Starting isolated collectEvents with duration ${duration}ms`);

    const watchers = startWatching(
      async (event, filePath, source) => {
        const eventInfo = { event, filePath, source, timestamp: new Date().toISOString() };
        log.event(`Event received in ${testName}:`, eventInfo);
        events.push({ event, path: filePath, source });
      },
      { ignoreInitial: false },
    );

    try {
      log.test(testName, 'Waiting for watchers to be ready');
      await waitForWatchersReady(watchers);
      log.test(testName, 'Watchers are ready');

      await new Promise((resolve) => setTimeout(resolve, 100));
      log.test(testName, 'Executing test action');
      await action(events, isolatedDirs);

      log.test(testName, `Waiting ${duration}ms for events`);
      await new Promise((resolve) => setTimeout(resolve, duration));

      log.test(testName, 'Final events:', events);
      return events;
    } finally {
      log.test(testName, 'Cleaning up watchers');
      await Promise.all(watchers.map((w) => w.close()));
      log.test(testName, 'Watchers cleaned up');
    }
  } finally {
    // Restore original environment variables
    if (originalKIT) {
      process.env.KIT = originalKIT;
    } else {
      process.env.KIT = undefined;
    }
    if (originalKENV) {
      process.env.KENV = originalKENV;
    } else {
      process.env.KENV = undefined;
    }

    // Cleanup isolated directories
    if (isolatedDirs.cleanup) {
      await isolatedDirs.cleanup();
    }
  }
}

/**
 * Collect events while watchers are active, ensuring watchers are fully ready
 * before performing the test action. For shared state tests that can't be isolated.
 */
export async function collectEvents(
  duration: number,
  action: (events: TestEvent[]) => Promise<void> | void,
  testName: string,
  testDirs: TestDirs,
): Promise<TestEvent[]> {
  const events: TestEvent[] = [];
  log.test(testName, `Starting collectEvents with duration ${duration}ms`);

  // Log initial directory state
  log.test(testName, 'Initial directory state:');
  await logDirectoryState(testDirs.kenv, 2);

  log.test(testName, 'Starting watchers');
  const watchers = startWatching(
    async (event, filePath, source) => {
      const eventInfo = { event, filePath, source, timestamp: new Date().toISOString() };
      log.event(`Event received in ${testName}:`, eventInfo);
      events.push({ event, path: filePath, source });
    },
    { ignoreInitial: false },
  );

  try {
    log.test(testName, 'Waiting for watchers to be ready');
    await waitForWatchersReady(watchers);
    log.test(testName, 'Watchers are ready');

    await new Promise((resolve) => setTimeout(resolve, 100));
    log.test(testName, 'Executing test action');
    await action(events);

    log.test(testName, `Waiting ${duration}ms for events`);
    await new Promise((resolve) => setTimeout(resolve, duration));

    log.test(testName, 'Final directory state:');
    await logDirectoryState(testDirs.kenv, 2);

    log.test(testName, 'Final events:', events);
    return events;
  } finally {
    log.test(testName, 'Cleaning up watchers');
    await Promise.all(watchers.map((w) => w.close()));
    log.test(testName, 'Watchers cleaned up');
  }
}

/**
 * Wait for specific events to occur, with a maximum timeout.
 * This is more reliable than fixed timeouts for timing-sensitive operations.
 */
export async function waitForEvents(
  expectedEvents: Array<{ event: WatchEvent; pathPattern?: string }>,
  maxWaitMs: number,
  action: () => Promise<void> | void,
  testName: string,
): Promise<TestEvent[]> {
  const events: TestEvent[] = [];
  log.test(testName, `Waiting for specific events with max timeout ${maxWaitMs}ms`);

  const watchers = startWatching(
    async (event, filePath, source) => {
      const eventInfo = { event, filePath, source, timestamp: new Date().toISOString() };
      log.event(`Event received in ${testName}:`, eventInfo);
      events.push({ event, path: filePath, source });
    },
    { ignoreInitial: false },
  );

  try {
    await waitForWatchersReady(watchers);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Brief settle time

    await action();

    // Wait for expected events or timeout
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const foundAll = expectedEvents.every((expected) =>
        events.some((event) => {
          const eventMatches = event.event === expected.event;
          const pathMatches = !expected.pathPattern || event.path.includes(expected.pathPattern);
          return eventMatches && pathMatches;
        }),
      );

      if (foundAll) {
        log.test(testName, 'All expected events found, completing early');
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50)); // Check every 50ms
    }

    return events;
  } finally {
    await Promise.all(watchers.map((w) => w.close()));
  }
}

/**
 * Enhanced collectEvents that can optionally wait for specific events
 */
export async function collectEventsWithEarlyExit(
  maxDuration: number,
  action: (events: TestEvent[]) => Promise<void> | void,
  testName: string,
  earlyExitCondition?: (events: TestEvent[]) => boolean,
): Promise<TestEvent[]> {
  const events: TestEvent[] = [];
  log.test(testName, `Starting enhanced collectEvents with max duration ${maxDuration}ms`);

  const watchers = startWatching(
    async (event, filePath, source) => {
      const eventInfo = { event, filePath, source, timestamp: new Date().toISOString() };
      log.event(`Event received in ${testName}:`, eventInfo);
      events.push({ event, path: filePath, source });
    },
    { ignoreInitial: false },
  );

  try {
    await waitForWatchersReady(watchers);
    await new Promise((resolve) => setTimeout(resolve, 100));

    await action(events);

    // Wait with early exit condition
    const startTime = Date.now();
    while (Date.now() - startTime < maxDuration) {
      if (earlyExitCondition?.(events)) {
        log.test(testName, 'Early exit condition met');
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return events;
  } finally {
    await Promise.all(watchers.map((w) => w.close()));
  }
}

export async function ensureFileOperation(
  operation: () => Promise<void>,
  verify: () => Promise<boolean>,
  maxAttempts = 3,
  delayMs = 100,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await operation();
      if (await verify()) {
        return;
      }
    } catch (err) {
      if (i === maxAttempts - 1) {
        throw err;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Operation failed after max attempts');
}
