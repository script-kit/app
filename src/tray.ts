/* eslint-disable import/prefer-default-export */
import { Tray } from 'electron';
import log from 'electron-log';
import { trySimpleScript } from './simple';
import { getAssetPath } from './assets';

let tray: Tray | null = null;

const leftClick = async () => {
  trySimpleScript('cli/run');
};

const rightClick = async () => {
  trySimpleScript('cli/run');
};

const trayIcon = getAssetPath('IconTemplate.png');

export const createTray = async () => {
  try {
    tray = new Tray(trayIcon);
    tray.setIgnoreDoubleClickEvents(true);

    tray.on('click', leftClick);
    tray.on('right-click', rightClick);
  } catch (error) {
    log.error(error);
  }

  return 'tray created';
};
