/* eslint-disable import/prefer-default-export */
import { Tray } from 'electron';
import log from 'electron-log';
import { KeyboardEvent } from 'electron/main';
import { tryKitScript } from './kit';
import { getAssetPath } from './assets';
import { restartIfNecessary } from './restart';
import { kitPath } from './helpers';

let tray: Tray | null = null;

const leftClick = async (event: KeyboardEvent) => {
  restartIfNecessary();
  if (event.metaKey) {
    tryKitScript('tray/command-click');
  } else if (event.shiftKey) {
    tryKitScript('tray/shift-click');
  } else if (event.ctrlKey) {
    tryKitScript('tray/control-click');
  } else if (event.altKey) {
    tryKitScript('tray/alt-click');
  } else {
    tryKitScript(kitPath('main/index.js'));
  }
};

const rightClick = async () => {
  tryKitScript(kitPath('main/edit.js'));
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
