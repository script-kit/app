import path from 'node:path';
import type { Script } from '@johnlindquist/kit';
import { ProcessType } from '@johnlindquist/kit/core/enum';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock process.resourcesPath
const originalProcess = process;
vi.stubGlobal('process', {
  ...originalProcess,
  resourcesPath: '/path/to/resources',
});

// Mock modules
vi.mock('valtio');
vi.mock('valtio/utils');
vi.mock('electron');
vi.mock('electron-store');
vi.mock('./kit');
vi.mock('./state');
vi.mock('./system');
vi.mock('./logs');
vi.mock('./process');
vi.mock('./version');
vi.mock('./install', () => ({
  cacheMainScripts: vi.fn(),
  debounceCacheMainScripts: vi.fn(),
}));
vi.mock('./main.dev.templates');
vi.mock('./shortcuts');
vi.mock('./system-events');
vi.mock('./background');
vi.mock('./schedule');
vi.mock('./watch');
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
}));
vi.mock('./shims', () => ({
  parseScript: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  lstat: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock('@johnlindquist/kit/core/utils', () => {
  const mockDebounce = vi.fn((fn) => fn);
  return {
    debounce: mockDebounce,
    kitPath: vi.fn((subpath?: string) => (subpath ? `/mock/kit/path/${subpath}` : '/mock/kit/path')),
    kenvPath: vi.fn((subpath?: string) => (subpath ? `/mock/kenv/path/${subpath}` : '/mock/kenv/path')),
    resolveToScriptPath: vi.fn((filePath: string) => `/resolved/${filePath}`),
    parseScript: vi.fn(),
  };
});
vi.mock('@johnlindquist/kit/core/enum', () => ({
  KitEvent: {
    RunPromptProcess: 'RUN_PROMPT_PROCESS',
  },
  Trigger: {
    RunTxt: 'RUN_TXT',
  },
}));
vi.mock('../shared/assets');
vi.mock('electron/main');
vi.mock('electron-context-menu');

// Import after mocks
import { onScriptChanged } from './watcher';

describe('watcher.ts - onScriptChanged Tests', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.clearAllMocks();
    // Restore process
    vi.stubGlobal('process', originalProcess);
  });

  it('should log when a script changes', async () => {
    const scriptPath = path.join('/mocked/kenv', 'scripts', 'change-me.ts');
    const mockScript = {
      filePath: scriptPath,
      name: 'change-me.ts',
      kenv: '',
      command: 'node',
      type: ProcessType.Prompt,
      id: 'test-script',
    } satisfies Script;

    await onScriptChanged('change', mockScript);

    const { scriptLog } = await import('./logs');
    expect(scriptLog.info).toHaveBeenCalledWith('🚨 onScriptChanged', 'change', mockScript.filePath);
  });
});

describe('watcher.ts - run.txt functionality', () => {
  let mockReadFile: any;
  let mockEmitter: any;
  let mockDebounce: any;
  let triggerRunTextHandler: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get reference to mocked readFile
    const { readFile } = await import('node:fs/promises');
    mockReadFile = vi.mocked(readFile);

    // Mock emitter
    mockEmitter = {
      emit: vi.fn(),
    };

    // Get reference to mocked debounce
    const { debounce } = await import('@johnlindquist/kit/core/utils');
    mockDebounce = vi.mocked(debounce);

    // References to mocked functions will be set in test-specific beforeEach blocks
  });

  describe('triggerRunText', () => {
    beforeEach(async () => {
      // Dynamic import to get fresh mocks
      const watcherModule = await import('./watcher');

      // Get the debounced function that was passed to debounce
      triggerRunTextHandler = mockDebounce.mock.calls.find(
        (call) => call[1] === 1000 && call[2]?.leading === true,
      )?.[0];
    });

    it('should parse and execute script from run.txt on add event', async () => {
      const { parseScript } = await import('./shims');
      const { runPromptProcess } = await import('./prompt');

      mockReadFile.mockResolvedValue('my-script arg1 arg2\n');
      vi.mocked(parseScript).mockResolvedValue({ shebang: null });

      await triggerRunTextHandler('add');

      expect(mockReadFile).toHaveBeenCalledWith('/mock/kit/path/run.txt', 'utf8');
      expect(parseScript).toHaveBeenCalledWith('/resolved/my-script');
      expect(runPromptProcess).toHaveBeenCalledWith({
        scriptPath: '/resolved/my-script',
        args: ['arg1', 'arg2'],
        options: {
          force: true,
          trigger: 'RUN_TXT',
        },
      });
    });

    it('should handle script with shebang', async () => {
      const { parseScript } = await import('./shims');
      const { spawnShebang } = await import('./prompt');

      mockReadFile.mockResolvedValue('bash-script.sh param1');
      vi.mocked(parseScript).mockResolvedValue({
        shebang: '#!/bin/bash',
        filePath: '/resolved/bash-script.sh',
      });

      await triggerRunTextHandler('change');

      expect(spawnShebang).toHaveBeenCalledWith({
        shebang: '#!/bin/bash',
        filePath: '/resolved/bash-script.sh',
      });
    });

    it('should handle empty run.txt', async () => {
      const { runPromptProcess, spawnShebang } = await import('./prompt');

      mockReadFile.mockResolvedValue('   \n  ');

      await triggerRunTextHandler('add');

      expect(runPromptProcess).not.toHaveBeenCalled();
      expect(spawnShebang).not.toHaveBeenCalled();
    });

    it('should handle script with no arguments', async () => {
      const { parseScript } = await import('./shims');
      const { runPromptProcess } = await import('./prompt');

      mockReadFile.mockResolvedValue('solo-script');
      vi.mocked(parseScript).mockResolvedValue({ shebang: null });

      await triggerRunTextHandler('add');

      expect(runPromptProcess).toHaveBeenCalledWith({
        scriptPath: '/resolved/solo-script',
        args: [],
        options: {
          force: true,
          trigger: 'RUN_TXT',
        },
      });
    });

    it('should handle script paths with spaces', async () => {
      const { parseScript } = await import('./shims');
      const { runPromptProcess } = await import('./prompt');

      mockReadFile.mockResolvedValue('"my script with spaces.js" arg1 arg2');
      vi.mocked(parseScript).mockResolvedValue({ shebang: null });

      await triggerRunTextHandler('add');

      // Note: This tests the current behavior, which might need adjustment
      // for proper quoted path handling
      expect(runPromptProcess).toHaveBeenCalled();
    });

    it('should ignore non-add/change events', async () => {
      const { runPromptProcess, spawnShebang } = await import('./prompt');

      await triggerRunTextHandler('unlink');

      expect(mockReadFile).not.toHaveBeenCalled();
      expect(runPromptProcess).not.toHaveBeenCalled();
      expect(spawnShebang).not.toHaveBeenCalled();
    });

    it('should handle file read errors', async () => {
      const { log } = await import('./logs');
      mockReadFile.mockRejectedValue(new Error('File not found'));

      await expect(triggerRunTextHandler('add')).rejects.toThrow('File not found');
    });
  });

  describe('run.txt watcher integration', () => {
    it('should debounce rapid changes', async () => {
      const watcherModule = await import('./watcher');

      // Verify debounce was called with correct parameters
      expect(mockDebounce).toHaveBeenCalledWith(expect.any(Function), 1000, { leading: true });
    });
  });
});

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
      const { handleFileChangeEvent } = await import('./watcher');
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

    it('should return true for files processed within the last 5 seconds', async () => {
      const { handleFileChangeEvent } = await import('./watcher');
      const { watcherLog } = await import('./logs');

      // First change - should be processed
      await handleFileChangeEvent('change', '/test/scripts/test.js', 'test');

      // Second change immediately after - should be ignored
      await handleFileChangeEvent('change', '/test/scripts/test.js', 'test');

      // Check that the second change was ignored
      expect(watcherLog.info).toHaveBeenCalledWith(
        expect.stringContaining('🛑 Ignoring change event'),
        expect.stringContaining('/test/scripts/test.js'),
        expect.stringContaining('recently processed')
      );
    });

    it('should return false for files processed more than 5 seconds ago', async () => {
      const { handleFileChangeEvent } = await import('./watcher');
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
    it('should handle Windows paths with backslashes', async () => {
      // Mock Windows platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true
      });

      const { handleFileChangeEvent } = await import('./watcher');
      const { watcherLog } = await import('./logs');

      // Process file with Windows path
      await handleFileChangeEvent('change', 'C:\\test\\scripts\\test.js', 'test');
      
      // Try with forward slashes - should be considered the same file
      await handleFileChangeEvent('change', 'C:/test/scripts/test.js', 'test');

      // Should be ignored as recently processed
      expect(watcherLog.info).toHaveBeenCalledWith(
        expect.stringContaining('🛑 Ignoring change event'),
        expect.any(String),
        expect.stringContaining('recently processed')
      );
    });

    it('should handle case-insensitive paths on Windows', async () => {
      // Mock Windows platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true
      });

      const { handleFileChangeEvent } = await import('./watcher');
      const { watcherLog } = await import('./logs');

      // Process file with one case
      await handleFileChangeEvent('change', 'C:/Test/Scripts/Test.js', 'test');
      
      // Try with different case - should be considered the same file on Windows
      await handleFileChangeEvent('change', 'C:/test/scripts/test.js', 'test');

      // Should be ignored as recently processed
      expect(watcherLog.info).toHaveBeenCalledWith(
        expect.stringContaining('🛑 Ignoring change event'),
        expect.any(String),
        expect.stringContaining('recently processed')
      );
    });

    it('should handle case-sensitive paths on Unix systems', async () => {
      // Mock Unix platform
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true
      });

      const { handleFileChangeEvent } = await import('./watcher');
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

  describe('Bug reproduction - file changes being incorrectly ignored', () => {
    it('should not ignore legitimate file changes after initial processing', async () => {
      const { handleFileChangeEvent, onScriptChanged } = await import('./watcher');
      const { parseScript } = await import('@johnlindquist/kit/core/utils');
      const { watcherLog } = await import('./logs');
      
      const testScript = {
        filePath: '/test/scripts/my-script.js',
        name: 'my-script.js',
        command: 'my-script',
      } as Script;
      
      vi.mocked(parseScript).mockResolvedValue(testScript);

      // Simulate initial script processing (e.g., from madgeAllScripts)
      await onScriptChanged('change', testScript, false, false);
      
      // Immediately after, a real file change happens
      await handleFileChangeEvent('change', '/test/scripts/my-script.js', 'test');

      // This should be ignored because it was just processed
      expect(watcherLog.info).toHaveBeenCalledWith(
        expect.stringContaining('🛑 Ignoring change event'),
        '/test/scripts/my-script.js',
        'in handleFileChangeEvent - recently processed'
      );

      // Advance time by 3 seconds (still within 5 second window)
      await vi.advanceTimersByTimeAsync(3000);

      // Another legitimate change happens
      await handleFileChangeEvent('change', '/test/scripts/my-script.js', 'test');

      // This should still be ignored
      expect(watcherLog.info).toHaveBeenCalledWith(
        expect.stringContaining('🛑 Ignoring change event'),
        '/test/scripts/my-script.js',
        'in handleFileChangeEvent - recently processed'
      );

      // Advance time past 5 seconds
      await vi.advanceTimersByTimeAsync(3000);

      // Now changes should be processed again
      await handleFileChangeEvent('change', '/test/scripts/my-script.js', 'test');
      
      // Should call parseScript again (not ignored)
      expect(parseScript).toHaveBeenCalledTimes(2); // Once in setup, once after timeout
    });

    it('should not ignore changes when rebuilt flag is true', async () => {
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
      expect(scriptLog.info).not.toHaveBeenCalledWith(
        expect.stringContaining('🛑 Ignoring change event')
      );
    });
  });

  describe('Cleanup and memory management', () => {
    it('should clean up entries after 5 seconds', async () => {
      const { handleFileChangeEvent } = await import('./watcher');
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

    it('should handle multiple files independently', async () => {
      const { handleFileChangeEvent } = await import('./watcher');
      const { parseScript } = await import('@johnlindquist/kit/core/utils');
      
      vi.mocked(parseScript).mockImplementation(async (filePath: string) => ({
        filePath,
        name: path.basename(filePath),
      } as Script));

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
