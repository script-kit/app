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
    });
    browserWindows.forEach((w) => {
      w?.destroy();
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

let manualUpdateCheck = false;
export const configureAutoUpdate = async () => {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    log.info('Update available.', info);
  });
  autoUpdater.on('update-not-available', (info) => {
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

  let updateDownloaded = false;
  autoUpdater.on('update-downloaded', async (event) => {
    const parseChannel = (version: string) => {
      if (version.includes('development')) return 'development';
      if (version.includes('alpha')) return 'alpha';
      if (version.includes('beta')) return 'beta';

      return 'main';
    };
    const version = getVersion();
    const newVersion = event?.version;

    const currentChannel = parseChannel(version);
    const newChannel = parseChannel(newVersion);

    if (currentChannel !== newChannel && newChannel !== 'main') {
      log.warn(`Blocking update install due to channel mis-match`);
      return;
    }

    autoUpdater.autoInstallOnAppQuit = true;
    try {
      log.info(`⏫ Updating from ${version} to ${newVersion}`);
      if (version === event?.version) {
        log.warn(`Downloaded same version 🤔`);
        return;
      }
      await storeVersion(version);
    } catch {
      log.warn(`Couldn't store previous version`);
    }

    const notification = new Notification({
      title: `Kit.app update downloaded`,
      body: `Updating to ${event.version} and relaunching`,
      silent: true,
    });

    notification.show();

    log.info(`Downloaded update ${event?.version}`);
    log.info('Attempting quitAndInstall...');
    updateDownloaded = true;

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

    log.info('Quit and exit 👋');

    app.quit();
    app.exit();
  });

  app.on('window-all-closed', (e: Event) => {
    if (!updateDownloaded) e.preventDefault();
  });

  emitter.on(KitEvent.CheckForUpdates, async () => {
    manualUpdateCheck = true;
    await checkForUpdates();
  });
};
