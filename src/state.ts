import Store from 'electron-store';

export const state = new Store({ name: 'state' });
export const NEEDS_RESTART = 'NEEDS_RESTART';
