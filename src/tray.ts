/* eslint-disable import/prefer-default-export */
/* eslint-disable no-nested-ternary */
import {
  Notification,
  Tray,
  Menu,
  MenuItemConstructorOptions,
  globalShortcut,
  shell,
  ipcMain,
  app,
} from 'electron';
import { formatDistanceToNow } from 'date-fns';
import path from 'path';
import { rm } from 'fs/promises';
import log, { LogLevel } from 'electron-log';
import { KitStatus, Status } from '@johnlindquist/kit/types/kitapp';
import { subscribeKey } from 'valtio/utils';
import { KeyboardEvent } from 'electron/main';
import os from 'os';
import {
  kenvPath,
  kitPath,
  knodePath,
  getMainScriptPath,
  isFile,
  getLogFromScriptPath,
} from '@johnlindquist/kit/cjs/utils';
import { getAppDb, getScriptsDb } from '@johnlindquist/kit/cjs/db';
import { getAssetPath } from './assets';
import { appDb, forceQuit, kitState, subs } from './state';
import { emitter, KitEvent } from './events';
import { getVersion } from './version';
import { AppChannel, HideReason, Trigger } from './enums';
import { mainLogPath, updateLogPath } from './logs';
import { getMainPrompt, maybeHide } from './prompt';

let tray: Tray | null = null;

export const openMenu = async (event?: KeyboardEvent) => {
  log.verbose(`🎨 Menu state: ${kitState.trayOpen ? 'open' : 'closed'}`);
  if (kitState.trayOpen) {
    tray?.closeContextMenu();
    kitState.trayOpen = false;
    return;
  }

  if (event?.metaKey) {
    emitter.emit(
      KitEvent.RunPromptProcess,
      kenvPath('app', 'command-click.js')
    );
  } else if (event?.shiftKey) {
    emitter.emit(KitEvent.RunPromptProcess, kenvPath('app', 'shift-click.js'));
  } else if (event?.ctrlKey) {
    emitter.emit(
      KitEvent.RunPromptProcess,
      kenvPath('app', 'control-click.js')
    );
  } else if (event?.altKey) {
    emitter.emit(KitEvent.RunPromptProcess, kenvPath('app', 'alt-click.js'));
  } else {
    // emitter.emit(KitEvent.RunPromptProcess, getMainScriptPath());

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

    const runScript =
      (
        scriptPath: string,
        args: string[] = [],
        options = { force: false, trigger: Trigger.App }
      ) =>
      () => {
        emitter.emit(KitEvent.RunPromptProcess, {
          scriptPath,
          args,
          options,
        });
      };

    const notifyItems: MenuItemConstructorOptions[] = [];

    for (const { status, message } of [...kitState.notifications].reverse()) {
      notifyItems.push({
        label: message,
        icon: menuIcon(status as iconType),
        click: runScript(kitPath('help', 'reveal-kit-log.js')),
      });
    }

    if (notifyItems.length) {
      notifyItems.push({
        type: 'separator',
      });
    }

    const authItems: MenuItemConstructorOptions[] = [];
    const updateItems: MenuItemConstructorOptions[] = [];

    if (kitState.requiresAuthorizedRestart) {
      updateItems.push({
        label: `Click to Restart Kit and Apply Permissions Changes`,
        click: () => {
          kitState.relaunch = true;
          // electron quit and restart
          forceQuit();
        },
      });
    }

    if (kitState.scriptErrorPath) {
      let logPath = kitPath('logs', 'kit.log');
      if (kitState.scriptErrorPath) {
        logPath = getLogFromScriptPath(kitState.scriptErrorPath);
      }
      updateItems.push({
        label: `Error Running ${path.basename(kitState.scriptErrorPath || '')}`,
        submenu: [
          {
            label: `Open ${path.basename(kitState.scriptErrorPath)}`,
            click: runScript(
              kitPath('cli', 'edit-script.js'),
              [kitState.scriptErrorPath],
              {
                force: true,
                trigger: Trigger.Tray,
              }
            ),
          },
          {
            label: `Open ${path.basename(logPath)}`,
            click: () => {
              shell.openPath(logPath);
            },
          },
        ],
        icon: menuIcon('warn'),
      });

      updateItems.push({
        type: 'separator',
      });
    }

    if (kitState.updateDownloaded) {
      updateItems.push({
        label: `Update Downloaded. Click to quit and install.`,
        click: () => {
          kitState.applyUpdate = true;
        },
        icon: menuIcon('cogwheel'),
      });

      updateItems.push({
        type: 'separator',
      });
    }

    const runningScripts: MenuItemConstructorOptions[] = [];

    if (kitState.ps.find((p) => p?.scriptPath)) {
      runningScripts.push({
        type: 'separator',
      });

      runningScripts.push({
        label: 'Running Proccesses',
        enabled: false,
      });

      for await (const { pid, scriptPath, date } of kitState.ps) {
        if (scriptPath) {
          const logItems: MenuItemConstructorOptions[] = [];
          const maybeLog = getLogFromScriptPath(scriptPath);

          const logExists = await isFile(maybeLog);

          if (logExists) {
            logItems.push({
              label: 'View Log',
              click: () => {
                emitter.emit(KitEvent.OpenLog, scriptPath as string);
              },
            });
          }
          let uptimeLabel = ``;

          try {
            uptimeLabel = `uptime: ${formatDistanceToNow(
              new Date(date as number)
            )}`;
          } catch (error) {
            // ignore
          }

          runningScripts.push({
            label: path.basename(scriptPath as string),
            submenu: [
              // Conditionally show uptime label
              ...(uptimeLabel ? [{ label: uptimeLabel }] : []),
              {
                label: `Process ID: ${pid}`,
              },
              {
                label: 'Terminate',
                click: () => {
                  emitter.emit(KitEvent.KillProcess, pid);
                },
              },
              ...logItems,
              {
                label: 'Edit',
                click: () => {
                  emitter.emit(KitEvent.OpenScript, scriptPath as string);
                },
              },
            ],
          });
        }
      }

      runningScripts.push({
        type: 'separator',
      });
    }
    const watcherSubmenu: MenuItemConstructorOptions[] = [];

    watcherSubmenu.push({
      label: 'Control Watchers',
      enabled: false,
    });

    watcherSubmenu.push({
      label: `${
        kitState.suspendWatchers ? `Resume` : `Suspend`
      } Script and File Watchers`,
      click: () => {
        kitState.suspendWatchers = !kitState.suspendWatchers;
      },
    });

    const toolsSubmenu: MenuItemConstructorOptions[] = [];

    toolsSubmenu.push({
      label: `Open Dev Tools`,
      click: async () => {
        emitter.emit(KitEvent.OpenDevTools);
      },
    });

    toolsSubmenu.push({
      label: 'Force Prompt to Front',
      click: () => {
        runScript(getMainScriptPath(), [], {
          force: true,
          trigger: Trigger.Tray,
        })();

        getMainPrompt()?.show();
        getMainPrompt()?.setPosition(0, 0);
        getMainPrompt()?.center();
        getMainPrompt()?.focus();
        getMainPrompt()?.setAlwaysOnTop(true, 'pop-up-menu', 1);
      },
    });

    toolsSubmenu.push({
      label: `Force Reload`,
      click: async () => {
        ipcMain.emit(AppChannel.RELOAD);
      },
    });

    toolsSubmenu.push(
      {
        type: 'separator',
      },
      {
        label: `Open kit.log`,
        click: async () => {
          shell.openPath(kitPath('logs', 'kit.log'));
        },
      }
    );

    if (kitState.isMac) {
      toolsSubmenu.push({
        label: `Watch kit.log in Terminal`,
        click: runScript(kitPath('help', 'tail-log.js')),
      });
    }

    toolsSubmenu.push({
      label: `Adjust Log Level`,
      submenu: log.levels.map(
        (level) =>
          ({
            label: level,
            click: () => {
              kitState.logLevel = level as LogLevel;
            },
            enabled: kitState.logLevel !== level,
          }) as MenuItemConstructorOptions
      ),
    });

    toolsSubmenu.push({
      type: 'separator',
    });

    toolsSubmenu.push({
      label: `Open main.log`,
      click: () => {
        shell.openPath(mainLogPath);
      },
    });

    toolsSubmenu.push({
      label: `Open update.log`,
      click: () => {
        shell.openPath(updateLogPath);
      },
    });

    toolsSubmenu.push({
      type: 'separator',
    });

    toolsSubmenu.push({
      label: `Reveal ~/.kenv`,
      click: runScript(kitPath('help', 'reveal-kenv.js')),
    });

    toolsSubmenu.push({
      label: `Reset Prompt`,
      click: runScript(kitPath('cli', 'kit-clear-prompt.js')),
    });

    toolsSubmenu.push({
      type: 'separator',
    });

    toolsSubmenu.push({
      label: 'Restart Script Watcher',
      click: () => {
        emitter.emit(KitEvent.RestartWatcher);
      },
    });

    toolsSubmenu.push({
      label: 'Force Repair Kit SDK. Will Automatically Restart',
      click: async () => {
        log.warn(`Repairing kit SDK node_modules...`);
        emitter.emit(KitEvent.TeardownWatchers);
        try {
          await rm(knodePath(), { recursive: true, force: true });
          await rm(kitPath(), { recursive: true, force: true });
        } catch (error) {
          log.error(error);
        }

        kitState.relaunch = true;
        forceQuit();
      },
    });

    toolsSubmenu.push({
      type: 'separator',
    });

    toolsSubmenu.push({
      label: 'Install VS Code Extension',
      click: runScript(kitPath('help', 'install-vscode-extension.js')),
    });

    toolsSubmenu.push({
      type: 'separator',
    });

    // Request Notifications Permission

    const permissionsSubmenu: MenuItemConstructorOptions[] = [];

    // REMOVE-MAC
    if (kitState.isMac) {
      permissionsSubmenu.push({
        label: `Request Accessibility Access`,
        click: async () => {
          const { askForAccessibilityAccess } = await import(
            'node-mac-permissions'
          );

          askForAccessibilityAccess();
        },
      });

      permissionsSubmenu.push({
        label: `Request Input Monitoring Access`,
        click: async () => {
          const { askForInputMonitoringAccess } = await import(
            'node-mac-permissions'
          );

          askForInputMonitoringAccess();
        },
      });

      permissionsSubmenu.push({
        label: `Request Full Disk Access`,
        click: async () => {
          const { askForFullDiskAccess } = await import('node-mac-permissions');

          askForFullDiskAccess();
        },
      });
    }
    // END-REMOVE-MAC
    permissionsSubmenu.push({
      label: `Request Notification Permission`,
      click: async () => {
        new Notification({
          title: 'Kit.app Notification',
          body: 'This is a test notification from Kit.app',
        }).show();

        // wait 2 seconds to see if it worked
        await new Promise((resolve) => setTimeout(resolve, 2000));

        runScript(kitPath('debug', 'test-notification.js'), [], {
          force: true,
          trigger: Trigger.Tray,
        });
      },
    });

    // toolsSubmenu.push({
    //   label: `Prevent Close on Blur`,
    //   type: 'checkbox',
    //   click: () => {
    //     log.info(
    //       `Toggling ignoreBlur to ${!kitState.preventClose ? 'true' : 'false'}`
    //     );
    //     kitState.preventClose = !kitState.preventClose;
    //   },
    //   checked: kitState.preventClose,
    // });

    const fixItems: MenuItemConstructorOptions[] = [];

    if (
      kitState.pid &&
      kitState.scriptPath === getMainScriptPath() &&
      kitState.promptCount === 1
    ) {
      fixItems.push({
        label: `Fix Stuck Process`,
        click: () => {
          log.info(`Killing ${kitState.pid}`);
          emitter.emit(KitEvent.KillProcess, kitState.pid);
          maybeHide(HideReason.MainShortcut);
        },
      });
    }

    const contextMenu = Menu.buildFromTemplate([
      ...fixItems,
      ...updateItems,
      ...notifyItems,
      ...authItems,
      {
        label: `Open Kit.app Prompt`,
        // icon: getAssetPath(`IconTemplate${isWin ? `-win` : ``}.png`),
        icon: menuIcon('open'),
        click: runScript(getMainScriptPath(), [], {
          force: true,
          trigger: Trigger.Tray,
        }),
        accelerator: kitState.mainShortcut,
      },
      {
        type: 'separator',
      },
      {
        label: `Script Kit Forum`,
        click: () => {
          shell.openExternal(
            `https://github.com/johnlindquist/kit/discussions`
          );
        },
        icon: menuIcon('github'),
      },
      {
        label: `Subscribe to the Newsletter`,
        click: runScript(kitPath('help', 'join.js')),
        icon: menuIcon('newsletter'),
      },
      {
        label: `Follow on Twitter`,
        click: () => {
          shell.openExternal(`https://twitter.com/scriptkitapp`);
        },
        icon: menuIcon('twitter'),
      },
      {
        label: `Browse Community Scripts`,
        click: () => {
          shell.openExternal(`https://scriptkit.com/scripts`);
        },
        icon: menuIcon('browse'),
      },
      {
        type: 'separator',
      },
      {
        label: `Script Kit ${getVersion()}`,
        enabled: false,
      },
      {
        label: `Watchers`,
        submenu: watcherSubmenu,
      },
      {
        label: `Debug`,
        submenu: toolsSubmenu,
      },
      {
        label: `Permissions`,
        submenu: permissionsSubmenu,
      },
      updateMenu,
      {
        type: 'separator',
      },
      // {
      //   label: `Open Settings`,
      //   click: runScript(kitPath('cli', 'settings.js')),
      // },
      {
        label: `Change Shortcut`,
        click: runScript(kitPath('cli', 'change-main-shortcut.js')),
      },
      ...runningScripts,
      {
        label: 'Quit',
        click: () => {
          forceQuit();
        },
      },
    ]);
    contextMenu.once('menu-will-close', () => {
      if (!kitState.starting) {
        kitState.status = {
          status: 'default',
          message: '',
        };
      }

      kitState.trayOpen = false;
      kitState.scriptErrorPath = '';
    });
    tray?.popUpContextMenu(contextMenu);
    kitState.trayOpen = true;
  }
  // emitter.emit(KitEvent.RunPromptProcess, kitPath('main', 'kit.js'));
};

const isWin = os.platform() === 'win32';

const trayIcon = (status: Status) => {
  log.info(`🎨 Tray icon: ${status}`);
  if (isWin) return getAssetPath(`tray`, `default-win-Template.png`);

  return getAssetPath(`tray`, `${status}-Template.png`);
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
  | Status;

const menuIcon = (name: iconType) => {
  return getAssetPath(`menu`, `${name}-Template.png`);
};

export const getTrayIcon = () => trayIcon('default');

export const setupTray = async (checkDb = false, state: Status = 'default') => {
  log.info(`🎨 Creating tray...`);

  // subscribeKey(kitState, 'isDark', () => {
  //   tray?.setImage(trayIcon('default'));
  //   kitState.notifyAuthFail = false;
  // });

  // subscribeKey(kitState, 'transparencyEnabled', () => {
  //   tray?.setImage(trayIcon('default'));
  //   kitState.notifyAuthFail = false;
  // });

  if (tray) {
    tray.removeAllListeners();
  }

  if (!tray) {
    tray = new Tray(trayIcon(state));
    tray.setIgnoreDoubleClickEvents(true);

    subscribeKey(kitState, 'status', (status: KitStatus) => {
      try {
        log.info(`🎨 Tray status: ${status.status}`);
        tray?.setImage(trayIcon(status.status));
      } catch (error) {
        log.error(error);
      }
    });
  }
  if (kitState.starting) {
    const startingMenu = () => {
      shell.beep();
      log.verbose(`🎨 Starting menu...`);
      const message = kitState.installing
        ? 'Installing Kit SDK...'
        : kitState.updateInstalling
        ? 'Applying Update to SDK. Please Wait...'
        : 'Starting...';

      kitState.status = {
        status: 'busy',
        message,
      };

      if (kitState.trayOpen) {
        kitState.trayOpen = false;
        tray?.closeContextMenu();
      } else {
        kitState.trayOpen = true;
        const startMenu = Menu.buildFromTemplate([
          {
            label: `Script Kit ${getVersion()}`,
            accelerator: kitState.mainShortcut,
            enabled: false,
          },
          {
            label: message,
            icon: menuIcon('busy'),
          },
          // add quit option
          {
            label: 'Quit',
            click: () => {
              forceQuit();
            },
          },
        ]);
        startMenu.once('menu-will-close', () => {
          kitState.trayOpen = false;
        });
        tray?.popUpContextMenu(startMenu);
      }
    };

    tray.on('mouse-down', startingMenu);
    tray.on('right-click', startingMenu);

    globalShortcut.register('CommandOrControl+;', startingMenu);
  } else {
    if (!kitState.ready) {
      globalShortcut.unregister('CommandOrControl+;');
    }
    const fileAppDb = await getAppDb();
    if (
      checkDb &&
      typeof fileAppDb?.tray === 'boolean' &&
      fileAppDb.tray === false
    ) {
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

      tray.on('mouse-down', openMenu);
      tray.on('right-click', openMenu);
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

const subTray = subscribeKey(appDb, 'tray', () => {
  if (!appDb.tray && tray) {
    destroyTray();
  } else {
    setupTray(false, 'default');
  }
});

const subReady = subscribeKey(kitState, 'ready', () => {
  if (kitState.trayOpen) {
    app?.focus({
      steal: true,
    });
  }
});

subs.push(subTray, subReady);

let leftClickOverride: null | ((event: any) => void) = null;
export const setTrayMenu = async (scriptPaths: string[]) => {
  if (!scriptPaths?.length) {
    if (leftClickOverride) {
      tray?.off('mouse-down', leftClickOverride);
      tray?.on('mouse-down', openMenu);
      leftClickOverride = null;
      tray?.setContextMenu(null);
    }
    return;
  }

  const db = await getScriptsDb();
  const scriptMenuItems = [];
  for (const scriptPath of scriptPaths) {
    const script = db.scripts.find((s) => s.filePath === scriptPath);
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
      kitState.trayOpen = true;
    };

    tray?.off('mouse-down', openMenu);
    tray?.on('mouse-down', leftClickOverride);
  }
};

// Can also use the OPEN_MENU channel
emitter.on(KitEvent.TrayClick, openMenu);
