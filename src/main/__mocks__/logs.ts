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

export const createLogInstance = vi.fn(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  verbose: vi.fn(),
}));
