import { app, shell } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;
import log from 'electron-log';
import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import fsExtra from 'fs-extra';
const { readdir, remove } = fsExtra;
import { once } from 'lodash-es';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { subscribeKey } from 'valtio/utils';
import { getVersion, storeVersion } from './version';
import { emitter, KitEvent } from '../shared/events';
import { forceQuit, kitState, online } from '../shared/state';
import { updateLog } from './logs';

export const kitIgnore = () => {
  const isGit = existsSync(kitPath('.kitignore'));
  log.info(`${isGit ? `Found` : `Didn't find`} ${kitPath('.kitignore')}`);
  return isGit;
};

export const checkForUpdates = async () => {
  if (kitState.kenvEnv.KIT_DISABLE_AUTO_UPDATE) {
    updateLog.info('Auto update disabled. Skipping check...');
    return;
  }
  updateLog.log('🔍 Checking for updates');
  const isOnline = await online();

  if (!isOnline) {
    updateLog.info('Not online. Skipping update check.');
    return;
  }

  updateLog.info('Online. Continuing update check.');

  // TODO: Prompt to apply update
  const isWin = os.platform().startsWith('win');
  if (isWin) return; // TODO: Get a Windows app cert

  // const autoUpdate = existsSync(appDbPath)
  //   ? (await getAppDb())?.autoUpdate
  //   : true;

  if (process.env.TEST_UPDATE) {
    autoUpdater.forceDevUpdateConfig = true;
  }

  if (!kitIgnore() || process.env.TEST_UPDATE) {
    try {
      const result = await autoUpdater.checkForUpdates();
      updateLog.info('Update check result', result);
    } catch (error) {
      updateLog.error(error);
    }
  } else {
    updateLog.info('Denied. Found .kitignore');
  }
};

const parseChannel = (version: string) => {
  if (version.includes('development')) return 'development';
  if (version.includes('alpha')) return 'alpha';
  if (version.includes('beta')) return 'beta';

  return 'main';
};

let updateInfo = null as any;
export const configureAutoUpdate = async () => {
  updateLog.info(
    `Configuring auto-update: ${process.env.TEST_UPDATE ? 'TEST' : 'PROD'}`
  );
  if (process.env.TEST_UPDATE) {
    updateLog.info(`Forcing dev update config`);
    const devUpdateFilePath = path.join(app.getAppPath(), 'dev-app-update.yml');
    const contents = await readFile(devUpdateFilePath, 'utf8');
    updateLog.info(`Update config: ${contents}`);
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
          updateLog.info(`Deleting ${filePath}`);
          await remove(filePath);
        }
      }
    } catch (error) {
      updateLog.error(`Error deleting pending updates`, error);
    }
  }

  autoUpdater.logger = updateLog;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const applyUpdate = once(async () => {
    const version = getVersion();
    const newVersion = updateInfo?.version;

    try {
      updateLog.info(`⏫ Updating from ${version} to ${newVersion}`);
      if (version === updateInfo?.version) {
        updateLog.warn(`Downloaded same version 🤔`);
        return;
      }
      await storeVersion(version);
    } catch {
      updateLog.warn(`Couldn't store previous version`);
    }

    updateLog.info('Quit and exit 👋');

    try {
      kitState.quitAndInstall = true;
      forceQuit();
    } catch (e) {
      updateLog.warn(`autoUpdater.quitAndInstall error:`, e);
      forceQuit();
    }
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
    updateLog.info('Update available.', info);

    const version = getVersion();
    const newVersion = info?.version;

    const currentChannel = parseChannel(version);
    const newChannel = parseChannel(newVersion);

    if (currentChannel === newChannel || process.env.TEST_UPDATE) {
      updateLog.info(`Downloading update`);

      try {
        const result = await autoUpdater.downloadUpdate();
        updateLog.info(`After downloadUpdate`);
        updateLog.info({ result });
      } catch (error) {
        updateLog.error(`Error downloading update`, error);
      }
    } else if (version === newVersion) {
      updateLog.info(
        `Blocking update. You're version is ${version} and found ${newVersion}`
      );
    } else {
      updateLog.info(
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

    updateLog.info(`⬇️ Update downloaded`);

    if (kitState.downloadPercent === 100) {
      updateLog.info(`💯 Download complete`);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    kitState.status = {
      status: 'default',
      message: '',
    };

    updateLog.info('Update not available...');
    updateLog.info(info);

    if (kitState.manualUpdateCheck) {
      kitState.status = {
        status: 'success',
        message: `Kit.app is on the latest version`,
      };

      kitState.manualUpdateCheck = false;
    }
  });

  autoUpdater.on('checking-for-update', () => {
    updateLog.info('Begin checking for update...');
  });

  autoUpdater.on('update-available', () => {
    updateLog.info('Update available');
    kitState.manualUpdateCheck = false;
  });

  autoUpdater.on('update-cancelled', () => {
    updateLog.info('Update cancelled');
  });

  autoUpdater.on('download-progress', async (progressObj) => {
    let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
    logMessage = `${logMessage} - Downloaded ${progressObj.percent}%`;
    logMessage = `${logMessage} (${progressObj.transferred}/${progressObj.total})`;
    updateLog.info(logMessage);

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
    updateLog.error(message);

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
    // if not mac, just open scriptkit.com
    if (!kitState.isMac) {
      shell.openExternal(kitState.url);
      return;
    }

    kitState.status = {
      status: 'busy',
      message: `Checking for update...`,
    };
    kitState.manualUpdateCheck = true;
    await checkForUpdates();
  });
};
