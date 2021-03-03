import Store from 'electron-store';
import { kenv } from './helpers';

let cache: Store | null = null;
export const getCache = () => cache;
export const createCache = () => {
  cache = new Store({ name: 'kit', cwd: kenv('cache') });
  cache.clear();
};
