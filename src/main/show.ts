/* eslint-disable import/prefer-default-export */
import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  Menu,
  type MenuItemConstructorOptions,
  type PopupOptions,
  app,
  screen,
} from 'electron';
import { ensureDir } from './cjs-exports';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDir, kenvPath } from '@johnlindquist/kit/core/utils';
import type { ShowOptions } from '@johnlindquist/kit/types/kitapp';
import type { WidgetOptions } from '@johnlindquist/kit/types/pro';
import { setTimeout } from 'node:timers/promises';

import { fileURLToPath } from 'node:url';
import { Channel } from '@johnlindquist/kit/core/enum';
import { snapshot } from 'valtio';
import { getAssetPath } from '../shared/assets';
import { getCurrentScreenFromMouse } from './prompt';
import { forceQuit, kitState } from './state';

export const INSTALL_ERROR = 'install-error';

import { createLogger } from '../shared/log-utils';
import { isUrl } from './helpers';

const log = createLogger('show.ts');

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

const getCenterOnCurrentScreen = (options: BrowserWindowConstructorOptions = {}) => {
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

const getTopRightCurrentScreen = (options: BrowserWindowConstructorOptions = {}) => {
  const cursor = screen.getCursorScreenPoint();
  // Get display with cursor
  const distScreen = screen.getDisplayNearestPoint({
    x: cursor.x,
    y: cursor.y,
  });

  const width = options?.width || 480;
  const height = options?.height || 360;

  const { width: workAreaWidth, x: workAreaX, y: workAreaY } = distScreen.workArea;

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
      // preload: fileURLToPath(new URL('../preload/index.mjs', import.meta.url)),
    },
    // alwaysOnTop: true,
  });

  win.loadURL(url);

  // Position win to bottom right of current screen
  const currentScreen = getCurrentScreenFromMouse();
  const { x, y, width, height } = currentScreen.workArea;
  win.setPosition(x + width - win.getSize()[0], y + height - win.getSize()[1]);

  return win;
};

export const showDevTools = async (value: any, url = '') => {
  const devToolsWindow = new BrowserWindow({
    // vibrancy: 'menu'
    // visualEffectState: 'active',
    show: false,
    width: 0,
    height: 0,
    webPreferences: {
      zoomFactor: 1,
      devTools: true,
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      preload: fileURLToPath(new URL('../preload/index.mjs', import.meta.url)),
    },
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

  const devToolsParentDir = (await isDir(kenvPath('tmp'))) ? kenvPath('tmp', 'devTools') : app.getPath('appData');

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

const loadWidgetUrl = async (widgetWindow: BrowserWindow, url: string) => {
  log.info(`Loading URL: ${url}`);
  try {
    await widgetWindow.loadURL(url);
  } catch (error) {
    log.error(error);
  }
  log.info('Ready to show. Inserting CSS');
  await widgetWindow.webContents.insertCSS('.draggable { -webkit-app-region: drag; }');
};

export const show = async (
  name: string,
  html: string,
  options: ShowOptions = {},
  showOnLoad = true,
): Promise<BrowserWindow> => {
  const position = options?.center ? getCenterOnCurrentScreen(options) : getTopRightCurrentScreen(options);

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
    backgroundMaterial: 'auto',
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
      if (BrowserWindow.getAllWindows().every((window) => !window.isVisible())) {
        if (app?.hide) {
          app?.hide();
        }
      }
    }
  });

  if (options?.ttl) {
    await setTimeout(options?.ttl);
    showWindow.removeAllListeners();
    showWindow.destroy();
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
  options: WidgetOptions = {},
): Promise<BrowserWindow> => {
  log.info(`Show widget: ${widgetId}`);
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
      devTools: true,
    },
    ...position,
    show: false,
    minHeight: 0,
    minWidth: 0,
    movable: true,
    backgroundMaterial: 'auto',

    ...(options as BrowserWindowConstructorOptions),
  };

  let widgetWindow: BrowserWindow;
  if (kitState.isMac) {
    widgetWindow = new BrowserWindow(bwOptions);
    if (!options.transparent) {
      widgetWindow.setVibrancy('popover');
    }
  } else if (options?.transparent) {
    widgetWindow = new BrowserWindow(bwOptions);
    widgetWindow.setBackgroundColor('#00000000');
  } else {
    widgetWindow = new BrowserWindow({
      ...bwOptions,
      backgroundColor: '#00000000',
    });
  }

  if (options?.ignoreMouse) {
    widgetWindow?.setIgnoreMouseEvents(true, { forward: true });
  }

  if (options?.ttl) {
    await setTimeout(options?.ttl);
    log.info(`Close widget: ${widgetWindow.id} due to timeout of ${options.ttl}ms`);
    widgetWindow.close();
  }

  return new Promise((resolve, reject) => {
    log.info(`Waiting for ${Channel.WIDGET_GET} from widgetWindow`, {
      widgetWindow: widgetWindow?.id || 'unknown',
      widgetId,
    });
    widgetWindow.webContents.ipc.once(Channel.WIDGET_GET, () => {
      log.info(`Received ${Channel.WIDGET_GET} from widgetWindow`);
      if (widgetWindow) {
        log.info(`Sending ${Channel.WIDGET_INIT} from widgetWindow`);
        widgetWindow.webContents.send(
          Channel.WIDGET_INIT,
          {
            ...options,
            widgetId,
          } || {},
        );

        // Set the css variables from kitState.theme
        const theme = kitState.theme;
        log.info('Current theme', {
          channel: Channel.WIDGET_THEME,
          theme,
        });
        widgetWindow.webContents.send(Channel.WIDGET_THEME, theme);

        const noShow = typeof options?.show === 'boolean' && options?.show === false;
        if (!noShow) {
          widgetWindow?.show();
        }
        if (options?.showDevTools) {
          widgetWindow?.webContents.openDevTools();
        }
        resolve(widgetWindow);
      } else {
        log.error(`Widget ${widgetId} failed to load`);
      }
    });

    widgetWindow.webContents.on('context-menu', (event: any) => {
      log.info('Context menu');
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
          label: 'Enable Click-Through',
          checked: options.ignoreMouse,
          click: () => {
            log.info(`Enable click-through on ${widgetWindow.id}`);
            options.ignoreMouse = !options.ignoreMouse;
            widgetWindow.setIgnoreMouseEvents(options.ignoreMouse);
          },
        },
        {
          label: `Disable Click-Though with ${kitState.isMac ? 'cmd' : 'ctrl'}+L`,
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

    if (isUrl(html)) {
      loadWidgetUrl(widgetWindow, html);
    } else if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
      log.info(`Loading URL: ${process.env.ELECTRON_RENDERER_URL}/widget.html`);
      widgetWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/widget.html`);
    } else {
      log.info(`Loading file: ${fileURLToPath(new URL('../renderer/widget.html', import.meta.url))}`);
      widgetWindow.loadFile(fileURLToPath(new URL('../renderer/widget.html', import.meta.url)));
    }
  });
};
