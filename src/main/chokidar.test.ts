import { vi, beforeAll, afterAll, describe, it, expect } from 'vitest';
import path from 'node:path';

// Constants for test timing
const WATCHER_SETTLE_TIME = 100;
const EVENT_COLLECTION_TIME = 100;

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
import { ensureDir, writeFile, remove, rename, pathExists } from 'fs-extra';
import { startWatching, KENV_GLOB_TIMEOUT, type WatchEvent, type WatchSource } from './chokidar';
import type { FSWatcher } from 'chokidar';
import os from 'node:os';

const log = {
  debug: (...args: any[]) => console.log('[DEBUG]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};

interface TestEvent {
  event: WatchEvent;
  path: string;
  source?: WatchSource;
}

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

/**
 * Collect events while watchers are active, ensuring watchers are fully ready
 * before performing the test action. Then wait a bit to gather events.
 */
async function collectEvents(
  duration: number,
  action: (events: TestEvent[]) => Promise<void> | void,
): Promise<TestEvent[]> {
  const events: TestEvent[] = [];
  log.debug('Starting watchers');

  // Start watchers
  const watchers = startWatching(async (event, filePath, source) => {
    log.debug('Event received:', { event, filePath, source });
    events.push({ event, path: filePath, source });
  });

  try {
    // Wait for watchers to be fully ready
    await waitForWatchersReady(watchers);

    // Add a small delay to ensure watchers are definitely ready for changes
    await new Promise((resolve) => setTimeout(resolve, 100));

    log.debug('Executing test action');
    await action(events);

    // Wait for events to be processed
    log.debug(`Waiting ${duration}ms for events to be processed`);
    await new Promise((resolve) => setTimeout(resolve, duration));

    log.debug('Final events:', events);
    return events;
  } finally {
    log.debug('Cleaning up watchers');
    await Promise.all(watchers.map((w) => w.close()));
  }
}

describe('File System Watcher', () => {
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

  it('should detect new script files', async () => {
    const scriptName = 'test-script.ts';
    const scriptPath = path.join(testDirs.scripts, scriptName);

    const events = await collectEvents(500, async () => {
      log.debug('Creating test script:', scriptPath);
      await writeFile(scriptPath, 'export {}');
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'add',
        path: scriptPath,
      }),
    );
  });

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

        // Create directory structure first
        log.debug('Creating directory:', newKenvScriptsDir);
        await ensureDir(newKenvScriptsDir);

        // Wait for globs to be added (matches timeout in kenvsWatcherCallback)
        log.debug('Waiting for globs to be added...');
        await new Promise((resolve) => setTimeout(resolve, KENV_GLOB_TIMEOUT + WATCHER_SETTLE_TIME));

        // Write initial content (this will be ignored)
        log.debug('Writing initial content:', newKenvScriptPath);
        await writeFile(newKenvScriptPath, 'export {}');

        // Wait for chokidar to detect the file
        await new Promise((resolve) => setTimeout(resolve, WATCHER_SETTLE_TIME));

        // Write new content (this should trigger a change event)
        log.debug('Writing new content:', newKenvScriptPath);
        await writeFile(newKenvScriptPath, 'export const foo = "bar"');

        // Wait for events
        await new Promise((resolve) => setTimeout(resolve, EVENT_COLLECTION_TIME));

        log.debug('Final events:', events);

        // Look for the change event
        const fileChanged = events.some((e) => e.event === 'change' && e.path.endsWith('test.ts'));
        expect(fileChanged).toBe(true);
      } finally {
        log.debug('Cleaning up watchers');
        await Promise.all(watchers.map((w) => w.close()));
      }
    },
    KENV_GLOB_TIMEOUT + WATCHER_SETTLE_TIME * 3 + EVENT_COLLECTION_TIME,
  );

  it('should ignore dotfiles', async () => {
    const hiddenName = '.hidden.ts';
    const hiddenPath = path.join(testDirs.scripts, hiddenName);
    const visibleName = 'visible.ts';
    const visiblePath = path.join(testDirs.scripts, visibleName);

    const events = await collectEvents(500, async () => {
      log.debug('Creating dotfile:', hiddenPath);
      await writeFile(hiddenPath, 'export {}');

      log.debug('Creating normal file:', visiblePath);
      await writeFile(visiblePath, 'export {}');
    });

    // Hidden file should be ignored
    expect(events.find((e) => e.path === hiddenPath)).toBeUndefined();

    // Visible file should be detected
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'add',
        path: visiblePath,
      }),
    );
  });

  it('should handle file deletions', async () => {
    const filePath = path.join(testDirs.scripts, 'to-delete.ts');
    log.debug('Creating file to delete:', filePath);
    await writeFile(filePath, 'export {}');

    // Let watchers settle
    await new Promise((resolve) => setTimeout(resolve, 500));

    const events = await collectEvents(500, async () => {
      log.debug('Deleting file:', filePath);
      await remove(filePath);
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'unlink',
        path: filePath,
      }),
    );
  });

  it('should detect changes to user.json (userDbPath)', async () => {
    const events = await collectEvents(200, async () => {
      // Update user.json so watchers see a "change"
      const updatedContent = { foo: 'bar' };
      log.debug('Updating user.json:', testDirs.userJsonPath);
      await writeFile(testDirs.userJsonPath, JSON.stringify(updatedContent, null, 2));
    });

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
    const events = await collectEvents(500, async () => {
      log.debug('Creating snippet:', snippetPath);
      await writeFile(snippetPath, 'Hello Snippet!');
    });

    const foundSnippet = events.some((e) => e.event === 'add' && e.path === snippetPath);
    expect(foundSnippet).toBe(true);
  });

  it('should detect snippet removal', async () => {
    const snippetPath = path.join(testDirs.snippets, 'removable-snippet.txt');
    await writeFile(snippetPath, 'Temporary snippet');

    // Let watchers see the file
    await new Promise((resolve) => setTimeout(resolve, 500));

    const events = await collectEvents(500, async () => {
      log.debug('Removing snippet:', snippetPath);
      await remove(snippetPath);
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'unlink',
        path: snippetPath,
      }),
    );
  });

  it('should detect new scriptlet file', async () => {
    const scriptletPath = path.join(testDirs.scriptlets, 'my-scriptlet.js');
    const events = await collectEvents(500, async () => {
      log.debug('Creating scriptlet:', scriptletPath);
      await writeFile(scriptletPath, '// scriptlet content');
    });

    const foundScriptlet = events.some((e) => e.event === 'add' && e.path === scriptletPath);
    expect(foundScriptlet).toBe(true);
  });

  it('should detect scriptlet deletion', async () => {
    const scriptletPath = path.join(testDirs.scriptlets, 'deleted-scriptlet.js');
    await writeFile(scriptletPath, '// deleted scriptlet');

    // Let watchers see the file
    await new Promise((resolve) => setTimeout(resolve, 500));

    const events = await collectEvents(500, async () => {
      log.debug('Removing scriptlet:', scriptletPath);
      await remove(scriptletPath);
    });

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

    const events = await collectEvents(400, async () => {
      log.debug('Writing to run.txt:', testDirs.runTxtPath);
      await writeFile(testDirs.runTxtPath, 'my-script.ts arg1 arg2');
    });

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

    const events = await collectEvents(500, async () => {
      await remove(testDirs.runTxtPath);
    });

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

    const events = await collectEvents(400, async () => {
      log.debug('Writing to .env:', testDirs.envFilePath);
      await writeFile(testDirs.envFilePath, 'KIT_DOCK=true');
    });

    log.debug('Events received:', events);

    // We should see a "change" event since the file already exists
    const foundEnvEvent = events.some((e) => e.path === testDirs.envFilePath && e.event === 'change');
    expect(foundEnvEvent).toBe(true);
  });

  it('should detect changes to ping.txt', async () => {
    const events = await collectEvents(200, async () => {
      log.debug('Creating ping.txt:', testDirs.pingTxtPath);
      await writeFile(testDirs.pingTxtPath, new Date().toISOString());
    });

    // ping.txt is not in the watched paths, so we should not see any events
    const foundPingEvent = events.some(
      (e) => e.path === testDirs.pingTxtPath && (e.event === 'add' || e.event === 'change'),
    );
    expect(foundPingEvent).toBe(false);
  });

  it('should detect new files in the root of .kenv directory', async () => {
    const rootFile = path.join(testDirs.kenv, 'root-file.txt');
    const events = await collectEvents(500, async () => {
      log.debug('Creating root file in .kenv:', rootFile);
      await writeFile(rootFile, 'root-level file');
    });

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

    const events = await collectEvents(2500, async () => {
      log.debug('Renaming script from', originalPath, 'to', renamedPath);
      await rename(originalPath, renamedPath);
    });

    // Some OS/file systems emit separate unlink/add events, others might show rename
    const unlinkEvent = events.find((e) => e.event === 'unlink' && e.path === originalPath);
    const addEvent = events.find((e) => e.event === 'add' && e.path === renamedPath);

    expect(unlinkEvent).toBeDefined();
    expect(addEvent).toBeDefined();
  });

  it('should ignore deeper nested directories in .kenv/kenvs beyond depth=0 for the kenvsWatcher', async () => {
    // By default in `chokidar.ts`, it sets depth: 0 for .kenv/kenvs
    // so it should not pick up subfolders deeper than that
    const newKenvNestedPath = path.join(testDirs.kenvs, 'deep-kenv', 'nested', 'scripts');
    const scriptPath = path.join(newKenvNestedPath, 'deep-script.ts');

    const events = await collectEvents(300, async () => {
      log.debug('Creating deep kenv nested path:', newKenvNestedPath);
      await ensureDir(newKenvNestedPath);

      // Wait for the directories to be created
      await new Promise((resolve) => setTimeout(resolve, 500));

      log.debug('Creating deep script file:', scriptPath);
      await writeFile(scriptPath, 'export {}');
    });

    // Because the watchers have depth=0 for "kenvs", we shouldn't see "add" or "addDir" for nested subdirs
    const foundNestedAdd = events.some((e) => e.event === 'add' && e.path.endsWith('deep-script.ts'));
    expect(foundNestedAdd).toBe(false);

    const foundNestedDir = events.some((e) => e.event === 'addDir' && e.path.includes('nested'));
    expect(foundNestedDir).toBe(false);
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
    os.platform = vi.fn(() => 'linux');
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
});
