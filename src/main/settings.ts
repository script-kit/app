import { app } from 'electron';
import log from 'electron-log';
import { kitState } from '../shared/state';

export const checkOpenAtLogin = () => {
  try {
    if (process.env.NODE_ENV === 'development') {
      app.setLoginItemSettings({ openAtLogin: false });
      return;
    }

    const openAtLoginEnabled = kitState.kenvEnv.KIT_OPEN_AT_LOGIN !== 'false';
    const { openAtLogin } = app.getLoginItemSettings();

    if (openAtLogin !== openAtLoginEnabled) {
      log.info(
        `${
          openAtLoginEnabled
            ? `☑ Enable: Open Kit.app at login`
            : `◽️ Disable: Open Kit.app at login`
        }`,
      );
      app.setLoginItemSettings({ openAtLogin: openAtLoginEnabled });
    }
  } catch (error) {
    log.warn('Error setting login item settings', error);
  }
};

export const startSettings = async () => {
  checkOpenAtLogin();
};
