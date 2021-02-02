/* eslint-disable import/prefer-default-export */
import { app, BrowserWindow, screen } from 'electron';
import { getAssetPath } from './assets';

const styles = 'dist/style.css';

const page = (html: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simple Scripts Debugger</title>
    <link rel="stylesheet" href="${styles}">
    <script>
    const ipc = require('electron').ipcRenderer;

    ipc.on('debug', (event, data) => {
      console.log(data)
      let div = document.createElement("div")
      div.innerText = data.line
      document.body.appendChild(div)


      window.scrollTo({
        top: document.body.scrollHeight - document.body.clientHeight,
        behavior: 'auto',
      });
    })
    </script>
</head>
<body class="h-screen bg-black text-green-500 font-mono text-xs overflow-y-scroll">
</body>
</html>`;

const customProtocol = 'file2';

let debugWindow: BrowserWindow | null = null;

export const killDebug = () => {
  if (debugWindow) {
    debugWindow?.close();
    debugWindow = null;
  }
};

export const createDebug = () => {
  if (!debugWindow) {
    const cursor = screen.getCursorScreenPoint();
    // Get display with cursor
    const distScreen = screen.getDisplayNearestPoint({
      x: cursor.x,
      y: cursor.y,
    });

    const {
      width: screenWidth,
      height: screenHeight,
    } = distScreen.workAreaSize;
    const width = Math.floor((screenWidth / 4) * distScreen.scaleFactor);
    const height = Math.floor((screenHeight / 4) * distScreen.scaleFactor);
    const x = distScreen.workArea.x + Math.floor(screenWidth / 2 - width / 2); // * distScreen.scaleFactor
    const y = distScreen.workArea.y + Math.floor(screenHeight / 2 - height / 2);

    debugWindow = new BrowserWindow({
      frame: true,
      transparent: false,
      backgroundColor: '#00000000',
      show: true,
      icon: getAssetPath('icon.png'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      width,
      height,
      x,
      y,
    });

    debugWindow?.setMaxListeners(2);

    debugWindow.webContents.once('did-finish-load', () => {
      debugWindow?.webContents.closeDevTools();
    });

    debugWindow?.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(page(``))}`,
      {
        baseURLForDataURL: `${customProtocol}://${app
          .getAppPath()
          .replace('\\', '/')}/`,
      }
    );
  }
  return debugWindow;
};
