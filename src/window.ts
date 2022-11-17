import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { Channel, UI } from '@johnlindquist/kit/cjs/enum';
import { getLogFromScriptPath } from '@johnlindquist/kit/cjs/utils';
import Tail from 'tail';
import { readFile, stat, writeFile } from 'fs/promises';
import { getAssetPath } from './assets';
import { kitState, windowsState } from './state';
import { WindowChannel } from './enums';
import { getCurrentScreenFromMouse } from './prompt';

export const createWindow = async ({
  ui,
  scriptPath,
  title,
}: {
  ui: UI;
  scriptPath: string;
  title: string;
}) => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: getAssetPath('icon.png'),
    // transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true,
      backgroundThrottling: false,
    },
    frame: true,
    hasShadow: true,
    roundedCorners: true,
    show: false,
    title,
  });

  windowsState.windows.push({
    scriptPath,
    id: win.id,
  });

  win.on('close', () => {
    windowsState.windows = windowsState.windows.filter((w) => w.id !== win.id);
  });

  await win.loadURL(`file://${__dirname}/index.html?vs=${getAssetPath('vs')}`);

  // TODO: combine these into one channel
  try {
    win.webContents.send(Channel.SET_APPEARANCE, kitState.appearance);
    win.webContents.send(Channel.SET_THEME, kitState.theme);
    win.webContents.send(Channel.SET_PROMPT_DATA, {
      ui,
    });
  } catch (error) {
    log.error(error);
  }

  return win;
};

export const showLogWindow = async ({
  scriptPath,
  pid,
}: {
  scriptPath: string;
  pid: number;
}) => {
  // TODO: If Log window already exists, just show it
  const alreadyOpen = windowsState.windows.find(
    (w) => w.scriptPath === scriptPath && w.ui === UI.log
  );

  if (alreadyOpen) {
    return;
  }

  const logPath = getLogFromScriptPath(scriptPath);
  const win = await createWindow({ ui: UI.log, scriptPath, title: logPath });
  const currentScreen = getCurrentScreenFromMouse();
  const { x, y, width, height } = currentScreen.workArea;
  win.setSize(480, 800);
  win.setPosition(x + width - win.getSize()[0], y + height - win.getSize()[1]);
  win.show();

  // check if logPath exists using fs.stat promise
  try {
    await stat(logPath);
  } catch (error) {
    // if it doesn't exist, create it
    await writeFile(logPath, '');
    // await readFile(logPath, 'utf8');
    // win.webContents.send(
    //   WindowChannel.SET_LAST_LOG_LINE,
    //   `Log file not found. Creating ${logPath} from app.`
    // );
  }

  // get ipc events from the window
  win.webContents.on('ipc-message', async (event, channel, message) => {
    if (channel === Channel.SHORTCUT) {
      if (message?.state?.shortcut?.endsWith('l')) {
        log.info(`Clearing log file ${logPath}`);
        await writeFile(logPath, '');
        win.webContents.send(WindowChannel.SET_LOG_VALUE, '');
      }
    }
  });

  const tail = new Tail.Tail(logPath, {
    fromBeginning: true,
    follow: true,
  });

  let contents = '';
  try {
    contents = await readFile(logPath, 'utf8');

    if (contents && !win.isDestroyed()) {
      win.webContents.send(WindowChannel.SET_LOG_VALUE, contents);
    }
  } catch (err) {
    log.info('no log file found');
  }

  tail.on('line', (data) => {
    log.info({ data });
    if (win.isDestroyed()) return;
    win.webContents.send(WindowChannel.SET_LAST_LOG_LINE, data);
  });

  win.on('close', () => {
    tail.unwatch();
  });
};
