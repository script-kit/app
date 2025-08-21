import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock electron
vi.mock('electron', () => {
  const mockApp = {
    getPath: vi.fn((name: string) => {
      switch (name) {
        case 'userData': return '/Users/test/Library/Application Support/ScriptKit';
        case 'downloads': return '/Users/test/Downloads';
        case 'home': return '/Users/test';
        case 'logs': return '/Users/test/Library/Logs/ScriptKit';
        default: return '/Users/test';
      }
    }),
    quit: vi.fn(),
    exit: vi.fn(),
    getName: vi.fn(() => 'ScriptKit'),
    getVersion: vi.fn(() => '1.0.0'),
    isReady: vi.fn(() => true),
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    isPackaged: false,
    setAppLogsPath: vi.fn(),
  };

  return {
    default: { app: mockApp },
    app: mockApp,
    BrowserWindow: Object.assign(vi.fn().mockImplementation(() => ({
      loadURL: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      close: vi.fn(),
      destroy: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
      webContents: {
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        removeAllListeners: vi.fn(),
        send: vi.fn(),
        executeJavaScript: vi.fn(),
      },
    })), {
      getAllWindows: vi.fn(() => []),
    }),
    crashReporter: {
      start: vi.fn(),
    },
    powerMonitor: {
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      listeners: vi.fn(() => []),
    },
    nativeTheme: {
      shouldUseDarkColors: false,
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
    },
  };
});

// Mock electron-log
const mockLog = {
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
  transports: {
    file: { level: 'info' },
    console: { level: false },
    ipc: { level: false },
  },
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  silly: vi.fn(),
};

vi.mock('electron-log', () => ({
  ...mockLog,
  default: mockLog,
}));

// Mock electron-store
vi.mock('electron-store', () => {
  const MockStore = vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    has: vi.fn(() => false),
    store: {},
  }));
  return { default: MockStore };
});

// Mock node:os
vi.mock('node:os', () => ({
  default: {
    arch: vi.fn(() => 'x64'),
    cpus: vi.fn(() => []),
    endianness: vi.fn(() => 'LE'),
    freemem: vi.fn(() => 1000000),
    getPriority: vi.fn(() => 0),
    homedir: vi.fn(() => '/Users/test'),
    hostname: vi.fn(() => 'test-host'),
    loadavg: vi.fn(() => [0, 0, 0]),
    machine: vi.fn(() => 'x86_64'),
    networkInterfaces: vi.fn(() => ({})),
    platform: vi.fn(() => 'darwin'),
    release: vi.fn(() => '1.0.0'),
    setPriority: vi.fn(),
    tmpdir: vi.fn(() => '/tmp'),
    totalmem: vi.fn(() => 2000000),
    type: vi.fn(() => 'Darwin'),
    uptime: vi.fn(() => 1000),
    userInfo: vi.fn(() => ({
      uid: 1000,
      gid: 1000,
      username: 'test',
      homedir: '/Users/test',
      shell: '/bin/bash'
    })),
    version: vi.fn(() => 'v1.0.0'),
    constants: {
      signals: {
        SIGHUP: 1,
        SIGINT: 2,
        SIGQUIT: 3,
        SIGILL: 4,
        SIGTRAP: 5,
        SIGABRT: 6,
        SIGIOT: 6,
        SIGBUS: 7,
        SIGFPE: 8,
        SIGKILL: 9,
        SIGUSR1: 10,
        SIGSEGV: 11,
        SIGUSR2: 12,
        SIGPIPE: 13,
        SIGALRM: 14,
        SIGTERM: 15,
        SIGCHLD: 17,
        SIGCONT: 18,
        SIGSTOP: 19,
        SIGTSTP: 20,
        SIGTTIN: 21,
        SIGTTOU: 22,
        SIGURG: 23,
        SIGXCPU: 24,
        SIGXFSZ: 25,
        SIGVTALRM: 26,
        SIGPROF: 27,
        SIGWINCH: 28,
        SIGIO: 29,
        SIGPOLL: 29,
        SIGPWR: 30,
        SIGSYS: 31,
        SIGUNUSED: 31,
      },
      errno: {},
      priority: {}
    }
  },
  arch: vi.fn(() => 'x64'),
  cpus: vi.fn(() => []),
  endianness: vi.fn(() => 'LE'),
  freemem: vi.fn(() => 1000000),
  getPriority: vi.fn(() => 0),
  homedir: vi.fn(() => '/Users/test'),
  hostname: vi.fn(() => 'test-host'),
  loadavg: vi.fn(() => [0, 0, 0]),
  machine: vi.fn(() => 'x86_64'),
  networkInterfaces: vi.fn(() => ({})),
  platform: vi.fn(() => 'darwin'),
  release: vi.fn(() => '1.0.0'),
  setPriority: vi.fn(),
  tmpdir: vi.fn(() => '/tmp'),
  totalmem: vi.fn(() => 2000000),
  type: vi.fn(() => 'Darwin'),
  uptime: vi.fn(() => 1000),
  userInfo: vi.fn(() => ({
    uid: 1000,
    gid: 1000,
    username: 'test',
    homedir: '/Users/test',
    shell: '/bin/bash'
  })),
  version: vi.fn(() => 'v1.0.0'),
  constants: {
    signals: {
      SIGHUP: 1,
      SIGINT: 2,
      SIGQUIT: 3,
      SIGILL: 4,
      SIGTRAP: 5,
      SIGABRT: 6,
      SIGIOT: 6,
      SIGBUS: 7,
      SIGFPE: 8,
      SIGKILL: 9,
      SIGUSR1: 10,
      SIGSEGV: 11,
      SIGUSR2: 12,
      SIGPIPE: 13,
      SIGALRM: 14,
      SIGTERM: 15,
      SIGCHLD: 17,
      SIGCONT: 18,
      SIGSTOP: 19,
      SIGTSTP: 20,
      SIGTTIN: 21,
      SIGTTOU: 22,
      SIGURG: 23,
      SIGXCPU: 24,
      SIGXFSZ: 25,
      SIGVTALRM: 26,
      SIGPROF: 27,
      SIGWINCH: 28,
      SIGIO: 29,
      SIGPOLL: 29,
      SIGPWR: 30,
      SIGSYS: 31,
      SIGUNUSED: 31,
    },
    errno: {},
    priority: {}
  }
}));

// Mock node-pty
vi.mock('node-pty', () => ({
  spawn: vi.fn((shell, args, options) => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
    process: shell,
  })),
  IPtyForkOptions: {},
}));

// Mock electron-is-dev
vi.mock('electron-is-dev', () => ({
  default: false,
}));

// Mock valtio to prevent subscribeKey errors
vi.mock('valtio/utils', () => ({
  subscribeKey: vi.fn(() => () => { }), // Return unsubscribe function
}));

// Mock @johnlindquist/kit/core/utils
vi.mock('@johnlindquist/kit/core/utils', () => ({
  getLogFromScriptPath: vi.fn((scriptPath: string) => `/tmp/logs/${scriptPath}.log`),
  kenvPath: vi.fn((subpath?: string) => subpath ? `/tmp/.kenv/${subpath}` : '/tmp/.kenv'),
  kitPath: vi.fn((subpath?: string) => subpath ? `/tmp/.kit/${subpath}` : '/tmp/.kit'),
  tmpClipboardDir: '/tmp/clipboard',
  getTrustedKenvsKey: vi.fn(() => 'trusted-kenvs'),
  defaultGroupNameClassName: vi.fn(() => 'default-group'),
  defaultGroupClassName: vi.fn(() => 'default-group-class'),
  // Add other exports as needed
}));

// Mock fs module
vi.mock('fs', () => {
  const fs = require('fs');
  return {
    ...fs,
    default: fs,
    realpathSync: vi.fn((path: string) => path),
  };
});

// Mock log-utils
vi.mock('src/main/log-utils', () => ({
  createLogger: vi.fn((prefix: string) => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
    green: vi.fn(),
    yellow: vi.fn(),
    purple: vi.fn(),
    red: vi.fn(),
    only: vi.fn(),
    off: false,
  })),
}));

// Also mock with relative path for files that import with relative paths
vi.mock('../log-utils', () => ({
  createLogger: vi.fn((prefix: string) => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
    green: vi.fn(),
    yellow: vi.fn(),
    purple: vi.fn(),
    red: vi.fn(),
    only: vi.fn(),
    off: false,
  })),
}));


// Mock window.electron for renderer tests
if (typeof window !== 'undefined') {
  (window as any).electron = {
    ipcRenderer: {
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      invoke: vi.fn(),
    },
    store: {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      openInEditor: vi.fn(),
    },
  };
}
