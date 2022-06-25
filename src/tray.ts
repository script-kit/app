/* eslint-disable import/prefer-default-export */
/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-loop-func */
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
import { colors, kitState, restartIfNecessary, trayColor } from './state';
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

    const updateMenu: MenuItemConstructorOptions = {
      label: 'Check for Updates',
      click: async () => {
        emitter.emit(KitEvent.CheckForUpdates, true);
      },
    };

    // if (kitState.starting) {
    //   updateMenu = {
    //     label: 'Starting up...',
    //     icon: menuIcon('green'),
    //   };
    // }

    // if (kitState.updateDownloading) {
    //   updateMenu = {
    //     label: 'Update downloading. Will auto-restart when complete.',
    //     icon: menuIcon('orange'),
    //   };
    // }

    // if (kitState.updateError) {
    //   updateMenu = {
    //     label: 'Update download failed. Check logs...',
    //     icon: menuIcon('red'),
    //   };
    // }

    const runScript = (script: string) => () => {
      emitter.emit(KitEvent.RunPromptProcess, script);
    };

    const kitItems: MenuItemConstructorOptions[] = [
      {
        type: 'separator',
      },
      {
        label: `Reveal ~/.kenv in Finder`,
        click: runScript(kitPath('help', 'reveal-kenv.js')),
      },
      {
        label: `Reveal ~/.kit/logs/kit.log in Finder`,
        click: runScript(kitPath('help', 'reveal-kit-log.js')),
      },
    ];

    const notifyItems: MenuItemConstructorOptions[] = [];

    for (const { color, label } of [...kitState.notifications].reverse()) {
      notifyItems.push({
        label,
        icon: menuIcon(color as iconType),
        click: runScript(kitPath('help', 'reveal-kit-log.js')),
      });
    }

    if (notifyItems.length) {
      notifyItems.push({
        type: 'separator',
      });
    }

    const authItems: MenuItemConstructorOptions[] = [];

    if (!kitState.authorized) {
      authItems.push({
        label: `Open Accessibility Panel to Enable Snippets, Clipbboard History, etc...,`,
        click: () => askForAccessibilityAccess(),
        icon: menuIcon(kitState.notifyAuthFail ? 'red' : 'cogwheel'),
      });

      authItems.push({
        label: `Learn More About Permissions`,
        click: runScript(kitPath('help', 'authorized-info.js')),
        icon: menuIcon('open_in_new'),
      });

      authItems.push({
        type: 'separator',
      });
    }

    const contextMenu = Menu.buildFromTemplate([
      ...notifyItems,
      ...authItems,
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
        label: `Join Community`,
        click: runScript(kitPath('help', 'get-help.js')),
        icon: menuIcon('github'),
      },
      {
        label: `Subscribe to the Newsletter`,
        click: runScript(kitPath('help', 'join.js')),
        icon: menuIcon('newsletter'),
      },
      {
        label: `Follow on Twitter`,
        click: runScript(kitPath('help', 'follow.js')),
        icon: menuIcon('twitter'),
      },
      {
        label: `Browse Community Scripts`,
        click: runScript(kitPath('cli', 'browse-examples.js')),
        icon: menuIcon('browse'),
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
          kitState.allowQuit = true;
          log.info(`Quitting...`);
          app.quit();
          app.exit();
        },
      },
    ]);
    contextMenu.once('menu-will-close', () => {
      kitState.notifications = [];
      kitState.notifyAuthFail = false;
    });
    tray?.popUpContextMenu(contextMenu);
  }
  // emitter.emit(KitEvent.RunPromptProcess, kitPath('main', 'kit.js'));
};

const isWin = os.platform() === 'win32';

const trayIcon = (color: trayColor) => {
  // log.info({
  //   reduceTransparency: kitState.reduceTransparency,
  //   isDark: kitState.isDark,
  // });
  const dark = !kitState.isDark && !kitState.transparencyEnabled ? `-dark` : ``;
  const pre = color === 'default' ? `default${dark}${isWin ? `-win` : ``}` : ``;
  const post = color !== 'default' ? `notification${dark}-${color}` : ``;

  // const greenIcon = getAssetPath(`tray`, `notification-green.png`);

  const name = `${pre}${post}`;

  log.info(`🎨 Tray icon: ${name}`);
  return getAssetPath(`tray`, `${name}.png`);
};

type iconType =
  | 'alarm'
  | 'browse'
  | 'bug'
  | 'cogwheel'
  | 'discord'
  | 'github'
  | 'help-alt'
  | 'help'
  | 'newsletter'
  | 'open'
  | 'open_in_new'
  | 'twitter'
  | 'red'
  | 'green'
  | 'orange';

const menuIcon = (name: iconType) => {
  const template = colors.includes(name as any) ? `` : `-Template`;
  return getAssetPath(`menu`, `${name}${template}.png`);
};

export const getTrayIcon = () => trayIcon('default');

export const createTray = async (checkDb = false) => {
  log.info(`🎨 Creating tray...`, { checkDb });

  subscribeKey(kitState, 'isDark', () => {
    tray?.setImage(trayIcon('default'));
    kitState.notifyAuthFail = false;
  });

  subscribeKey(kitState, 'transparencyEnabled', () => {
    tray?.setImage(trayIcon('default'));
    kitState.notifyAuthFail = false;
  });

  subscribeKey(kitState, 'notifyAuthFail', (fail) => {
    if (fail) {
      tray?.setImage(trayIcon('red'));
    } else {
      tray?.setImage(trayIcon('default'));
    }
  });

  subscribeKey(kitState, 'notifications', (notifications) => {
    if (notifications.length) {
      tray?.setImage(trayIcon(notifications[notifications.length - 1].color));
    } else {
      tray?.setImage(trayIcon('default'));
    }
  });

  if (tray) {
    tray.removeAllListeners();
  }
  if (!tray) {
    tray = new Tray(trayIcon('default'));
    tray.setIgnoreDoubleClickEvents(true);
  }
  if (kitState.starting) {
    const startingMenu = () => {
      const label = kitState.installing
        ? 'Installing Kit SDK...'
        : kitState.updateInstalling
        ? 'Applying Update...'
        : 'Starting...';
      kitState.orange = label;

      tray?.popUpContextMenu(
        Menu.buildFromTemplate([
          {
            label: `Script Kit ${getVersion()}`,
          },
          {
            label,
            icon: menuIcon('orange'),
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
