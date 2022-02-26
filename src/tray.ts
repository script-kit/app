/* eslint-disable import/prefer-default-export */
import { Notification, Tray, Menu, app } from 'electron';
import log from 'electron-log';
import { KeyboardEvent } from 'electron/main';
import os from 'os';
import {
  kenvPath,
  kitPath,
  mainScriptPath,
} from '@johnlindquist/kit/cjs/utils';
import { getAppDb, getScriptsDb } from '@johnlindquist/kit/cjs/db';
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

const contextMenu = Menu.buildFromTemplate([
  {
    label: `Script Kit ${getVersion()}`,
  },
  {
    label: 'Check for Updates',
    click: async () => {
      emitter.emit(KitEvent.CheckForUpdates, true);
    },
  },
  {
    label: `Change Shortcut`,
    click: async () => {
      emitter.emit(
        KitEvent.RunPromptProcess,
        kitPath('cli', 'change-main-shortcut.js')
      );
    },
  },
  {
    label: 'Quit',

    click: () => {
      log.info(`Quitting...`);
      app.quit();
      app.exit();
    },
  },
]);

const rightClick = async () => {
  tray?.popUpContextMenu(contextMenu);
  // emitter.emit(KitEvent.RunPromptProcess, kitPath('main', 'kit.js'));
};

const isWin = os.platform() === 'win32';
const trayIcon = getAssetPath(`IconTemplate${isWin ? `-win` : ``}.png`);

export const getTrayIcon = () => trayIcon;

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
    log.info(`☑ Enable tray`);
    tray = new Tray(trayIcon);
    tray.setIgnoreDoubleClickEvents(true);

    tray.on('click', leftClick);

    log.info(`right click`);

    tray.on('right-click', rightClick);
  } catch (error) {
    log.error(error);
  }
};

export const getTray = (): Tray | null => tray;

export const destroyTray = () => {
  log.info(`◽️ Disable tray`);
  if (tray) {
    tray?.destroy();
    tray = null;
  }
};

export const toggleTray = async () => {
  const appDb = await getAppDb();
  const trayEnabled = appDb.tray;
  const changed = Boolean(tray) !== trayEnabled;
  if (changed) {
    if (tray) {
      destroyTray();
    } else {
      createTray();
    }
  }
};

let leftClickOverride: null | ((event: any) => void) = null;
export const setTrayMenu = async (scripts: string[]) => {
  if (!scripts?.length) {
    if (leftClickOverride) {
      tray?.off('click', leftClickOverride);
      tray?.on('click', leftClick);
      leftClickOverride = null;
      tray?.setContextMenu(null);
    }
    return;
  }

  const db = await getScriptsDb();
  const scriptMenuItems = [];
  for (const command of scripts) {
    const script = db.scripts.find((s) => s.command === command);
    if (script) {
      scriptMenuItems.push({
        label: script.name,
        click: () => {
          emitter.emit(KitEvent.RunPromptProcess, script.filePath);
        },
      });
    }
  }

  if (scriptMenuItems.length) {
    const cMenu = Menu.buildFromTemplate(scriptMenuItems);

    leftClickOverride = () => {
      tray?.popUpContextMenu(cMenu);
    };

    tray?.off('click', leftClick);
    tray?.on('click', leftClickOverride);
  }
};
