import Store from 'electron-store';

// eslint-disable-next-line import/prefer-default-export
export const cache = new Store({ name: 'simple' });
cache.clear();
