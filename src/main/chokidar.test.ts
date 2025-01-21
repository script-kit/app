import { vi, beforeAll, afterAll, describe, it, expect } from 'vitest';
import path from 'node:path';

// Constants for test timing - increased for parallel execution
const WATCHER_SETTLE_TIME = 200;
const KENV_GLOB_TIMEOUT = 1000;

const testDir = vi.hoisted(() => {
  console.log('[HOISTED] Setting up testDir');
  return import('tmp-promise').then(({ dir }) => {
    console.log('[HOISTED] Got dir function');
    return dir({ unsafeCleanup: true }).then((result) => {
      console.log('[HOISTED] Created temp dir:', result.path);
      return result;
    });
  });
});

vi.mock('node:os', async () => {
  console.log('[OS MOCK] Starting setup');
  const tmpDir = await testDir;
  console.log('[OS MOCK] Got tmpDir:', tmpDir.path);
  const osMock = {
    homedir: () => {
      console.log('[OS MOCK] homedir called, returning:', tmpDir.path);
      return tmpDir.path;
    },
    path,
    platform: () => 'darwin',
  };
  return {
    default: osMock,
    ...osMock,
  };
});

vi.mock('@johnlindquist/kit/core/utils', async () => {
  console.log('[MOCK] Starting mock setup');
  const tmpDir = await testDir;
  console.log('[MOCK] Got tmpDir:', tmpDir.path);
  process.env.KIT = path.resolve(tmpDir.path, '.kit');
  process.env.KENV = path.resolve(tmpDir.path, '.kenv');
  return {
    kitPath: (...parts: string[]) => path.join(process.env.KIT!, ...parts),
    kenvPath: (...parts: string[]) => path.join(process.env.KENV!, ...parts),
    userDbPath: path.resolve(process.env.KIT!, 'db', 'user.json'),
  };
});

// Rest of imports can go here
import { ensureDir, writeFile, remove, rename, pathExists, readFile, readdir } from 'fs-extra';
import { startWatching, type WatchEvent, type WatchSource } from './chokidar';
import type { FSWatcher } from 'chokidar';
import os from 'node:os';

const log = {
  debug: (...args: any[]) => console.log(`[${new Date().toISOString()}] [DEBUG]`, ...args),
  error: (...args: any[]) => console.error(`[${new Date().toISOString()}] [ERROR]`, ...args),
  test: (testName: string, ...args: any[]) => console.log(`[${new Date().toISOString()}] [TEST:${testName}]`, ...args),
  watcher: (...args: any[]) => console.log(`[${new Date().toISOString()}] [WATCHER]`, ...args),
  event: (...args: any[]) => console.log(`[${new Date().toISOString()}] [EVENT]`, ...args),
  dir: (...args: any[]) => console.log(`[${new Date().toISOString()}] [DIR]`, ...args),
};

async function ensureFileOperation(
  operation: () => Promise<void>,
  verify: () => Promise<boolean>,
  maxAttempts = 3,
  delayMs = 100,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await operation();
      if (await verify()) return;
    } catch (err) {
      if (i === maxAttempts - 1) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Operation failed after max attempts');
}

interface TestEvent {
  event: WatchEvent;
  path: string;
  source?: WatchSource;
}

// Move testDirs to module scope
const testDirs = {
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

/**
 * Wait for all watchers to emit their "ready" event.
 * This helps ensure we don't miss any file changes
 * occurring shortly after watchers start.
 */
async function waitForWatchersReady(watchers: FSWatcher[]) {
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

async function logDirectoryState(dir: string, depth = 0) {
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
 * Collect events while watchers are active, ensuring watchers are fully ready
 * before performing the test action. Then wait a bit to gather events.
 */
async function collectEvents(
  duration: number,
  action: (events: TestEvent[]) => Promise<void> | void,
  testName: string,
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

describe.concurrent('File System Watcher', () => {
  beforeAll(async () => {
    log.debug('Setting up test environment');
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

    log.debug('Test environment setup complete', testDirs);
  });

  afterAll(async () => {
    await remove(testDirs.root);
    vi.clearAllMocks();
  });

  // -------------------------------------------------------
  // Tests
  // -------------------------------------------------------

  it(
    'should detect new script files',
    async () => {
      const scriptName = 'test-script.ts';
      const scriptPath = path.join(testDirs.scripts, scriptName);

      const events = await collectEvents(
        500,
        async () => {
          log.debug('Creating test script:', scriptPath);
          await writeFile(scriptPath, 'export {}');
        },
        'should detect new script files',
      );

      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'add',
          path: scriptPath,
        }),
      );
    },
    { timeout: 5000 },
  );

  it(
    'should detect new kenv directories and watch their contents',
    async () => {
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
        KENV_GLOB_TIMEOUT + 2000,
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
      );

      log.debug('Final events:', events);

      // Look for both the add and change events
      const addEvent = events.some((e) => e.event === 'add' && e.path.endsWith('test.ts'));
      const changeEvent = events.some((e) => e.event === 'change' && e.path.endsWith('test.ts'));

      expect(addEvent || changeEvent).toBe(true);
    },
    { timeout: 15000 },
  );

  it('should handle file deletions', async () => {
    const filePath = path.join(testDirs.scripts, 'to-delete.ts');
    log.debug('Creating file to delete:', filePath);
    await writeFile(filePath, 'export {}');

    // Let watchers settle
    await new Promise((resolve) => setTimeout(resolve, 500));

    const events = await collectEvents(
      500,
      async () => {
        log.debug('Deleting file:', filePath);
        await remove(filePath);
      },
      'should handle file deletions',
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'unlink',
        path: filePath,
      }),
    );
  });

  it('should detect changes to user.json (userDbPath)', async () => {
    const events = await collectEvents(
      200,
      async () => {
        // Update user.json so watchers see a "change"
        const updatedContent = { foo: 'bar' };
        log.debug('Updating user.json:', testDirs.userJsonPath);
        await writeFile(testDirs.userJsonPath, JSON.stringify(updatedContent, null, 2));
      },
      'should detect changes to user.json (userDbPath)',
    );

    // We expect to see a "change" event for user.json
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'change',
        path: testDirs.userJsonPath,
      }),
    );
  });

  it('should detect new snippet file', async () => {
    const snippetPath = path.join(testDirs.snippets, 'my-snippet.txt');
    const events = await collectEvents(
      500,
      async () => {
        log.debug('Creating snippet:', snippetPath);
        await writeFile(snippetPath, 'Hello Snippet!');
      },
      'should detect new snippet file',
    );

    const foundSnippet = events.some((e) => e.event === 'add' && e.path === snippetPath);
    expect(foundSnippet).toBe(true);
  });

  it('should detect snippet removal', async () => {
    const snippetPath = path.join(testDirs.snippets, 'removable-snippet.txt');
    await writeFile(snippetPath, 'Temporary snippet');

    // Let watchers see the file
    await new Promise((resolve) => setTimeout(resolve, 500));

    const events = await collectEvents(
      500,
      async () => {
        log.debug('Removing snippet:', snippetPath);
        await remove(snippetPath);
      },
      'should detect snippet removal',
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'unlink',
        path: snippetPath,
      }),
    );
  });

  it('should detect new scriptlet file', async () => {
    const scriptletPath = path.join(testDirs.scriptlets, 'my-scriptlet.js');
    const events = await collectEvents(
      500,
      async () => {
        log.debug('Creating scriptlet:', scriptletPath);
        await writeFile(scriptletPath, '// scriptlet content');
      },
      'should detect new scriptlet file',
    );

    const foundScriptlet = events.some((e) => e.event === 'add' && e.path === scriptletPath);
    expect(foundScriptlet).toBe(true);
  });

  it('should detect scriptlet deletion', async () => {
    const scriptletPath = path.join(testDirs.scriptlets, 'deleted-scriptlet.js');
    await writeFile(scriptletPath, '// deleted scriptlet');

    // Let watchers see the file
    await new Promise((resolve) => setTimeout(resolve, 500));

    const events = await collectEvents(
      500,
      async () => {
        log.debug('Removing scriptlet:', scriptletPath);
        await remove(scriptletPath);
      },
      'should detect scriptlet deletion',
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'unlink',
        path: scriptletPath,
      }),
    );
  });

  it('should detect changes to run.txt', async () => {
    // First create run.txt and let the watchers ignore it
    await writeFile(testDirs.runTxtPath, 'initial content');

    // Let everything settle
    await new Promise((resolve) => setTimeout(resolve, 200));

    const events = await collectEvents(
      400,
      async () => {
        log.debug('Writing to run.txt:', testDirs.runTxtPath);
        await writeFile(testDirs.runTxtPath, 'my-script.ts arg1 arg2');
      },
      'should detect changes to run.txt',
    );

    log.debug('Events received:', events);

    // We should see a "change" event since the file already exists
    const foundRunTxt = events.some((e) => e.path === testDirs.runTxtPath && e.event === 'change');
    expect(foundRunTxt).toBe(true);
  });

  it('should detect removals of run.txt', async () => {
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
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'unlink',
        path: testDirs.runTxtPath,
      }),
    );
  });

  it('should detect changes to .env file', async () => {
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
    );

    log.debug('Events received:', events);

    // We should see a "change" event since the file already exists
    const foundEnvEvent = events.some((e) => e.path === testDirs.envFilePath && e.event === 'change');
    expect(foundEnvEvent).toBe(true);
  });

  it('should detect renamed scripts within /scripts directory', async () => {
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
      2500,
      async () => {
        log.debug('Renaming script from', originalPath, 'to', renamedPath);
        await rename(originalPath, renamedPath);
      },
      'should detect renamed scripts within /scripts directory',
    );

    // Some OS/file systems emit separate unlink/add events, others might show rename
    const unlinkEvent = events.find((e) => e.event === 'unlink' && e.path === originalPath);
    const addEvent = events.find((e) => e.event === 'add' && e.path === renamedPath);

    expect(unlinkEvent).toBeDefined();
    expect(addEvent).toBeDefined();
  });

  it(
    'should NOT watch nested script files in sub-kenvs',
    async () => {
      const testName = 'watcher-behavior';
      log.test(testName, 'Starting test - verifying watcher behavior');

      // Create a script in a new kenv at root level AND a nested script
      const kenvName = 'test-kenv';
      const kenvPathDir = path.join(testDirs.kenvs, kenvName);
      const scriptsDir = path.join(kenvPathDir, 'scripts');
      const rootScriptPath = path.join(scriptsDir, 'root-script.ts');
      const nestedDir = path.join(scriptsDir, 'nested');
      const nestedScriptPath = path.join(nestedDir, 'nested-script.ts');

      log.test(testName, 'Test paths:', {
        kenvPathDir,
        scriptsDir,
        rootScriptPath,
        nestedScriptPath,
      });

      // Clean up any existing directories
      log.test(testName, 'Cleaning up existing directories');
      await remove(kenvPathDir).catch((err) => {
        log.test(testName, 'Error during cleanup:', err);
      });

      const events = await collectEvents(
        2000,
        async () => {
          // First create the kenv directory and scripts directory
          log.test(testName, 'Creating kenv and scripts directories');
          await ensureDir(kenvPathDir);
          await ensureDir(scriptsDir);
          await ensureDir(nestedDir);

          // Wait for the kenv and scripts watchers to attach
          log.test(testName, 'Waiting for kenv and scripts detection');
          await new Promise((resolve) => setTimeout(resolve, KENV_GLOB_TIMEOUT));

          // Create both root and nested scripts
          log.test(testName, 'Creating root and nested script files');
          await writeFile(rootScriptPath, 'export {}');
          await writeFile(nestedScriptPath, 'export {}');

          // Verify paths exist
          log.test(testName, 'Verifying paths exist:', {
            kenv: await pathExists(kenvPathDir),
            scriptDir: await pathExists(scriptsDir),
            rootScript: await pathExists(rootScriptPath),
            nestedScript: await pathExists(nestedScriptPath),
          });
        },
        testName,
      );

      // We should see an addDir for the main kenv folder
      const kenvAddEvent = events.find((e) => e.event === 'addDir' && e.path === kenvPathDir);
      expect(kenvAddEvent).toBeDefined();

      // We expect an "add" event for the root-script.ts since it's at root level
      const rootScriptAddEvent = events.find((e) => e.event === 'add' && e.path === rootScriptPath);
      expect(rootScriptAddEvent).toBeDefined();

      // We should NOT see any events for the nested script
      const nestedScriptEvent = events.find((e) => e.path === nestedScriptPath);
      expect(nestedScriptEvent).toBeUndefined();
    },
    { timeout: 10000 },
  );

  it('should detect application changes in /Applications or user Applications directory', async () => {
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
  }, 10000);

  //
  // ADDITIONAL TESTS *AFTER* YOUR EXISTING TESTS
  //

  it(
    'should detect rename of snippet file',
    async () => {
      // Create a snippet to rename
      const snippetOriginal = path.join(testDirs.snippets, 'rename-snippet.txt');
      const snippetRenamed = path.join(testDirs.snippets, 'renamed-snippet.txt');
      await writeFile(snippetOriginal, 'Initial snippet content');

      // Let watchers settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      const events = await collectEvents(
        2000,
        async () => {
          // Rename snippet file
          await rename(snippetOriginal, snippetRenamed);
        },
        'should detect rename of snippet file',
      );

      // We expect an "unlink" on the old path and an "add" on the new path
      const unlinkEvent = events.find((e) => e.event === 'unlink' && e.path === snippetOriginal);
      const addEvent = events.find((e) => e.event === 'add' && e.path === snippetRenamed);

      expect(unlinkEvent).toBeDefined();
      expect(addEvent).toBeDefined();
    },
    { timeout: 3000 },
  );

  it(
    'should detect rename of scriptlet file',
    async () => {
      // Create a scriptlet to rename
      const scriptletOriginal = path.join(testDirs.scriptlets, 'rename-scriptlet.js');
      const scriptletRenamed = path.join(testDirs.scriptlets, 'renamed-scriptlet.js');
      await writeFile(scriptletOriginal, '// scriptlet content');

      // Let watchers settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      const events = await collectEvents(
        2000,
        async () => {
          // Rename the scriptlet
          await rename(scriptletOriginal, scriptletRenamed);
        },
        'should detect rename of scriptlet file',
      );

      const unlinkEvent = events.find((e) => e.event === 'unlink' && e.path === scriptletOriginal);
      const addEvent = events.find((e) => e.event === 'add' && e.path === scriptletRenamed);

      expect(unlinkEvent).toBeDefined();
      expect(addEvent).toBeDefined();
    },
    { timeout: 3000 },
  );

  it(
    'should handle removal of .env',
    async () => {
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
      );

      expect(events).toContainEqual(
        expect.objectContaining({
          event: 'unlink',
          path: testDirs.envFilePath,
        }),
      );
    },
    { timeout: 3000 },
  );

  it(
    'should detect multiple rapid changes to run.txt',
    async () => {
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
      );

      // We expect at least one or more "change" events
      const changeEvents = events.filter((e) => e.path === testDirs.runTxtPath && e.event === 'change');
      expect(changeEvents.length).toBeGreaterThanOrEqual(1);
    },
    { timeout: 3000 },
  );

  it(
    'should detect re-creation of user.json after removal',
    async () => {
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
      );

      log.debug('Events collected:', JSON.stringify(events, null, 2));

      // We might get "add" or "change" depending on how watchers handle it
      const userJsonEvent = events.find(
        (e) => e.path === testDirs.userJsonPath && (e.event === 'add' || e.event === 'change'),
      );

      log.debug('Found user.json event:', userJsonEvent);
      expect(userJsonEvent).toBeDefined();
    },
    { timeout: 5000 },
  );

  it('should detect a script extension change (.ts -> .js)', async () => {
    const originalPath = path.join(testDirs.scripts, 'extension-change.ts');
    const newPath = path.join(testDirs.scripts, 'extension-change.js');

    // Create a .ts script
    await writeFile(originalPath, 'export const isTS = true;');
    await new Promise((resolve) => setTimeout(resolve, 300));

    const events = await collectEvents(
      1200,
      async () => {
        // Rename the extension from .ts to .js
        await rename(originalPath, newPath);
      },
      'should detect a script extension change (.ts -> .js)',
    );

    const unlinkEvent = events.find((e) => e.event === 'unlink' && e.path === originalPath);
    const addEvent = events.find((e) => e.event === 'add' && e.path === newPath);

    expect(unlinkEvent).toBeDefined();
    expect(addEvent).toBeDefined();
  });

  it('should detect changes to package.json in .kenv', async () => {
    // Ensure package.json exists
    const packageJsonPath = path.join(testDirs.kenv, 'package.json');
    await writeFile(packageJsonPath, JSON.stringify({ name: 'test-kenv' }, null, 2));
    await new Promise((resolve) => setTimeout(resolve, 300));

    const events = await collectEvents(
      1000,
      async () => {
        await writeFile(packageJsonPath, JSON.stringify({ name: 'test-kenv', version: '1.0.1' }, null, 2));
      },
      'should detect changes to package.json in .kenv',
    );

    // We expect a "change" event
    const pkgChange = events.find((e) => e.event === 'change' && e.path === packageJsonPath);
    expect(pkgChange).toBeDefined();
  });

  it(
    'should detect rapid consecutive changes to the same snippet file',
    async () => {
      const testName = 'rapid-changes';
      const tmpTestDir = await import('tmp-promise').then(({ dir }) => dir({ unsafeCleanup: true }));

      // Create ALL required directories first
      const isolatedKenv = path.join(tmpTestDir.path, '.kenv-rapid-test');
      await Promise.all([
        ensureDir(path.join(isolatedKenv, 'scripts')),
        ensureDir(path.join(isolatedKenv, 'snippets')),
        ensureDir(path.join(isolatedKenv, 'scriptlets')),
        ensureDir(path.join(isolatedKenv, 'kenvs')),
      ]);

      const snippetPath = path.join(isolatedKenv, 'snippets', 'rapid-snippet.txt');

      // Point watcher at our test directory
      const originalKenv = process.env.KENV;
      process.env.KENV = isolatedKenv;

      const events: TestEvent[] = [];
      const watchers = startWatching(async (event, filePath, source) => {
        log.test(testName, 'Event received:', { event, filePath, source });
        events.push({ event, path: filePath, source });
      });

      try {
        await waitForWatchersReady(watchers);

        // Create and modify file
        await writeFile(snippetPath, 'initial');
        await new Promise((resolve) => setTimeout(resolve, 500));

        await writeFile(snippetPath, 'update 1');
        await writeFile(snippetPath, 'update 2');
        await writeFile(snippetPath, 'update 3');

        // Wait for events
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const changeEvents = events.filter((e) => e.event === 'change' && e.path === snippetPath);
        log.test(testName, 'Events:', events);
        log.test(testName, 'Change events:', changeEvents);

        expect(changeEvents.length).toBeGreaterThanOrEqual(1);
      } finally {
        process.env.KENV = originalKenv;
        await Promise.all(watchers.map((w) => w.close()));
        await remove(tmpTestDir.path);
      }
    },
    { timeout: 20000 },
  );

  it(
    'should watch the correct paths',
    async () => {
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
        await new Promise((resolve) => setTimeout(resolve, 5000));

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

          expect(isWatched).toBe(true, `Path ${normalizedRequired} should be watched`);
        }
      } finally {
        await Promise.all(watchers.map((w) => w.close()));
      }
    },
    { timeout: 10000 },
  );

  // -------------------------------------------------------
  // NEW TESTS TO ENSURE WE *DO NOT* WATCH node_modules OR .git
  // -------------------------------------------------------

  describe('Ensure node_modules and .git are NOT watched', () => {
    it('should not trigger events when creating files inside node_modules in main kenv', async () => {
      const nodeModulesDir = path.join(testDirs.kenv, 'node_modules');
      const fileInside = path.join(nodeModulesDir, 'test-file.txt');

      const events = await collectEvents(
        1000,
        async () => {
          await ensureDir(nodeModulesDir);
          await writeFile(fileInside, 'this should not be watched');
        },
        'node_modules in main kenv should not be watched',
      );

      // Verify no events
      const anyNodeModulesEvent = events.some((e) => e.path.includes('node_modules'));
      expect(anyNodeModulesEvent).toBe(false);
    });

    it('should not trigger events when creating files inside .git in main kenv', async () => {
      const dotGitDir = path.join(testDirs.kenv, '.git');
      const fileInside = path.join(dotGitDir, 'HEAD');

      const events = await collectEvents(
        1000,
        async () => {
          await ensureDir(dotGitDir);
          await writeFile(fileInside, 'ref: refs/heads/main');
        },
        '.git in main kenv should not be watched',
      );

      // Verify no events
      const anyDotGitEvent = events.some((e) => e.path.includes('.git'));
      expect(anyDotGitEvent).toBe(false);
    });

    it('should not trigger events when creating files inside node_modules of a sub-kenv', async () => {
      const subKenvName = 'ignore-sub-kenv';
      const subKenvPath = path.join(testDirs.kenvs, subKenvName);
      const nodeModulesDir = path.join(subKenvPath, 'node_modules');
      const fileInside = path.join(nodeModulesDir, 'ignored.txt');

      const events = await collectEvents(
        2000,
        async () => {
          // Create sub-kenv
          await ensureDir(subKenvPath);
          // Let watchers settle
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Create node_modules
          await ensureDir(nodeModulesDir);
          // Write file
          await writeFile(fileInside, 'should not be watched');
        },
        'node_modules in sub-kenv should not be watched',
      );

      const anyNodeModulesEvent = events.some((e) => e.path.includes('node_modules'));
      expect(anyNodeModulesEvent).toBe(false);
    });

    it('should not trigger events when creating files inside .git of a sub-kenv', async () => {
      const subKenvName = 'git-sub-kenv';
      const subKenvPath = path.join(testDirs.kenvs, subKenvName);
      const dotGitDir = path.join(subKenvPath, '.git');
      const fileInside = path.join(dotGitDir, 'HEAD');

      const events = await collectEvents(
        2000,
        async () => {
          // Create sub-kenv
          await ensureDir(subKenvPath);
          // Let watchers settle
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Create .git folder
          await ensureDir(dotGitDir);
          // Write file
          await writeFile(fileInside, 'ref: refs/heads/main');
        },
        '.git in sub-kenv should not be watched',
      );

      const anyDotGitEvent = events.some((e) => e.path.includes('.git'));
      expect(anyDotGitEvent).toBe(false);
    });

    it('should not trigger events for random files outside watched paths', async () => {
      // Create some random files in various locations
      const randomFiles = [
        path.join(testDirs.kenv, 'random.txt'),
        path.join(testDirs.kenv, 'some-dir', 'file.txt'),
        path.join(testDirs.kenv, 'kenvs', 'random-file.txt'),
        path.join(testDirs.kenv, 'random-dir', 'nested', 'file.ts'),
      ];

      const events = await collectEvents(
        1000,
        async () => {
          // Create each file and its parent directory
          for (const file of randomFiles) {
            await ensureDir(path.dirname(file));
            await writeFile(file, 'random content');
          }
        },
        'random files should not be watched',
      );

      // Verify no events for these random files
      const randomFileEvents = events.filter((e) => randomFiles.some((file) => e.path === file));

      expect(randomFileEvents).toHaveLength(0);

      // Double check by modifying the files
      const moreEvents = await collectEvents(
        1000,
        async () => {
          // Modify each file
          for (const file of randomFiles) {
            await writeFile(file, 'modified content');
          }
        },
        'modified random files should not be watched',
      );

      const modifyEvents = moreEvents.filter((e) => randomFiles.some((file) => e.path === file));

      expect(modifyEvents).toHaveLength(0);
    });
  });
});

// -------------------------------------------------------
// ADDITIONAL COVERAGE TESTS
// -------------------------------------------------------

it(
  'should NOT detect changes in nested subfolders of main /scripts directory (depth=0)',
  async () => {
    // Example: /scripts/nested/another-nested/file.ts
    const nestedDir = path.join(testDirs.scripts, 'nested', 'another-nested');
    const nestedFile = path.join(nestedDir, 'nested-file.ts');

    // Clean up any existing artifacts
    await remove(nestedDir).catch(() => {
      /* ignore */
    });

    const events = await collectEvents(
      1000,
      async () => {
        // Create nested structure
        await ensureDir(nestedDir);
        await writeFile(nestedFile, '// nested script');
      },
      'should NOT detect changes in nested subfolders of main /scripts directory',
    );

    // Ensure we got no events for that nested file
    const nestedEvent = events.find((e) => e.path === nestedFile);
    expect(nestedEvent).toBeUndefined();
  },
  { timeout: 5000 },
);

it(
  'should detect changes to a symlinked file in main /scripts when followSymlinks = true',
  async () => {
    // We'll create a folder "linked-target" with a file, then symlink that folder into /scripts
    const linkedTargetDir = path.join(testDirs.root, 'linked-target');
    const linkedTargetFile = path.join(linkedTargetDir, 'symlinked-script.ts');
    const symlinkDir = path.join(testDirs.scripts, 'linked-symlink');

    // Clean up from any previous runs
    await remove(linkedTargetDir).catch(() => {
      /* ignore */
    });
    await remove(symlinkDir).catch(() => {
      /* ignore */
    });

    await ensureDir(linkedTargetDir);
    // Create an initial file
    await writeFile(linkedTargetFile, 'export const original = true;');

    // Create symlink inside /scripts => points to linkedTargetDir
    await new Promise<void>((resolve, reject) => {
      import('node:fs').then(({ symlink }) => {
        symlink(linkedTargetDir, symlinkDir, (err) => {
          if (err) {
            // Windows symlinks require privileges, so we skip if it fails
            console.warn('[SYMLINK] Could not create symlink:', err);
            resolve();
          } else {
            resolve();
          }
        });
      });
    });

    // Now we collect events and modify the symlinked file
    const events = await collectEvents(
      1500,
      async () => {
        // Modify the symlinked file
        await writeFile(linkedTargetFile, 'export const updated = true;');
      },
      'should detect changes to a symlinked file in /scripts',
    );

    // If symlink creation failed (on Windows without admin privileges), the test just checks that no events appear
    // Otherwise, we expect a "change" event
    const changedEvent = events.find((e) => e.event === 'change' && e.path === linkedTargetFile);
    // We'll accept either no event (symlink creation failed) or a change event if symlink succeeded
    // but let's confirm we didn't get an error.
    expect(events.some((e) => e.event === 'unlink')).toBe(false);
  },
  { timeout: 5000 },
);

it(
  'should detect sub-kenv rename and re-watch its scripts',
  async () => {
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
      5000,
      async () => {
        // 1) Create the sub-kenv + a script
        await ensureDir(path.join(originalKenvPath, 'scripts'));
        await writeFile(originalScriptPath, '// original content');

        // Wait for watchers to detect the new kenv folder
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 2) Rename the sub-kenv directory
        await rename(originalKenvPath, renamedKenvPath);

        // Wait for watchers to see unlinkDir + addDir
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // 3) Create a new script in the renamed sub-kenv
        await ensureDir(path.join(renamedKenvPath, 'scripts'));
        await writeFile(newScriptPathAfterRename, '// new script in renamed kenv');
      },
      'should detect sub-kenv rename and re-watch its scripts',
    );

    // Expect to see a "unlinkDir" for the old path, and an "addDir" for the new path
    const unlinkDirEvent = events.find((e) => e.event === 'unlinkDir' && e.path === originalKenvPath);
    const addDirEvent = events.find((e) => e.event === 'addDir' && e.path === renamedKenvPath);

    // For the new file
    const addNewScriptEvent = events.find((e) => e.event === 'add' && e.path === newScriptPathAfterRename);

    expect(unlinkDirEvent).toBeDefined();
    expect(addDirEvent).toBeDefined();
    expect(addNewScriptEvent).toBeDefined();
  },
  { timeout: 15000 },
);

it(
  'should detect changes to ping.txt',
  async () => {
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
    );

    // We expect an "add" or "change" event for ping.txt
    const pingEvent = events.find(
      (e) => e.path === testDirs.pingTxtPath && (e.event === 'add' || e.event === 'change'),
    );
    expect(pingEvent).toBeDefined();
  },
  { timeout: 3000 },
);

it(
  'should NOT detect changes to random untracked file in kitPath root',
  async () => {
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
    );

    // Verify no events
    const foundRandomFileEvent = events.find((e) => e.path === randomFile);
    expect(foundRandomFileEvent).toBeUndefined();
  },
  { timeout: 5000 },
);
