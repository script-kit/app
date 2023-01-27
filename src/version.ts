import { app } from 'electron';
import { getAppDb } from '@johnlindquist/kit/cjs/db';
import log from 'electron-log';
import fs from 'fs';
import { getAssetPath } from './assets';

// eslint-disable-next-line import/prefer-default-export
export const getVersionFromText = () => {
  const versionPath = getAssetPath('version.txt');
  return fs.readFileSync(versionPath, 'utf8').trim();
};

export const getVersion = () => {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line global-require
    return getVersionFromText();
  }
  return app.getVersion();
};

export const storeVersion = async (version: string) => {
  const appDb = await getAppDb();
  appDb.version = version;

  try {
    await appDb.write();
  } catch (error) {
    log.info(error);
  }
};

export const getStoredVersion = async () => {
  return (await getAppDb()).version;
};
