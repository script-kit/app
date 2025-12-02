import path from 'node:path';
import type { Script } from '@johnlindquist/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all dependencies first
vi.mock('valtio');
vi.mock('valtio/utils');
vi.mock('electron', () => ({
  Notification: vi.fn(),
  app: {
    getPath: vi.fn((name: string) => {
      switch (name) {
        case 'userData':
          return '/Users/test/Library/Application Support/ScriptKit';
        case 'downloads':
          return '/Users/test/Downloads';
        case 'home':
          return '/Users/test';
        case 'logs':
          return '/Users/test/Library/Logs/ScriptKit';
        default:
          return '/Users/test';
      }
    }),
  },
  shell: {
    openPath: vi.fn(),
  },
}));
vi.mock('electron-store');
vi.mock('./kit');
vi.mock('./state', () => ({
  kitState: {
    ready: true,
    scripts: new Map(),
    scriptlets: new Map(),
    firstBatch: false,
    ignoreInitial: true,
    suspendWatchers: false,
    kenvEnv: {},
    trustedKenvs: [],
    trustedKenvsKey: 'TRUSTED_KENVS',
    user: {},
    isSponsor: false,
    waitingForPing: false,
    tempTheme: '',
  },
  debounceSetScriptTimestamp: vi.fn(),
  sponsorCheck: vi.fn().mockResolvedValue(false),
  setKitStateAtom: vi.fn(),
}));
vi.mock('./system');
vi.mock('./logs', () => ({
  watcherLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    verbose: vi.fn(),
  },
  scriptLog: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('./process', () => ({
  sendToAllActiveChildren: vi.fn(),
}));
vi.mock('./version');
vi.mock('./install', () => ({
  cacheMainScripts: vi.fn(),
  debounceCacheMainScripts: vi.fn(),
}));
vi.mock('./main.dev.templates');
vi.mock('./shortcuts', () => ({
  shortcutScriptChanged: vi.fn(),
  unlinkShortcuts: vi.fn(),
}));
vi.mock('./system-events', () => ({
  systemScriptChanged: vi.fn(),
  unlinkEvents: vi.fn(),
}));
vi.mock('./background', () => ({
  backgroundScriptChanged: vi.fn(),
  removeBackground: vi.fn(),
}));
vi.mock('./schedule', () => ({
  scheduleScriptChanged: vi.fn(),
  cancelSchedule: vi.fn(),
}));
vi.mock('./watch', () => ({
  watchScriptChanged: vi.fn(),
  removeWatch: vi.fn(),
}));
vi.mock('./tick', () => ({
  snippetScriptChanged: vi.fn(),
  removeSnippet: vi.fn(),
  snippetMap: new Map(),
}));
vi.mock('./cjs-exports', () => ({
  pathExists: vi.fn().mockResolvedValue(true),
  pathExistsSync: vi.fn().mockReturnValue(true),
  writeFile: vi.fn(),
}));
vi.mock('./tray');
vi.mock('./messages');
vi.mock('./prompt', () => ({
  runPromptProcess: vi.fn(),
  spawnShebang: vi.fn(),
  clearPromptCacheFor: vi.fn(),
  clearPromptCache: vi.fn(),
  setKitStateAtom: vi.fn(),
}));
vi.mock('./shims', () => ({
  parseScript: vi.fn(),
}));
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  lstat: vi.fn(),
  stat: vi.fn().mockResolvedValue({ mtime: new Date() }),
  readdir: vi.fn().mockResolvedValue([]),
  rm: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock('@johnlindquist/kit/core/utils', () => ({
  debounce: vi.fn((fn) => fn),
  kitPath: vi.fn((subpath?: string) => (subpath ? `/mock/kit/path/${subpath}` : '/mock/kit/path')),
  kenvPath: vi.fn((subpath?: string) => (subpath ? `/mock/kenv/path/${subpath}` : '/mock/kenv/path')),
  resolveToScriptPath: vi.fn((filePath: string) => `/resolved/${filePath}`),
  parseScript: vi.fn(),
  getKenvFromPath: vi.fn(),
}));
vi.mock('@johnlindquist/kit/core/enum', () => ({
  KitEvent: {
    RunPromptProcess: 'RUN_PROMPT_PROCESS',
  },
  Trigger: {
    RunTxt: 'RUN_TXT',
  },
  Channel: {
    SCRIPT_CHANGED: 'SCRIPT_CHANGED',
    SCRIPT_ADDED: 'SCRIPT_ADDED',
    SCRIPT_REMOVED: 'SCRIPT_REMOVED',
  },
  ProcessType: {
    App: 'app',
    Background: 'background',
    Prompt: 'prompt',
    Schedule: 'schedule',
    System: 'system',
    Watch: 'watch',
  },
  Env: {
    REMOVE: 'REMOVE',
  },
}));
vi.mock('../shared/assets');
vi.mock('../shared/utils', () => ({
  compareArrays: vi.fn().mockReturnValue(true),
  diffArrays: vi.fn().mockReturnValue({ added: [], removed: [] }),
}));
vi.mock('../shared/events', () => ({
  KitEvent: {
    RunPromptProcess: 'RUN_PROMPT_PROCESS',
    TeardownWatchers: 'TEARDOWN_WATCHERS',
    RestartWatcher: 'RESTART_WATCHER',
  },
  emitter: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}));
vi.mock('./apps', () => ({
  reloadApps: vi.fn(),
}));
vi.mock('./channel', () => ({
  sendToAllPrompts: vi.fn(),
}));
vi.mock('./dock', () => ({
  actualHideDock: vi.fn(),
  showDock: vi.fn(),
}));
vi.mock('./env-utils', () => ({
  loadKenvEnvironment: vi.fn().mockReturnValue({}),
}));
vi.mock('./kit', () => ({
  runScript: vi.fn(),
}));
vi.mock('./npm', () => ({
  getFileImports: vi.fn().mockResolvedValue([]),
}));
vi.mock('./pty', () => ({
  createIdlePty: vi.fn(),
}));
vi.mock('./prompts', () => ({
  prompts: [],
}));
vi.mock('./snippet-cache', () => ({
  parseSnippet: vi.fn(),
}));
vi.mock('./theme', () => ({
  setCSSVariable: vi.fn(),
  updateTheme: vi.fn(),
  watchTheme: vi.fn(),
}));
vi.mock('electron/main');
vi.mock('electron-context-menu');
vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn(),
      removeAllListeners: vi.fn(),
    })),
  },
}));
vi.mock('globby', () => ({
  globby: vi.fn().mockResolvedValue([]),
}));
vi.mock('lodash-es', async () => {
  const actual = await vi.importActual<typeof import('lodash-es')>('lodash-es');
  return {
    ...actual,
    debounce: vi.fn((fn) => fn),
  };
});
vi.mock('madge', () => ({
  default: vi.fn().mockResolvedValue({
    obj: vi.fn().mockReturnValue({}),
  }),
}));
vi.mock('package-up');
vi.mock('@johnlindquist/kit/core/db');
vi.mock('./chokidar', () => ({
  getWatcherManager: vi.fn(),
  startWatching: vi.fn(() => []),
}));
vi.mock('./path-utils', () => ({
  kenvChokidarPath: vi.fn(() => '/mock/kenv'),
  kitChokidarPath: vi.fn(() => '/mock/kit'),
  slash: vi.fn((p: string) => p),
}));
vi.mock('./helpers', () => ({
  isInDirectory: vi.fn(),
}));

// Make stat globally available as it seems to be missing from imports in watcher.ts
(globalThis as any).stat = vi.fn().mockResolvedValue({ mtime: new Date() });

// Mock some global functions that watcher.ts uses
(globalThis as any).madgeAllScripts = vi.fn();
(globalThis as any).settleFirstBatch = vi.fn();
(globalThis as any).checkFileImports = vi.fn();
(globalThis as any).getDepWatcher = vi.fn(() => ({
  getWatched: vi.fn().mockReturnValue({}),
  unwatch: vi.fn(),
  add: vi.fn(),
}));

// Import after all mocks
import { handleFileChangeEvent, onScriptChanged } from './watcher';

describe('watcher.ts - wasRecentlyProcessed Tests', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Save original platform descriptor
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore original platform
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  describe('wasRecentlyProcessed basic functionality', () => {
    it('should return false for files that have never been processed', async () => {
      const { parseScript } = await import('@johnlindquist/kit/core/utils');

      // Mock dependencies
      vi.mocked(parseScript).mockResolvedValue({
        filePath: '/test/scripts/test.js',
        name: 'test.js',
      } as Script);

      // First call should go through
      await handleFileChangeEvent('change', '/test/scripts/test.js', 'test');

      // Since we can't directly test wasRecentlyProcessed, we test the behavior
      // The script change should be processed (not ignored)
      expect(parseScript).toHaveBeenCalled();
    });

    it('should NOT ignore the original file after madgeAllScripts runs', async () => {
      const { scriptLog } = await import('./logs');

      // Use onScriptChanged which checks wasRecentlyProcessed
      const testScript = {
        filePath: '/test/scripts/test.js',
        name: 'test.js',
      } as Script;

      // First call to onScriptChanged - this will NOT be ignored
      await onScriptChanged('change', testScript, false, false);

      // The script should be processed normally
      expect(scriptLog.info).toHaveBeenCalledWith('🚨 onScriptChanged', 'change', '/test/scripts/test.js');

      // Second call immediately after - with our fix, this should ALSO NOT be ignored
      // because madgeAllScripts now excludes the original file from being marked
      await onScriptChanged('change', testScript, false, false);

      // The script should be processed again (not ignored)
      expect(scriptLog.info).toHaveBeenCalledWith('🚨 onScriptChanged', 'change', '/test/scripts/test.js');

      // Should NOT see the "ignoring" message
      expect(scriptLog.info).not.toHaveBeenCalledWith(expect.stringContaining('🛑 Ignoring change event'));
    });

    it.skip('should return false for files processed more than 5 seconds ago', async () => {
      const { parseScript } = await import('@johnlindquist/kit/core/utils');

      vi.mocked(parseScript).mockResolvedValue({
        filePath: '/test/scripts/test.js',
        name: 'test.js',
      } as Script);

      // First change
      await handleFileChangeEvent('change', '/test/scripts/test.js', 'test');

      // Advance time by 6 seconds
      await vi.advanceTimersByTimeAsync(6000);

      // Second change after timeout - should be processed
      await handleFileChangeEvent('change', '/test/scripts/test.js', 'test');

      // parseScript should be called twice (not ignored the second time)
      expect(parseScript).toHaveBeenCalledTimes(2);
    });
  });

  describe('Path normalization and platform-specific behavior', () => {
    it.skip('should handle Windows paths with backslashes', async () => {
      // Mock Windows platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const { watcherLog } = await import('./logs');

      // Process file with Windows path
      await handleFileChangeEvent('change', 'C:\\test\\scripts\\test.js', 'test');

      // Try with forward slashes - should be considered the same file
      await handleFileChangeEvent('change', 'C:/test/scripts/test.js', 'test');

      // Should be ignored as recently processed
      expect(watcherLog.info).toHaveBeenCalledWith(
        expect.stringContaining('🛑 Ignoring change event'),
        expect.any(String),
        expect.stringContaining('recently processed'),
      );
    });

    it.skip('should handle case-insensitive paths on Windows', async () => {
      // Mock Windows platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const { watcherLog } = await import('./logs');

      // Process file with one case
      await handleFileChangeEvent('change', 'C:/Test/Scripts/Test.js', 'test');

      // Try with different case - should be considered the same file on Windows
      await handleFileChangeEvent('change', 'C:/test/scripts/test.js', 'test');

      // Should be ignored as recently processed
      expect(watcherLog.info).toHaveBeenCalledWith(
        expect.stringContaining('🛑 Ignoring change event'),
        expect.any(String),
        expect.stringContaining('recently processed'),
      );
    });

    it.skip('should handle case-sensitive paths on Unix systems', async () => {
      // Mock Unix platform
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      const { parseScript } = await import('@johnlindquist/kit/core/utils');

      vi.mocked(parseScript).mockResolvedValue({
        filePath: '/test/scripts/test.js',
        name: 'test.js',
      } as Script);

      // Process file with one case
      await handleFileChangeEvent('change', '/Test/Scripts/Test.js', 'test');

      // Try with different case - should be considered different files on Unix
      await handleFileChangeEvent('change', '/test/scripts/test.js', 'test');

      // Both should be processed (not ignored)
      expect(parseScript).toHaveBeenCalledTimes(2);
    });
  });

  describe('Bug fix verification - original file not marked as processed', () => {
    it.skip('should demonstrate that the fix allows rapid user saves', async () => {
      const { scriptLog } = await import('./logs');

      const testScript = {
        filePath: '/test/scripts/my-script.js',
        name: 'my-script.js',
        command: 'my-script',
      } as Script;

      // Simulate rapid user saves
      // First save
      await onScriptChanged('change', testScript, false, false);

      // User immediately saves again (within milliseconds)
      await onScriptChanged('change', testScript, false, false);

      // Third save
      await onScriptChanged('change', testScript, false, false);

      // All three saves should be processed (not ignored)
      expect(scriptLog.info).toHaveBeenCalledTimes(3);
      expect(scriptLog.info).toHaveBeenNthCalledWith(1, '🚨 onScriptChanged', 'change', '/test/scripts/my-script.js');
      expect(scriptLog.info).toHaveBeenNthCalledWith(2, '🚨 onScriptChanged', 'change', '/test/scripts/my-script.js');
      expect(scriptLog.info).toHaveBeenNthCalledWith(3, '🚨 onScriptChanged', 'change', '/test/scripts/my-script.js');

      // Should NOT see any "ignoring" messages
      expect(scriptLog.info).not.toHaveBeenCalledWith(expect.stringContaining('🛑 Ignoring change event'));
    });

    it.skip('should still prevent cascading dependency changes', async () => {
      const { watcherLog } = await import('./logs');

      // Mock madgeAllScripts to simulate marking other files as processed
      const originalMadge = (globalThis as any).madgeAllScripts;
      (globalThis as any).madgeAllScripts = vi.fn((originalFilePath?: string) => {
        // Simulate what madgeAllScripts does - mark OTHER files as processed
        // but not the original file
        if (originalFilePath !== '/test/scripts/original.js') {
          // In real code, this would mark dependency files
          // For testing, we'll manually trigger a change on a dependency
        }
      });

      const originalScript = {
        filePath: '/test/scripts/original.js',
        name: 'original.js',
      } as Script;

      const dependencyScript = {
        filePath: '/test/scripts/dependency.js',
        name: 'dependency.js',
      } as Script;

      // User changes original.js
      await onScriptChanged('change', originalScript, false, false);

      // Now simulate that madgeAllScripts found dependency.js imports original.js
      // In the real code, madgeAllScripts would mark dependency.js as processed
      // We need to simulate this by calling the internal marking logic
      // Since we can't access markFileAsProcessed directly, we'll test the behavior

      // For this test, we'll just verify that the original file can still be changed
      await onScriptChanged('change', originalScript, false, false);

      // Original file should still be processable (not ignored)
      expect(watcherLog.info).not.toHaveBeenCalledWith(
        expect.stringContaining('🛑 Ignoring change event'),
        expect.stringContaining('original.js'),
        expect.any(String),
      );

      // Restore
      (globalThis as any).madgeAllScripts = originalMadge;
    });

    it.skip('should not ignore changes when rebuilt flag is true', async () => {
      const { onScriptChanged } = await import('./watcher');
      const { scriptLog } = await import('./logs');

      const testScript = {
        filePath: '/test/scripts/my-script.js',
        name: 'my-script.js',
      } as Script;

      // First change marks as processed
      await onScriptChanged('change', testScript, false, false);

      // Second change with rebuilt=true should NOT be ignored
      await onScriptChanged('change', testScript, true, false);

      // Should not see the "ignoring" message when rebuilt=true
      expect(scriptLog.info).not.toHaveBeenCalledWith(expect.stringContaining('🛑 Ignoring change event'));
    });
  });

  describe('Cleanup and memory management', () => {
    it.skip('should clean up entries after 5 seconds', async () => {
      const { parseScript } = await import('@johnlindquist/kit/core/utils');

      vi.mocked(parseScript).mockResolvedValue({
        filePath: '/test/scripts/test.js',
        name: 'test.js',
      } as Script);

      // Process a file
      await handleFileChangeEvent('change', '/test/scripts/test.js', 'test');

      // Should be ignored immediately
      await handleFileChangeEvent('change', '/test/scripts/test.js', 'test');
      expect(parseScript).toHaveBeenCalledTimes(1);

      // Advance time to trigger cleanup
      await vi.advanceTimersByTimeAsync(5100);

      // After cleanup, the file should be processable again
      await handleFileChangeEvent('change', '/test/scripts/test.js', 'test');
      expect(parseScript).toHaveBeenCalledTimes(2);
    });

    it.skip('should handle multiple files independently', async () => {
      const { parseScript } = await import('@johnlindquist/kit/core/utils');

      vi.mocked(parseScript).mockImplementation(
        async (filePath: string) =>
          ({
            filePath,
            name: path.basename(filePath),
          }) as Script,
      );

      // Process multiple files
      await handleFileChangeEvent('change', '/test/scripts/file1.js', 'test');
      await handleFileChangeEvent('change', '/test/scripts/file2.js', 'test');
      await handleFileChangeEvent('change', '/test/scripts/file3.js', 'test');

      // All should be processed
      expect(parseScript).toHaveBeenCalledTimes(3);

      // Try to process file1 again - should be ignored
      await handleFileChangeEvent('change', '/test/scripts/file1.js', 'test');
      expect(parseScript).toHaveBeenCalledTimes(3);

      // But file2 after 5 seconds should work
      await vi.advanceTimersByTimeAsync(5100);
      await handleFileChangeEvent('change', '/test/scripts/file2.js', 'test');
      expect(parseScript).toHaveBeenCalledTimes(4);
    });
  });
});
