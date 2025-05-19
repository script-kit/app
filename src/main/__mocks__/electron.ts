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

const mockNativeTheme = {
  shouldUseDarkColors: false,
  themeSource: 'system',
  on: vi.fn(),
};

// Create a proper event emitter for powerMonitor
const mockPowerMonitor = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  emit: vi.fn(),
};

// Export all mocks as a single object
export default {
  // Also include named exports
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: mockIpcMain,
  screen: mockScreen,
  shell: mockShell,
  powerMonitor: mockPowerMonitor,
  nativeTheme: mockNativeTheme,
};
