import { app, BrowserWindow, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import os from 'os';
import { existsSync } from 'fs';
import {
  kitPath,
  appDbPath,
  KIT_FIRST_PATH,
  kenvPath,
} from '@johnlindquist/kit/cjs/utils';
import { getAppDb } from '@johnlindquist/kit/cjs/db';
import { spawn } from 'child_process';
import { destroyTray } from './tray';
import { getVersion, storeVersion } from './version';
import { emitter, KitEvent } from './events';
import { kitState } from './state';

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
    log.warn(`callBeforeQuitAndInstall error`, e);
  }
};

export const kitIgnore = () => {
  const isGit = existsSync(kitPath('.kitignore'));
  log.info(`${isGit ? `Found` : `Didn't find`} ${kitPath('.kitignore')}`);
  return isGit;
};

export const checkForUpdates = async () => {
  log.info('Checking for updates...');
  const isWin = os.platform().startsWith('win');
  if (isWin) return; // TODO: Get a Windows app cert

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
  log.info(`Configuring auto-update`);
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  let downloadProgressMade = false;

  const applyUpdate = async (info: any) => {
    const version = getVersion();
    const newVersion = info?.version;

    try {
      log.info(`⏫ Updating from ${version} to ${newVersion}`);
      if (version === info?.version) {
        log.warn(`Downloaded same version 🤔`);
        return;
      }
      await storeVersion(version);
    } catch {
      log.warn(`Couldn't store previous version`);
    }

    log.info(`⏰ Waiting one second before quit`);
    callBeforeQuitAndInstall();

    setTimeout(() => {
      log.info('Quit and exit 👋');

      try {
        autoUpdater.quitAndInstall();
      } catch (e) {
        log.warn(`autoUpdater.quitAndInstall error:`, e);

        const KIT = kitPath();

        log.info(`Before relaunch attempt`);

        try {
          const child = spawn(`./script`, [`./cli/open-app.js`], {
            cwd: KIT,
            detached: true,
            env: {
              KIT,
              KENV: kenvPath(),
              PATH: KIT_FIRST_PATH,
            },
          });

          child.on('message', (data) => {
            log.info(data.toString());
          });
        } catch (spawnError) {
          log.warn(`spawn open-app error`, spawnError);
        }

        log.info(`After relaunch attempt`);

        app.quit();
        app.exit();
      }
    }, 250);
  };

  autoUpdater.on('update-available', async (info) => {
    kitState.updateDownloading = true;
    log.info('Update available.', info);

    const version = getVersion();
    const newVersion = info?.version;

    const currentChannel = parseChannel(version);
    const newChannel = parseChannel(newVersion);

    if (currentChannel === newChannel) {
      log.info(`Downloading update`);

      // const notification = new Notification({
      //   title: `Downloading Kit.app update ${info.version}`,
      //   body: `Kit.app will relaunch once download completes`,
      //   silent: true,
      // });

      // notification.show();
      const result = await autoUpdater.downloadUpdate();
      log.log(`Update downloaded:`, result);
      if (downloadProgressMade) {
        await applyUpdate(info);
      }
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
    kitState.updateDownloaded = true;
    log.info(`⬇️ Update downloaded`);
  });

  autoUpdater.on('update-not-available', (info) => {
    kitState.updateDownloaded = false;
    kitState.updateInstalling = false;
    kitState.updateDownloading = false;

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
    kitState.updateDownloading = true;
    log.info('Checking for update...');
  });

  autoUpdater.on('download-progress', (progressObj) => {
    downloadProgressMade = true;

    let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
    logMessage = `${logMessage} - Downloaded ${progressObj.percent}%`;
    logMessage = `${logMessage} (${progressObj.transferred}/${progressObj.total})`;
    log.info(logMessage);
  });

  autoUpdater.on('error', (message) => {
    kitState.updateDownloading = false;
    log.error('There was a problem updating Kit.app');
    log.error(message);

    // const notification = new Notification({
    //   title: `There was a problem downloading the Kit.app update`,
    //   body: `Please check logs in Kit tab`,
    //   silent: true,
    // });

    // notification.show();
  });

  app.on('window-all-closed', (e: Event) => {
    if (!kitState.updateDownloaded) e.preventDefault();
  });

  emitter.on(KitEvent.CheckForUpdates, async () => {
    manualUpdateCheck = true;
    await checkForUpdates();
  });
};
