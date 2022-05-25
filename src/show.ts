/* eslint-disable import/prefer-default-export */
import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  screen,
  nativeTheme,
} from 'electron';
import log from 'electron-log';
import { ensureDir } from 'fs-extra';
import path from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { kenvPath, isDir } from '@johnlindquist/kit/cjs/utils';
import { ShowOptions } from '@johnlindquist/kit/types/kitapp';
import { WidgetOptions } from '@johnlindquist/kit/types/pro';

import { getAssetPath } from './assets';
import { darkTheme, lightTheme } from './components/themes';
import { kitState } from './state';

export const INSTALL_ERROR = 'install-error';

const page = (body: string, options: ShowOptions) => {
  const baseURL = app.getAppPath().replace('\\', '/');
  const stylePath = `${baseURL}/dist/style.css`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${stylePath}">
    <style>
      body {
        ${
          options?.transparent
            ? `
          background-color: rgba(0, 0, 0, 0) !important;`
            : ``
        }

        ${
          options?.draggable
            ? `
            -webkit-user-select: none;
            -webkit-app-region: drag;
        `
            : ``
        }

        pointer-events: none
      }

      * {pointer-events: all;}
      .draggable {-webkit-app-region: drag;}
    </style>



    <style>
    ${nativeTheme.shouldUseDarkColors ? darkTheme : lightTheme}
    </style>
    <script>

    window.addEventListener('load', () => {
      let minWidth = document.body.firstElementChild.offsetWidth + 'px'
      document.body.firstElementChild.style.display = "inline-block"
      document.body.style.minWidth = minWidth;
    })

    const {ipcRenderer} = require("electron")

    ipcRenderer.on('UPDATE', (event, {message, header, spinner})=> {
      if(header) document.querySelector(".header").innerHTML = header
      if(message) document.querySelector(".message").innerHTML = message
      if(typeof spinner === "boolean") document.querySelector(".spinner").classList[spinner ? "remove" : "add"]("hidden")
    })

    let cw = 0
    let ch = 0
    let resize = ()=>  setTimeout(()=> {
      let width =  Math.ceil(document.body.firstElementChild.offsetWidth)
      let height =  Math.ceil(document.body.firstElementChild.offsetHeight)

      if(width === cw && height === ch) return
      cw = width
      ch = height


      ipcRenderer.send("WIDGET_RESIZE", {
        width,
        height
      })
    }, 500)

    ipcRenderer.on('WIDGET_UPDATE', (event, {html})=> {
      document.body.innerHTML = html
      resize()
    })

    resize()

    ${
      kitState.isMac
        ? ``
        : `
    document.documentElement.style.setProperty("--opacity-themedark", "100%");
    document.documentElement.style.setProperty("--opacity-themelight", "100%");
    `
    }
    </script>
</head>
    ${body}
    <script>

    document.addEventListener("click", (event) => {
      console.log(window.id, event.target)
      ipcRenderer.send("WIDGET_CLICK", {
        targetId: event.target.id,
        windowId: window.id
      })
    })


    document.addEventListener("input", (event) => {
      ipcRenderer.send("WIDGET_INPUT", {
        targetId: event.target.id,
        windowId: window.id,
        value: event.target.value
      })
    })

    // const myObserver = new ResizeObserver(entries => {
    //   entries.forEach(entry => {
    //     console.log('width', entry.contentRect.width);
    //     console.log('height', entry.contentRect.height);

    //     ipcRenderer.send("WIDGET_RESIZE", {
    //       width: Math.round(entry.contentRect.width),
    //       height: Math.round(entry.contentRect.height)
    //     })
    //   });
    // });


    // myObserver.observe(document.body.firstElementChild);

    </script>
</html>`;
};

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
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script>
      const { ipcRenderer } = require('electron');

      ipcRenderer.on('DEVTOOLS', (event, x) => {
        window['x'] = x;

        for (let [key, value] of Object.entries(x)) {
          window[key] = value;
        }

        console.log(x);
      });
    </script>
</head>
</html>`;
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

export const showDevTools = async (value: any) => {
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
    // vibrancy: 'menu',
    // visualEffectState: 'active',
    show: false,
    width: 0,
    height: 0,
  });
  devToolsWindow.webContents.openDevTools({
    activate: true,
    mode: 'detach',
  });

  devToolsWindow.webContents.setZoomFactor(1.5);

  devToolsWindow.webContents.focus();

  if (value) {
    devToolsWindow.webContents.send('DEVTOOLS', value);
  }

  const devToolsParentDir = (await isDir(kenvPath('tmp')))
    ? kenvPath('tmp', 'devTools')
    : app.getPath('appData');

  await ensureDir(devToolsParentDir);

  const devToolsPath = path.resolve(devToolsParentDir, 'devTools.html');
  await writeFile(devToolsPath, devTools());

  const devToolsUrl = `file://${devToolsPath}`;

  log.info(`Load ${devToolsUrl} in ${devToolsWindow.id}`);
  devToolsWindow?.loadURL(devToolsUrl);

  devToolsWindow.show();
  devToolsWindow.focus();
  devToolsWindow.webContents.focus();

  devToolsWindow.webContents.on('devtools-closed', () => {
    log.info(`Close devTools: ${devToolsWindow.id}`);
    devToolsWindow?.destroy();
  });
};

export const show = async (
  name: string,
  html: string,
  options: ShowOptions = {},
  showOnLoad = true
): Promise<BrowserWindow> => {
  const center = getCenterOnCurrentScreen(options);
  const showWindow = new BrowserWindow({
    title: name,
    frame: false,
    transparent: true,
    ...(options?.transparent
      ? {}
      : {
          vibrancy: 'menu',
        }),
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    ...center,
    show: false,
    ...options,
  });

  showWindow?.setMaxListeners(2);

  showWindow?.webContents.on('before-input-event', (event: any, input) => {
    if (input.key === 'Escape') {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      showWindow.destroy();
      if (name === INSTALL_ERROR) {
        app.removeAllListeners('window-all-closed');
        const browserWindows = BrowserWindow.getAllWindows();
        browserWindows.forEach((browserWindow) => {
          browserWindow.removeAllListeners('close');
          browserWindow?.destroy();
        });

        app.quit();
        app.exit();
      }
      if (
        BrowserWindow.getAllWindows().every((window) => !window.isVisible())
      ) {
        if (app?.hide) app?.hide();
      }
    }
  });

  const showParentDir = kenvPath('tmp', name);
  await ensureDir(kenvPath('tmp', name));

  const showPath = `${showParentDir}/${name}.html`;
  log.info(`Load ${showPath} in ${showWindow.id}`);
  await writeFile(showPath, page(html, options));

  if (options?.ttl) {
    setTimeout(() => {
      showWindow.removeAllListeners();
      showWindow.destroy();
    }, options?.ttl);
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
  widgetId: string,
  filePath: string,
  options: WidgetOptions = {}
): Promise<BrowserWindow> => {
  const center = getCenterOnCurrentScreen(options);
  const widgetWindow = new BrowserWindow({
    title: 'Script Kit Widget',
    frame: false,
    transparent: true,
    ...(options?.transparent
      ? {}
      : {
          vibrancy: 'menu',
        }),
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    ...center,
    show: false,
    minHeight: 36,
    minWidth: 36,
    ...options,
  });

  if (options?.ignoreMouse)
    widgetWindow?.setIgnoreMouseEvents(true, { forward: true });

  if (options?.ttl) {
    setTimeout(() => {
      widgetWindow.removeAllListeners();
      widgetWindow.destroy();
    }, options?.ttl);
  }

  return new Promise((resolve, reject) => {
    widgetWindow.webContents.once('did-finish-load', () => {
      if (widgetWindow) {
        widgetWindow.webContents.send('WIDGET_INIT', options.state || {});
        widgetWindow?.show();
        resolve(widgetWindow);
      } else {
        log.error(`Widget ${widgetId} failed to load`);
      }
    });

    log.info(`Load ${filePath} in ${widgetWindow.id}`);

    widgetWindow?.loadURL(`file://${filePath}?widgetId=${widgetId}`);
  });
};
