import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { getLogFromScriptPath } from '@johnlindquist/kit/core/utils';
import { BrowserWindow } from 'electron';
import log from 'electron-log';
import Tail from 'tail';
import { snapshot } from 'valtio';
import { getAssetPath } from '../shared/assets';
import { WindowChannel } from '../shared/enums';
import { windowsState } from '../shared/windows';
import { getCurrentScreenFromMouse } from './prompt';
import { getPromptOptions } from './prompt.options';
import { kitState } from './state';

export const createWindow = async ({
  ui,
  scriptPath,
  title,
}: {
  ui: UI;
  scriptPath: string;
  title: string;
}) => {
  const options = getPromptOptions();
  log.info(`Creating log window for ${scriptPath}`);

  const win = new BrowserWindow({
    ...options,
    title,
    frame: true,
  });

  windowsState.windows.push({
    scriptPath,
    id: win.id,
    ui,
  });

  win.on('close', () => {
    windowsState.windows = windowsState.windows.filter((w) => w.id !== win.id);
  });

  await win.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)), {
    query: { vs: getAssetPath('vs') },
  });

  win.webContents.executeJavaScript(`
  document.title = '${title}'
  `);

  // TODO: combine these into one channel
  try {
    win.webContents.send(Channel.SET_APPEARANCE, kitState.appearance);
    win.webContents.send(Channel.SET_THEME, snapshot(kitState.theme));
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
  let tail: Tail.Tail;
  const alreadyOpen = windowsState.windows.find((w) => w.scriptPath === scriptPath && w.ui === UI.log);

  if (alreadyOpen) {
    log.info(`${alreadyOpen?.id}: Log window already open for ${scriptPath}`, {
      alreadyOpen,
    });
    BrowserWindow.fromId(alreadyOpen.id)?.showInactive();
    return;
  }

  const logPath = getLogFromScriptPath(scriptPath);
  const { base: title } = path.parse(logPath);
  const win = await createWindow({ ui: UI.log, scriptPath, title });
  const currentScreen = getCurrentScreenFromMouse();
  const { x, y, width, height } = currentScreen.workArea;
  win.setSize(480, 800);
  win.setPosition(x + width - win.getSize()[0], y + height - win.getSize()[1]);
  win.showInactive();

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
      if (message?.state?.shortcut?.endsWith('y')) {
        log.info(`Clearing log file ${logPath}`);
        await writeFile(logPath, '');
        win.webContents.send(WindowChannel.SET_LOG_VALUE, '');
      }

      if (message?.state?.shortcut?.endsWith('w')) {
        log.info('Closing log window');
        tail?.unwatch();
        win.close();
        win.destroy();
        windowsState.windows = windowsState.windows.filter((w) => w.id !== win.id);
        log.info(`Close handled. Destroying log window ${win.id}`);
      }
    }

    if (channel === WindowChannel.MOUNTED) {
      tail = new Tail.Tail(logPath, {
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
        if (win.isDestroyed()) {
          return;
        }
        win.webContents.send(WindowChannel.SET_LAST_LOG_LINE, data);
      });
    }
  });
};
