import { app } from 'electron';

// eslint-disable-next-line import/prefer-default-export
export const getVersion = () => {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line global-require
    return require('./package.json').version;
  }
  return app.getVersion();
};
