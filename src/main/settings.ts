import { app } from 'electron';
import log from 'electron-log';
import { subscribeKey } from 'valtio/utils';
import { appDb } from '../shared/state';

export const startSettings = async () => {
  const handler = () => {
    try {
      if (process.env.NODE_ENV === 'development') {
        app.setLoginItemSettings({ openAtLogin: false });
        return;
      }

      const openAtLoginEnabled = appDb.openAtLogin;
      const { openAtLogin } = app.getLoginItemSettings();

      if (openAtLogin !== openAtLoginEnabled) {
        log.info(
          `${
            openAtLoginEnabled
              ? `☑ Enable: Open Kit.app at login`
              : `◽️ Disable: Open Kit.app at login`
          }`
        );
        app.setLoginItemSettings({ openAtLogin: openAtLoginEnabled });
      }
    } catch (error) {
      log.warn('Error setting login item settings', error);
    }
  };

  handler();
  subscribeKey(appDb, 'openAtLogin', handler);
};
