/* eslint global-require: off, no-console: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `yarn build` or `yarn build-main`, this file is compiled to
 * `./src/main.prod.js` using webpack. This gives us some performance wins.
 */
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import { app, protocol } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import path from 'path';
import { spawnSync, SpawnSyncOptions, exec } from 'child_process';
import { test } from 'shelljs';
import { createTray } from './tray';
import { manageShortcuts } from './shortcuts';
import { getAssetPath } from './assets';
import { trySimpleScript } from './simple';
import { createPromptWindow, createPreview, createPromptCache } from './prompt';
import { createNotification } from './notifications';
import { simplePath } from './helpers';
import { createCache } from './cache';
import { makeRestartNecessary } from './restart';

const setupLog = log.create('setup');

app.setName('Simple Scripts');
app.requestSingleInstanceLock();
app.setAsDefaultProtocolClient('simple');
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
  protocol.registerHttpProtocol('simple', (req, cb) => {
    log.info(`FILE PROTOCOL:`, req.url);
    const command = req.url.split(' ').slice(1);
    log.info(command);
  });

  app.on('open-url', (e, url) => {
    log.info(`URL PROTOCOL`, url);
    e.preventDefault();
    const [command, ...runArgs] = decodeURI(url)
      .slice('simple://'.length)
      .split(' ');

    trySimpleScript(command, runArgs);
  });

  const customProtocol = 'simple';

  protocol.registerFileProtocol(customProtocol, (request, callback) => {
    const url = request.url.substr(customProtocol.length + 2);
    const file = { path: url };

    callback(file);
  });
};

const createLogs = () => {
  log.transports.file.resolvePath = () => simplePath('logs', 'simple.log');
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

const SIMPLE_SDK = path.join(app.getPath('home'), '.simplesdk');
const SIMPLE_PATH = path.join(app.getPath('home'), '.simple');

const options: SpawnSyncOptions = {
  stdio: 'inherit',
  cwd: SIMPLE_SDK,
  env: {
    SIMPLE_SDK,
    SIMPLE_PATH,
    PATH: `${path.join(SIMPLE_SDK, 'node', 'bin')}:${process.env.PATH}`,
  },
};

const checkoutSimpleScriptsTag = async () => {
  const gitFetchTagsResult = spawnSync(
    'git',
    `fetch --all --tags`.split(' '),
    options
  );
  setupLog.info({ gitFetchTagsResult });

  const gitCheckoutTagResult = spawnSync(
    'git',
    `checkout tags/${app.getVersion()} -b main`.split(' '),
    options
  );
  setupLog.info({ gitCheckoutTagResult });
};

const checkSimpleScripts = async () => {
  // eslint-disable-next-line jest/expect-expect
  const sdkExists = test('-d', SIMPLE_SDK);

  if (!sdkExists) {
    setupLog.info(`~/.simplesdk not found. Installing...`);

    // Step 1: Clone repo
    const gitResult = spawnSync(
      'git',
      `clone https://github.com/johnlindquist/simplescripts.git ${SIMPLE_SDK}`.split(
        ' '
      ),
      {
        ...options,
        cwd: app.getPath('home'),
      }
    );
    setupLog.info({ gitResult });

    await checkoutSimpleScriptsTag();

    // Step 2: Install node into .simplesdk/node
    const installNodeResult = spawnSync(
      `./setup/install-node.sh`,
      ` --prefix node --platform darwin`.split(' '),
      options
    );
    setupLog.info({ installNodeResult });

    // Step 3: npm install packages into .simplesdk/node_modules
    const npmResult = spawnSync(`npm`, [`i`], options);
    setupLog.info({ npmResult });

    // Step 4: Use simple.sh wrapper to run setup.js script
    const setupResult = spawnSync(`./simple.sh`, [`./setup/setup.js`], options);
    setupLog.info({ createEnvResult: setupResult });
  } else {
    await checkoutSimpleScriptsTag();
  }

  await ready();
};

app.whenReady().then(checkSimpleScripts).catch(setupLog.warn);
