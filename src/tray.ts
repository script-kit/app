/* eslint-disable import/prefer-default-export */
import { Tray } from 'electron';
import log from 'electron-log';
import { trySimpleScript } from './simple';
import { getAssetPath } from './assets';

let tray: Tray | null = null;

const leftClick = async (event: MouseEvent) => {
  if (event.metaKey) {
    trySimpleScript('app/command-click');
  } else if (event.shiftKey) {
    trySimpleScript('app/shift-click');
  } else if (event.ctrlKey) {
    trySimpleScript('app/control-click');
  } else if (event.altKey) {
    trySimpleScript('app/alt-click');
  } else {
    trySimpleScript('app/left-click');
  }
};

const rightClick = async () => {
  trySimpleScript('app/right-click');
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
