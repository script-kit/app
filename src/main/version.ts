import fs from 'node:fs';
import { app } from 'electron';
import { getAssetPath } from '../shared/assets';
import { kitStore } from './state';

// eslint-disable-next-line import/prefer-default-export
export const getVersionFromText = () => {
  const versionPath = getAssetPath('version.txt');
  return fs.readFileSync(versionPath, 'utf8').trim();
};

export const getVersion = () => {
  const kitAppVersion = process.env?.KIT_APP_VERSION;
  if (kitAppVersion === 'undefined' || kitAppVersion === undefined) {
    if (process.env.NODE_ENV === 'development') {
      return getVersionFromText();
    }
    return app.getVersion();
  }
  return kitAppVersion.trim() || app.getVersion();
};

export const storeVersion = async (version: string) => {
  kitStore.set('version', version);
};

export const getStoredVersion = async () => {
  return kitStore.get('version');
};
