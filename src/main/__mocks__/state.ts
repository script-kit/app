import { vi } from 'vitest';
import Store from 'electron-store';

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

// Create a mock store instance with required schema
export const kitStore = new Store({
  projectName: 'kit-test',
  schema: {
    KENV: {
      type: 'string',
      default: '',
    },
  },
});

// Mock themes
export const getThemes = () => ({
  scriptKitTheme: {
    name: 'Script Kit Dark',
    // Add any other theme properties needed
  },
  scriptKitLightTheme: {
    name: 'Script Kit Light',
    // Add any other theme properties needed
  },
});

// Ensure mock functions are available
kitStore.get.mockReturnValue('');
kitStore.set.mockReturnValue(undefined);

export const debounceSetScriptTimestamp = vi.fn();
export const sponsorCheck = vi.fn();
