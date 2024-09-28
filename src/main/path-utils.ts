import path from 'node:path';
import { kenvPath, kitPath } from '@johnlindquist/kit/core/utils';

const windowsSlashRE = /\\/g;
export function slash(p: string): string {
  return p.replace(windowsSlashRE, '/');
}

export const kitChokidarPath = (...parts: string[]) => {
  return slash(kitPath(...parts));
};

export const kenvChokidarPath = (...parts: string[]) => {
  return slash(kenvPath(...parts));
};

export const pathChokidarResolve = (...parts: string[]) => {
  return slash(path.resolve(...parts));
};
