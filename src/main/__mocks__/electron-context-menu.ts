import { vi } from 'vitest';

export default vi.fn(() => ({
  dispose: vi.fn(),
}));
