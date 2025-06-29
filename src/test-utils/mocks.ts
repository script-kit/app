import { vi } from 'vitest';

export function createElectronLogMock() {
  return () => ({
    default: {
      create: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn(),
        transports: {
          file: vi.fn(),
          console: vi.fn(),
        },
      })),
      transports: {
        file: vi.fn(),
        console: vi.fn(),
      },
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
      silly: vi.fn(),
    },
    create: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
      silly: vi.fn(),
      transports: {
        file: vi.fn(),
        console: vi.fn(),
      },
    })),
    transports: {
      file: vi.fn(),
      console: vi.fn(),
    },
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  });
}

export function createElectronStoreMock() {
  return () => {
    const MockStore = vi.fn().mockImplementation(() => ({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(() => false),
      store: {},
    }));
    return { default: MockStore };
  };
}

export function createNodeOsMock() {
  return {
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
        shell: '/bin/bash',
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
        priority: {},
      },
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
      shell: '/bin/bash',
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
      priority: {},
    },
  };
}

export function createElectronMock() {
  return {
    app: {
      getPath: vi.fn((name: string) => {
        switch (name) {
          case 'userData':
            return '/Users/test/Library/Application Support/ScriptKit';
          case 'downloads':
            return '/Users/test/Downloads';
          case 'home':
            return '/Users/test';
          default:
            return '/Users/test';
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
    },
    BrowserWindow: vi.fn().mockImplementation(() => ({
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
    })),
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
}

export function createHoistedElectronMock() {
  return {
    app: {
      getPath: vi.fn((name: string) => {
        switch (name) {
          case 'userData':
            return '/Users/test/Library/Application Support/ScriptKit';
          case 'downloads':
            return '/Users/test/Downloads';
          case 'home':
            return '/Users/test';
          default:
            return '/Users/test';
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
    },
    BrowserWindow: vi.fn().mockImplementation(() => ({
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
    })),
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
}

export function setupCommonMocks() {
  // Mock electron
  vi.mock('electron', createElectronMock);

  // Mock electron-log
  vi.mock('electron-log', createElectronLogMock);

  // Mock electron-store
  vi.mock('electron-store', createElectronStoreMock);

  // Mock node:os
  vi.mock('node:os', createNodeOsMock);
}
