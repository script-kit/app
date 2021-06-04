/* eslint-disable import/prefer-default-export */
import { Tray } from 'electron';
import log from 'electron-log';
import { KeyboardEvent } from 'electron/main';
import { tryPromptScript } from './kit';
import { getAssetPath } from './assets';
import { restartIfNecessary } from './state';
import { kitPath, mainScriptPath } from './helpers';

let tray: Tray | null = null;

const leftClick = async (event: KeyboardEvent) => {
  restartIfNecessary();
  if (event.metaKey) {
    await tryPromptScript('tray/command-click');
  } else if (event.shiftKey) {
    await tryPromptScript('tray/shift-click');
  } else if (event.ctrlKey) {
    await tryPromptScript('tray/control-click');
  } else if (event.altKey) {
    await tryPromptScript('tray/alt-click');
  } else {
    await tryPromptScript(mainScriptPath);
  }
};

const rightClick = async () => {
  await tryPromptScript(kitPath('main', 'help.js'));
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

export const destroyTray = () => {
  tray = null;
};
