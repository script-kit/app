/* eslint-disable import/prefer-default-export */
import { Tray } from 'electron';
import log from 'electron-log';
import { KeyboardEvent } from 'electron/main';
import { getAssetPath } from './assets';
import { restartIfNecessary } from './state';
import { kitPath, mainScriptPath } from './helpers';
import { runPromptProcess } from './kit';

let tray: Tray | null = null;

const leftClick = async (event: KeyboardEvent) => {
  restartIfNecessary();
  if (event.metaKey) {
    runPromptProcess('app/command-click');
  } else if (event.shiftKey) {
    runPromptProcess('app/shift-click');
  } else if (event.ctrlKey) {
    runPromptProcess('app/control-click');
  } else if (event.altKey) {
    runPromptProcess('app/alt-click');
  } else {
    runPromptProcess(mainScriptPath);
  }
};

const rightClick = async () => {
  runPromptProcess(kitPath('main', 'help.js'));
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
