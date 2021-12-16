/* eslint-disable import/prefer-default-export */
import { app } from 'electron';
import path from 'path';
import { readFileSync } from 'fs';

const checkPackaged = (name: string) =>
  app.isPackaged
    ? path.join(process.resourcesPath, name)
    : path.join(__dirname, '..', name);

export const getAssetPath = (...paths: string[]): string => {
  return path.join(checkPackaged('assets'), ...paths);
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

export const getNodeVersion = () => {
  try {
    return readFileSync(getAssetPath('node.txt'), 'utf-8').trim();
  } catch (error) {
    return '7.2.0';
  }
};
