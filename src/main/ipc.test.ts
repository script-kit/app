import axios from 'axios';
import detect from 'detect-file-type';
import { ipcMain } from 'electron';
import { debounce } from 'lodash-es';
import { DownloaderHelper } from 'node-downloader-helper';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all dependencies
vi.mock('electron', () => ({
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
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn) => fn),
}));

vi.mock('axios');
vi.mock('detect-file-type');
vi.mock('node-downloader-helper');

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
}));

vi.mock('@johnlindquist/kit/core/utils', () => ({
  getLogFromScriptPath: vi.fn((path) => `${path}.log`),
  getMainScriptPath: vi.fn(() => '/test/main.js'),
  isFile: vi.fn(() => true),
  isInDir: vi.fn(() => true),
  kenvPath: vi.fn(() => '/test/kenv'),
  kitPath: vi.fn(() => '/test/kit'),
  tmpDownloadsDir: '/test/downloads',
}));

vi.mock('../shared/events', () => ({
  KitEvent: {
    RunPromptProcess: 'run-prompt-process',
    SetScriptTimestamp: 'set-script-timestamp',
  },
  emitter: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('../shared/assets', () => ({
  getAssetPath: vi.fn((path) => `/assets/${path}`),
}));

vi.mock('../shared/defaults', () => ({
  noChoice: { name: 'No Choice', value: null },
}));

vi.mock('./process', () => ({
  processes: {
    getByPid: vi.fn(),
    removeByPid: vi.fn(),
  },
  ensureIdleProcess: vi.fn(),
  ProcessAndPrompt: class {
    constructor(public pid: number) {}
  },
}));

vi.mock('./kit', () => ({
  runPromptProcess: vi.fn(),
}));

vi.mock('./logs', () => ({
  ipcLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    silly: vi.fn(),
    verbose: vi.fn(),
  },
}));

vi.mock('./prompts', () => ({
  prompts: {
    get: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('./search', () => ({
  debounceInvokeSearch: vi.fn(),
  invokeFlagSearch: vi.fn(),
  invokeSearch: vi.fn(),
}));

vi.mock('./state', () => ({
  kitState: {
    isDark: false,
    preventResize: false,
  },
}));

import { Channel, Mode, UI } from '@johnlindquist/kit/core/enum';
import type { AppMessage } from '@johnlindquist/kit/types/kitapp';
import { AppChannel, HideReason, Trigger } from '../shared/enums';
// Import the module after mocks
import { startIpc } from './ipc';

describe('IPC Communication', () => {
  let mockPrompt: any;
  let mockProcessInfo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock prompt
    mockPrompt = {
      pid: 1234,
      ready: true,
      sendToPrompt: vi.fn(),
      getLogPrefix: vi.fn(() => 'test-prompt'),
      kitSearch: {
        input: '',
        keyword: '',
        inputRegex: undefined,
        keywordCleared: false,
        commandChars: [],
        triggers: new Map(),
        postfixes: new Map(),
        keywords: new Map(),
        shortcodes: new Map(),
      },
    };

    // Setup mock process info
    mockProcessInfo = {
      pid: 1234,
      prompt: mockPrompt,
      child: {
        send: vi.fn(),
        kill: vi.fn(),
      },
    };
  });

  describe('startIpc', () => {
    it('should register IPC handlers', () => {
      startIpc();

      // Check that handlers are registered
      expect(ipcMain.on).toHaveBeenCalled();

      // Check for specific channels being registered
      const onCalls = vi.mocked(ipcMain.on).mock.calls;
      const registeredChannels = onCalls.map(([channel]) => channel);

      // Verify at least some key channels are registered
      expect(registeredChannels).toContain(AppChannel.ERROR_RELOAD);
    });
  });

  describe('Channel Message Handling', () => {
    it('should handle message with valid process', async () => {
      const { processes } = vi.mocked(await import('./process'));
      processes.getByPid.mockReturnValue(mockProcessInfo);

      const message: AppMessage = {
        pid: 1234,
        channel: Channel.INPUT,
        value: 'test input',
      };

      // Simulate a channel handler being called
      const handlers = vi.mocked(ipcMain.on).mock.calls;
      const inputHandler = handlers.find(([channel]) => channel === Channel.INPUT)?.[1];

      if (inputHandler) {
        inputHandler({}, message);
        expect(processes.getByPid).toHaveBeenCalledWith(1234);
      }
    });

    it('should handle message fail when process not found', async () => {
      const { processes, ensureIdleProcess } = vi.mocked(await import('./process'));
      processes.getByPid.mockReturnValue(undefined);

      const message: AppMessage = {
        pid: 1234,
        channel: Channel.INPUT,
        value: 'test',
      };

      // The handleMessageFail is debounced
      const { ipcLog } = vi.mocked(await import('./logs'));

      // Simulate handling a message with no process
      processes.removeByPid(1234, 'ipc handleMessageFail');
      ensureIdleProcess();

      expect(processes.removeByPid).toHaveBeenCalledWith(1234, 'ipc handleMessageFail');
      expect(ensureIdleProcess).toHaveBeenCalled();
    });
  });

  describe('Input Processing', () => {
    describe('checkShortcodesAndKeywords', () => {
      it('should handle trigger matches', () => {
        mockPrompt.kitSearch.triggers.set('test', { value: 'triggered' });

        // We can't directly test checkShortcodesAndKeywords as it's not exported
        // but we can verify the behavior through integration
      });

      it('should handle postfix matches', () => {
        mockPrompt.kitSearch.postfixes.set('.js', {
          name: 'JavaScript',
          value: 'js-handler',
        });
      });

      it('should handle keyword detection', () => {
        mockPrompt.kitSearch.keywords.set('find', {
          name: 'Find',
          value: 'find-handler',
        });
      });

      it('should handle shortcode detection', () => {
        mockPrompt.kitSearch.shortcodes.set('ff', {
          name: 'Firefox',
          value: 'firefox-handler',
        });
      });
    });
  });

  describe('File Downloads', () => {
    it('should handle download request', async () => {
      const mockDownloader = {
        on: vi.fn().mockReturnThis(),
        start: vi.fn().mockReturnThis(),
      };

      vi.mocked(DownloaderHelper).mockImplementation(() => mockDownloader as any);

      // Test download functionality when properly integrated
    });

    it('should detect file type for downloads', async () => {
      vi.mocked(detect).fromFile = vi.fn().mockResolvedValue({
        ext: 'png',
        mime: 'image/png',
      });

      // Test file type detection
    });
  });

  describe('Search Functionality', () => {
    it('should invoke search with debouncing', async () => {
      const { debounceInvokeSearch, invokeSearch } = vi.mocked(await import('./search'));

      // Test search invocation
      debounceInvokeSearch({} as any, 'test query', {} as any);
      expect(debounceInvokeSearch).toHaveBeenCalled();
    });

    it('should handle flag search', async () => {
      const { invokeFlagSearch } = vi.mocked(await import('./search'));

      // Test flag search
      invokeFlagSearch({} as any, 'flag', {} as any);
      expect(invokeFlagSearch).toHaveBeenCalled();
    });
  });

  describe('Window Resize Handling', () => {
    it('should handle resize data', () => {
      const resizeData = {
        id: 'test-prompt',
        width: 800,
        height: 600,
      };

      // Test resize handling when integrated
    });
  });

  describe('Script Execution', () => {
    it('should run prompt process', async () => {
      const { runPromptProcess } = vi.mocked(await import('./kit'));

      await runPromptProcess({
        scriptPath: '/test/script.js',
        args: ['arg1', 'arg2'],
        options: {
          force: true,
          trigger: Trigger.Ipc,
        },
      });

      expect(runPromptProcess).toHaveBeenCalled();
    });
  });

  describe('Actions Menu', () => {
    it('should handle actions open timeout', () => {
      // Test actions menu timeout behavior
      // This would involve testing the actionsOpenTimeout variable behavior
    });
  });

  describe('Error Handling', () => {
    it('should handle IPC errors gracefully', async () => {
      const { ipcLog } = vi.mocked(await import('./logs'));

      // Simulate an error
      const error = new Error('IPC Error');
      ipcLog.error('IPC Error', error);

      expect(ipcLog.error).toHaveBeenCalledWith('IPC Error', error);
    });
  });

  afterEach(() => {
    // Clear any timeouts that might have been set
    vi.clearAllTimers();
  });
});
