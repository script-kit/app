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
import { askForAccessibilityAccess } from 'node-mac-permissions';
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

const trayClick = async (event: KeyboardEvent) => {
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
    // emitter.emit(KitEvent.RunPromptProcess, mainScriptPath);

    let updateMenu: MenuItemConstructorOptions = {
      label: 'Check for Updates',
      click: async () => {
        emitter.emit(KitEvent.CheckForUpdates, true);
      },
    };

    if (kitState.starting) {
      updateMenu = {
        label: '🟢 Starting up...',
      };
    }

    if (kitState.updateDownloading) {
      updateMenu = {
        label: '🟠 Update Downloading...',
      };
    }

    if (kitState.updateError) {
      updateMenu = {
        label: '🔴 Update download failed. Check logs...',
      };
    }

    const runScript = (script: string) => () => {
      emitter.emit(KitEvent.RunPromptProcess, script);
    };

    const kitItems = [
      {
        label: `Reveal ~/.kenv in Finder`,
        click: runScript(kitPath('help', 'reveal-kenv.js')),
      },
      {
        label: `Reveal ~/.kit/logs/kit.log in Finder`,
        click: runScript(kitPath('help', 'reveal-kit-log.js')),
      },
    ];

    if (!kitState.authorized) {
      kitItems.push({
        label: `Allow Snippets, Clipboard History, etc...`,
        click: () => askForAccessibilityAccess(),
      });
    }
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Open Kit.app Prompt`,
        // icon: getAssetPath(`IconTemplate${isWin ? `-win` : ``}.png`),
        icon: menuIcon('open'),
        click: runScript(mainScriptPath),
        accelerator: kitState.mainShortcut,
      },
      {
        type: 'separator',
      },
      {
        label: `Community`,
        click: runScript(kitPath('help', 'get-help.js')),
        icon: menuIcon('github'),
      },
      {
        label: `Join the Newsletter`,
        click: runScript(kitPath('help', 'join.js')),
        icon: menuIcon('newsletter'),
      },
      {
        type: 'separator',
      },
      ...kitItems,
      {
        type: 'separator',
      },
      {
        label: `Script Kit ${getVersion()}`,
        enabled: false,
      },
      updateMenu,
      {
        type: 'separator',
      },
      {
        label: `Change Shortcut`,
        click: runScript(kitPath('cli', 'change-main-shortcut.js')),
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
  }
  // emitter.emit(KitEvent.RunPromptProcess, kitPath('main', 'kit.js'));
};

const isWin = os.platform() === 'win32';
type trayColor = 'default' | 'green' | 'red' | 'orange';
const trayIcon = (color: trayColor) => {
  const dark = kitState.isDark ? `` : ``;
  const pre = color === 'default' ? `default${dark}${isWin ? `-win` : ``}` : ``;
  const post = color !== 'default' ? `notification${dark}-${color}` : ``;

  // const greenIcon = getAssetPath(`tray`, `notification-green.png`);

  const name = `${pre}${post}`;

  log.info(`🎨 Tray icon: ${name}`);
  return getAssetPath(`tray`, `${name}.png`);
};

type iconType =
  | 'bug'
  | 'discord'
  | 'github'
  | 'help-alt'
  | 'help'
  | 'newsletter'
  | 'open';
const menuIcon = (name: iconType) => {
  return getAssetPath(`menu`, `${name}.png`);
};

export const getTrayIcon = () => trayIcon('default');

export const createTray = async (checkDb = false) => {
  log.info(`🎨 Creating tray...`, { checkDb });

  subscribeKey(kitState, 'updateDownloading', (updateDownloading) => {
    if (updateDownloading) {
      tray?.setImage(trayIcon('orange'));
    }
  });

  subscribeKey(kitState, 'updateDownloaded', (updateDownloaded) => {
    if (updateDownloaded) {
      tray?.setImage(trayIcon('green'));
    }
  });

  subscribeKey(kitState, 'updateError', (updateError) => {
    if (updateError) {
      tray?.setImage(trayIcon('red'));
    } else {
      tray?.setImage(trayIcon('default'));
    }
  });

  // const colors = ['default', 'green', 'red', 'orange'];
  // let i = 0;
  // setInterval(() => {
  //   i++;
  //   if (i >= colors.length) i = 0;
  //   tray?.setImage(trayIcon(colors[i] as trayColor));
  // }, 500);

  if (tray) {
    tray.removeAllListeners();
  }
  if (!tray) {
    tray = new Tray(trayIcon('default'));
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

    tray.on('mouse-down', startingMenu);
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

      tray.on('mouse-down', trayClick);
      tray.on('right-click', trayClick);

      // tray.on('mouse-enter', () => {
      //   tray?.setImage(trayIcon('green'));
      // });
      // tray.on('mouse-leave', () => {
      //   tray?.setImage(trayIcon('default'));
      // });
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
      tray?.off('mouse-down', leftClickOverride);
      tray?.on('mouse-down', trayClick);
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

    tray?.off('mouse-down', trayClick);
    tray?.on('mouse-down', leftClickOverride);
  }
};
