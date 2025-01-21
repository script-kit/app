import { vi } from 'vitest';

export const snapshot = vi.fn((obj) => obj);
export const subscribe = vi.fn();
export const subscribeKey = vi.fn();

// For valtio/utils
export const utils = {
  subscribeKey: vi.fn(),
};
