import { vi } from 'vitest';

class Store {
  constructor() {
    return {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(),
      onDidChange: vi.fn(),
    };
  }
}

export default Store;
