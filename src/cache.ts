import Store from 'electron-store';
import { simplePath } from './helpers';

let cache: Store | null = null;
export const getCache = () => cache;
export const createCache = () => {
  cache = new Store({ name: 'simple', cwd: simplePath('cache') });
  cache.clear();
};
