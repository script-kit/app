/* eslint-disable import/prefer-default-export */
import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  screen,
  MenuItemConstructorOptions,
  PopupOptions,
  Menu,
} from 'electron';
import log from 'electron-log';
import fsExtra from 'fs-extra';
const { ensureDir } = fsExtra;
import path from 'path';
import { writeFile } from 'fs/promises';
import { kenvPath, isDir } from '@johnlindquist/kit/core/utils';
import { ShowOptions } from '@johnlindquist/kit/types/kitapp';
import { WidgetOptions } from '@johnlindquist/kit/types/pro';

import { snapshot } from 'valtio';
import { getAssetPath } from '../shared/assets';
import { darkTheme } from '../shared/themes';
import { forceQuit, kitState } from '../shared/state';
import { getCurrentScreenFromMouse } from './prompt';
import { fileURLToPath } from 'url';
import { Channel } from '@johnlindquist/kit/core/enum';

export const INSTALL_ERROR = 'install-error';

// let t

// let setIgnoreMouseEvents = (bool)=> {
//   ipcRenderer.send("WIDGET_IGNORE_MOUSE", bool)
// }

// window.addEventListener('mousemove', event => {
//   if (event.target === document.documentElement) {
//     setIgnoreMouseEvents(true)
//     if (t) clearTimeout(t)
//     t = setTimeout(function() {
//       setIgnoreMouseEvents(false)
//     }, 150)
//   } else setIgnoreMouseEvents(false)
// })

const devTools = () => {
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />

      <title>Dev Tools</title>
      <style>
        body {
          height: 100vh;
          width: 100vw;
          padding: 0;
          margin: 0;
        }
        @media (prefers-color-scheme: dark) {
          body {
            background: rgba(0, 0, 0, 0.25);
            color: white;
          }
        }

        @media (prefers-color-scheme: light) {
          body {
            background: rgba(255, 255, 255, 0.25);
            color: black;
          }
        }
      </style>
      <script>
        const { ipcRenderer } = require('electron');

        ipcRenderer.on('DEVTOOLS', (event, x) => {
          window['x'] = x;

          for (let [key, value] of Object.entries(x)) {
            window[key] = value;
          }

          console.log(x);
        });

        ipcRenderer.on('LOG', (event, x) => {
          console.log(x);
        });
      </script>
    </head>

    <body></body>
  </html>
  `;
};

const getCenterOnCurrentScreen = (
  options: BrowserWindowConstructorOptions = {}
) => {
  const cursor = screen.getCursorScreenPoint();
  // Get display with cursor
  const distScreen = screen.getDisplayNearestPoint({
    x: cursor.x,
    y: cursor.y,
  });

  const { width: screenWidth, height: screenHeight } = distScreen.workAreaSize;
  const width = options?.width || 480;
  const height = options?.height || 360;
  const x = distScreen.workArea.x + Math.floor(screenWidth / 2 - width / 2); // * distScreen.scaleFactor
  const y = distScreen.workArea.y + Math.floor(screenHeight / 2 - height / 2);

  return {
    width,
    height,
    x,
    y,
  };
};

const getTopRightCurrentScreen = (
  options: BrowserWindowConstructorOptions = {}
) => {
  const cursor = screen.getCursorScreenPoint();
  // Get display with cursor
  const distScreen = screen.getDisplayNearestPoint({
    x: cursor.x,
    y: cursor.y,
  });

  const width = options?.width || 480;
  const height = options?.height || 360;

  const {
    width: workAreaWidth,
    x: workAreaX,
    y: workAreaY,
  } = distScreen.workArea;

  const x = workAreaX + workAreaWidth - width; // * distScreen.scaleFactor
  const y = workAreaY;

  return {
    width,
    height,
    x,
    y,
  };
};

export const showInspector = (url: string): BrowserWindow => {
  const win = new BrowserWindow({
    title: 'Script Kit Inspector',
    width: 1024,
    height: 768,
    webPreferences: {
      zoomFactor: 1,
      devTools: true,
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      preload: fileURLToPath(new URL('../preload/index.mjs', import.meta.url)),
    },
    alwaysOnTop: true,
  });

  win.loadURL(url);

  // Position win to bottom right of current screen
  const currentScreen = getCurrentScreenFromMouse();
  const { x, y, width, height } = currentScreen.workArea;
  win.setPosition(x + width - win.getSize()[0], y + height - win.getSize()[1]);

  return win;
};

export const showDevTools = async (value: any, url = '') => {
  const center = getCenterOnCurrentScreen({ width: 800, height: 600 });

  const devToolsWindow = new BrowserWindow({
    ...center,
    titleBarStyle: 'customButtonsOnHover',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: false,
    transparent: true,
    // vibrancy: 'menu'
    // visualEffectState: 'active',
    show: false,
    width: 0,
    height: 0,
  });
  devToolsWindow.webContents.openDevTools({
    activate: true,
    mode: 'detach',
  });

  devToolsWindow.webContents.setZoomFactor(1);
  devToolsWindow.webContents.focus();

  if (value) {
    devToolsWindow.webContents.send('DEVTOOLS', value);
    devToolsWindow.webContents.send('LOG', `Type 'x' to access your object`);
  }

  const devToolsParentDir = (await isDir(kenvPath('tmp')))
    ? kenvPath('tmp', 'devTools')
    : app.getPath('appData');

  await ensureDir(devToolsParentDir);

  const devToolsPath = path.resolve(devToolsParentDir, 'devTools.html');
  await writeFile(devToolsPath, devTools());

  const devToolsUrl = `file://${devToolsPath}`;

  log.info(`Load ${devToolsUrl} in ${devToolsWindow.id}`);
  devToolsWindow?.loadURL(devToolsUrl, {});

  devToolsWindow.show();
  kitState.devToolsCount += 1;
  // devToolsWindow.focus();
  // devToolsWindow.webContents.focus();

  // setTimeout(() => pressShortcut(shortcut), 2000);

  devToolsWindow.webContents.on('devtools-closed', () => {
    log.info(`Close devTools: ${devToolsWindow.id}`);
    devToolsWindow?.destroy();
    // remove the id from the kitState.devToolsWindows using splice
    kitState.devToolsCount -= 1;
  });
};

export const show = async (
  name: string,
  html: string,
  options: ShowOptions = {},
  showOnLoad = true
): Promise<BrowserWindow> => {
  const position = options?.center
    ? getCenterOnCurrentScreen(options)
    : getTopRightCurrentScreen(options);

  const showWindow = new BrowserWindow({
    title: name,
    frame: false,
    transparent: kitState.isMac,
    vibrancy: 'popover',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    ...(options?.transparent
      ? {}
      : {
          vibrancy: 'popover',
          visualEffectState: 'active',
        }),
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    ...position,
    show: false,
    ...options,
  });

  showWindow?.setMaxListeners(1);

  showWindow?.webContents.on('before-input-event', (event: any, input) => {
    if (input.key === 'Escape') {
      showWindow.destroy();
      if (name === INSTALL_ERROR) {
        app.removeAllListeners('window-all-closed');
        const browserWindows = BrowserWindow.getAllWindows();
        browserWindows.forEach((browserWindow) => {
          browserWindow.removeAllListeners('close');
          browserWindow?.destroy();
        });

        forceQuit();
      }
      if (
        BrowserWindow.getAllWindows().every((window) => !window.isVisible())
      ) {
        if (app?.hide) app?.hide();
      }
    }
  });

  if (options?.ttl) {
    setTimeout(
      () => {
        showWindow.removeAllListeners();
        showWindow.destroy();
      },
      options?.ttl
    );
  }

  return new Promise((resolve, reject) => {
    showWindow.webContents.once('did-finish-load', () => {
      if (showOnLoad && showWindow) {
        showWindow?.show();
      }

      resolve(showWindow);
    });

    showWindow?.loadURL(`file://${showPath}`);
  });
};

export const showWidget = async (
  scriptPath: string,
  widgetId: string,
  html: string,
  options: WidgetOptions = {}
): Promise<BrowserWindow> => {
  options.body = options.body || html || '';
  const position = options?.center
    ? getCenterOnCurrentScreen(options as BrowserWindowConstructorOptions)
    : getTopRightCurrentScreen(options as BrowserWindowConstructorOptions);

  const bwOptions: BrowserWindowConstructorOptions = {
    title: `${path.basename(scriptPath)} | id: ${widgetId}`,
    frame: false,
    transparent: kitState.isMac,
    titleBarStyle: 'customButtonsOnHover',
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      experimentalFeatures: true,
      preload: fileURLToPath(new URL('../preload/index.mjs', import.meta.url)),
      webSecurity: false,
    },
    ...position,
    show: false,
    minHeight: 120,
    minWidth: 160,
    movable: true,

    ...(options as BrowserWindowConstructorOptions),
  };

  let widgetWindow: BrowserWindow;
  if (kitState.isMac) {
    widgetWindow = new BrowserWindow(bwOptions);
    if (!options.transparent) {
      widgetWindow.setVibrancy('popover');
    }
  } else if (!options?.transparent) {
    widgetWindow = new BrowserWindow({
      ...bwOptions,
      backgroundColor: '#00000000',
    });
  } else {
    widgetWindow = new BrowserWindow(bwOptions);
    widgetWindow.setBackgroundColor(`#00000000`);
  }

  if (options?.ignoreMouse)
    widgetWindow?.setIgnoreMouseEvents(true, { forward: true });

  if (options?.ttl) {
    setTimeout(
      () => {
        log.info(
          `Close widget: ${widgetWindow.id} due to timeout of ${options.ttl}ms`
        );
        widgetWindow.close();
      },
      options?.ttl
    );
  }

  return new Promise((resolve, reject) => {
    widgetWindow.webContents.once('did-finish-load', () => {
      if (widgetWindow) {
        widgetWindow.webContents.send(
          Channel.WIDGET_INIT,
          {
            ...options,
            widgetId,
          } || {}
        );

        // Set the css variables from kitState.theme
        widgetWindow.webContents.send(
          Channel.WIDGET_THEME,
          snapshot(kitState.theme)
        );

        const noShow =
          typeof options?.show === 'boolean' && options?.show === false;
        if (!noShow) {
          widgetWindow?.show();
        }
        resolve(widgetWindow);
      } else {
        log.error(`Widget ${widgetId} failed to load`);
      }
    });

    widgetWindow.webContents.on('context-menu', (event: any) => {
      log.info(`Context menu`);
      event?.preventDefault();

      if (!widgetWindow) {
        log.error('🛑 No BrowserWindow found');
        return;
      }

      const template: MenuItemConstructorOptions[] = [
        {
          label: 'Show Dev Tools',
          click: () => {
            log.info(`Show dev tools: ${widgetWindow.id}`);
            widgetWindow.webContents.openDevTools();
          },
        },
        {
          label: `Enable Click-Through`,
          checked: options.ignoreMouse,
          click: () => {
            log.info(`Enable click-through on ${widgetWindow.id}`);
            options.ignoreMouse = !options.ignoreMouse;
            widgetWindow.setIgnoreMouseEvents(options.ignoreMouse);
          },
        },
        {
          label: `Disable Click-Though with ${
            kitState.isMac ? `cmd` : `ctrl`
          }+L`,
          enabled: false,
        },

        {
          label: 'Close',
          click: () => {
            log.info(`Close widget: ${widgetWindow.id}`);
            widgetWindow?.close();
            widgetWindow.destroy();
          },
        },
      ];
      const menu = Menu.buildFromTemplate(template);
      menu.popup(widgetWindow as PopupOptions);
    });

    // log.info(`Load ${filePath} in ${widgetWindow.id}`);

    log.info({
      html,
    });

    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
      widgetWindow.loadURL(
        `${process.env['ELECTRON_RENDERER_URL']}/widget.html`
      );
    } else {
      widgetWindow.loadFile(path.join(__dirname, '../renderer/widget.html'));
    }
  });
};
