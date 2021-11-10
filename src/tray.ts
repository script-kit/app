/* eslint-disable import/prefer-default-export */
import { Notification, Tray } from 'electron';
import log from 'electron-log';
import { KeyboardEvent } from 'electron/main';
import {
  kenvPath,
  kitPath,
  mainScriptPath,
} from '@johnlindquist/kit/cjs/utils';
import { getAppDb } from '@johnlindquist/kit/cjs/db';
import { getAssetPath } from './assets';
import { restartIfNecessary } from './state';
import { emitter, KitEvent } from './events';
import { getVersion } from './version';

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

export const createTray = async (checkDb = false) => {
  const appDb = await getAppDb();
  if (checkDb && typeof appDb?.tray === 'boolean' && appDb.tray === false) {
    const notification = new Notification({
      title: `Kit.app started with icon hidden`,
      body: `${getVersion()}`,
      silent: true,
    });

    notification.show();
    return;
  }
  try {
    tray = new Tray(trayIcon);
    tray.setIgnoreDoubleClickEvents(true);

    tray.on('click', leftClick);
    tray.on('right-click', rightClick);
  } catch (error) {
    log.error(error);
  }
};

export const getTray = (): Tray | null => tray;

export const destroyTray = () => {
  tray?.destroy();
  tray = null;
};

export const toggleTray = async () => {
  const appDb = await getAppDb();
  if (tray) {
    destroyTray();
    appDb.tray = false;
  } else {
    createTray();
    appDb.tray = true;
  }
  await appDb.write();
};
