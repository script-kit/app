import Store from 'electron-store';
import { kenvPath } from './helpers';

let cache: Store | null = null;
export const getCache = () => cache;
export const createCache = () => {
  cache = new Store({ name: 'kit', cwd: kenvPath('cache') });
  cache.clear();
};
