import { app } from 'electron';
import log from 'electron-log';
import { disableOldAutoLaunch } from './launch';
import { container } from './state/services/container';

export const checkOpenAtLogin = () => {
  try {
    if (process.env.NODE_ENV === 'development') {
      app.setLoginItemSettings({ openAtLogin: false });
      return;
    }

    const openAtLoginEnabled = container.getConfig().isOpenAtLoginEnabled();
    const { openAtLogin } = app.getLoginItemSettings();

    if (openAtLogin !== openAtLoginEnabled) {
      log.info(`${openAtLoginEnabled ? '☑ Enable: Open Kit.app at login' : '◽️ Disable: Open Kit.app at login'}`);
      app.setLoginItemSettings({ openAtLogin: openAtLoginEnabled });
    }
  } catch (error) {
    log.warn('Error setting login item settings', error);
  }
};

export const startSettings = async () => {
  checkOpenAtLogin();
  await disableOldAutoLaunch();
};
