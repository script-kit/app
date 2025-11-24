import { vi } from 'vitest';

// Use hoisted mocks for modules that need them
const mockElectronBase = vi.hoisted(() => ({
  app: {
    getPath: vi.fn((name: string) => {
      switch (name) {
        case 'userData': return '/Users/test/Library/Application Support/ScriptKit';
        case 'downloads': return '/Users/test/Downloads';
        case 'home': return '/Users/test';
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
}));

vi.mock('electron', () => ({
  default: mockElectronBase,
  ...mockElectronBase,
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
}));

vi.mock('electron-store', () => {
  class MockStore {
    get = vi.fn();
    set = vi.fn();
    delete = vi.fn();
    clear = vi.fn();
    has = vi.fn(() => false);
    store = {};
  }
  return { default: MockStore };
});

import { invoke } from '../src/main/invoke-pty';
import { describe, it } from "vitest"
import assert from "node:assert"
import path from "node:path"
import os from "node:os"

// describe('invoke-pty', () => {
//   it('should return the result of the command', async () => {
//     const result = await invoke('which pnpm');
//     console.log({ result });
//     assert(result);
//   });
// });

const kitPath = ()=> path.join(os.homedir(), '.kit');

describe('invoke-pty with cwd', () => {
  it.skip('should return the result of the command', async () => {
    const result = await invoke('pnpm node --version', kitPath());
    console.log({ result });
    assert(result);
  });
});


describe('invoke-pty with quotes in command', () => {
  it.skip('should return the result of the command', async () => {
    const pnpmPath = '/Users/johnlindquist/Library/pnpm/pnpm'
    const result = await invoke(`"${pnpmPath}" node -e "console.log(process.execPath)"`, kitPath());
    console.log({ result });
    assert(result);
  });
});

