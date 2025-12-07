import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FSWatcher } from 'chokidar';
import { ensureDir, pathExists, readFile, remove, rename, writeFile } from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startWatching, type WatchSource } from './chokidar';
import {
  collectEvents,
  collectEventsWithEarlyExit,
  KENV_GLOB_TIMEOUT,
  log,
  logDirectoryState,
  type TestDirs,
  type TestEvent,
  WATCHER_SETTLE_TIME,
  waitForWatchersReady,
} from './chokidar-test-utils';

// Detect if we're running in a container environment
const isContainerEnvironment = () => {
  return (
    process.env.CONTAINER === 'true' ||
    process.env.CI === 'true' ||
    fs.existsSync('/.dockerenv') ||
    process.platform === 'linux'
  );
};


// Mock setup for sequential tests - shared state
const testDir = vi.hoisted(() => {
  return import('tmp-promise').then(({ dir }) => {
    return dir({ unsafeCleanup: true }).then((result) => {
      return result;
    });
  });
});

vi.mock('node:os', async () => {
  const tmpDir = await testDir;

  return {
    default: {
      arch: vi.fn(() => 'x64'),
      cpus: vi.fn(() => []),
      endianness: vi.fn(() => 'LE'),
      freemem: vi.fn(() => 1000000),
      getPriority: vi.fn(() => 0),
      homedir: () => tmpDir.path,
      hostname: vi.fn(() => 'test-host'),
      loadavg: vi.fn(() => [0, 0, 0]),
      machine: vi.fn(() => 'x86_64'),
      networkInterfaces: vi.fn(() => ({})),
      platform: vi.fn(() => 'darwin'),
      release: vi.fn(() => '1.0.0'),
      setPriority: vi.fn(),
      tmpdir: vi.fn(() => '/tmp'),
      totalmem: vi.fn(() => 2000000),
      type: vi.fn(() => 'Darwin'),
      uptime: vi.fn(() => 1000),
      userInfo: vi.fn(() => ({
        uid: 1000,
        gid: 1000,
        username: 'test',
        homedir: tmpDir.path,
        shell: '/bin/bash',
      })),
      version: vi.fn(() => 'v1.0.0'),
      constants: {
        signals: {
          SIGHUP: 1,
          SIGINT: 2,
          SIGQUIT: 3,
          SIGILL: 4,
          SIGTRAP: 5,
          SIGABRT: 6,
          SIGIOT: 6,
          SIGBUS: 7,
          SIGFPE: 8,
          SIGKILL: 9,
          SIGUSR1: 10,
          SIGSEGV: 11,
          SIGUSR2: 12,
          SIGPIPE: 13,
          SIGALRM: 14,
          SIGTERM: 15,
          SIGCHLD: 17,
          SIGCONT: 18,
          SIGSTOP: 19,
          SIGTSTP: 20,
          SIGTTIN: 21,
          SIGTTOU: 22,
          SIGURG: 23,
          SIGXCPU: 24,
          SIGXFSZ: 25,
          SIGVTALRM: 26,
          SIGPROF: 27,
          SIGWINCH: 28,
          SIGIO: 29,
          SIGPOLL: 29,
          SIGPWR: 30,
          SIGSYS: 31,
          SIGUNUSED: 31,
        },
        errno: {},
        priority: {},
      },
    },
    arch: vi.fn(() => 'x64'),
    cpus: vi.fn(() => []),
    endianness: vi.fn(() => 'LE'),
    freemem: vi.fn(() => 1000000),
    getPriority: vi.fn(() => 0),
    homedir: () => tmpDir.path,
    hostname: vi.fn(() => 'test-host'),
    loadavg: vi.fn(() => [0, 0, 0]),
    machine: vi.fn(() => 'x86_64'),
    networkInterfaces: vi.fn(() => ({})),
    platform: vi.fn(() => 'darwin'),
    release: vi.fn(() => '1.0.0'),
    setPriority: vi.fn(),
    tmpdir: vi.fn(() => '/tmp'),
    totalmem: vi.fn(() => 2000000),
    type: vi.fn(() => 'Darwin'),
    uptime: vi.fn(() => 1000),
    userInfo: vi.fn(() => ({
      uid: 1000,
      gid: 1000,
      username: 'test',
      homedir: tmpDir.path,
      shell: '/bin/bash',
    })),
    version: vi.fn(() => 'v1.0.0'),
    constants: {
      signals: {
        SIGHUP: 1,
        SIGINT: 2,
        SIGQUIT: 3,
        SIGILL: 4,
        SIGTRAP: 5,
        SIGABRT: 6,
        SIGIOT: 6,
        SIGBUS: 7,
        SIGFPE: 8,
        SIGKILL: 9,
        SIGUSR1: 10,
        SIGSEGV: 11,
        SIGUSR2: 12,
        SIGPIPE: 13,
        SIGALRM: 14,
        SIGTERM: 15,
        SIGCHLD: 17,
        SIGCONT: 18,
        SIGSTOP: 19,
        SIGTSTP: 20,
        SIGTTIN: 21,
        SIGTTOU: 22,
        SIGURG: 23,
        SIGXCPU: 24,
        SIGXFSZ: 25,
        SIGVTALRM: 26,
        SIGPROF: 27,
        SIGWINCH: 28,
        SIGIO: 29,
        SIGPOLL: 29,
        SIGPWR: 30,
        SIGSYS: 31,
        SIGUNUSED: 31,
      },
      errno: {},
      priority: {},
    },
  };
});

vi.mock('@johnlindquist/kit/core/utils', async () => {
  const tmpDir = await testDir;
  process.env.KIT = path.resolve(tmpDir.path, '.kit');
  process.env.KENV = path.resolve(tmpDir.path, '.kenv');
  return {
    kitPath: (...parts: string[]) => path.join(process.env.KIT!, ...parts),
    kenvPath: (...parts: string[]) => path.join(process.env.KENV!, ...parts),
    userDbPath: path.resolve(process.env.KIT!, 'db', 'user.json'),
    getTrustedKenvsKey: () => 'KENV_TRUST_MAP',
    tmpClipboardDir: '/tmp/clipboard',
    defaultGroupNameClassName: vi.fn(() => 'default-group'),
    defaultGroupClassName: vi.fn(() => 'default-group-class'),
    getLogFromScriptPath: vi.fn((scriptPath: string) => `/tmp/logs/${scriptPath}.log`),
  };
});

// Shared test directories for sequential tests
const testDirs: TestDirs = {
  root: '',
  kit: '',
  kenv: '',
  scripts: '',
  snippets: '',
  scriptlets: '',
  kenvs: '',
  dbDir: '',
  userJsonPath: '',
  runTxtPath: '',
  pingTxtPath: '',
  envFilePath: '',
};

// Use conditional describe to skip in CI
const describeSequential = isContainerEnvironment() ? describe.skip : describe;
describeSequential('File System Watcher - Sequential Tests', () => {
  beforeAll(async () => {
    log.debug('Setting up sequential test environment');
    const tmpDir = await testDir;
    testDirs.root = tmpDir.path;

    // Resolve and store kit/kenv paths
    testDirs.kit = path.join(testDirs.root, '.kit');
    testDirs.kenv = path.join(testDirs.root, '.kenv');
    testDirs.scripts = path.join(testDirs.kenv, 'scripts');
    testDirs.snippets = path.join(testDirs.kenv, 'snippets');
    testDirs.scriptlets = path.join(testDirs.kenv, 'scriptlets');
    testDirs.kenvs = path.join(testDirs.kenv, 'kenvs');

    // DB directory for user.json
    testDirs.dbDir = path.join(testDirs.kit, 'db');
    testDirs.userJsonPath = path.join(testDirs.dbDir, 'user.json');

    // run.txt / ping.txt / .env
    testDirs.runTxtPath = path.join(testDirs.kit, 'run.txt');
    testDirs.pingTxtPath = path.join(testDirs.kit, 'ping.txt');
    testDirs.envFilePath = path.join(testDirs.kenv, '.env');

    // Create directory structure
    log.debug('Creating directory structure');
    await Promise.all([
      ensureDir(testDirs.kit),
      ensureDir(testDirs.kenv),
      ensureDir(testDirs.scripts),
      ensureDir(testDirs.snippets),
      ensureDir(testDirs.scriptlets),
      ensureDir(testDirs.kenvs),
      ensureDir(testDirs.dbDir),
    ]);

    // Create an initial user.json so we can test "change"
    await writeFile(testDirs.userJsonPath, JSON.stringify({ initial: true }, null, 2));

    // Ensure run.txt/ping.txt don't exist initially
    if (await pathExists(testDirs.runTxtPath)) {
      await remove(testDirs.runTxtPath);
    }
    if (await pathExists(testDirs.pingTxtPath)) {
      await remove(testDirs.pingTxtPath);
    }

    log.debug('Sequential test environment setup complete', testDirs);
  });

  afterAll(async () => {
    await remove(testDirs.root);
    vi.clearAllMocks();
  });

  // Tests that require shared state and must run sequentially

  it.sequential('should detect changes to user.json (userDbPath)', async () => {
    const events = await collectEvents(
      200,
      async () => {
        // Update user.json so watchers see a "change"
        const updatedContent = { foo: 'bar' };
        log.debug('Updating user.json:', testDirs.userJsonPath);
        await writeFile(testDirs.userJsonPath, JSON.stringify(updatedContent, null, 2));
      },
      'should detect changes to user.json (userDbPath)',
      testDirs,
    );

    // We expect to see a "change" event for user.json
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'change',
        path: testDirs.userJsonPath,
      }),
    );
  }, 3000);

  it.sequential('should detect new kenv directories and watch their contents', async () => {
    const newKenvName = 'test-kenv';
    const newKenvPath = path.join(testDirs.kenvs, newKenvName);
    const newKenvScriptsDir = path.join(newKenvPath, 'scripts');
    const newKenvScriptPath = path.join(newKenvScriptsDir, 'test.ts');

    log.debug('Starting test with paths:', {
      newKenvPath,
      newKenvScriptsDir,
      newKenvScriptPath,
    });

    // Use the collectEvents helper instead of managing watchers directly
    const events = await collectEvents(
      800, // Reduced from KENV_GLOB_TIMEOUT + 2000 (was ~1250ms)
      async () => {
        // Create directory structure first
        log.debug('Creating directory:', newKenvScriptsDir);
        await ensureDir(newKenvScriptsDir);

        // Wait for watchers to detect the new kenv directory
        log.debug('Waiting for globs to be added...');
        await new Promise((resolve) => setTimeout(resolve, KENV_GLOB_TIMEOUT + WATCHER_SETTLE_TIME));

        // Write initial content
        log.debug('Writing initial content:', newKenvScriptPath);
        await writeFile(newKenvScriptPath, 'export {}');

        // Wait for chokidar to detect the file
        await new Promise((resolve) => setTimeout(resolve, WATCHER_SETTLE_TIME));

        // Write new content
        log.debug('Writing new content:', newKenvScriptPath);
        await writeFile(newKenvScriptPath, 'export const foo = "bar"');
      },
      'should detect new kenv directories and watch their contents',
      testDirs,
    );

    log.debug('Final events:', events);

    // Look for both the add and change events
    const addEvent = events.some((e) => e.event === 'add' && e.path.endsWith('test.ts'));
    const changeEvent = events.some((e) => e.event === 'change' && e.path.endsWith('test.ts'));

    expect(addEvent || changeEvent).toBe(true);
  }, 5000); // Reduced from 15000ms

  it.sequential('should detect changes to run.txt', async () => {
    // First create run.txt and let the watchers ignore it
    await writeFile(testDirs.runTxtPath, 'initial content');

    // Let everything settle longer for sequential test
    await new Promise((resolve) => setTimeout(resolve, 600));

    const events = await collectEvents(
      800, // Longer collection time for sequential test
      async () => {
        log.debug('Writing to run.txt:', testDirs.runTxtPath);
        await writeFile(testDirs.runTxtPath, 'my-script.ts arg1 arg2');
      },
      'should detect changes to run.txt',
      testDirs,
    );

    log.debug('Events received:', events);

    // We should see a "change" event since the file already exists
    const foundRunTxt = events.some((e) => e.path === testDirs.runTxtPath && e.event === 'change');
    expect(foundRunTxt).toBe(true);
  }, 5000);

  it.sequential('should detect removals of run.txt', async () => {
    // Create run.txt so we can remove it
    if (!(await pathExists(testDirs.runTxtPath))) {
      await writeFile(testDirs.runTxtPath, 'initial content');
    }

    // Let watchers settle
    await new Promise((resolve) => setTimeout(resolve, 500));

    const events = await collectEvents(
      500,
      async () => {
        await remove(testDirs.runTxtPath);
      },
      'should detect removals of run.txt',
      testDirs,
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'unlink',
        path: testDirs.runTxtPath,
      }),
    );
  }, 3000);

  it.sequential('should detect changes to .env file', async () => {
    // First create .env and let the watchers ignore it
    await writeFile(testDirs.envFilePath, 'KIT_DOCK=false');

    // Let everything settle
    await new Promise((resolve) => setTimeout(resolve, 200));

    const events = await collectEvents(
      400,
      async () => {
        log.debug('Writing to .env:', testDirs.envFilePath);
        await writeFile(testDirs.envFilePath, 'KIT_DOCK=true');
      },
      'should detect changes to .env file',
      testDirs,
    );

    log.debug('Events received:', events);

    // We should see a "change" event since the file already exists
    const foundEnvEvent = events.some((e) => e.path === testDirs.envFilePath && e.event === 'change');
    expect(foundEnvEvent).toBe(true);
  }, 3000);

  it.sequential('should detect renamed scripts within /scripts directory', async () => {
    const originalPath = path.join(testDirs.scripts, 'rename-me.ts');
    const renamedPath = path.join(testDirs.scripts, 'renamed.ts');

    // Make sure the original doesn't exist, then create it:
    if (await pathExists(originalPath)) {
      await remove(originalPath);
    }
    await writeFile(originalPath, 'export {}');

    // Wait to see the "add" event
    await new Promise((resolve) => setTimeout(resolve, 500));

    const events = await collectEvents(
      800, // Reduced from 2500ms
      async () => {
        log.debug('Renaming script from', originalPath, 'to', renamedPath);
        await rename(originalPath, renamedPath);
      },
      'should detect renamed scripts within /scripts directory',
      testDirs,
    );

    // Some OS/file systems emit separate unlink/add events, others might show rename
    const unlinkEvent = events.find((e) => e.event === 'unlink' && e.path === originalPath);
    const addEvent = events.find((e) => e.event === 'add' && e.path === renamedPath);

    expect(unlinkEvent).toBeDefined();
    expect(addEvent).toBeDefined();
  }, 5000);

  it.sequential('should handle removal of .env', async () => {
    // Ensure .env exists so we can remove it
    if (!(await pathExists(testDirs.envFilePath))) {
      await writeFile(testDirs.envFilePath, 'KIT_DOCK=false');
      // Wait for watchers to settle
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const events = await collectEvents(
      2000,
      async () => {
        await remove(testDirs.envFilePath);
      },
      'should handle removal of .env',
      testDirs,
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'unlink',
        path: testDirs.envFilePath,
      }),
    );
  }, 5000);

  it.sequential('should detect multiple rapid changes to run.txt', async () => {
    // Make sure run.txt is there
    await writeFile(testDirs.runTxtPath, 'initial content');
    await new Promise((resolve) => setTimeout(resolve, 300));

    const events = await collectEvents(
      2000,
      async () => {
        // Make several quick writes
        await writeFile(testDirs.runTxtPath, 'change 1');
        await writeFile(testDirs.runTxtPath, 'change 2');
        await writeFile(testDirs.runTxtPath, 'change 3');
      },
      'should detect multiple rapid changes to run.txt',
      testDirs,
    );

    // We expect at least one or more "change" events
    const changeEvents = events.filter((e) => e.path === testDirs.runTxtPath && e.event === 'change');
    expect(changeEvents.length).toBeGreaterThanOrEqual(1);
  }, 10000);

  it.sequential('should detect re-creation of user.json after removal', async () => {
    log.debug('Starting user.json recreation test');
    log.debug('User DB Path:', testDirs.userJsonPath);
    log.debug('DB Directory:', testDirs.dbDir);

    // Remove user.json
    if (await pathExists(testDirs.userJsonPath)) {
      log.debug('Removing existing user.json');
      await remove(testDirs.userJsonPath);
      log.debug('user.json removed');
    }

    // Wait longer for watchers to stabilize after removal
    log.debug('Waiting for watchers to stabilize after removal');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const events = await collectEvents(
      2000,
      async () => {
        log.debug('Re-creating user.json');
        // Re-create user.json
        const updated = { foo: 'bar', time: Date.now() };
        await writeFile(testDirs.userJsonPath, JSON.stringify(updated, null, 2));
        log.debug('Finished writing user.json');

        // Verify file exists
        const exists = await pathExists(testDirs.userJsonPath);
        log.debug('Verifying user.json exists:', exists);

        if (exists) {
          const content = await readFile(testDirs.userJsonPath, 'utf8');
          log.debug('user.json content:', content);
        }
      },
      'should detect re-creation of user.json after removal',
      testDirs,
    );

    log.debug('Events collected:', JSON.stringify(events, null, 2));

    // We might get "add" or "change" depending on how watchers handle it
    const userJsonEvent = events.find(
      (e) => e.path === testDirs.userJsonPath && (e.event === 'add' || e.event === 'change'),
    );

    log.debug('Found user.json event:', userJsonEvent);
    expect(userJsonEvent).toBeDefined();
  }, 8000);

  it.sequential('should detect changes to ping.txt', async () => {
    // Make sure ping.txt doesn't exist
    if (await pathExists(testDirs.pingTxtPath)) {
      await remove(testDirs.pingTxtPath);
    }

    // Ensure .kit directory exists BEFORE starting watchers
    await ensureDir(testDirs.kit);

    const events = await collectEvents(
      1000,
      async () => {
        await writeFile(testDirs.pingTxtPath, 'PING TEST');
      },
      'should detect changes to ping.txt',
      testDirs,
    );

    // We expect an "add" or "change" event for ping.txt
    const pingEvent = events.find(
      (e) => e.path === testDirs.pingTxtPath && (e.event === 'add' || e.event === 'change'),
    );
    expect(pingEvent).toBeDefined();
  }, 5000);

  it.sequential('should watch the correct paths', async () => {
    const testName = 'watch-paths';
    log.test(testName, 'Starting test to verify watched paths');

    // Create required test files
    log.test(testName, 'Creating test files...');
    await Promise.all([
      writeFile(path.join(testDirs.scripts, 'test-script.ts'), 'export {}'),
      writeFile(path.join(testDirs.snippets, 'test-snippet.txt'), 'test'),
      writeFile(path.join(testDirs.scriptlets, 'test-scriptlet.js'), '// test'),
      writeFile(testDirs.envFilePath, 'TEST=true'),
      writeFile(path.join(testDirs.kenv, 'package.json'), '{}'),
      writeFile(path.join(testDirs.kenv, 'globals.ts'), 'export {}'),
      writeFile(testDirs.userJsonPath, '{}'),
      writeFile(testDirs.runTxtPath, 'test'),
      writeFile(testDirs.pingTxtPath, 'test'),
    ]);

    log.test(testName, 'Files created, verifying existence...');
    for (const file of [
      path.join(testDirs.scripts, 'test-script.ts'),
      path.join(testDirs.snippets, 'test-snippet.txt'),
      path.join(testDirs.scriptlets, 'test-scriptlet.js'),
      testDirs.envFilePath,
      path.join(testDirs.kenv, 'package.json'),
      path.join(testDirs.kenv, 'globals.ts'),
      testDirs.userJsonPath,
      testDirs.runTxtPath,
      testDirs.pingTxtPath,
    ]) {
      const exists = await pathExists(file);
      log.test(testName, `File ${file} exists: ${exists}`);
    }

    // Start watchers and wait for them to be ready
    log.test(testName, 'Starting watchers...');
    const watchers = startWatching(
      async (event, path, source) => {
        log.test(testName, `Event received: ${event} ${path} ${source || ''}`);
      },
      { ignoreInitial: false },
    );

    try {
      log.test(testName, 'Waiting for watchers to be ready...');
      await waitForWatchersReady(watchers);
      log.test(testName, 'Watchers ready');

      // Give chokidar time to do its initial scan
      log.test(testName, 'Waiting for initial scan...');
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Reduced from 5000ms

      // Get all watched paths from each watcher
      const allWatchedPaths = new Set<string>();
      for (const watcher of watchers) {
        const watched = watcher.getWatched();
        // Add more detailed logging
        log.test(testName, 'Raw watcher paths:', JSON.stringify(watched, null, 2));

        for (const [dir, files] of Object.entries(watched)) {
          const normalizedDir = path.normalize(dir);
          allWatchedPaths.add(normalizedDir);
          log.test(testName, `Adding normalized dir: ${normalizedDir}`);

          for (const file of files) {
            const normalizedPath = path.normalize(path.join(dir, file));
            allWatchedPaths.add(normalizedPath);
            log.test(testName, `Adding normalized file: ${normalizedPath}`);
          }
        }
      }

      log.test(testName, 'All watched paths:', Array.from(allWatchedPaths));

      // Required paths that must be watched
      const requiredPaths = [
        testDirs.scripts,
        testDirs.snippets,
        testDirs.scriptlets,
        testDirs.kenvs,
        testDirs.dbDir,
        testDirs.envFilePath,
        path.join(testDirs.kenv, 'package.json'),
        path.join(testDirs.kenv, 'globals.ts'),
        testDirs.userJsonPath,
        testDirs.runTxtPath,
        testDirs.pingTxtPath,
      ].map(path.normalize);

      // Verify each required path is being watched
      for (const requiredPath of requiredPaths) {
        const normalizedRequired = path.normalize(requiredPath);
        log.test(testName, `Checking if ${normalizedRequired} is watched...`);

        const isWatched = Array.from(allWatchedPaths).some((watchedPath) => {
          const normalizedWatched = path.normalize(watchedPath);
          const normalizedRequired = path.normalize(requiredPath);

          // More robust path comparison
          const isMatch =
            normalizedRequired === normalizedWatched ||
            // Check if the required path is a subpath of watched path
            normalizedRequired.startsWith(normalizedWatched + path.sep) ||
            // Check if the watched path is a subpath of required path
            normalizedWatched.startsWith(normalizedRequired + path.sep) ||
            // Handle root directory case
            (normalizedWatched === '.' && normalizedRequired.startsWith('.'));

          if (isMatch) {
            log.test(testName, {
              match: true,
              watchedPath: normalizedWatched,
              requiredPath: normalizedRequired,
            });
          }
          return isMatch;
        });

        log.test(testName, `Checking path: ${normalizedRequired}`);
        log.test(testName, 'Against watched paths:', Array.from(allWatchedPaths));
        log.test(testName, `isWatched result: ${isWatched}`);

        expect(isWatched).toBe(true);
      }
    } finally {
      await Promise.all(watchers.map((w) => w.close()));
    }
  }, 8000); // Reduced from 10000ms

  it.sequential('should detect sub-kenv rename and re-watch its scripts', async () => {
    const originalName = 'my-temp-kenv';
    const renamedName = 'renamed-kenv';

    const originalKenvPath = path.join(testDirs.kenvs, originalName);
    const renamedKenvPath = path.join(testDirs.kenvs, renamedName);
    const originalScriptPath = path.join(originalKenvPath, 'scripts', 'test-renamed.ts');
    const newScriptPathAfterRename = path.join(renamedKenvPath, 'scripts', 'new-after-rename.ts');

    // Ensure they don't exist
    await remove(originalKenvPath).catch(() => {});
    await remove(renamedKenvPath).catch(() => {});

    const events = await collectEvents(
      1500, // Reduced from 5000ms
      async () => {
        // 1) Create the sub-kenv + a script
        await ensureDir(path.join(originalKenvPath, 'scripts'));
        await writeFile(originalScriptPath, '// original content');

        // Wait for watchers to detect the new kenv folder
        await new Promise((resolve) => setTimeout(resolve, KENV_GLOB_TIMEOUT)); // Use constant

        // 2) Rename the sub-kenv directory
        await rename(originalKenvPath, renamedKenvPath);

        // Wait for watchers to see unlinkDir + addDir
        await new Promise((resolve) => setTimeout(resolve, KENV_GLOB_TIMEOUT)); // Reduced from 1500ms

        // 3) Create a new script in the renamed sub-kenv
        await ensureDir(path.join(renamedKenvPath, 'scripts'));
        await writeFile(newScriptPathAfterRename, '// new script in renamed kenv');
      },
      'should detect sub-kenv rename and re-watch its scripts',
      testDirs,
    );

    // Expect to see a "unlinkDir" for the old path, and an "addDir" for the new path
    const unlinkDirEvent = events.find((e) => e.event === 'unlinkDir' && e.path === originalKenvPath);
    const addDirEvent = events.find((e) => e.event === 'addDir' && e.path === renamedKenvPath);

    // For the new file
    const addNewScriptEvent = events.find((e) => e.event === 'add' && e.path === newScriptPathAfterRename);

    expect(unlinkDirEvent).toBeDefined();
    expect(addDirEvent).toBeDefined();
    expect(addNewScriptEvent).toBeDefined();
  }, 8000); // Reduced from 15000ms

  it.sequential('should handle consecutive sub-kenv deletions', async () => {
    const kenv1 = path.join(testDirs.kenvs, 'kenv-1');
    const kenv2 = path.join(testDirs.kenvs, 'kenv-2');
    const kenv1Scripts = path.join(kenv1, 'scripts');
    const kenv2Scripts = path.join(kenv2, 'scripts');

    const events = await collectEvents(
      1000, // Reduced from KENV_GLOB_TIMEOUT + 3000 (was ~1250ms)
      async () => {
        // 1) Create 2 sub-kenvs
        await ensureDir(kenv1Scripts);
        await ensureDir(kenv2Scripts);

        // Wait for watchers to see them
        await new Promise((resolve) => setTimeout(resolve, KENV_GLOB_TIMEOUT + WATCHER_SETTLE_TIME));

        // 2) Delete the first sub-kenv
        await remove(kenv1);

        // Wait for watchers
        await new Promise((resolve) => setTimeout(resolve, WATCHER_SETTLE_TIME)); // Reduced wait time

        // 3) Delete the second sub-kenv
        await remove(kenv2);

        // Wait for watchers again
        await new Promise((resolve) => setTimeout(resolve, WATCHER_SETTLE_TIME));
      },
      'should handle consecutive sub-kenv deletions',
      testDirs,
    );

    // We should see "unlinkDir" for each sub-kenv folder
    const kenv1Removed = events.filter((e) => e.event === 'unlinkDir' && e.path === kenv1);
    const kenv2Removed = events.filter((e) => e.event === 'unlinkDir' && e.path === kenv2);

    expect(kenv1Removed.length).toBeGreaterThan(0);
    expect(kenv2Removed.length).toBeGreaterThan(0);
  }, 8000); // Reduced from 20000ms

  it.sequential('should detect application changes in /Applications or user Applications directory', async () => {
    // Mock directories
    const mockSystemApps = path.join(testDirs.root, 'Applications');
    const mockUserApps = path.join(testDirs.root, 'Users', 'test', 'Applications');
    log.debug('Mock directories:', { mockSystemApps, mockUserApps });

    // Mock os functions
    const originalHomedir = os.homedir;
    const originalPlatform = os.platform;
    os.homedir = vi.fn(() => path.join(testDirs.root, 'Users', 'test'));
    os.platform = vi.fn(() => 'linux' as NodeJS.Platform);
    log.debug('Mocked os functions:', {
      homedir: os.homedir(),
      platform: os.platform(),
    });

    // Create mock directories
    log.debug('Creating mock directories');
    await ensureDir(mockSystemApps);
    await ensureDir(mockUserApps);

    const events: TestEvent[] = [];
    const watchers = startWatching(async (event, filePath, source) => {
      log.debug('Event received:', { event, filePath, source });
      events.push({ event, path: filePath, source });
    });

    try {
      // Wait for watchers to be ready
      log.debug('Waiting for watchers to be ready...');
      await waitForWatchersReady(watchers);
      log.debug('Watchers are ready');

      // Since we're mocked to linux, we should get no app watchers
      // => no events from /Applications
      expect(events.filter((e) => e.source === 'app')).toHaveLength(0);
    } finally {
      // Restore original functions
      os.homedir = originalHomedir;
      os.platform = originalPlatform;

      // Clean up watchers
      await Promise.all(watchers.map((w) => w.close()));
    }
  }, 8000);

  // Additional tests for edge cases requiring shared state

  it.sequential('should not detect changes to random untracked file in kitPath root', async () => {
    // We only watch run.txt, ping.txt, and db/ in kitPath
    // So let's create random-file.txt in kitPath root and ensure it triggers no events
    const randomFile = path.join(testDirs.kit, 'random-file.txt');

    // Remove if it exists
    await remove(randomFile).catch(() => {});

    const events = await collectEvents(
      1000,
      async () => {
        await writeFile(randomFile, 'random content');
        // Wait a bit and modify it again
        await new Promise((resolve) => setTimeout(resolve, 200));
        await writeFile(randomFile, 'more random content');
      },
      'should NOT detect changes to random untracked file in kitPath root',
      testDirs,
    );

    // Verify no events
    const foundRandomFileEvent = events.find((e) => e.path === randomFile);
    expect(foundRandomFileEvent).toBeUndefined();
  }, 5000);
});
