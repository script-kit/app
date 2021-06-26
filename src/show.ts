/* eslint-disable import/prefer-default-export */
import { app, BrowserWindow, screen } from 'electron';
import { writeFile, mkdir } from 'fs/promises';
import { getAssetPath } from './assets';
import { kenvPath, isDir } from './helpers';

const page = (body: string) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.skypack.dev/twind/shim" type="module"></script>
    <script>

    const {ipcRenderer} = require("electron")

    ipcRenderer.on('UPDATE', (event, {message, header})=> {
      if(header) document.querySelector(".header").innerHTML = header
      if(message) document.querySelector(".message").innerHTML = message
    })
    </script>
</head>
    ${body}
</html>`;
};

export const show = async (
  name: string,
  html: string,
  options: any = {},
  showOnLoad = true
): Promise<BrowserWindow> => {
  const cursor = screen.getCursorScreenPoint();
  // Get display with cursor
  const distScreen = screen.getDisplayNearestPoint({
    x: cursor.x,
    y: cursor.y,
  });

  const { width: screenWidth, height: screenHeight } = distScreen.workAreaSize;
  const width =
    options?.width || Math.floor((screenWidth / 4) * distScreen.scaleFactor);
  const height =
    options?.height || Math.floor((screenHeight / 4) * distScreen.scaleFactor);
  const x = distScreen.workArea.x + Math.floor(screenWidth / 2 - width / 2); // * distScreen.scaleFactor
  const y = distScreen.workArea.y + Math.floor(screenHeight / 2 - height / 2);

  const showWindow = new BrowserWindow({
    title: name,
    frame: true,
    transparent: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    width,
    height,
    x,
    y,
    show: false,
    vibrancy: 'popover',
    ...options,
  });

  showWindow?.setMaxListeners(2);

  showWindow?.webContents.on('before-input-event', (event: any, input) => {
    if (input.key === 'Escape') {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      showWindow.destroy();
      if (
        BrowserWindow.getAllWindows().every((window) => !window.isVisible())
      ) {
        app?.hide();
      }
    }
  });

  const showParentDir = isDir(kenvPath('tmp'))
    ? kenvPath('tmp', name)
    : app.getPath('appData');

  if (!isDir(showParentDir)) {
    await mkdir(showParentDir, { recursive: true });
  }

  const showPath = `${showParentDir}/${name}.html`;
  await writeFile(showPath, page(html));

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
