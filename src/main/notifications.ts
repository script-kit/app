/* eslint-disable import/prefer-default-export */
import { BrowserWindow, app, screen } from 'electron';
import { KIT_PROTOCOL } from './helpers';

let notificationWindow: BrowserWindow | null = null;

export const createNotification = async () => {
  notificationWindow = new BrowserWindow({
    title: 'Kit Notification',
    frame: true,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    // TODO: Fix icon
    // icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow?.webContents.on('before-input-event', (event: any, input) => {
      if (input.key === 'Escape') {
        hidePromptWindow();
        notificationWindow?.webContents.send('escape', {});
      }
    });
  }
  return notificationWindow;
};

const styles = 'dist/style.css';

const page = (html: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kit Notification</title>
    <link rel="stylesheet" href="${styles}">
</head>
<body>
    ${html}
</body>
</html>`;

export const showNotification = (html: string, options: any = {}) => {
  notificationWindow?.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(page(html))}`, {
    baseURLForDataURL: `${KIT_PROTOCOL}://${app.getAppPath().replace('\\', '/')}/`,
  });
  if (!notificationWindow?.isVisible()) {
    const cursor = screen.getCursorScreenPoint();
    // Get display with cursor
    const distScreen = screen.getDisplayNearestPoint({
      x: cursor.x,
      y: cursor.y,
    });

    const { width: screenWidth, height: screenHeight } = distScreen.workAreaSize;
    const width = Math.floor((screenWidth / 4) * distScreen.scaleFactor);
    const height = Math.floor((screenHeight / 4) * distScreen.scaleFactor);
    const x = Math.floor(screenWidth * distScreen.scaleFactor - width); // * distScreen.scaleFactor
    const { y } = distScreen.workArea;
    notificationWindow?.setBounds({ x, y, width, height, ...options });

    notificationWindow?.show();
  }

  return notificationWindow;
};

export const hidePromptWindow = () => {
  if (notificationWindow?.isVisible()) {
    notificationWindow?.hide();
  }
};
