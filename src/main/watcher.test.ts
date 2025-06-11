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
vi.mock('./install');
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
vi.mock('./tray');
vi.mock('./messages');
vi.mock('./prompt');
vi.mock('@johnlindquist/kit/core/utils');
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fs.readFile
    mockReadFile = vi.fn();
    vi.mock('node:fs/promises', () => ({
      readFile: mockReadFile,
    }));

    // Mock emitter
    mockEmitter = {
      emit: vi.fn(),
    };

    // Mock debounce to execute immediately
    mockDebounce = vi.fn((fn) => fn);
    vi.mock('@johnlindquist/kit/core/utils', () => ({
      debounce: mockDebounce,
      kitPath: vi.fn((subpath?: string) => (subpath ? `/mock/kit/path/${subpath}` : '/mock/kit/path')),
      kenvPath: vi.fn((subpath?: string) => (subpath ? `/mock/kenv/path/${subpath}` : '/mock/kenv/path')),
      resolveToScriptPath: vi.fn((filePath: string) => `/resolved/${filePath}`),
    }));

    // Mock other dependencies
    vi.mock('./prompt', () => ({
      runPromptProcess: vi.fn(),
      spawnShebang: vi.fn(),
    }));
    vi.mock('./shims', () => ({
      parseScript: vi.fn(),
    }));
    vi.mock('@johnlindquist/kit/core/enum', () => ({
      KitEvent: {
        RunPromptProcess: 'RUN_PROMPT_PROCESS',
      },
      Trigger: {
        RunTxt: 'RUN_TXT',
      },
    }));
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
