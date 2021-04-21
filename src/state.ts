import { app } from 'electron';
import Store from 'electron-store';

const NEEDS_RESTART = 'NEEDS_RESTART';
const REQUIRES_SETUP = 'UPDATED';

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

export const setRequiresSetup = (updated: boolean) => {
  state.set(REQUIRES_SETUP, updated);
};

export const getRequiresSetup = () => {
  return state.get(REQUIRES_SETUP, true);
};
