/* eslint-disable no-nested-ternary */
import os from 'os';
import untildify from 'untildify';
import { KIT_FIRST_PATH } from '@johnlindquist/kit/cjs/utils';
import log from 'electron-log';
import { ipcMain } from 'electron';
import { debounce } from 'lodash';
import { kitState } from './state';
import { AppChannel } from './enums';
import { sendToPrompt } from './prompt';

let t: any = null;

type TermSize = {
  cols: number;
  rows: number;
};

const USE_BINARY = os.platform() !== 'win32';

function bufferString(timeout: number) {
  let s = '';
  let sender: any = null;
  return (data: any) => {
    s += data;
    if (!sender) {
      sender = setTimeout(() => {
        sendToPrompt(AppChannel.TERM_OUTPUT as any, s);
        s = '';
        sender = null;
      }, timeout);
    }
  };
}
// binary message buffering
function bufferUtf8(timeout: number) {
  let buffer: any[] = [];
  let sender: any = null;
  let length = 0;
  return (data: any) => {
    const d = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

    buffer.push(d);

    length += d.length;
    if (!sender) {
      sender = setTimeout(() => {
        const b = Buffer.concat(buffer, length);

        // const s = b.toString('utf8');a

        // if (s.endsWith('\x07')) {
        //   kitState.terminalOutput = stripAnsi(s);
        // }

        sendToPrompt(AppChannel.TERM_OUTPUT as any, b);
        buffer = [];
        sender = null;
        length = 0;
      }, timeout);
    }
  };
}

const resizeHandler = (_event: any, { cols, rows }: TermSize) => {
  if (t) t?.resize(cols, rows);
};

const inputHandler = (_event: any, data: string) => {
  try {
    t.write(data);
  } catch (error) {
    log.error(`Error writing to pty`, error);
  }
};

const teardown = () => {
  try {
    if (t) {
      t?.kill();
      t = null;
      ipcMain.off(AppChannel.TERM_RESIZE, resizeHandler);
      ipcMain.off(AppChannel.TERM_INPUT, inputHandler);
    }
  } catch (error) {
    log.error(`Error killing pty`, error);
  }
};

export const readyPty = async () => {
  ipcMain.on(AppChannel.TERM_READY, async (event, config) => {
    teardown();
    ipcMain.once(AppChannel.TERM_EXIT, () => {
      teardown();
    });

    ipcMain.on(AppChannel.TERM_RESIZE, resizeHandler);
    ipcMain.on(AppChannel.TERM_INPUT, inputHandler);

    const pty = await import('node-pty');

    log.info(`🐲 >_ Starting pty server`);

    let env: any = { PATH: KIT_FIRST_PATH };

    if (kitState.isWindows) {
      env = {
        ...process.env,
        ...kitState?.termEnv,
      };
      env.PATH = KIT_FIRST_PATH;
      env.Path = KIT_FIRST_PATH;
    }

    const shell =
      config?.env?.KIT_SHELL ||
      (process.platform === 'win32'
        ? 'cmd.exe'
        : // if linux, use bash
        process.platform === 'linux'
        ? 'bash'
        : // if mac, use zsh
          'zsh');

    t = pty.spawn(
      shell,
      [
        // Start in login mode if not windows
        ...(process.platform === 'win32' ? [] : ['-l']),
      ],
      {
        useConpty: false,
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: untildify(kitState?.termCwd || os.homedir()),
        encoding: USE_BINARY ? null : 'utf8',
        env,
      }
    );

    const sendData = USE_BINARY ? bufferUtf8(5) : bufferString(5);

    const invokeCommandWhenSettled = debounce(() => {
      log.silly(`Invoking command: ${kitState.termCommand}`);
      if (kitState.termCommand) {
        if (USE_BINARY) {
          t.write(`${kitState.termCommand}\n`);
        } else {
          // Todo: on Windows this was also submitted the first prompt argument on
          t.write(`${kitState.termCommand}\r`);
        }
      }

      kitState.termCommand = '';
    }, 100);

    t.onData(async (data: any) => {
      try {
        sendData(data);
      } catch (ex) {
        log.error(`Error sending data to pty`, ex);
      }

      if (kitState.termCommand) {
        invokeCommandWhenSettled();
      }
    });

    t.onExit(() => {
      try {
        teardown();
        // t = null;
      } catch (error) {
        log.error(`Error closing pty`, error);
      }
    });
  });
};
