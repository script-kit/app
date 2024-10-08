import { vi } from 'vitest';

vi.mock('electron', () => ({
  default: {
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
  },
}));
