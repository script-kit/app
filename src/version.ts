import { app, autoUpdater } from 'electron';
import log from 'electron-log';
import { existsSync } from 'fs';
import { kitPath, appDbPath } from '@johnlindquist/kit/cjs/utils';
import { getAppDb } from '@johnlindquist/kit/cjs/db';

// eslint-disable-next-line import/prefer-default-export
export const getVersion = () => {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line global-require
    return require('./package.json').version;
  }
  return app.getVersion();
};

export const kitIgnore = () => {
  const isGit = existsSync(kitPath('.kitignore'));
  log.info(`${isGit ? `Found` : `Didn't find`} ${kitPath('.kitignore')}`);
  return isGit;
};

export const checkForUpdates = async () => {
  const autoUpdate = existsSync(appDbPath)
    ? (await getAppDb())?.autoUpdate
    : true;

  if (!kitIgnore() && autoUpdate) {
    log.info(`AutoUpdater go!`);
    autoUpdater.checkForUpdates();
  }
};
