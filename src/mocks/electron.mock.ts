import { vi } from 'vitest';

// src/mocks/electron.mock.ts
export default {
  app: {
    whenReady: vi.fn().mockResolvedValue(true),
    // Add other mocked Electron APIs as needed
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadFile: vi.fn(),
  })),
  crashReporter: {
    start: vi.fn(),
  },
  // Include other properties/methods you use from electron
};
