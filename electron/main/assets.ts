/* eslint-disable import/prefer-default-export */
import { app } from 'electron';
import path from 'path';
import { readFileSync } from 'fs';

export function slash(p: string) {
  const isExtendedLengthPath = /^\\\\\?\\/.test(p);
  const hasNonAscii = /[^\u0000-\u0080]+/.test(p); // eslint-disable-line no-control-regex

  if (isExtendedLengthPath || hasNonAscii) {
    return p;
  }

  return p.replace(/\\/g, '/');
}

const checkPackaged = (name: string) =>
  app.isPackaged
    ? path.resolve(process.resourcesPath, name)
    : path.resolve(process.cwd(), name);

export const getAssetPath = (...paths: string[]): string => {
  return slash(path.resolve(checkPackaged('assets'), ...paths));
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

export const getArch = () => {
  try {
    return readFileSync(getAssetPath('arch.txt'), 'utf-8').trim();
  } catch (error) {
    return 'arm64';
  }
};

export const getPlatform = () => {
  try {
    return readFileSync(getAssetPath('platform.txt'), 'utf-8').trim();
  } catch (error) {
    return 'darwin';
  }
};

export const getPlatformExtension = (): string => {
  const platform = getPlatform();
  const win = platform.startsWith('win');
  const mac = platform.startsWith('darwin');
  const linux = platform.startsWith('linux');
  if (mac) return 'tar.gz';
  if (linux) return 'tar.xz';
  if (win) return 'zip';
  throw new Error('Unsupported platform');
};

export const getNodeVersion = () => {
  try {
    return readFileSync(getAssetPath('node.txt'), 'utf-8').trim();
  } catch (error) {
    return '7.2.0';
  }
};
