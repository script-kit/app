/* eslint-disable import/first */
/* eslint-disable jest/no-identical-title */
/* eslint-disable jest/expect-expect */
/* eslint global-require: off, no-console: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `yarn build` or `yarn build-main`, this file is compiled to
 * `./src/main.prod.js` using webpack. This gives us some performance wins.
 */

import { app, protocol } from 'electron';

if (!app.requestSingleInstanceLock()) {
  app.exit();
}

import 'core-js/stable';
import 'regenerator-runtime/runtime';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import path from 'path';
import { spawnSync, SpawnSyncOptions, exec } from 'child_process';
import { test } from 'shelljs';
import { createTray } from './tray';
import { manageShortcuts } from './shortcuts';
import { getAssetPath } from './assets';
import { tryKitScript } from './kit';
import { createPromptWindow, createPreview, createPromptCache } from './prompt';
import { createNotification } from './notifications';
import { APP_NAME, kenv, KIT, KENV, KIT_PROTOCOL } from './helpers';
import { createCache } from './cache';
import { makeRestartNecessary } from './restart';
import { getVersion } from './version';

const setupLog = log.create('setup');

app.setName(APP_NAME);

app.setAsDefaultProtocolClient(KIT_PROTOCOL);
app.dock.hide();
app.dock.setIcon(getAssetPath('icon.png'));

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

if (
  process.env.NODE_ENV === 'development' ||
  process.env.DEBUG_PROD === 'true'
) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
});
autoUpdater.on('update-available', (info) => {
  log.info('Update available.', info);
});
autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available.', info);
});
autoUpdater.on('download-progress', (progressObj) => {
  let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
  logMessage = `${logMessage} - Downloaded ${progressObj.percent}%`;
  logMessage = `${logMessage} (${progressObj.transferred}/${progressObj.total})`;
  log.info(logMessage);
});

autoUpdater.on('update-downloaded', () => {
  log.info('update downloaded');
  makeRestartNecessary();
  autoUpdater.quitAndInstall();
  app.quit();
});

app.on('window-all-closed', (e: Event) => e.preventDefault());

app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    if (parsedUrl.protocol.startsWith('http')) {
      event.preventDefault();
      exec(`open ${parsedUrl.href}`);
    }
  });
});

const prepareProtocols = async () => {
  protocol.registerHttpProtocol(KIT_PROTOCOL, (req, cb) => {
    log.info(`FILE PROTOCOL:`, req.url);
    const command = req.url.split(' ').slice(1);
    log.info(command);
  });

  app.on('open-url', (e, url) => {
    log.info(`URL PROTOCOL`, url);
    e.preventDefault();
    const newArgs = decodeURI(url).slice('kit://'.length).split(' ');

    tryKitScript('kit/cli/new', newArgs);
  });

  protocol.registerFileProtocol(KIT_PROTOCOL, (request, callback) => {
    const url = request.url.substr(KIT_PROTOCOL.length + 2);
    const file = { path: url };

    callback(file);
  });
};

const createLogs = () => {
  log.transports.file.resolvePath = () => kenv('logs', 'kit.log');
};

const createCaches = () => {
  createCache();
  createPromptCache();
};

const ready = async () => {
  createLogs();
  createCaches();
  await prepareProtocols();
  await createTray();
  await manageShortcuts();
  await createPromptWindow();
  await createPreview();
  await createNotification();
  autoUpdater.logger = log;
  autoUpdater.checkForUpdatesAndNotify();
};

const options: SpawnSyncOptions = {
  cwd: KIT,
  env: {
    KIT,
    KENV,
    PATH: `${path.join(KIT, 'node', 'bin')}:${process.env.PATH}`,
  },
};

const checkoutKitTag = async () => {
  const gitFetchTagsResult = spawnSync(
    'git',
    `fetch --all --tags`.split(' '),
    options
  );
  setupLog.info({ gitFetchTagsResult });

  const gitCheckoutTagResult = spawnSync(
    'git',
    `checkout tags/${getVersion()}`.split(' '),
    options
  );
  setupLog.info({ gitCheckoutTagResult });
};

const checkKit = async () => {
  // eslint-disable-next-line jest/expect-expect
  const kitExists = test('-d', KIT);

  setupLog.info(`Checking if kit exists`);
  if (!kitExists) {
    setupLog.info(`~/.kit not found. Installing...`);

    // Step 1: Clone repo
    const gitResult = spawnSync(
      'git',
      `clone https://github.com/johnlindquist/kit.git ${KIT}`.split(' '),
      {
        ...options,
        cwd: app.getPath('home'),
      }
    );
    setupLog.info(gitResult.stdout.toString().trim());

    // Step 2: Install node into .kit/node
    const installNodeResult = spawnSync(
      `./setup/install-node.sh`,
      ` --prefix node --platform darwin`.split(' '),
      options
    );
    setupLog.info(installNodeResult.stdout.toString().trim());

    // Step 3: npm install packages into .kit/node_modules
    const npmResult = spawnSync(`npm`, [`i`], options);
    setupLog.info(npmResult.stdout.toString().trim());
  }

  const { stdout } = spawnSync(
    `git`,
    `describe --tags --exact-match HEAD`.split(' '),
    options
  );

  const kitVersion = stdout.toString().trim();
  console.log(`KIT ${kitVersion} - KIT APP ${getVersion()}`);
  if (kitVersion !== getVersion() && process.env.NODE_ENV !== 'development') {
    // TODO: verify tag
    // git show-ref --verify refs/tags/
    console.log(`Checking out ${getVersion()}`);
    await checkoutKitTag();
  }

  const kenvExists = test('-d', KENV);

  if (!kenvExists) {
    // Step 4: Use kit wrapper to run setup.js script
    const setupResult = spawnSync(`./bin/kit`, [`./setup/setup.js`], options);
    setupLog.info({ createEnvResult: setupResult });
  }

  await ready();
};

app.whenReady().then(checkKit).catch(setupLog.warn);
