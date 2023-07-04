/* eslint-disable import/prefer-default-export */
import { app } from 'electron';
import path from 'path';
import { readFileSync } from 'fs';
import os from 'os';

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
    : path.resolve(__dirname, '..', name);

export const getAssetPath = (...paths: string[]): string => {
  return slash(path.resolve(checkPackaged('assets'), ...paths)).trim();
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
    return '18.16.0';
  }
};
