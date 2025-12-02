import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Channel } from '@johnlindquist/kit/core/enum';
import { isDir, kenvPath } from '@johnlindquist/kit/core/utils';
import type { ShowOptions } from '@johnlindquist/kit/types/kitapp';
import type { WidgetOptions } from '@johnlindquist/kit/types/pro';
/* eslint-disable import/prefer-default-export */
import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  Menu,
  type MenuItemConstructorOptions,
  type PopupOptions,
  screen,
} from 'electron';
import { getAssetPath } from '../shared/assets';
import { ensureDir } from './cjs-exports';
import { getCurrentScreenFromMouse } from './prompt.screen-utils';
import { forceQuit, kitState } from './state';
import { widgetPool } from './widget-pool';

export const INSTALL_ERROR = 'install-error';

import { isUrl } from './helpers';
import { createLogger } from './log-utils';

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

/**
 * Layout presets for widget positioning
 */
type LayoutPreset =
  | 'center'
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'sidebar-right'
  | 'sidebar-left'
  | 'top-bar'
  | 'bottom-bar';

/**
 * Calculate widget position and size based on layout preset
 */
const getLayoutPosition = (
  layout: LayoutPreset,
  options: BrowserWindowConstructorOptions & { margin?: number; monitor?: 'current' | 'primary' } = {},
) => {
  const margin = options.margin ?? 20;
  const monitor = options.monitor ?? 'current';

  // Get the appropriate display
  let display: Electron.Display;
  if (monitor === 'primary') {
    display = screen.getPrimaryDisplay();
  } else {
    const cursor = screen.getCursorScreenPoint();
    display = screen.getDisplayNearestPoint({ x: cursor.x, y: cursor.y });
  }

  const { x: areaX, y: areaY, width: areaWidth, height: areaHeight } = display.workArea;

  // Default widget size
  let width = options.width || 300;
  let height = options.height || 200;

  // Calculate position based on layout
  let x: number;
  let y: number;

  switch (layout) {
    case 'center':
      x = areaX + Math.round((areaWidth - width) / 2);
      y = areaY + Math.round((areaHeight - height) / 2);
      break;

    case 'top-right':
      x = areaX + areaWidth - width - margin;
      y = areaY + margin;
      break;

    case 'top-left':
      x = areaX + margin;
      y = areaY + margin;
      break;

    case 'bottom-right':
      x = areaX + areaWidth - width - margin;
      y = areaY + areaHeight - height - margin;
      break;

    case 'bottom-left':
      x = areaX + margin;
      y = areaY + areaHeight - height - margin;
      break;

    case 'sidebar-right':
      // Sidebars span full height
      height = areaHeight;
      x = areaX + areaWidth - width;
      y = areaY;
      break;

    case 'sidebar-left':
      height = areaHeight;
      x = areaX;
      y = areaY;
      break;

    case 'top-bar':
      // Bars span full width
      width = areaWidth;
      x = areaX;
      y = areaY;
      break;

    case 'bottom-bar':
      width = areaWidth;
      x = areaX;
      y = areaY + areaHeight - height;
      break;

    default:
      // Default to top-right
      x = areaX + areaWidth - width - margin;
      y = areaY + margin;
  }

  log.info('📍 Layout position calculated', {
    layout,
    margin,
    monitor,
    result: { x, y, width, height },
  });

  return { x, y, width, height };
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

export const showDevTools = async (value: any, _url = '') => {
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
  _html: string,
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

  showWindow?.webContents.on('before-input-event', (_event: any, input) => {
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

  return new Promise((resolve, _reject) => {
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
  log.info('🚀 Starting showWidget', {
    scriptPath,
    widgetId,
    htmlLength: html?.length,
    options: JSON.stringify(options),
  });

  options.body = options.body || html || '';
  log.info('📐 Calculating window position', {
    center: options?.center,
    layout: options?.layout,
    options: JSON.stringify(options),
  });

  // Calculate position based on layout preset, center option, or default to top-right
  let position: { x: number; y: number; width: number; height: number };

  if (options?.layout) {
    // Use layout preset
    position = getLayoutPosition(options.layout as LayoutPreset, options as any);
  } else if (options?.center) {
    // Use center positioning
    position = getCenterOnCurrentScreen(options as BrowserWindowConstructorOptions);
  } else {
    // Default to top-right
    position = getTopRightCurrentScreen(options as BrowserWindowConstructorOptions);
  }

  log.info('📍 Calculated position', { position });

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
      webviewTag: true,
      allowRunningInsecureContent: true,
    },
    ...position,
    show: false,
    minHeight: 0,
    minWidth: 0,
    movable: true,
    backgroundMaterial: 'auto',

    ...(options as BrowserWindowConstructorOptions),
  };

  log.info('🔧 Final BrowserWindow options', {
    bwOptions: JSON.stringify(bwOptions),
    isMac: kitState.isMac,
  });

  let widgetWindow: BrowserWindow;
  let fromPool = false;

  // Try to claim a pre-warmed window from the pool first
  const pooledWindow = widgetPool.claim();

  if (pooledWindow) {
    log.info('⚡ Using pooled window (instant)', {
      windowId: pooledWindow.id,
      poolStats: widgetPool.getStats(),
    });

    widgetWindow = pooledWindow;
    fromPool = true;

    // Configure the pooled window with our options
    widgetWindow.setTitle(bwOptions.title || '');
    widgetWindow.setSize(position.width, position.height);
    widgetWindow.setPosition(position.x, position.y);

    if (kitState.isMac && !options.transparent) {
      widgetWindow.setVibrancy('popover');
    }
  } else {
    // Fall back to cold window creation
    try {
      if (kitState.isMac) {
        log.info('🍎 Creating Mac BrowserWindow (cold)');
        widgetWindow = new BrowserWindow(bwOptions);
        if (!options.transparent) {
          log.info(`Setting vibrancy to 'popover'`);
          widgetWindow.setVibrancy('popover');
        }
      } else if (options?.transparent) {
        log.info('🪟 Creating transparent BrowserWindow (cold)');
        widgetWindow = new BrowserWindow(bwOptions);
        widgetWindow.setBackgroundColor('#00000000');
      } else {
        log.info('🪟 Creating standard BrowserWindow (cold)');
        widgetWindow = new BrowserWindow({
          ...bwOptions,
          backgroundColor: '#00000000',
        });
      }

      log.info('✅ BrowserWindow created successfully', {
        windowId: widgetWindow.id,
        bounds: widgetWindow.getBounds(),
        fromPool: false,
      });
    } catch (error) {
      log.error('❌ Failed to create BrowserWindow', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  if (options?.ignoreMouse) {
    log.info('🖱️ Setting ignore mouse events', {
      windowId: widgetWindow.id,
      ignoreMouse: true,
    });
    widgetWindow?.setIgnoreMouseEvents(true, { forward: true });
  }

  if (options?.ttl) {
    log.info('⏲️ Setting TTL timeout', {
      windowId: widgetWindow.id,
      ttl: options.ttl,
    });
    await setTimeout(options?.ttl);
    log.info('⌛ TTL expired, closing widget', {
      windowId: widgetWindow.id,
      ttl: options.ttl,
    });
    widgetWindow.close();
  }

  return new Promise((resolve, reject) => {
    log.info('🔄 Setting up widget initialization promise', {
      windowId: widgetWindow?.id || 'unknown',
      widgetId,
    });

    if (!widgetWindow?.webContents) {
      const error = new Error('Widget window or webContents is null');
      log.error('❌ Widget initialization failed', {
        error: error.message,
        windowId: widgetWindow?.id,
      });
      reject(error);
      return;
    }

    widgetWindow.webContents.ipc.once(Channel.WIDGET_GET, () => {
      log.info('📨 Received WIDGET_GET event', {
        windowId: widgetWindow.id,
        widgetId,
      });

      if (widgetWindow) {
        const widgetOptions = {
          ...options,
          widgetId,
        };
        log.info('📤 Sending WIDGET_INIT', {
          windowId: widgetWindow.id,
          widgetOptions: JSON.stringify(widgetOptions),
        });
        widgetWindow.webContents.send(Channel.WIDGET_INIT, widgetOptions);

        const theme = kitState.theme;
        log.info('🎨 Sending theme', {
          windowId: widgetWindow.id,
          theme: JSON.stringify(theme),
        });
        widgetWindow.webContents.send(Channel.WIDGET_THEME, theme);

        const noShow = typeof options?.show === 'boolean' && options?.show === false;
        log.info('👁️ Widget visibility', {
          windowId: widgetWindow.id,
          noShow,
          showOption: options?.show,
        });

        if (!noShow) {
          widgetWindow?.show();
          log.info('✨ Widget shown', {
            windowId: widgetWindow.id,
            bounds: widgetWindow.getBounds(),
          });
        }

        if (options?.showDevTools || options?.devTools) {
          log.info('🛠️ Opening DevTools', {
            windowId: widgetWindow.id,
          });
          widgetWindow?.webContents.openDevTools({
            mode: 'detach',
          });
        }

        resolve(widgetWindow);
      } else {
        const error = new Error(`Widget ${widgetId} failed to load`);
        log.error('❌ Widget initialization failed', {
          error: error.message,
          widgetId,
        });
        reject(error);
      }
    });

    widgetWindow.webContents.on('context-menu', (event: any) => {
      log.info('📋 Context menu requested', {
        windowId: widgetWindow?.id,
      });
      event?.preventDefault();

      if (!widgetWindow) {
        log.error('❌ No BrowserWindow found for context menu');
        return;
      }

      const template: MenuItemConstructorOptions[] = [
        {
          label: 'Show Dev Tools',
          click: () => {
            log.info('🛠️ Opening DevTools from context menu', {
              windowId: widgetWindow.id,
            });
            widgetWindow.webContents.openDevTools({
              mode: 'detach',
            });
          },
        },
        {
          label: 'Enable Click-Through',
          checked: options.ignoreMouse,
          click: () => {
            log.info('🖱️ Toggling click-through', {
              windowId: widgetWindow.id,
              newState: !options.ignoreMouse,
            });
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
            log.info('🚫 Closing widget from context menu', {
              windowId: widgetWindow.id,
            });
            widgetWindow?.close();
            widgetWindow.destroy();
          },
        },
      ];
      const menu = Menu.buildFromTemplate(template);
      menu.popup(widgetWindow as PopupOptions);
    });

    log.info('🌐 Loading content', {
      windowId: widgetWindow.id,
      isUrl: isUrl(html),
      html: html?.substring(0, 100) + (html?.length > 100 ? '...' : ''),
    });

    try {
      if (isUrl(html)) {
        log.info('🔗 Loading URL content', {
          windowId: widgetWindow.id,
          url: html,
        });
        loadWidgetUrl(widgetWindow, html);
      } else if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
        const url = `${process.env.ELECTRON_RENDERER_URL}/widget.html`;
        log.info('🔗 Loading development URL', {
          windowId: widgetWindow.id,
          url,
        });
        widgetWindow.loadURL(url);
      } else {
        const filePath = fileURLToPath(new URL('../renderer/widget.html', import.meta.url));
        log.info('📄 Loading widget HTML file', {
          windowId: widgetWindow.id,
          filePath,
        });
        widgetWindow.loadFile(filePath);
      }
    } catch (error) {
      log.error('❌ Failed to load widget content', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        windowId: widgetWindow.id,
      });
      reject(error);
    }
  });
};
