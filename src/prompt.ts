/* eslint-disable import/prefer-default-export */
import { BrowserWindow, screen, app } from 'electron';
import log from 'electron-log';
import { getAssetPath } from './assets';

let promptWindow: BrowserWindow | null = null;

const clearPrompt = () => {
  promptWindow?.webContents.send('escape', {});
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  hidePromptWindow();
};

export const createPromptWindow = async () => {
  promptWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    hasShadow: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    alwaysOnTop: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    movable: false,
  });

  promptWindow.setAlwaysOnTop(true, 'floating', 1);
  promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  promptWindow.loadURL(`file://${__dirname}/index.html`);

  promptWindow.webContents.once('did-finish-load', () => {
    promptWindow?.webContents.closeDevTools();
  });

  promptWindow?.setMaxListeners(2);

  promptWindow?.webContents.on('before-input-event', (event: any, input) => {
    if (input.key === 'Escape') {
      clearPrompt();
    }
  });

  promptWindow?.on('blur', clearPrompt);
};

export const focusPrompt = () => {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow?.focus();
  }
};

export const invokePromptWindow = (channel: string, data: any) => {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow?.setBackgroundColor('#00FFFFFF');
    promptWindow?.webContents.send(channel, data);
  }

  if (promptWindow && !promptWindow?.isVisible()) {
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

    const height = Math.floor(screenHeight / 3);
    const width = Math.floor(height * (4 / 3));
    const { x: workX, y: workY } = distScreen.workArea;
    const x = Math.floor(screenWidth / 2 - width / 2 + workX);
    const y = Math.floor(workY + height / 10);
    console.log({ screenWidth, screenHeight, width, height, x, y });
    promptWindow?.setBounds({ x, y, width, height });

    promptWindow?.show();
  }

  return promptWindow;
};

export const hidePromptWindow = () => {
  if (promptWindow && promptWindow?.isVisible()) {
    log.info(`Hiding prompt`);
    app?.hide();
    promptWindow?.hide();
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    hidePreview();
  }
};

let previewWindow: BrowserWindow | null = null;

const styles = 'dist/style.css';

const page = (html: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simple Scripts</title>
    <link rel="stylesheet" href="${styles}">
</head>
<body class="flex flex-row-reverse">
    ${html}
</body>
</html>`;

const customProtocol = 'file2';

export const createPreview = async () => {
  previewWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    show: false,
    hasShadow: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    alwaysOnTop: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    movable: false,
    focusable: false,
  });

  previewWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  previewWindow.webContents.once('did-finish-load', () => {
    previewWindow?.webContents.closeDevTools();
  });

  previewWindow?.setMaxListeners(2);

  previewWindow.setBackgroundColor('#00FFFFFF');
};

export const showPreview = async (html: string) => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    try {
      previewWindow.loadURL(
        `data:text/html;charset=UTF-8,${encodeURIComponent(page(html))}`,
        {
          baseURLForDataURL: `${customProtocol}://${app
            .getAppPath()
            .replace('\\', '/')}/`,
        }
      );
    } catch (error) {
      log.warn(error);
    }

    previewWindow.setBackgroundColor('#00FFFFFF');
  }
  if (previewWindow && !previewWindow?.isVisible()) {
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

    const height = Math.floor(screenHeight / 3);
    const width = Math.floor(height * (4 / 3));
    const { x: workX, y: workY } = distScreen.workArea;
    const x = Math.floor(screenWidth / 2 - width / 2 + workX) - width;
    const y = Math.floor(workY + height / 10);
    previewWindow?.setBounds({ x, y, width, height });

    previewWindow.setFocusable(false);
    previewWindow?.show();
  }

  return previewWindow;
};

export const hidePreview = () => {
  if (previewWindow && previewWindow.isVisible()) {
    previewWindow?.hide();
    previewWindow.loadURL(`data:text/html;charset=UTF-8,`);
  }
};
