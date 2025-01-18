import { vi, beforeAll, afterAll, describe, it, expect } from 'vitest';
import { dir } from 'tmp-promise';
import path from 'node:path';
import { ensureDir, writeFile, remove } from 'fs-extra';
import { startWatching, type WatchEvent, type WatchSource } from './chokidar';

const log = {
  debug: (...args: any[]) => console.log('[DEBUG]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};

const mocks = vi.hoisted(() => {
  let root = '';
  let kit = '';
  let kenv = '';

  return {
    setRootPath: (rootPath: string) => {
      root = rootPath;
      kit = path.join(root, '.kit');
      kenv = path.join(root, '.kenv');
    },
    getPaths: () => ({ root, kit, kenv }),
    kitPath: (...parts: string[]) => path.join(kit, ...parts),
    kenvPath: (...parts: string[]) => path.join(kenv, ...parts),
    userDbPath: () => path.join(kit, 'db', 'user.json'),
  };
});

vi.mock('@johnlindquist/kit/core/utils', () => ({
  kitPath: mocks.kitPath,
  kenvPath: mocks.kenvPath,
  userDbPath: mocks.userDbPath(),
}));

vi.mock('node:os', () => {
  const osMock = {
    homedir: () => mocks.getPaths().root,
    platform: () => 'darwin',
  };
  return {
    default: osMock,
    ...osMock,
  };
});

interface TestEvent {
  event: WatchEvent;
  path: string;
  source?: WatchSource;
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
  };

  beforeAll(async () => {
    log.debug('Setting up test environment');
    const tmpDir = await dir({ unsafeCleanup: true });
    testDirs.root = tmpDir.path;

    // Set the mock paths first
    log.debug('Setting mock paths', { root: testDirs.root });
    mocks.setRootPath(testDirs.root);

    testDirs.kit = path.join(testDirs.root, '.kit');
    testDirs.kenv = path.join(testDirs.root, '.kenv');

    // Create directory structure
    log.debug('Creating directory structure');
    await Promise.all([
      ensureDir(path.join(testDirs.kenv, 'scripts')),
      ensureDir(path.join(testDirs.kenv, 'snippets')),
      ensureDir(path.join(testDirs.kenv, 'scriptlets')),
      ensureDir(path.join(testDirs.kenv, 'kenvs')),
      ensureDir(path.join(testDirs.kit, 'Applications')),
    ]);

    testDirs.scripts = path.join(testDirs.kenv, 'scripts');
    testDirs.snippets = path.join(testDirs.kenv, 'snippets');
    testDirs.scriptlets = path.join(testDirs.kenv, 'scriptlets');
    testDirs.kenvs = path.join(testDirs.kenv, 'kenvs');

    log.debug('Test environment setup complete', testDirs);
  });

  afterAll(async () => {
    await remove(testDirs.root);
    vi.clearAllMocks();
  });

  async function collectEvents(duration: number, action: (events: TestEvent[]) => Promise<void>): Promise<TestEvent[]> {
    const events: TestEvent[] = [];
    log.debug('Starting watchers');
    const watchers = await startWatching(
      (event, filePath, source) => {
        log.debug('Event received:', { event, filePath, source });
        events.push({ event, path: filePath, source });
      },
      { ignoreInitial: true },
    );

    try {
      // Wait for watchers to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      log.debug('Executing test action');
      await action(events);

      // Wait for events to be processed
      log.debug('Waiting for events to be processed');
      await new Promise((resolve) => setTimeout(resolve, duration));

      log.debug('Final events:', events);
      return events;
    } finally {
      log.debug('Cleaning up watchers');
      await Promise.all(watchers.map((w) => w.close()));
    }
  }

  it('should detect new script files', async () => {
    const events = await collectEvents(1000, async () => {
      const scriptPath = path.join(testDirs.scripts, 'test-script.ts');
      log.debug('Creating test script:', scriptPath);
      await writeFile(scriptPath, 'export {}');
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'add',
        path: path.join(testDirs.scripts, 'test-script.ts'),
      }),
    );
  });

  it('should detect new kenv directories and watch their contents', async () => {
    const events = await collectEvents(3000, async () => {
      const newKenvPath = path.join(testDirs.kenvs, 'test-kenv');
      const newKenvScriptPath = path.join(newKenvPath, 'scripts', 'test.ts');

      log.debug('Creating new kenv directory:', newKenvPath);
      await ensureDir(newKenvPath);

      // Wait for directory to be detected
      await new Promise((resolve) => setTimeout(resolve, 1000));

      log.debug('Creating scripts directory:', path.join(newKenvPath, 'scripts'));
      await ensureDir(path.join(newKenvPath, 'scripts'));

      // Wait for scripts directory to be detected
      await new Promise((resolve) => setTimeout(resolve, 1000));

      log.debug('Creating kenv script:', newKenvScriptPath);
      await writeFile(newKenvScriptPath, 'export {}');
    });

    log.debug('Events after kenv creation:', events);

    // Look for the directory creation event in the chokidar logs
    const dirCreated = events.some((e) => {
      const isMatch = e.event === 'addDir' && e.path.includes('test-kenv');
      if (isMatch) {
        log.debug('Found directory creation event:', e);
      }
      return isMatch;
    });

    expect(dirCreated).toBe(true);

    // Look for the file creation event
    const fileCreated = events.some((e) => {
      const isMatch = e.event === 'add' && e.path.endsWith('test.ts');
      if (isMatch) {
        log.debug('Found file creation event:', e);
      }
      return isMatch;
    });

    expect(fileCreated).toBe(true);
  }, 10000);

  it('should ignore dotfiles', async () => {
    const events = await collectEvents(1000, async () => {
      const dotfilePath = path.join(testDirs.scripts, '.hidden.ts');
      const normalPath = path.join(testDirs.scripts, 'visible.ts');

      log.debug('Creating dotfile:', dotfilePath);
      await writeFile(dotfilePath, 'export {}');

      log.debug('Creating normal file:', normalPath);
      await writeFile(normalPath, 'export {}');
    });

    expect(events).not.toContainEqual(
      expect.objectContaining({
        path: path.join(testDirs.scripts, '.hidden.ts'),
      }),
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'add',
        path: path.join(testDirs.scripts, 'visible.ts'),
      }),
    );
  });

  it('should handle file deletions', async () => {
    const filePath = path.join(testDirs.scripts, 'to-delete.ts');
    log.debug('Creating file to delete:', filePath);
    await writeFile(filePath, 'export {}');

    // Wait for the initial add event to be processed
    await new Promise((resolve) => setTimeout(resolve, 500));

    const events = await collectEvents(1000, async () => {
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
});
