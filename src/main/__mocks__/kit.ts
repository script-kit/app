import path from 'node:path';
import { vi } from 'vitest';

export const runScript = vi.fn();
export const setupKit = vi.fn();

export const clearPromptCache = vi.fn();
export const clearPromptCacheFor = vi.fn();
export const setKitStateAtom = vi.fn();

export const parseScript = vi.fn(async (filePath: string) => ({
  filePath,
  name: path.basename(filePath),
}));

export const kenvPath = (...parts: string[]) => path.join('/mocked/kenv', ...parts);
export const kitPath = (...parts: string[]) => path.join('/mocked/kit', ...parts);

export const kitState = {
  ready: true,
  ignoreInitial: false,
  scripts: new Map(),
  user: {},
  kenvEnv: {},
  sponsorCheck: vi.fn(),
  trayOpen: false,
  suspendWatchers: false,
  waitingForPing: false,
  isSponsor: false,
  typedLimit: 100,
  trustedKenvs: [],
  trustedKenvsKey: 'KIT_TRUSTED_KENVS',
  scriptlets: new Map(),
  tempTheme: '',
  isDark: false,
  noPreview: false,
  firstBatch: false,
};

export const debounceSetScriptTimestamp = vi.fn();
export const sponsorCheck = vi.fn();
