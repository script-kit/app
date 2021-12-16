import { app } from 'electron';
import { getAppDb } from '@johnlindquist/kit/cjs/db';

// eslint-disable-next-line import/prefer-default-export
export const getVersion = () => {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line global-require
    return require('./package.json').version;
  }
  return app.getVersion();
};

export const storeVersion = async (version: string) => {
  const appDb = await getAppDb();
  appDb.version = version;
  await appDb.write();
};

export const getStoredVersion = async () => {
  return (await getAppDb()).version;
};
