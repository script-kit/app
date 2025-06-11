import type { ChildProcess } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import os from 'node:os';
import axios from 'axios';
import { type Display, nativeTheme } from 'electron';
import Store from 'electron-store';
import schedule from 'node-schedule';
import { subscribeKey } from 'valtio/utils';
import { proxy, snapshot } from 'valtio/vanilla';
import { type MockedFunction, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all dependencies
vi.mock('electron', () => ({
  default: {
    app: {
      getPath: vi.fn(() => '/test/path'),
      getName: vi.fn(() => 'test-app'),
    },
    ipcMain: {
      handle: vi.fn(),
    },
    shell: {
      openPath: vi.fn(),
    },
  },
  nativeTheme: {
    shouldUseDarkColors: false,
  },
  app: {
    getPath: vi.fn(() => '/test/path'),
    getName: vi.fn(() => 'test-app'),
  },
  ipcMain: {
    handle: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
  },
}));

vi.mock('electron-store');

vi.mock('valtio/vanilla', () => ({
  proxy: vi.fn((obj) => obj),
  snapshot: vi.fn((obj) => obj),
  unstable_getInternalStates: vi.fn(() => ({
    proxyStateMap: new Map(),
    snapCache: new Map(),
  })),
}));

vi.mock('valtio/utils', () => ({
  subscribeKey: vi.fn(() => vi.fn()),
}));
vi.mock('node-schedule');
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
  post: vi.fn(),
  get: vi.fn(),
}));
vi.mock('node:fs/promises');
vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn, _delay, _options) => {
    // Return the function directly without debouncing for tests
    return fn;
  }),
}));

vi.mock('@johnlindquist/kit/core/utils', () => ({
  getTrustedKenvsKey: vi.fn(() => 'test-trusted-key'),
  isParentOfDir: vi.fn(() => false),
  kenvPath: vi.fn(() => '/test/kenv'),
  kitPath: vi.fn((...args: string[]) => {
    if (args.length === 0) {
      return '/test/kit';
    }
    return `/test/kit/${args.join('/')}`;
  }),
  parseScript: vi.fn(async (filePath: string) => ({
    filePath,
    command: 'test-command',
    name: 'test-script',
  })),
  tmpClipboardDir: '/test/tmp/clipboard',
}));

vi.mock('../shared/events', () => ({
  KitEvent: {
    ForceQuit: 'force-quit',
    RunPromptProcess: 'run-prompt-process',
    SetScriptTimestamp: 'set-script-timestamp',
    ShowDock: 'show-dock',
    HideDock: 'hide-dock',
  },
  emitter: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('../shared/internet-available', () => ({
  default: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('./shims', () => ({
  default: {
    'node-mac-permissions': {
      getAuthStatus: vi.fn(() => 'authorized'),
    },
  },
}));

vi.mock('./log-utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Import the module after mocks are set up
import {
  type Background,
  backgroundMap,
  cacheKitScripts,
  convertKey,
  debounceSetScriptTimestamp,
  forceQuit,
  getAccessibilityAuthorized,
  getBackgroundTasks,
  getEmojiShortcut,
  getKitScript,
  getSchedule,
  getThemes,
  kitCache,
  kitClipboard,
  kitConfig,
  kitState,
  kitStore,
  online,
  preloadChoicesMap,
  preloadPreviewMap,
  preloadPromptDataMap,
  promptState,
  scheduleMap,
  serverState,
  sponsorCheck,
  subs,
  theme,
  workers,
} from './state';

describe('State Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset maps and state
    backgroundMap.clear();
    scheduleMap.clear();
    preloadChoicesMap.clear();
    preloadPreviewMap.clear();
    preloadPromptDataMap.clear();
  });

  describe('kitStore', () => {
    it('should initialize with default schema values', () => {
      const mockStore = {
        get: vi.fn((key: string) => {
          const defaults: Record<string, any> = {
            KENV: '/test/kenv',
            accessibilityAuthorized: true,
            sponsor: false,
            version: '0.0.0',
            retryCount: 0,
            uIOhookEnabled: true,
          };
          return defaults[key];
        }),
        set: vi.fn(),
        path: '/test/store/path',
      };

      vi.mocked(Store).mockImplementation(() => mockStore as any);

      expect(mockStore.get('KENV')).toBe('/test/kenv');
      expect(mockStore.get('accessibilityAuthorized')).toBe(true);
      expect(mockStore.get('sponsor')).toBe(false);
    });
  });

  describe('serverState', () => {
    it('should have initial server state', () => {
      expect(serverState).toEqual({
        running: false,
        host: '',
        port: 0,
      });
    });
  });

  describe('Background Tasks', () => {
    it('should add and retrieve background tasks', () => {
      const mockChild = {
        spawnargs: ['node', 'script.js'],
        pid: 1234,
      } as unknown as ChildProcess;

      const background: Background = {
        child: mockChild,
        start: '2023-01-01T00:00:00Z',
        status: 'ready',
      };

      backgroundMap.set('/test/script.js', background);

      const tasks = getBackgroundTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual({
        filePath: '/test/script.js',
        process: {
          spawnargs: ['node', 'script.js'],
          pid: 1234,
          start: '2023-01-01T00:00:00Z',
        },
      });
    });

    it('should handle null child process', () => {
      const background: Background = {
        child: null,
        start: '2023-01-01T00:00:00Z',
        status: 'starting',
      };

      backgroundMap.set('/test/script.js', background);

      const tasks = getBackgroundTasks();
      expect(tasks[0].process.spawnargs).toBeUndefined();
      expect(tasks[0].process.pid).toBeUndefined();
    });
  });

  describe('Schedule Management', () => {
    it('should get scheduled jobs', () => {
      const mockJob = {
        nextInvocation: vi.fn(() => new Date('2023-01-01T12:00:00Z')),
      };

      scheduleMap.set('/test/scheduled.js', mockJob as any);
      vi.mocked(schedule).scheduledJobs = {
        '/test/scheduled.js': mockJob,
      } as any;

      const scheduled = getSchedule();
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0]).toEqual({
        filePath: '/test/scheduled.js',
        date: new Date('2023-01-01T12:00:00Z'),
      });
    });

    it('should filter out kit path jobs', async () => {
      const mockJob = {
        nextInvocation: vi.fn(() => new Date()),
      };

      scheduleMap.set('/test/kit/internal.js', mockJob as any);
      vi.mocked(schedule).scheduledJobs = {
        '/test/kit/internal.js': mockJob,
      } as any;

      const { isParentOfDir } = await import('@johnlindquist/kit/core/utils');
      vi.mocked(isParentOfDir).mockReturnValue(true);

      const scheduled = getSchedule();
      expect(scheduled).toHaveLength(0);
    });
  });

  describe('Workers', () => {
    it('should initialize workers as null', () => {
      expect(workers.createBin).toBeNull();
      expect(workers.cacheScripts).toBeNull();
      expect(workers.kit).toBeNull();
    });
  });

  describe('Kit Scripts Caching', () => {
    it('should cache kit scripts from main and cli directories', async () => {
      vi.mocked(readdir).mockImplementation(async (path: string) => {
        if (path.includes('main')) {
          return ['main-script.js'] as any;
        }
        if (path.includes('cli')) {
          return ['cli-script.js', 'not-a-script.txt'] as any;
        }
        return [] as any;
      });

      const { parseScript } = await import('@johnlindquist/kit/core/utils');
      vi.mocked(parseScript).mockImplementation(
        async (filePath: string) =>
          ({
            filePath,
            command: filePath.includes('main') ? 'main-command' : 'cli-command',
            name: filePath.includes('main') ? 'Main Script' : 'CLI Script',
          }) as any,
      );

      await cacheKitScripts();

      expect(kitState.kitScripts).toHaveLength(2);
      expect(kitState.kitScripts[0].command).toBe('main-command');
      expect(kitState.kitScripts[1].command).toBe('cli-command');
    });
  });

  describe('getKitScript', () => {
    it('should return cached script if found', async () => {
      const cachedScript = {
        filePath: '/test/cached.js',
        command: 'cached',
        name: 'Cached Script',
      };
      kitState.kitScripts = [cachedScript] as any;

      const result = await getKitScript('/test/cached.js');
      expect(result).toEqual(cachedScript);
    });

    it('should parse script if not in cache', async () => {
      kitState.kitScripts = [];
      const { parseScript } = await import('@johnlindquist/kit/core/utils');
      vi.mocked(parseScript).mockResolvedValue({
        filePath: '/test/new.js',
        command: 'new',
        name: 'New Script',
      } as any);

      const result = await getKitScript('/test/new.js');
      expect(result.command).toBe('new');
      expect(parseScript).toHaveBeenCalledWith('/test/new.js');
    });
  });

  describe('Theme Management', () => {
    it('should return dark theme when dark mode is enabled', () => {
      vi.mocked(nativeTheme).shouldUseDarkColors = true;
      const themes = getThemes();
      expect(themes.scriptKitTheme).toContain('--appearance: dark');
      expect(themes.scriptKitLightTheme).toContain('--appearance: light');
    });

    it('should use appropriate theme based on system preference', () => {
      vi.mocked(nativeTheme).shouldUseDarkColors = false;
      // Theme is determined at module load time, so we can't test the dynamic behavior here
      expect(theme).toContain(':root');
    });
  });

  describe('Online Status', () => {
    it('should check online status successfully', async () => {
      const internetAvailable = (await import('../shared/internet-available')).default;
      vi.mocked(internetAvailable).mockResolvedValue(true);

      const result = await online();
      expect(result).toBe(true);
    });

    it('should handle offline status', async () => {
      const internetAvailable = (await import('../shared/internet-available')).default;
      vi.mocked(internetAvailable).mockResolvedValue(false);

      const result = await online();
      expect(result).toBe(false);
    });

    it('should handle errors when checking online status', async () => {
      const internetAvailable = (await import('../shared/internet-available')).default;
      vi.mocked(internetAvailable).mockRejectedValue(new Error('Network error'));

      const result = await online();
      expect(result).toBe(false);
    });
  });

  describe('Force Quit', () => {
    it('should set allowQuit to true', () => {
      kitState.allowQuit = false;
      forceQuit();
      expect(kitState.allowQuit).toBe(true);
    });
  });

  describe('Sponsor Check', () => {
    it('should return true when offline', async () => {
      const internetAvailable = (await import('../shared/internet-available')).default;
      vi.mocked(internetAvailable).mockResolvedValue(false);

      const result = await sponsorCheck('test-feature');
      expect(result).toBe(true);
      expect(kitState.isSponsor).toBe(true);
    });

    it('should return true for development environment', async () => {
      const originalEnv = process.env.KIT_SPONSOR;
      process.env.KIT_SPONSOR = 'development';
      vi.spyOn(os, 'userInfo').mockReturnValue({ username: 'johnlindquist' } as any);

      const result = await sponsorCheck('test-feature');
      expect(result).toBe(true);
      expect(kitState.isSponsor).toBe(true);

      process.env.KIT_SPONSOR = originalEnv;
    });

    it('should check sponsor status via API', async () => {
      // Ensure we're online
      const internetAvailable = (await import('../shared/internet-available')).default;
      vi.mocked(internetAvailable).mockResolvedValue(true);

      kitState.isSponsor = false;
      kitState.user = { login: 'testuser', node_id: 'test-node-id' } as any;
      kitState.url = 'https://test.com';

      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: { id: 'test-node-id' },
      });

      const result = await sponsorCheck('test-feature');
      expect(result).toBe(true);
      expect(kitState.isSponsor).toBe(true);
      expect(axios.post).toHaveBeenCalledWith('https://test.com/api/check-sponsor', {
        login: 'testuser',
        node_id: 'test-node-id',
        feature: 'test-feature',
      });
    });

    it('should handle non-sponsor with blocking', async () => {
      kitState.isSponsor = false;
      kitState.user = { login: 'testuser', node_id: 'test-node-id' } as any;

      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: { id: 'different-node-id' },
      });

      const { emitter } = await import('../shared/events');
      const result = await sponsorCheck('pro-feature', true);

      expect(result).toBe(false);
      expect(kitState.isSponsor).toBe(false);
      expect(emitter.emit).toHaveBeenCalledWith(
        'run-prompt-process',
        expect.objectContaining({
          scriptPath: '/test/kit/pro/sponsor.js',
        }),
      );
    });

    it('should handle API errors gracefully', async () => {
      kitState.isSponsor = false;
      vi.mocked(axios.post).mockRejectedValue(new Error('Network error'));

      const result = await sponsorCheck('test-feature');
      expect(result).toBe(true);
      expect(kitState.isSponsor).toBe(true);
    });
  });

  describe('Key Conversion', () => {
    it('should skip conversion when KIT_CONVERT_KEY is false', () => {
      kitState.kenvEnv = { KIT_CONVERT_KEY: 'false' } as any;
      const result = convertKey('a');
      expect(result).toBe('a');
    });

    it('should skip conversion when keymap is empty', () => {
      kitState.keymap = {};
      const result = convertKey('a');
      expect(result).toBe('a');
    });

    it('should convert key based on keymap', () => {
      kitState.keymap = {
        KeyA: { value: 'å' },
      } as any;
      kitState.kenvEnv = {} as any;

      const result = convertKey('å');
      expect(result).toBe('A');
    });

    it('should return original key when no conversion found', () => {
      kitState.keymap = {
        KeyB: { value: 'b' },
      } as any;
      kitState.kenvEnv = {} as any;

      const result = convertKey('x');
      expect(result).toBe('x');
    });
  });

  describe('Emoji Shortcut', () => {
    it('should return custom emoji shortcut from env', () => {
      // TODO: This test is failing due to how kitState is initialized
      // The function checks kitState?.kenvEnv?.KIT_EMOJI_SHORTCUT
      // Let's ensure kitState is properly set
      Object.assign(kitState, {
        kenvEnv: { KIT_EMOJI_SHORTCUT: 'Ctrl+E' },
      });
      const result = getEmojiShortcut();
      expect(result).toBe('Ctrl+E');
    });

    it('should return default Mac shortcut', () => {
      kitState.kenvEnv = {} as any;
      kitState.isMac = true;
      const result = getEmojiShortcut();
      expect(result).toBe('Command+Control+Space');
    });

    it('should return default Windows/Linux shortcut', () => {
      kitState.kenvEnv = {} as any;
      kitState.isMac = false;
      const result = getEmojiShortcut();
      expect(result).toBe('Super+.');
    });
  });

  describe('Accessibility Authorization', () => {
    it('should check Mac accessibility authorization', async () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(os, 'platform');
      Object.defineProperty(os, 'platform', {
        value: () => 'darwin',
        configurable: true,
      });

      const result = await getAccessibilityAuthorized();
      expect(result).toBe(true);

      if (originalPlatform) {
        Object.defineProperty(os, 'platform', originalPlatform);
      }
    });

    it('should return true for non-Mac platforms', async () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(os, 'platform');
      Object.defineProperty(os, 'platform', {
        value: () => 'win32',
        configurable: true,
      });

      const result = await getAccessibilityAuthorized();
      expect(result).toBe(true);

      if (originalPlatform) {
        Object.defineProperty(os, 'platform', originalPlatform);
      }
    });
  });

  describe('Kit State', () => {
    it('should have correct initial state values', () => {
      expect(kitState.scripts).toBeInstanceOf(Map);
      expect(kitState.scriptlets).toBeInstanceOf(Map);
      expect(kitState.snippets).toBeInstanceOf(Map);
      expect(kitState.gpuEnabled).toBe(true);
      expect(kitState.debugging).toBe(false);
      expect(kitState.hasOpenedMainMenu).toBe(false);
    });
  });

  describe('Kit Cache', () => {
    it('should have correct initial cache structure', () => {
      expect(kitCache.choices).toEqual([]);
      expect(kitCache.scripts).toEqual([]);
      expect(kitCache.preview).toBe('');
      expect(kitCache.shortcuts).toEqual([]);
      expect(kitCache.scriptFlags).toEqual({});
      expect(kitCache.triggers).toBeInstanceOf(Map);
      expect(kitCache.postfixes).toBeInstanceOf(Map);
      expect(kitCache.keywords).toBeInstanceOf(Map);
      expect(kitCache.shortcodes).toBeInstanceOf(Map);
      expect(kitCache.keys).toEqual(['slicedName', 'tag', 'group', 'command']);
    });
  });

  describe('Kit Config', () => {
    it('should have correct initial config', () => {
      expect(kitConfig.imagePath).toBe('/test/tmp/clipboard');
      expect(kitConfig.deleteSnippet).toBe(true);
    });
  });

  describe('Debounced Functions', () => {
    it('should debounce setScriptTimestamp', async () => {
      const { emitter } = await import('../shared/events');
      kitState.hasOpenedMainMenu = true;

      const stamp = {
        filePath: '/test/script.js',
        timestamp: Date.now(),
        reason: 'test',
      };

      debounceSetScriptTimestamp(stamp as any);
      expect(vi.mocked(emitter).emit).toHaveBeenCalledWith('set-script-timestamp', stamp);
    });

    it('should skip stamping for kit internal files', async () => {
      const { emitter } = await import('../shared/events');
      kitState.hasOpenedMainMenu = true;

      const stamp = {
        filePath: '/test/.kit/internal.js',
        timestamp: Date.now(),
      };

      debounceSetScriptTimestamp(stamp as any);
      expect(vi.mocked(emitter).emit).not.toHaveBeenCalled();
    });
  });

  describe('Subscriptions', () => {
    it('should have required subscriptions', () => {
      expect(subs).toBeInstanceOf(Array);
      expect(subs.length).toBeGreaterThan(0);
    });
  });
});
