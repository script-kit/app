import { app } from 'electron';
import fs from 'fs';
import { getAssetPath } from '../shared/assets';
import { kitStore } from '../shared/state';

// eslint-disable-next-line import/prefer-default-export
export const getVersionFromText = () => {
  return `1.0.0`;
  // TODO: FIX
  // const versionPath = getAssetPath('version.txt');
  // return fs.readFileSync(versionPath, 'utf8').trim();
};

export const getVersion = () => {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line global-require
    return getVersionFromText();
  }
  return app.getVersion();
};

export const storeVersion = async (version: string) => {
  kitStore.set('version', version);
};

export const getStoredVersion = async () => {
  return kitStore.get('version');
};
