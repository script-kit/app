/* eslint-disable import/prefer-default-export */
import { app } from 'electron';
import path from 'path';

const checkPackaged = (name) =>
  app.isPackaged
    ? path.join(process.resourcesPath, name)
    : path.join(__dirname, '..', name);

export const getAssetPath = (...paths: string[]): string => {
  return path.join(checkPackaged('assets'), ...paths);
};
