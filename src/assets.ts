/* eslint-disable import/prefer-default-export */
import { app } from 'electron';
import path from 'path';

const ASSETS_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../assets');

export const getAssetPath = (...paths: string[]): string => {
  return path.join(ASSETS_PATH, ...paths);
};
