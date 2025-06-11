import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.electron for renderer tests
Object.defineProperty(window, 'electron', {
  value: {
    ipcRenderer: {
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      invoke: vi.fn(),
    },
  },
  writable: true,
});
