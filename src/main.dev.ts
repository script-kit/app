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
import { app, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { createTray } from './tray';
import { manageShortcuts } from './shortcuts';
import { getAssetPath } from './assets';

app.setName('Simple Scripts');
app.setAsDefaultProtocolClient('simple');
app.dock.hide();
app.dock.setIcon(getAssetPath('icon.png'));

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

const ready = async () => {
  await createTray();
  await manageShortcuts();

  console.log(`------ AFTER MANAGE SHORTCUTS -----`);

  ipcMain.on('message', (event, data) => {
    console.log({ data });
  });
};

app.whenReady().then(ready).catch(console.log);
