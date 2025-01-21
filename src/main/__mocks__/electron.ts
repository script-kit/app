import { vi } from 'vitest';

// Everything you need from electron
const mockApp = {
  getPath: vi.fn(),
  getVersion: vi.fn(() => '1.0.0'),
  on: vi.fn(),
  quit: vi.fn(),
  isPackaged: false,
};

const mockBrowserWindow = vi.fn().mockImplementation(() => ({
  loadURL: vi.fn(),
  on: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
  close: vi.fn(),
  destroy: vi.fn(),
  webContents: {
    on: vi.fn(),
    send: vi.fn(),
  },
}));

const mockIpcMain = {
  on: vi.fn(),
  handle: vi.fn(),
  removeHandler: vi.fn(),
  removeAllListeners: vi.fn(),
};

const mockScreen = {
  getPrimaryDisplay: vi.fn(() => ({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
  })),
  getAllDisplays: vi.fn(() => [
    {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    },
  ]),
};

const mockShell = {
  openExternal: vi.fn(),
  openPath: vi.fn(),
};

// Create a proper event emitter for powerMonitor
const listeners = new Map();
const mockPowerMonitor = {
  addListener: vi.fn((event: string, callback: () => void) => {
    if (!listeners.has(event)) {
      listeners.set(event, []);
    }
    listeners.get(event).push(callback);
  }),
  removeListener: vi.fn((event: string, callback: () => void) => {
    if (listeners.has(event)) {
      const callbacks = listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }),
  removeAllListeners: vi.fn((event?: string) => {
    if (event) {
      listeners.delete(event);
    } else {
      listeners.clear();
    }
  }),
  // Helper method to emit events (not part of the actual electron API)
  emit: (event: string) => {
    if (listeners.has(event)) {
      listeners.get(event).forEach((callback: () => void) => callback());
    }
  },
};

// Provide both default and named exports
export {
  mockApp as app,
  mockBrowserWindow as BrowserWindow,
  mockIpcMain as ipcMain,
  mockScreen as screen,
  mockShell as shell,
  mockPowerMonitor as powerMonitor,
};

// Default export for compatibility
export default {
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: mockIpcMain,
  screen: mockScreen,
  shell: mockShell,
  powerMonitor: mockPowerMonitor,
};
