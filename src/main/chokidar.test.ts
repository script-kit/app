import { vi, beforeAll, afterAll, describe, it, expect } from 'vitest';
import path from 'node:path';

// Constants for test timing - increased for parallel execution
const WATCHER_SETTLE_TIME = 200;
const EVENT_COLLECTION_TIME = 200;
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

    // Ensure run.txt/ping.txt don’t exist initially
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

          // Wait for globs to be added
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

  it('should detect changes to ping.txt', async () => {
    const events = await collectEvents(
      200,
      async () => {
        log.debug('Creating ping.txt:', testDirs.pingTxtPath);
        await writeFile(testDirs.pingTxtPath, new Date().toISOString());
      },
      'should detect changes to ping.txt',
    );

    // ping.txt is not in the watched paths, so we should not see any events
    const foundPingEvent = events.some(
      (e) => e.path === testDirs.pingTxtPath && (e.event === 'add' || e.event === 'change'),
    );
    expect(foundPingEvent).toBe(false);
  });

  it('should detect new files in the root of .kenv directory', async () => {
    const rootFile = path.join(testDirs.kenv, 'root-file.txt');
    const events = await collectEvents(
      500,
      async () => {
        log.debug('Creating root file in .kenv:', rootFile);
        await writeFile(rootFile, 'root-level file');
      },
      'should detect new files in the root of .kenv directory',
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'add',
        path: rootFile,
      }),
    );
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

  it('should watch nested script files while respecting kenvs watcher depth', async () => {
    const testName = 'watcher-behavior';
    log.test(testName, 'Starting test - verifying watcher behavior');

    // Create a deep nested script in a new kenv
    const kenvName = 'test-kenv';
    const kenvPath = path.join(testDirs.kenvs, kenvName);
    const nestedScriptDir = path.join(kenvPath, 'deeply', 'nested', 'scripts');
    const scriptPath = path.join(nestedScriptDir, 'deep-script.ts');

    log.test(testName, 'Test paths:', {
      kenvPath,
      nestedScriptDir,
      scriptPath,
    });

    // Clean up any existing directories
    log.test(testName, 'Cleaning up existing directories');
    await remove(kenvPath).catch((err) => {
      log.test(testName, 'Error during cleanup:', err);
    });

    const events = await collectEvents(
      2000,
      async () => {
        // First create the kenv directory - this should be detected by kenvsWatcher
        log.test(testName, 'Creating kenv directory');
        await ensureDir(kenvPath);

        // Wait for the kenv to be detected and globs to be added
        log.test(testName, 'Waiting for kenv detection');
        await new Promise((resolve) => setTimeout(resolve, KENV_GLOB_TIMEOUT));

        // Now create the nested script - this should be detected by kenvScriptsWatcher
        log.test(testName, 'Creating nested script directory and file');
        await ensureDir(nestedScriptDir);
        await writeFile(scriptPath, 'export {}');

        // Verify paths exist
        log.test(testName, 'Verifying paths exist:', {
          kenv: await pathExists(kenvPath),
          scriptDir: await pathExists(nestedScriptDir),
          script: await pathExists(scriptPath),
        });
      },
      testName,
    );

    // Group events by type and path depth
    const eventsByType = events.reduce(
      (acc, e) => {
        const depth = e.path.split(path.sep).length - testDirs.kenvs.split(path.sep).length;
        const key = `${e.event}-depth-${depth}`;
        acc[key] = acc[key] || [];
        acc[key].push(e.path);
        return acc;
      },
      {} as Record<string, string[]>,
    );

    log.test(testName, 'Events by type and depth:', eventsByType);

    // We should see:
    // 1. addDir event for the kenv directory (depth 1)
    const kenvAddEvent = events.find((e) => e.event === 'addDir' && e.path === kenvPath);
    expect(kenvAddEvent).toBeDefined();

    // 2. add event for the script file (at any depth)
    const scriptAddEvent = events.find((e) => e.event === 'add' && e.path === scriptPath);
    expect(scriptAddEvent).toBeDefined();

    // Cleanup
    log.test(testName, 'Starting cleanup');
    await remove(kenvPath).catch((err) => {
      log.test(testName, 'Error during cleanup:', err);
    });
    log.test(testName, 'Test complete');
  });

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

      // Since we're mocked to linux, we should get no app events
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
  // ADD THESE TESTS *AFTER* YOUR EXISTING TESTS
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

  it('should detect new package.json in .kenv', async () => {
    // Some watchers look for package.json changes to do installs or updates
    const packageJsonPath = path.join(testDirs.kenv, 'package.json');

    const events = await collectEvents(
      1000,
      async () => {
        await writeFile(packageJsonPath, JSON.stringify({ name: 'test-kenv' }, null, 2));
      },
      'should detect new package.json in .kenv',
    );

    // We expect an "add" event for the new package.json
    const pkgEvent = events.find((e) => e.event === 'add' && e.path === packageJsonPath);
    expect(pkgEvent).toBeDefined();
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

  it('should handle removing the entire scriptlets folder', async () => {
    // Ensure the scriptlets folder has something
    const scriptletPath = path.join(testDirs.scriptlets, 'temp-scriptlet.js');
    await writeFile(scriptletPath, '// temp content');
    await new Promise((resolve) => setTimeout(resolve, 300));

    const events = await collectEvents(
      1500,
      async () => {
        // Remove the entire "scriptlets" folder
        await remove(testDirs.scriptlets);
      },
      'should handle removing the entire scriptlets folder',
    );

    const unlinkDirEvent = events.find((e) => e.event === 'unlinkDir' && e.path === testDirs.scriptlets);
    expect(unlinkDirEvent).toBeDefined();
  });

  it('should handle removing the entire snippets folder', async () => {
    // Ensure the snippets folder has something
    const snippetPath = path.join(testDirs.snippets, 'temp-snippet.txt');
    await writeFile(snippetPath, 'temp snippet');
    await new Promise((resolve) => setTimeout(resolve, 300));

    const events = await collectEvents(
      1500,
      async () => {
        // Remove the entire "snippets" folder
        await remove(testDirs.snippets);
      },
      'should handle removing the entire snippets folder',
    );

    const unlinkDirEvent = events.find((e) => e.event === 'unlinkDir' && e.path === testDirs.snippets);
    expect(unlinkDirEvent).toBeDefined();
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
    'should handle removing the entire kenv folder',
    async () => {
      const testLog = (msg: string, ...args: any[]) => log.debug(`[KENV-TEST] ${msg}`, ...args);

      testLog('Creating test files...');
      // Create some content in the kenv directory to ensure it exists
      const testFile = path.join(testDirs.kenv, 'test.txt');
      await ensureDir(testDirs.kenv);
      await writeFile(testFile, 'test content');

      // Create a script file to ensure the kenv directory is being watched
      const scriptFile = path.join(testDirs.scripts, 'test-script.ts');
      await ensureDir(testDirs.scripts);
      await writeFile(scriptFile, 'export {}');

      // Create a file in the root of .kenv to ensure it's watched by kenvRootWatcher
      const rootFile = path.join(testDirs.kenv, 'root-file.txt');
      await writeFile(rootFile, 'root content');
      testLog('Test files created');

      // Wait for watchers to settle after creating content
      testLog('Waiting for initial settle...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      testLog('Initial settle complete');

      const events = await collectEvents(
        3000,
        async (events) => {
          testLog('Waiting for initial scan...');
          // Wait for initial scan to complete - we should see add events for our files
          let attempts = 0;
          while (!events.some((e) => e.event === 'add' && e.path === rootFile)) {
            if (attempts++ > 30) {
              testLog('WARNING: Timed out waiting for initial scan');
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          testLog('Initial scan complete with events:', events);

          testLog('Removing kenv directory:', testDirs.kenv);
          await remove(testDirs.kenv);
          testLog('Finished removing kenv directory');
        },
        'should handle removing the entire kenv folder',
      );

      testLog('All events received:', events);

      // We should get unlink events for the contents
      const unlinkEvents = events.filter(
        (e) => (e.event === 'unlink' || e.event === 'unlinkDir') && e.path.includes(testDirs.kenv),
      );
      testLog('Unlink events:', unlinkEvents);
      expect(unlinkEvents.length).toBeGreaterThan(0);

      // We should get at least one unlink event for the root file
      const rootFileUnlink = unlinkEvents.find((e) => e.path.endsWith('root-file.txt'));
      expect(rootFileUnlink).toBeDefined();

      // We should get an unlinkDir event for the kenv directory itself
      const kenvDirUnlink = unlinkEvents.find((e) => e.event === 'unlinkDir' && e.path === testDirs.kenv);
      expect(kenvDirUnlink).toBeDefined();
    },
    { timeout: 5000 },
  );
});
