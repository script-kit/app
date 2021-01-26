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
import { app, ipcMain, protocol } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import path from 'path';
import { spawnSync, SpawnSyncOptions } from 'child_process';
import { test } from 'shelljs';
import { createTray } from './tray';
import { manageShortcuts } from './shortcuts';
import { getAssetPath } from './assets';
import { trySimpleScript } from './simple';
import { createPromptWindow } from './prompt';
import { createNotification, showNotification } from './notifications';

app.setName('Simple Scripts');
app.requestSingleInstanceLock();
app.setAsDefaultProtocolClient('simple');
app.dock.hide();
app.dock.setIcon(getAssetPath('icon.png'));

/* eslint-disable jest/no-export */
// Linter thinks the `test` function from shelljs makes this a test file
export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

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

app.on('window-all-closed', (e: Event) => e.preventDefault());

const prepareProtocols = async () => {
  protocol.registerHttpProtocol('simple', (req, cb) => {
    log.info(`FILE PROTOCOL`);
    log.info(req);
    const command = req.url.split(' ').slice(1);
    log.info(command);
  });

  app.on('open-url', (e, url) => {
    e.preventDefault();
    const [command, ...runArgs] = decodeURI(url)
      .slice('simple://'.length)
      .split(' ');

    trySimpleScript(command, runArgs);
  });

  const customProtocol = 'file2';

  protocol.registerFileProtocol(customProtocol, (request, callback) => {
    const url = request.url.substr(customProtocol.length + 2);
    const file = { path: url };

    callback(file);
  });
};

const ready = async () => {
  await prepareProtocols();
  await createTray();
  await manageShortcuts();
  await createPromptWindow();
  await createNotification();
};

const checkSimpleScripts = async () => {
  const SIMPLE_PATH = path.join(app.getPath('home'), '.simple');

  // eslint-disable-next-line jest/expect-expect
  const simpleScriptsExists = test('-d', SIMPLE_PATH);
  if (!simpleScriptsExists) {
    log.info(`~/.simple not found. Installing...`);

    const options: SpawnSyncOptions = {
      stdio: 'inherit',
      cwd: SIMPLE_PATH,
      env: {
        SIMPLE_PATH,
        PATH: `${path.join(SIMPLE_PATH, 'node', 'bin')}:${process.env.PATH}`,
      },
    };

    const [
      git,
      ...gitArgs
    ] = `git clone https://github.com/johnlindquist/simplescripts.git ${SIMPLE_PATH}`.split(
      ' '
    );

    const [
      installNode,
      ...installNodeArgs
    ] = `./config/install-node.sh --prefix node --platform darwin`.split(' ');

    const gitResult = spawnSync(git, gitArgs, {
      ...options,
      cwd: app.getPath('home'),
    });
    console.log({ gitResult });
    const installNodeResult = spawnSync(installNode, installNodeArgs, options);
    console.log({ installNodeResult });
    const npmResult = spawnSync(`npm`, [`i`], options);
    console.log({ npmResult });
    const createEnvResult = spawnSync(`./config/create-env.sh`, [], options);
    console.log({ createEnvResult });
    const createBinResult = spawnSync(`./config/create-bins.sh`, [], options);
    // console.log({ createBinResult });
  }

  await ready();
};

app.whenReady().then(checkSimpleScripts).catch(console.log);
