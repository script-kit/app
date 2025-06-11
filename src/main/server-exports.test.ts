import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, stopServer } from './server';

// Mock dependencies
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
  },
}));

vi.mock('./logs', () => ({
  serverLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('./state', () => ({
  kitState: {
    serverRunning: false,
    kenvEnv: {},
  },
}));

vi.mock('./serverTrayUtils', () => ({
  getServerPort: vi.fn(() => 5173),
}));

vi.mock('bonjour-service', () => ({
  Bonjour: vi.fn().mockImplementation(() => ({
    publish: vi.fn(() => ({
      on: vi.fn(),
    })),
  })),
}));

describe('Server Exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure server is stopped after each test
    stopServer();
  });

  it('should export startServer function', () => {
    expect(startServer).toBeDefined();
    expect(typeof startServer).toBe('function');
  });

  it('should export stopServer function', () => {
    expect(stopServer).toBeDefined();
    expect(typeof stopServer).toBe('function');
  });

  it('should start server when startServer is called', () => {
    const mockListen = vi.fn((_port, callback) => {
      callback();
    });

    // Mock http.createServer
    vi.doMock('http', () => ({
      default: {
        createServer: vi.fn(() => ({
          listen: mockListen,
        })),
      },
    }));

    startServer();

    // Server should be marked as running
    expect(mockListen).toHaveBeenCalledWith(5173, expect.any(Function));
  });

  it('should not start server if already running', () => {
    const { serverLog } = require('./logs');

    // Start server first time
    startServer();
    vi.clearAllMocks();

    // Try to start again
    startServer();

    // Should warn about server already running
    expect(serverLog.warn).toHaveBeenCalledWith('Server is already running');
  });
});
