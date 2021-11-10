import { app, BrowserWindow, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { existsSync } from 'fs';
import {
  kitPath,
  appDbPath,
  KIT_FIRST_PATH,
} from '@johnlindquist/kit/cjs/utils';
import { getAppDb } from '@johnlindquist/kit/cjs/db';
import { spawn } from 'child_process';
import { destroyTray } from './tray';
import { getVersion, storeVersion } from './version';
import { emitter, KitEvent } from './events';

const callBeforeQuitAndInstall = () => {
  try {
    destroyTray();
    app.removeAllListeners('window-all-closed');
    const browserWindows = BrowserWindow.getAllWindows();
    browserWindows.forEach((browserWindow) => {
      browserWindow.removeAllListeners('close');
      browserWindow?.destroy();
    });
  } catch (e) {
    console.log(e);
  }
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
    log.info(`Auto-update enabled. Checking for update.`);
    autoUpdater.checkForUpdates();
  }
};

const parseChannel = (version: string) => {
  if (version.includes('development')) return 'development';
  if (version.includes('alpha')) return 'alpha';
  if (version.includes('beta')) return 'beta';

  return 'main';
};

let manualUpdateCheck = false;
export const configureAutoUpdate = async () => {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  let updateDownloaded = false;

  const applyUpdate = async (info: any) => {
    const version = getVersion();
    const newVersion = info?.version;

    try {
      log.info(`⏫ Updating from ${version} to ${newVersion}`);
      if (version === info?.version) {
        log.warn(`Downloaded same version 🤔`);
        return;
      }
      await storeVersion(info?.version);
    } catch {
      log.warn(`Couldn't store previous version`);
    }

    log.info(`Downloaded update ${info?.version}`);
    log.info('Attempting quitAndInstall...');
    updateDownloaded = true;

    setTimeout(() => {
      log.info('Quit and exit 👋');

      app.quit();
      app.exit();
    }, 250);
    callBeforeQuitAndInstall();

    const KIT = kitPath();
    spawn(`./script`, [`./cli/open-app.js`], {
      cwd: KIT,
      detached: true,
      env: {
        KIT,
        KENV: kenvPath(),
        PATH: KIT_FIRST_PATH,
      },
    });

    log.info(`attempting relaunch`);
  };

  autoUpdater.on('update-available', async (info) => {
    log.info('Update available.', info);

    const version = getVersion();
    const newVersion = info?.version;

    const currentChannel = parseChannel(version);
    const newChannel = parseChannel(newVersion);

    if (currentChannel === newChannel) {
      log.info(`Downloading update`);

      const notification = new Notification({
        title: `Kit.app update downloading...`,
        body: `Updating to ${info.version} and relaunching`,
        silent: true,
      });

      notification.show();
      const result = await autoUpdater.downloadUpdate();
      log.log(`Update downloaded:`, result);
      await applyUpdate(info);
    } else if (version === newVersion) {
      log.info(
        `Blocking update. You're version is ${version} and found ${newVersion}`
      );
    } else {
      log.info(
        `Blocking update. You're on ${currentChannel}, but requested ${newChannel}`
      );
    }
  });

  autoUpdater.on('update-downloaded', () => {
    log.info(`⬇️ Update downloaded`);
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available...');
    log.info(info);

    if (manualUpdateCheck) {
      const notification = new Notification({
        title: `Kit.app is on the latest version`,
        body: `${getVersion()}`,
        silent: true,
      });

      notification.show();

      manualUpdateCheck = false;
    }
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
    logMessage = `${logMessage} - Downloaded ${progressObj.percent}%`;
    logMessage = `${logMessage} (${progressObj.transferred}/${progressObj.total})`;
    log.info(logMessage);
  });

  autoUpdater.on('error', (message) => {
    console.error('There was a problem updating the application');
    console.error(message);
  });

  app.on('window-all-closed', (e: Event) => {
    if (!updateDownloaded) e.preventDefault();
  });

  emitter.on(KitEvent.CheckForUpdates, async () => {
    manualUpdateCheck = true;
    await checkForUpdates();
  });
};
