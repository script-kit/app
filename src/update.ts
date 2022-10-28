import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { readdir, remove } from 'fs-extra';
import { once } from 'lodash';
import { kitPath, appDbPath } from '@johnlindquist/kit/cjs/utils';
import { subscribeKey } from 'valtio/utils';
import { getAppDb } from '@johnlindquist/kit/cjs/db';
import { getVersion, storeVersion } from './version';
import { emitter, KitEvent } from './events';
import { forceQuit, kitState, online } from './state';

export const kitIgnore = () => {
  const isGit = existsSync(kitPath('.kitignore'));
  log.info(`${isGit ? `Found` : `Didn't find`} ${kitPath('.kitignore')}`);
  return isGit;
};

export const checkForUpdates = async () => {
  const isOnline = await online();

  if (!isOnline) {
    log.info('Not online. Skipping update check.');
    return;
  }

  log.info('Checking for updates...');
  if (kitState.updateDownloaded) return;

  // TODO: Prompt to apply update
  const isWin = os.platform().startsWith('win');
  if (isWin) return; // TODO: Get a Windows app cert

  const autoUpdate = existsSync(appDbPath)
    ? (await getAppDb())?.autoUpdate
    : true;

  if (process.env.TEST_UPDATE) {
    autoUpdater.forceDevUpdateConfig = true;
  }

  if ((!kitIgnore() && autoUpdate) || process.env.TEST_UPDATE) {
    log.info(`Auto-update enabled. Checking for update.`);
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log.error(error);
    }
  }
};

const parseChannel = (version: string) => {
  if (version.includes('development')) return 'development';
  if (version.includes('alpha')) return 'alpha';
  if (version.includes('beta')) return 'beta';

  return 'main';
};

let manualUpdateCheck = false;
let updateInfo = null as any;
export const configureAutoUpdate = async () => {
  log.info(
    `Configuring auto-update: ${process.env.TEST_UPDATE ? 'TEST' : 'PROD'}`
  );
  if (process.env.TEST_UPDATE) {
    log.info(`Forcing dev update config`);
    const devUpdateFilePath = path.join(app.getAppPath(), 'dev-app-update.yml');
    const contents = await readFile(devUpdateFilePath, 'utf8');
    log.info(`Update config: ${contents}`);
    autoUpdater.updateConfigPath = devUpdateFilePath;

    try {
      const cachePath = path.resolve(
        app.getPath('userData'),
        '..',
        'Caches',
        'Kit',
        'pending'
      );
      const files = await readdir(cachePath);
      if (files) {
        for await (const file of files) {
          const filePath = path.resolve(cachePath, file);
          log.info(`Deleting ${filePath}`);
          await remove(filePath);
        }
      }
    } catch (error) {
      log.error(`Error deleting pending updates`, error);
    }
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const applyUpdate = once(async () => {
    const version = getVersion();
    const newVersion = updateInfo?.version;

    try {
      log.info(`⏫ Updating from ${version} to ${newVersion}`);
      if (version === updateInfo?.version) {
        log.warn(`Downloaded same version 🤔`);
        return;
      }
      await storeVersion(version);
    } catch {
      log.warn(`Couldn't store previous version`);
    }

    setTimeout(() => {
      log.info('Quit and exit 👋');

      try {
        app?.relaunch();
        autoUpdater.quitAndInstall();
        forceQuit();
      } catch (e) {
        log.warn(`autoUpdater.quitAndInstall error:`, e);
        forceQuit();
      }
    }, 1000);
  });

  subscribeKey(kitState, 'applyUpdate', async (update) => {
    if (update) {
      await applyUpdate();
    }
  });

  autoUpdater.on('update-available', async (info) => {
    updateInfo = info;

    kitState.status = {
      status: 'update',
      message: `Downloading update ${info.version}...`,
    };
    log.info('Update available.', info);

    const version = getVersion();
    const newVersion = info?.version;

    const currentChannel = parseChannel(version);
    const newChannel = parseChannel(newVersion);

    if (currentChannel === newChannel || process.env.TEST_UPDATE) {
      log.info(`Downloading update`);

      try {
        const result = await autoUpdater.downloadUpdate();
        log.info(`After downloadUpdate`);
        log.info({ result });
      } catch (error) {
        log.error(`Error downloading update`, error);
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

  autoUpdater.on('update-downloaded', async () => {
    kitState.updateDownloaded = true;
    kitState.status = {
      status: 'default',
      message: '',
    };

    kitState.status = {
      status: 'success',
      message: ``,
    };

    log.info(`⬇️ Update downloaded`);

    if (kitState.downloadPercent === 100) {
      // await applyUpdate();
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    kitState.status = {
      status: 'default',
      message: '',
    };

    log.info('Update not available...');
    log.info(info);

    if (manualUpdateCheck) {
      kitState.status = {
        status: 'success',
        message: `Kit.app is on the latest version`,
      };

      manualUpdateCheck = false;
    }
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('download-progress', async (progressObj) => {
    let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
    logMessage = `${logMessage} - Downloaded ${progressObj.percent}%`;
    logMessage = `${logMessage} (${progressObj.transferred}/${progressObj.total})`;
    log.info(logMessage);

    kitState.downloadPercent = progressObj.percent;

    if (progressObj.percent === 100 && kitState.updateDownloaded) {
      // await applyUpdate();
    }
  });

  autoUpdater.on('error', (message) => {
    // kitState.status = {
    //   status: 'default',
    //   message: '',
    // };
    kitState.status = {
      status: 'warn',
      message: `Auto-updater error. Check logs..`,
    };

    kitState.updateDownloaded = false;

    // log.error('There was a problem updating Kit.app');
    log.error(message);

    // setTimeout(() => {
    //   kitState.status = {
    //     status: 'default',
    //     message: '',
    //   };
    // }, 5000);

    // const notification = new Notification({
    //   title: `There was a problem downloading the Kit.app update`,
    //   body: `Please check logs in Kit tab`,
    //   silent: true,
    // });

    // notification.show();
  });

  emitter.on(KitEvent.CheckForUpdates, async () => {
    kitState.status = {
      status: 'busy',
      message: `Checking for update...`,
    };
    manualUpdateCheck = true;
    await checkForUpdates();
  });
};
