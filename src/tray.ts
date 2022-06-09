/* eslint-disable import/prefer-default-export */
/* eslint-disable no-nested-ternary */
import {
  Notification,
  Tray,
  Menu,
  app,
  MenuItemConstructorOptions,
  globalShortcut,
} from 'electron';
import log from 'electron-log';
import { subscribeKey } from 'valtio/utils';
import { KeyboardEvent } from 'electron/main';
import os from 'os';
import {
  kenvPath,
  kitPath,
  mainScriptPath,
} from '@johnlindquist/kit/cjs/utils';
import { getAppDb, getScriptsDb } from '@johnlindquist/kit/cjs/db';
import { getAssetPath } from './assets';
import { kitState, restartIfNecessary } from './state';
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
    emitter.emit(KitEvent.RunPromptProcess, kenvPath('app', 'shift-click.js'));
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
  let updateMenu: MenuItemConstructorOptions = {
    label: 'Check for Updates',
    click: async () => {
      emitter.emit(KitEvent.CheckForUpdates, true);
    },
  };

  if (kitState.starting) {
    updateMenu = {
      label: 'Starting up...',
    };
  }

  if (kitState.updateDownloading) {
    updateMenu = {
      label: 'Update Downloading...',
    };
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Script Kit ${getVersion()}`,
    },
    updateMenu,
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
  tray?.popUpContextMenu(contextMenu);
  // emitter.emit(KitEvent.RunPromptProcess, kitPath('main', 'kit.js'));
};

const isWin = os.platform() === 'win32';
const trayIcon = getAssetPath(`IconTemplate${isWin ? `-win` : ``}.png`);

export const getTrayIcon = () => trayIcon;

export const createTray = async (checkDb = false) => {
  log.info(`🎨 Creating tray...`, { checkDb });

  subscribeKey(kitState, 'updateDownloaded', (updateDownloaded) => {
    if (updateDownloaded) {
      const updateIcon = getAssetPath(
        `IconTemplate${isWin ? `-win` : ``}-update.png`
      );
      tray?.setImage(updateIcon);
    }
  });

  if (tray) {
    tray.removeAllListeners();
  }
  if (!tray) {
    tray = new Tray(trayIcon);
    tray.setIgnoreDoubleClickEvents(true);
  }
  if (kitState.starting) {
    const startingMenu = () => {
      tray?.popUpContextMenu(
        Menu.buildFromTemplate([
          {
            label: `Script Kit ${getVersion()}`,
          },
          {
            label: kitState.installing
              ? 'Installing Kit SDK...'
              : kitState.updateInstalling
              ? 'One sec. Updating...'
              : 'Starting...',
          },
        ])
      );
    };

    tray.on('click', startingMenu);
    tray.on('right-click', startingMenu);

    globalShortcut.register('CommandOrControl+;', startingMenu);
  } else {
    if (!kitState.ready) {
      globalShortcut.unregister('CommandOrControl+;');
    }
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

      tray.on('click', leftClick);

      log.info(`right click`);

      tray.on('right-click', rightClick);
    } catch (error) {
      log.error(error);
    }
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
