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

// REMOVE-MAC
import nmp from 'node-mac-permissions';
const { askForAccessibilityAccess, askForInputMonitoringAccess } = nmp;
// END-REMOVE-MAC

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
  resolveToScriptPath,
} from '@johnlindquist/kit/core/utils';

import { getAssetPath } from '../shared/assets';
import { forceQuit, kitState, subs } from '../shared/state';
import { emitter, KitEvent } from '../shared/events';
import { getVersion } from './version';
import { AppChannel, Trigger } from '../shared/enums';
import { mainLogPath, updateLogPath } from './logs';
import { prompts } from './prompts';
import { processes } from './process';
import { debounce } from 'lodash-es';

let tray: Tray | null = null;

const buildAuthSubmenu = (): MenuItemConstructorOptions[] => {
  const authItems: MenuItemConstructorOptions[] = [];

  return authItems;
};

const buildRunningScriptsSubmenu = async (): Promise<
  MenuItemConstructorOptions[]
> => {
  const runningScripts: MenuItemConstructorOptions[] = [];

  if (processes.find((p) => p?.scriptPath)) {
    // Terminate all running scripts

    runningScripts.push({
      type: 'separator',
    });

    runningScripts.push({
      label: 'Terminate All Running Scripts',
      click: () => {
        for (const { pid } of processes) {
          processes.removeByPid(pid);
        }
      },
    });

    runningScripts.push({
      type: 'separator',
    });

    runningScripts.push({
      label: 'Running Proccesses',
      enabled: false,
    });

    for await (const { pid, scriptPath, date } of processes) {
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
            new Date(date as number),
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

  return runningScripts;
};

const buildNotifySubmenu = (): MenuItemConstructorOptions[] => {
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

  return notifyItems;
};

const buildUpdateSubmenu = (): MenuItemConstructorOptions[] => {
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
              sponsorCheck: false,
            },
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

  return updateItems;
};

const buildWatcherSubmenu = (): MenuItemConstructorOptions[] => {
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

  return watcherSubmenu;
};

const buildPermissionsSubmenu = (): MenuItemConstructorOptions[] => {
  const permissionsSubmenu: MenuItemConstructorOptions[] = [];

  // REMOVE-MAC
  if (kitState.isMac) {
    permissionsSubmenu.push({
      label: `Request Accessibility Access`,
      click: async () => {
        const result = await askForAccessibilityAccess();
        log.info(`Accessibility Access: ${result}`);
      },
    });

    permissionsSubmenu.push({
      label: `Request Input Monitoring Access`,
      click: async () => {
        const result = await askForInputMonitoringAccess();
        log.info(`Input Monitoring Access: ${result}`);
      },
    });

    permissionsSubmenu.push({
      label: `Request Full Disk Access`,
      click: async () => {
        // const result = await askForFullDiskAccess();
        // log.info(`Full Disk Access: ${result}`);
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
        sponsorCheck: false,
      });
    },
  });

  return permissionsSubmenu;
};

const buildPromptsSubmenu = (): MenuItemConstructorOptions[] => {
  const promptsSubmenu: MenuItemConstructorOptions[] = [];

  promptsSubmenu.push({
    label: `Open Focused Prompt Dev Tools`,
    click: async () => {
      log.info(`Opening focused prompt dev tools...`);
      prompts?.focused?.window?.webContents?.openDevTools();
    },
  });

  promptsSubmenu.push({
    label: 'Center Focused Prompt',
    click: () => {
      log.info(`Centering focused prompt...`);
      prompts.focused?.forcePromptToCenter();
    },
  });

  promptsSubmenu.push({
    label: 'Gather All Prompts to Center',
    click: () => {
      log.info(`Gathering all prompts to center...`);
      for (const prompt of prompts) {
        prompt.forcePromptToCenter();
      }
    },
  });

  promptsSubmenu.push({
    label: `Clear Prompt Cache`,
    click: runScript(kitPath('cli', 'kit-clear-prompt.js')),
  });

  return promptsSubmenu;
};

const buildToolsSubmenu = (): MenuItemConstructorOptions[] => {
  const toolsSubmenu: MenuItemConstructorOptions[] = [];

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
    },
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
        }) as MenuItemConstructorOptions,
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

  return toolsSubmenu;
};

export const openMenu = debounce(
  async (event?: KeyboardEvent) => {
    log.info(`🎨 openMenu`, event);

    if (event?.metaKey) {
      log.info(
        `🎨 Meta key held while clicking on tray. Running command click...`,
      );
      emitter.emit(
        KitEvent.RunPromptProcess,
        kenvPath('app', 'command-click.js'),
      );
    } else if (event?.shiftKey) {
      log.info(
        `🎨 Shift key held while clicking on tray. Running shift click...`,
      );
      emitter.emit(
        KitEvent.RunPromptProcess,
        kenvPath('app', 'shift-click.js'),
      );
    } else if (event?.ctrlKey) {
      log.info(
        `🎨 Ctrl key held while clicking on tray. Running control click...`,
      );
      emitter.emit(
        KitEvent.RunPromptProcess,
        kenvPath('app', 'control-click.js'),
      );
    } else if (event?.altKey) {
      log.info(`🎨 Alt key held while clicking on tray. Running alt click...`);
      emitter.emit(KitEvent.RunPromptProcess, kenvPath('app', 'alt-click.js'));
    } else {
      log.info(`🎨 Opening tray menu...`);
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

      // const isLowCpuEnabled = kitState.kenvEnv.KIT_LOW_CPU === 'true';

      // watcherSubmenu.push({
      //   label: `${isLowCpuEnabled ? `Disable` : `Enable`} Low CPU Mode`,
      //   click: runScript(kitPath('cli', 'set-env-var.js'), [
      //     'KIT_LOW_CPU',
      //     isLowCpuEnabled ? 'false' : 'true',
      //   ]),
      // });

      // Request Notifications Permission

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

      const contextMenu = Menu.buildFromTemplate([
        ...buildUpdateSubmenu(),
        ...buildNotifySubmenu(),
        ...buildAuthSubmenu(),
        createOpenMain(),
        {
          type: 'separator',
        },
        {
          label: `Script Kit Forum`,
          click: () => {
            shell.openExternal(
              `https://github.com/johnlindquist/kit/discussions`,
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
          label: `Prompts`,
          submenu: buildPromptsSubmenu(),
        },
        {
          label: `Tools`,
          submenu: buildToolsSubmenu(),
        },
        {
          label: `Permissions`,
          submenu: buildPermissionsSubmenu(),
        },
        {
          label: `Watchers`,
          submenu: buildWatcherSubmenu(),
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
        ...(await buildRunningScriptsSubmenu()),
        {
          label: 'Quit',
          click: () => {
            forceQuit();
          },
        },
      ]);
      contextMenu.once('menu-will-close', () => {
        log.info(`🎨 menu-will-close Closing tray menu...`);
        if (!kitState.starting && kitState.trayScripts.length === 0) {
          kitState.status = {
            status: 'default',
            message: '',
          };
        }

        kitState.trayOpen = false;
        kitState.scriptErrorPath = '';
      });
      log.info(`🎨 Opening tray menu...`);
      tray?.popUpContextMenu(contextMenu);
      kitState.trayOpen = true;
    }
    // emitter.emit(KitEvent.RunPromptProcess, kitPath('main', 'kit.js'));
  },
  200,
  {
    leading: true,
  },
);

const isWin = os.platform() === 'win32';

export const trayIcon = (status: Status) => {
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

const runScript =
  (
    scriptPath: string,
    args: string[] = [],
    options = { force: false, trigger: Trigger.App, sponsorCheck: false },
  ) =>
  () => {
    log.info(`🎨 Running script: ${scriptPath}`);
    emitter.emit(KitEvent.RunPromptProcess, {
      scriptPath,
      args,
      options,
    });
  };

const createOpenMain = () => {
  return {
    label: `Open Kit.app Prompt`,
    // icon: getAssetPath(`IconTemplate${isWin ? `-win` : ``}.png`),
    icon: menuIcon('open'),
    click: runScript(getMainScriptPath(), [], {
      force: true,
      trigger: Trigger.Tray,
      sponsorCheck: true,
    }),
    accelerator: kitState.mainShortcut,
  };
};

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

    globalShortcut.register('CommandOrControl+;', startingMenu);
    tray?.on('click', startingMenu);
  } else {
    if (!kitState.ready) {
      globalShortcut.unregister('CommandOrControl+;');
    }

    const trayEnabled = kitState.kenvEnv?.KIT_TRAY !== 'false';
    log.info(
      `🎨 Tray enabled by .env KIT_TRAY: ${trayEnabled ? 'true' : 'false'}`,
    );
    if (checkDb && !trayEnabled) {
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

      tray.removeAllListeners();

      if (kitState.isMac) {
        tray.on('mouse-down', openMenu);
      } else {
        tray.on('click', openMenu);
      }
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

const subReady = subscribeKey(kitState, 'ready', () => {
  if (kitState.trayOpen) {
    log.info(`🎨 Kit ready. Tray open. Stealing focus...`);
    app?.focus({
      steal: true,
    });
  }
});

subs.push(subReady);

let leftClickOverride: null | ((event: any) => void) = null;
export const setTrayMenu = async (scriptPaths: string[]) => {
  kitState.trayScripts = scriptPaths;
  if (!scriptPaths?.length) {
    if (leftClickOverride) {
      tray?.removeAllListeners('mouse-down');
      tray?.removeAllListeners('click');
      tray?.removeAllListeners('mouse-enter');

      if (kitState.isMac) {
        tray?.on('mouse-down', openMenu);
      } else {
        tray?.on('click', openMenu);
      }
      leftClickOverride = null;
      tray?.setContextMenu(null);
    }
    return;
  }

  const scriptMenuItems: MenuItemConstructorOptions[] = [];
  for (const scriptPath of scriptPaths) {
    scriptMenuItems.push({
      label: scriptPath,
      click: () => {
        emitter.emit(KitEvent.RunPromptProcess, {
          scriptPath: resolveToScriptPath(scriptPath, kenvPath()),
          args: [],
          options: {
            force: true,
            trigger: Trigger.Menu,
            sponsorCheck: false,
          },
        });
      },
    });
  }

  scriptMenuItems.push({
    type: 'separator',
  });

  scriptMenuItems.push(createOpenMain());
  scriptMenuItems.push({
    label: 'Reset Menu',
    click: () => {
      kitState.trayOpen = false;
      // TODO: Fix tray icon
      // tray?.setImage(getTrayIcon());
      tray?.setTitle('');
      setTrayMenu([]);
    },
  });

  if (scriptMenuItems.length) {
    const cMenu = Menu.buildFromTemplate(scriptMenuItems);

    leftClickOverride = () => {
      if (kitState.isLinux) {
        runScript(getMainScriptPath(), [], {
          force: true,
          trigger: Trigger.Tray,
          sponsorCheck: false,
        });
        return;
      }
      tray?.popUpContextMenu(cMenu);
      kitState.trayOpen = true;
    };

    tray?.removeAllListeners('mouse-down');
    tray?.removeAllListeners('click');

    if (kitState.isMac) {
      tray?.on('mouse-down', leftClickOverride);
    } else {
      tray?.on('click', leftClickOverride);
    }
  }
};

// Can also use the OPEN_MENU channel
emitter.on(KitEvent.TrayClick, openMenu);

export const checkTray = debounce(() => {
  const trayDisabled = kitState.kenvEnv?.KIT_TRAY === 'false';
  log.info(`🎨 Checking tray... ${trayDisabled ? 'disabled' : 'enabled'}`);
  if (trayDisabled) {
    destroyTray();
  } else {
    setupTray(false, 'default');
  }
}, 200);
