import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* eslint-disable import/prefer-default-export */
import { app } from 'electron';
import { createLogger } from '../shared/log-utils';
const log = createLogger('assets.ts');

export function slash(p: string) {
  const isExtendedLengthPath = /^\\\\\?\\/.test(p);
  const hasNonAscii = /[^\u0000-\u0080]+/.test(p); // eslint-disable-line no-control-regex

  if (isExtendedLengthPath || hasNonAscii) {
    return p;
  }

  return p.replace(/\\/g, '/');
}

const checkPackaged = (name: string) => {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  // log.info({
  //   dirname,
  //   name,
  //   isPackaged: app.isPackaged,
  //   resourcesPath: process.resourcesPath,
  // });
  return app.isPackaged
    ? path.resolve(process.resourcesPath, 'app.asar.unpacked', name)
    : path.resolve(dirname, '..', '..', name);
};

export const getAssetPath = (...paths: string[]): string => {
  const assetPath = slash(path.resolve(checkPackaged('assets'), ...paths)).trim();
  log.info(`Asset: ${assetPath}`);
  return assetPath;
};

export const getBinPath = (...paths: string[]): string => {
  return slash(path.join(checkPackaged(''), ...paths));
};

export const getReleaseChannel = () => {
  try {
    return readFileSync(getAssetPath('release_channel.txt'), 'utf-8').trim();
  } catch (error) {
    return 'main';
  }
};

export const getPlatformExtension = (): string => {
  const platform = os.platform();
  const win = platform.startsWith('win');
  return win ? 'zip' : 'tar.gz';
};

export const getNodeVersion = () => {
  try {
    return readFileSync(getAssetPath('node.txt'), 'utf-8').trim();
  } catch (error) {
    return '18.18.2';
  }
};
