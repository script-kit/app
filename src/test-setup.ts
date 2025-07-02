import { vi } from 'vitest';

// Mock electron modules before any imports
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      switch (name) {
        case 'userData': return '/test/userData';
        case 'downloads': return '/test/downloads';
        case 'home': return '/test/home';
        default: return '/test';
      }
    }),
    getName: vi.fn(() => 'ScriptKit'),
    getVersion: vi.fn(() => '1.0.0'),
    isReady: vi.fn(() => true),
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  clipboard: {
    readText: vi.fn(),
    writeText: vi.fn(),
    readImage: vi.fn(),
    has: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
  },
  Notification: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    show: vi.fn(),
  })),
  powerMonitor: {
    on: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    listeners: vi.fn(() => []),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: vi.fn(),
  },
}));

vi.mock('electron-context-menu', () => ({
  default: vi.fn(),
}));

vi.mock('electron-log', () => ({
  default: {
    create: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
      silly: vi.fn(),
      transports: {
        file: { level: 'info' },
        console: { level: false },
        ipc: { level: false },
      },
    })),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  },
}));

// Mock valtio
vi.mock('valtio', () => ({
  proxy: vi.fn((obj) => obj),
  snapshot: vi.fn((obj) => obj),
  subscribe: vi.fn(),
}));

vi.mock('valtio/utils', () => ({
  subscribeKey: vi.fn((obj, key, fn) => {
    // Return a mock unsubscribe function
    return () => {};
  }),
}));

// Mock shared state
vi.mock('./state', () => ({
  kitState: {
    trustedKenvs: [],
    snippet: '',
    isTyping: false,
    typedText: '',
    typedLimit: 100,
    kenvEnv: {},
  },
  kitConfig: {
    deleteSnippet: true,
  },
  kitClipboard: {
    store: null,
  },
  kitStore: {
    get: vi.fn(),
    set: vi.fn(),
  },
  subs: [],
}));

// Mock shared events
vi.mock('../shared/events', () => ({
  KitEvent: {
    RunPromptProcess: 'RunPromptProcess',
  },
  emitter: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// Mock shared enums
vi.mock('../shared/enums', () => ({
  Trigger: {
    Snippet: 'snippet',
    System: 'system',
    Info: 'info',
    RunTxt: 'runTxt',
  },
}));

// Mock kit paths
vi.mock('@johnlindquist/kit/core/utils', () => ({
  kitPath: vi.fn((...args) => path.join('/test/kit', ...args)),
  kenvPath: vi.fn((...args) => path.join('/test/kenv', ...args)),
  tmpClipboardDir: '/test/tmp/clipboard',
  parseScript: vi.fn(),
  getKenvFromPath: vi.fn(),
  resolveToScriptPath: vi.fn(),
}));

// Mock other utilities
vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn(),
      getWatched: vi.fn(() => ({})),
      add: vi.fn(),
      unwatch: vi.fn(),
    })),
  },
}));

vi.mock('globby', () => ({
  globby: vi.fn(() => Promise.resolve([])),
}));

vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn) => fn),
  isEqual: vi.fn(),
  omit: vi.fn(),
}));

import path from 'node:path';