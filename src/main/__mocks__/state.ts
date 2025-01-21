import { vi } from 'vitest';

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
