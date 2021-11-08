import { app, autoUpdater } from 'electron';
import { existsSync } from 'fs';
import { kitPath } from '@johnlindquist/kit/cjs/utils';

// eslint-disable-next-line import/prefer-default-export
export const getVersion = () => {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line global-require
    return require('./package.json').version;
  }
  return app.getVersion();
};

export const kitIsGit = () => {
  const isGit = existsSync(kitPath('.kitignore'));

  return isGit;
};

export const checkForUpdates = () => {
  if (!kitIsGit) {
    autoUpdater.checkForUpdates();
  }
};
