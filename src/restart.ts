import { app } from 'electron';
import Store from 'electron-store';

const NEEDS_RESTART = 'NEEDS_RESTART';

const state = new Store({ name: 'state' });

export const makeRestartNecessary = () => {
  state.set(NEEDS_RESTART, true);
};
export const restartIfNecessary = () => {
  if (state.get(NEEDS_RESTART)) {
    state.set(NEEDS_RESTART, false);
    app.relaunch();
    app.exit(0);
  }
};
