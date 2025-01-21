import { vi } from 'vitest';
import path from 'node:path';

export const parseScript = vi.fn(async (filePath: string) => ({
  filePath,
  name: path.basename(filePath),
}));

export const kenvPath = (...parts: string[]) => path.join('/mocked/kenv', ...parts);
export const kitPath = (...parts: string[]) => path.join('/mocked/kit', ...parts);
