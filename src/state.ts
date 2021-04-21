import { app } from 'electron';
import Store from 'electron-store';

const NEEDS_RESTART = 'NEEDS_RESTART';
const STORE_VERSION = 'version';

const state = new Store({ name: 'state' });

export const makeRestartNecessary = () => {
  state.set(NEEDS_RESTART, true);
};
export const restartIfNecessary = () => {
  if (state.get(NEEDS_RESTART)) {
    state.set(NEEDS_RESTART, false);
    app.exit(0);
  }
};

export const storeVersion = (version: string) => {
  state.set(STORE_VERSION, version);
};

export const getStoredVersion = () => {
  return state.get(STORE_VERSION, '0.0.0');
};
