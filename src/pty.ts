/* eslint-disable no-nested-ternary */
import os from 'os';
import untildify from 'untildify';
import { KIT_FIRST_PATH, KIT_LAST_PATH } from '@johnlindquist/kit/cjs/utils';
import log from 'electron-log';
import { ipcMain } from 'electron';
import * as pty from 'node-pty';
import { debounce } from 'lodash';
import { appDb, kitState } from './state';
import { AppChannel } from './enums';
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

function getDefaultShell(): string {
  switch (process.platform) {
    case 'win32':
      // check if cmd.exe exists
      if (process.env.ComSpec) {
        log.info(`Using ComSpec: ${process.env.ComSpec}`);
        return process.env.ComSpec;
      }
      return 'cmd.exe';
    case 'linux':
      // check if bash exists
      if (process.env.SHELL) {
        log.info(`Using SHELL: ${process.env.SHELL}`);
        return process.env.SHELL;
      }
      return 'bash';
    default:
      if (process.env.SHELL) {
        log.info(`Using SHELL: ${process.env.SHELL}`);
        return process.env.SHELL;
      }
      return 'zsh';
  }
}

function getShellConfig(config: TermConfig, defaultShell: string) {
  let login = true;
  if (typeof config.shell === 'boolean') {
    if (config.shell) {
      config.shell = config.env.KIT_SHELL || defaultShell;
    } else if (config.command) {
      // eslint-disable-next-line prefer-destructuring
      login = false;
      config.shell = config?.command.split(' ')[0];
      if (config?.args?.length === 0)
        config.args = config?.command.split(' ').slice(1);
      config.command = '';
    } else {
      config.command = '';
    }
  }

  const args = config?.args?.length
    ? config.args
    : process.platform === 'win32' || !login
    ? []
    : ['-l'];

  const shell = config.shell || config.env.KIT_SHELL || defaultShell;

  return { shell, args };
}

function getPtyOptions(config: TermConfig) {
  const env: any = {
    ...process.env,
    ...config?.env,
    ...{
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: `Kit`,
      TERM_PROGRAM_VERSION: appDb?.version || '0.0.0',
    },
  };

  env.PATH = config?.env?.PATH || KIT_FIRST_PATH;
  if (kitState.isWindows) {
    env.Path = config?.env?.PATH || KIT_FIRST_PATH;
  }

  return {
    useConpty: false,
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: untildify(config?.cwd || os.homedir()),
    encoding: USE_BINARY ? null : 'utf8',
    env: config?.cleanPath ? process.env : env,
  };
}

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
  log.verbose(`🐲 >_ Shell teardown`);
  ipcMain.off(AppChannel.TERM_RESIZE, resizeHandler);
  ipcMain.off(AppChannel.TERM_INPUT, inputHandler);
  try {
    if (t) {
      t?.kill();
      t = null;
    }
  } catch (error) {
    log.error(`Error killing pty`, error);
  }
};

const write = (text: string) => {
  if (USE_BINARY) {
    t.write(`${text}\n`);
  } else {
    // Todo: on Windows this was also submitted the first prompt argument on
    t.write(`${text}\r`);
  }
};

export const readyPty = async () => {
  ipcMain.on(AppChannel.TERM_READY, async (event, config: TermConfig) => {
    const termWrite = (text: string) => {
      write(text);
    };

    const termKill = (pid: number) => {
      log.verbose(`TERM_KILL`, {
        pid,
        configPid: config?.pid,
      });
      if (pid === config?.pid) {
        ipcMain.off(AppChannel.TERM_EXIT, termExit);
        teardown();
      }
    };

    const termExit = () => {
      emitter.off(KitEvent.TERM_KILL, termKill);
      emitter.off(KitEvent.TermWrite, termWrite);
      log.verbose(`TERM_EXIT`);
      teardown();
    };

    ipcMain.once(AppChannel.TERM_EXIT, termExit);

    emitter.once(KitEvent.TERM_KILL, termKill);

    ipcMain.on(AppChannel.TERM_RESIZE, resizeHandler);
    ipcMain.on(AppChannel.TERM_INPUT, inputHandler);

    const defaultShell = getDefaultShell();
    const { shell, args } = getShellConfig(config, defaultShell);
    const ptyOptions = getPtyOptions(config);

    log.info(
      `🐲 >_ Starting term with config: ${JSON.stringify({
        shell: config.shell,
        command: config.command,
        args: config.args,
        cwd: config.cwd,
      })}`
    );

    try {
      t = pty.spawn(shell, args, ptyOptions);
    } catch (error) {
      displayError(error as any);

      teardown();

      return;
    }

    sendToPrompt(AppChannel.PTY_READY, {});

    emitter.on(KitEvent.TermWrite, termWrite);

    const sendData = USE_BINARY ? bufferUtf8(5) : bufferString(5);

    const invokeCommandWhenSettled = debounce(() => {
      log.silly(`Invoking command: ${config.command}`);
      if (config.command && t) {
        write(config.command);
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

    t.onExit(
      debounce(
        () => {
          log.info(`🐲 Term process exited`);
          try {
            if (
              typeof config?.closeOnExit === 'boolean' &&
              !config.closeOnExit
            ) {
              log.info(
                `Process closed, but not closing pty because closeOnExit is false`
              );
            } else {
              teardown();

              log.info(`🐲 >_ Emit term process exited`);
              emitter.emit(KitEvent.TermExited, '');
            }
            // t = null;
          } catch (error) {
            log.error(`Error closing pty`, error);
          }
        },
        500,
        { leading: true }
      )
    );
  });
};
