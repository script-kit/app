import Store from 'electron-store';
import { simplePath } from './helpers';

// eslint-disable-next-line import/prefer-default-export
export const cache = new Store({ name: 'simple', cwd: simplePath('cache') });
cache.clear();
