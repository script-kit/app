import Store from 'electron-store';
import { sk } from './helpers';

let cache: Store | null = null;
export const getCache = () => cache;
export const createCache = () => {
  cache = new Store({ name: 'kit', cwd: sk('cache') });
  cache.clear();
};
