/* eslint-disable import/prefer-default-export */
import { BrowserWindow, screen } from 'electron';
import log from 'electron-log';
import { getAssetPath } from './assets';

let promptWindow: BrowserWindow | null = null;

export const createPromptWindow = async () => {
  promptWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  promptWindow.loadURL(`file://${__dirname}/index.html`);

  promptWindow.webContents.once('did-finish-load', () => {
    promptWindow?.webContents.closeDevTools();
  });

  promptWindow?.setMaxListeners(2);

  promptWindow?.webContents.on('before-input-event', (event: any, input) => {
    if (input.key === 'Escape') {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      hidePromptWindow();
      promptWindow?.webContents.send('escape', {});
    }
  });
};

export const invokePromptWindow = (channel: string, data: any) => {
  if (promptWindow) {
    promptWindow?.webContents.send(channel, data);
  }

  if (!promptWindow?.isVisible()) {
    const cursor = screen.getCursorScreenPoint();
    // Get display with cursor
    const distScreen = screen.getDisplayNearestPoint({
      x: cursor.x,
      y: cursor.y,
    });

    const { scaleFactor } = distScreen;
    const {
      width: screenWidth,
      height: screenHeight,
    } = distScreen.workAreaSize;
    const width = Math.floor((screenWidth * scaleFactor) / (3 * scaleFactor));
    const height = Math.floor((screenHeight * scaleFactor) / (3 * scaleFactor));
    const x = Math.floor(screenWidth * scaleFactor - width); // * distScreen.scaleFactor
    const { y } = distScreen.workArea;
    promptWindow?.setBounds({ x, y, width, height });

    promptWindow?.show();
  }

  return promptWindow;
};

export const hidePromptWindow = () => {
  if (promptWindow?.isVisible()) {
    log.info(`Hiding prompt`);

    promptWindow?.hide();
  }
};
