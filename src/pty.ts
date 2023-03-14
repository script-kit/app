/* eslint-disable no-nested-ternary */
import os from 'os';
import untildify from 'untildify';
import { KIT_FIRST_PATH, kitPath } from '@johnlindquist/kit/cjs/utils';
import log from 'electron-log';
import { ipcMain } from 'electron';
import { debounce } from 'lodash';
import { kitState } from './state';
import { AppChannel, Trigger } from './enums';
import { sendToPrompt } from './prompt';
import { emitter, KitEvent } from './events';
import { TermConfig } from './types';
import { displayError } from './error';

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
  ipcMain.on(AppChannel.TERM_READY, async (event, config: TermConfig) => {
    ipcMain.once(AppChannel.TERM_EXIT, () => {
      teardown();
    });

    ipcMain.on(AppChannel.TERM_RESIZE, resizeHandler);
    ipcMain.on(AppChannel.TERM_INPUT, inputHandler);

    const pty = await import('node-pty');

    log.info(`🐲 >_ Starting pty server`);

    let env: any = {};

    env = {
      ...process.env,
      ...config?.env,
    };

    env.PATH = config?.env?.PATH || KIT_FIRST_PATH;
    if (kitState.isWindows) {
      env.Path = config?.env?.PATH || KIT_FIRST_PATH;
    }

    const defaultShell =
      process.platform === 'win32'
        ? 'cmd.exe'
        : // if linux, use bash
        process.platform === 'linux'
        ? 'bash'
        : // if mac, use zsh
          'zsh';

    let login = false;
    if (typeof config?.shell === 'boolean') {
      if (config.shell) {
        config.shell = config?.env?.KIT_SHELL || defaultShell;
        login = true;
      } else if (config?.command) {
        config.shell = config?.command?.split(' ')?.[0];
        config.command = config?.command?.split(' ')?.slice(1).join(' ');
      } else {
        config.command = 'echo "No shell or command provided"';
      }
    }

    const args = config?.args?.length
      ? config.args
      : [
          // Start in login mode if not windows
          ...(process.platform === 'win32' || !login ? [] : ['-l']),
        ];

    const shell = config?.shell || config?.env?.KIT_SHELL || defaultShell;

    try {
      t = pty.spawn(shell, args, {
        useConpty: false,
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: untildify(config?.cwd || os.homedir()),
        encoding: USE_BINARY ? null : 'utf8',
        env,
      });
    } catch (error) {
      displayError(error as any);

      teardown();

      return;
    }

    const sendData = USE_BINARY ? bufferUtf8(5) : bufferString(5);

    const invokeCommandWhenSettled = debounce(() => {
      log.silly(`Invoking command: ${config.command}`);
      if (config.command) {
        if (USE_BINARY) {
          t.write(`${config.command}\n`);
        } else {
          // Todo: on Windows this was also submitted the first prompt argument on
          t.write(`${config.command}\r`);
        }
      }

      config.command = '';
    }, 100);

    t.onData(async (data: any) => {
      try {
        sendData(data);
      } catch (ex) {
        log.error(`Error sending data to pty`, ex);
      }

      if (config.command) {
        invokeCommandWhenSettled();
      }
    });

    t.onExit(() => {
      log.info(
        `🐲 Pty process exited`,
        JSON.stringify({ closeOnExit: config?.closeOnExit })
      );
      try {
        if (typeof config?.closeOnExit === 'boolean' && !config.closeOnExit) {
          log.info(
            `Process closed, but not closing pty because closeOnExit is false`
          );
        } else {
          teardown();

          emitter.emit(KitEvent.TermExited, '');
        }
        // t = null;
      } catch (error) {
        log.error(`Error closing pty`, error);
      }
    });
  });
};
