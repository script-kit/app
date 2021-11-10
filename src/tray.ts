/* eslint-disable import/prefer-default-export */
import { Tray } from 'electron';
import log from 'electron-log';
import { KeyboardEvent } from 'electron/main';
import {
  kenvPath,
  kitPath,
  mainScriptPath,
} from '@johnlindquist/kit/cjs/utils';
import { getAssetPath } from './assets';
import { restartIfNecessary } from './state';
import { emitter, KitEvent } from './events';

let tray: Tray | null = null;

const leftClick = async (event: KeyboardEvent) => {
  await restartIfNecessary();
  if (event.metaKey) {
    emitter.emit(
      KitEvent.RunPromptProcess,
      kenvPath('app', 'command-click.js')
    );
  } else if (event.shiftKey) {
    emitter.emit(
      KitEvent.RunPromptProcess,
      kenvPath('app', 'command-click.js')
    );
  } else if (event.ctrlKey) {
    emitter.emit(
      KitEvent.RunPromptProcess,
      kenvPath('app', 'control-click.js')
    );
  } else if (event.altKey) {
    emitter.emit(KitEvent.RunPromptProcess, kenvPath('app', 'alt-click.js'));
  } else {
    emitter.emit(KitEvent.RunPromptProcess, mainScriptPath);
  }
};

const rightClick = async () => {
  emitter.emit(KitEvent.RunPromptProcess, kitPath('main', 'kit.js'));
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

export const getTray = (): Tray | null => tray;

export const destroyTray = () => {
  tray?.destroy();
  tray = null;
};

export const toggleTray = () => {
  if (tray) {
    destroyTray();
  } else {
    createTray();
  }
};
