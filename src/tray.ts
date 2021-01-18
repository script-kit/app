/* eslint-disable import/prefer-default-export */
import { app, Menu, Tray } from 'electron';
import log from 'electron-log';
import {
  KeyboardEvent,
  MenuItemConstructorOptions,
  Point,
} from 'electron/main';
import { platform } from 'os';
import path from 'path';
import { Dirent } from 'fs';
import { grep } from 'shelljs';
import {
  processMap,
  SIMPLE_BIN_PATH,
  SIMPLE_SCRIPTS_PATH,
  trySimpleScript,
} from './simple';
import { getAssetPath } from './assets';
import { setPromptPosition } from './prompt';
import { shortcutMap } from './shortcuts';

let tray: Tray | null = null;
let menu: MenuItemConstructorOptions[] | null = null;

const makeMenu = async () => {
  menu = [];
  const menuMarker = 'Menu:';
  const files: Dirent[] = (await import('fs')).readdirSync(
    SIMPLE_SCRIPTS_PATH,
    {
      withFileTypes: true,
    }
  );

  files
    .filter((file) => file.isFile())
    .map((file) => file.name)
    .filter((name) => name.endsWith('.js'))
    .forEach((file) => {
      const filePath = path.join(SIMPLE_SCRIPTS_PATH, file);
      let { stdout } = grep(menuMarker, filePath);
      stdout = stdout.trim();

      const menuOptions = stdout.substring(
        stdout.indexOf(menuMarker) + menuMarker.length
      );
      if (!menuOptions) return;

      const accelerator = shortcutMap.get(filePath);

      const execPath = filePath.replace('scripts', 'bin').replace('.js', '');

      let label = menuOptions.trim();
      const click = () => trySimpleScript(execPath);

      if (processMap.get(execPath)) {
        label += ' 🔚';
      }

      const menuItem: MenuItemConstructorOptions = {
        // label: command + ": " + menuOptions,
        label,
        accelerator,
        click,
      };

      // log.info({ menuItem })
      menu?.push(menuItem);
    });

  menu.push(
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    }
  );
  return menu;
};

const makeOtherMenu = async () => {
  const files: Dirent[] = (await import('fs')).readdirSync(
    SIMPLE_SCRIPTS_PATH,
    {
      withFileTypes: true,
    }
  );

  const commands = files
    .filter((file) => file.isFile())
    .filter((file) => file.name.endsWith('.js'))
    .map((file) => file.name.replace('.js', ''));

  const menuItems = commands.map((command) => {
    const simpleExecPath = path.join(SIMPLE_BIN_PATH, 'simple');
    return {
      label: command,
      submenu: [
        {
          label: 'edit',
          click: () => {
            trySimpleScript(simpleExecPath, ['edit', command]);
          },
        },
        // {
        //   label: "rm",
        //   click: () => {
        //     trySimpleScript(simpleExecPath, ["rm", command])
        //   },
        // },
        {
          label: 'duplicate',
          click: () => {
            trySimpleScript(simpleExecPath, ['cp', command]);
          },
        },
        {
          label: 'rename',
          click: () => {
            trySimpleScript(simpleExecPath, ['mv', command]);
          },
        },
      ],
    };
  });

  const newItem = {
    label: 'new',
    click: () => {
      const execPath = path.join(SIMPLE_BIN_PATH, 'new');
      trySimpleScript(execPath);
    },
  };

  return [newItem, ...menuItems];
};

const leftClick = async (event: KeyboardEvent, position: Point) => {
  const menuCondition = event.altKey || event.shiftKey || event.ctrlKey;
  const menuTemplate = await (menuCondition ? makeOtherMenu() : makeMenu());
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
};

const trayIcon = getAssetPath('IconTemplate.png');

export const createTray = async () => {
  try {
    tray = new Tray(trayIcon);
    tray.setIgnoreDoubleClickEvents(true);

    if (platform().includes('darwin')) {
      tray.on('mouse-down', leftClick);
    } else {
      tray.on('click', leftClick);
    }
  } catch (error) {
    log.error(error);
  }

  return 'tray created';
};
