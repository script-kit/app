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
import { test, cp } from 'shelljs';
import { createTray } from './tray';
import { manageShortcuts } from './shortcuts';
import { getAssetPath, getBundledSimpleScripts } from './assets';
import { trySimpleScript } from './simple';

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
};

const ready = async () => {
  await prepareProtocols();
  await createTray();
  await manageShortcuts();

  console.log(`------ AFTER MANAGE SHORTCUTS -----`);

  ipcMain.on('message', (event, data) => {
    console.log({ data });
  });
};

const checkSimpleScripts = async () => {
  const SIMPLE_PATH = path.join(app.getPath('home'), '.simple');

  const simpleScriptsExists = test('-d', SIMPLE_PATH);
  if (!simpleScriptsExists) {
    log.info(`~/.simple not found. Installing...`);
    cp('-R', getBundledSimpleScripts(), SIMPLE_PATH);

    const options: SpawnSyncOptions = {
      stdio: 'inherit',
      cwd: SIMPLE_PATH,
      env: {
        SIMPLE_PATH,
        PATH: `${path.join(SIMPLE_PATH, 'node', 'bin')}:${process.env.PATH}`,
      },
    };

    log.info({ simpleScriptsPath: SIMPLE_PATH });
    spawnSync(`npm`, [`i`], options);
    spawnSync(`./config/create-env.sh`, [], options);
    spawnSync(`./config/create-bins.sh`, [], options);
  }

  await ready();
};

app.whenReady().then(checkSimpleScripts).catch(console.log);
