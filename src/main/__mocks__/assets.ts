import path from 'node:path';
import { vi } from 'vitest';

export const slash = (p: string) => p.replace(/\\/g, '/');

export const getAssetPath = vi.fn((...paths: string[]) => {
  return path.join('/mocked/assets', ...paths);
});

export const getBinPath = vi.fn((...paths: string[]) => {
  return path.join('/mocked/bin', ...paths);
});

export const getReleaseChannel = vi.fn(() => 'main');

export const getPlatformExtension = vi.fn(() => '.exe');

export const getNodeVersion = vi.fn(() => '18.0.0');
