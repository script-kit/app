/* eslint-disable import/prefer-default-export */
import { Tray } from 'electron';
import log from 'electron-log';
import { KeyboardEvent } from 'electron/main';
import { tryKitScript } from './kit';
import { getAssetPath } from './assets';
import { restartIfNecessary } from './restart';

let tray: Tray | null = null;

const leftClick = async (event: KeyboardEvent) => {
  restartIfNecessary();
  if (event.metaKey) {
    tryKitScript('app/command-click');
  } else if (event.shiftKey) {
    tryKitScript('app/shift-click');
  } else if (event.ctrlKey) {
    tryKitScript('app/control-click');
  } else if (event.altKey) {
    tryKitScript('app/alt-click');
  } else {
    tryKitScript('app/left-click');
  }
};

const rightClick = async () => {
  tryKitScript('app/right-click');
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
