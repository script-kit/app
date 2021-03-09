/* eslint-disable import/prefer-default-export */
import { app, BrowserWindow, screen } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { getAssetPath } from './assets';

const page = (body: string, styles: string) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>${styles}</style>
    <script>
    console.log('SCRIPTING TIME!!!!')
    const {ipcRenderer} = require("electron")

    console.log(ipcRenderer)

    ipcRenderer.on('MESSAGE', (event, message)=> {
      console.log(event, message)
      document.querySelector(".message").innerHTML = message
    })
    </script>
</head>
    ${body}
</html>`;
};

export const show = async (
  name: string,
  html: string,
  options: any = {}
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
    ...options,
  });

  showWindow?.setMaxListeners(2);

  if (!options?.preventDestroy) {
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
  }
  const baseURL = app.getAppPath().replace('\\', '/');
  const stylePath = `${baseURL}/dist/style.css`;
  const styles = await readFile(stylePath, { encoding: 'utf8' });
  const showPath = `${baseURL}/dist/${name}.html`;
  await writeFile(showPath, page(html, styles));

  return new Promise((resolve, reject) => {
    showWindow.webContents.once('did-finish-load', () => {
      showWindow?.webContents.closeDevTools();
      showWindow?.show();
      resolve(showWindow);
    });

    showWindow?.loadURL(`file://${showPath}`);
  });
};
