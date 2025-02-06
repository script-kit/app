import { vi } from 'vitest';

export const subs = [];

export const scriptLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

export const watcherLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  verbose: vi.fn(),
};

const createMockLogInstance = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  verbose: vi.fn(),
  transports: {
    file: {
      level: 'info',
      resolvePathFn: vi.fn(),
    },
    console: {
      level: 'info',
    },
  },
});

export const createLogInstance = vi.fn(() => createMockLogInstance());

// Add missing exports for schedule tests
export const scheduleLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  verbose: vi.fn(),
  create: vi.fn(() => createMockLogInstance()),
  transports: {
    file: {
      level: 'info',
      resolvePathFn: vi.fn(),
    },
    console: {
      level: 'info',
    },
  },
};

// Add system log
export const systemLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  verbose: vi.fn(),
};

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  verbose: vi.fn(),
  create: vi.fn(() => createMockLogInstance()),
  transports: {
    file: {
      level: 'info',
      resolvePathFn: vi.fn(),
    },
    console: {
      level: 'info',
    },
  },
};

export { mockLog as default };
