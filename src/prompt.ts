/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import { BrowserWindow, screen, app } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';
import { EventEmitter } from 'events';
import { getAssetPath } from './assets';

const promptStore = new Store({ name: 'prompt' });

let promptWindow: BrowserWindow | null = null;
let blurredBySimple = false;

export const hideEmitter = new EventEmitter();

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
      devTools: process.env.NODE_ENV === 'development',
    },
    alwaysOnTop: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    movable: true,
    skipTaskbar: true,
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
      hidePromptWindow();
    }
  });

  promptWindow?.on('blur', hidePromptWindow);
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

    const screenConfig = promptStore.get(`prompt.${String(distScreen.id)}`);

    if (screenConfig) {
      const currentScreenBounds = promptStore.get(
        `prompt.${String(distScreen.id)}.bounds`
      );

      promptWindow.setBounds(currentScreenBounds as any);
    } else {
      const {
        width: screenWidth,
        height: screenHeight,
      } = distScreen.workAreaSize;

      const height = Math.floor(screenHeight / 3);
      const width = Math.floor(height * (4 / 3));
      const { x: workX, y: workY } = distScreen.workArea;
      const x = Math.floor(screenWidth / 2 - width / 2 + workX);
      const y = Math.floor(workY + height / 10);

      promptWindow?.setBounds({ x, y, width, height });
      promptWindow?.setMaximumSize(width, height);
      promptWindow?.setMinimumSize(width, height);
    }

    // TODO: Think through "show on every invoke" logic
    if (!promptWindow?.isVisible() && channel !== 'CLEAR_PROMPT') {
      promptWindow?.show();
    }
  }

  return promptWindow;
};

export const hidePromptWindow = (ignoreBlur = false) => {
  invokePromptWindow('CLEAR_PROMPT', {});

  if (ignoreBlur) {
    blurredBySimple = false;
  }

  if (promptWindow && promptWindow?.isVisible() && !blurredBySimple) {
    const distScreen = screen.getDisplayNearestPoint({
      x: promptWindow.getBounds().x,
      y: promptWindow.getBounds().y,
    });
    const promptBounds = promptWindow.getBounds();
    promptStore.set(`prompt.${String(distScreen.id)}.bounds`, promptBounds);
    if (!debugWindow?.isVisible()) {
      if (promptWindow.isVisible()) {
        app?.hide();
        promptWindow?.hide();
      }
    }
  }
  blurredBySimple = false;
  hideEmitter.emit('hide');
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
      devTools: process.env.NODE_ENV === 'development',
    },
    alwaysOnTop: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    movable: true,
    skipTaskbar: true,
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

    const screenConfig = promptStore.get(`preview.${String(distScreen.id)}`);

    if (screenConfig) {
      const currentScreenBounds = promptStore.get(
        `preview.${String(distScreen.id)}.bounds`
      );

      previewWindow.setBounds(currentScreenBounds as any);
    } else {
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
      previewWindow?.setMaximumSize(width, height);
      previewWindow?.setMinimumSize(width, height);
    }
    previewWindow.setFocusable(false);
    blurredBySimple = true;
    previewWindow?.show();
  }

  return previewWindow;
};

export const hidePreview = () => {
  if (previewWindow && previewWindow.isVisible()) {
    const distScreen = screen.getDisplayNearestPoint({
      x: previewWindow.getBounds().x,
      y: previewWindow.getBounds().y,
    });
    promptStore.set(
      `preview.${String(distScreen.id)}.bounds`,
      previewWindow.getBounds()
    );
    previewWindow?.hide();
    // clear preview
    previewWindow.loadURL(`data:text/html;charset=UTF-8,`);
  }
};

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
      show: false,
      frame: true,
      transparent: false,
      backgroundColor: '#00000000',
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

    debugWindow.on('focus', () => {
      blurredBySimple = true;
    });

    debugWindow?.setMaxListeners(2);

    debugWindow.webContents.once('did-finish-load', () => {
      debugWindow?.webContents.closeDevTools();
    });

    debugWindow?.loadURL(`file://${__dirname}/debug.html`);
    blurredBySimple = true;
    debugWindow?.show();
  }
  return debugWindow;
};

export const debugToggle = () => {
  debugWindow = createDebug();
  if (debugWindow) {
    debugWindow?.webContents.on(
      'before-input-event',
      (event: any, input: any) => {
        if (input.key === 'Escape') {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          killDebug();
          debugWindow = null;
        }
      }
    );
  }
};

let debugLineIndex = 0;
export const debugLine = (line: string) => {
  if (debugWindow && !debugWindow?.isDestroyed()) {
    debugWindow.webContents.send('debug', {
      line,
      i: debugLineIndex += 1,
    });
  }
};
