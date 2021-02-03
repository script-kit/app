/* eslint-disable import/prefer-default-export */
import { Tray } from 'electron';
import log from 'electron-log';
import { KeyboardEvent } from 'electron/main';
import { trySimpleScript } from './simple';
import { getAssetPath } from './assets';

let tray: Tray | null = null;

const leftClick = async (event: KeyboardEvent) => {
  if (event.metaKey) {
    trySimpleScript('tray/command-click');
  } else if (event.shiftKey) {
    trySimpleScript('tray/shift-click');
  } else if (event.ctrlKey) {
    trySimpleScript('tray/control-click');
  } else if (event.altKey) {
    trySimpleScript('tray/alt-click');
  } else {
    trySimpleScript('tray/left-click');
  }
};

const rightClick = async () => {
  trySimpleScript('tray/right-click');
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
