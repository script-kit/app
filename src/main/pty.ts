import { type IpcMainEvent, ipcMain } from 'electron';
import { debounce } from 'lodash-es';
import * as pty from 'node-pty';
import { AppChannel } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import type { TermConfig } from '../shared/types';
import { displayError } from './error';
/* eslint-disable no-nested-ternary */
import { termLog } from './logs';

import type { KitPrompt } from './prompt';
import {
  USE_BINARY,
  getDefaultArgs,
  getDefaultOptions,
  getDefaultShell,
  getPtyOptions,
  getShellConfig,
} from './pty-utils';

class PtyPool {
  killPty(pid: number) {
    const p = this.ptys.find((p) => p.pid === pid);
    if (p) {
      termLog.info(`🐲 Killing pty ${pid}`);
      try {
        p.kill();
      } catch (error) {
        termLog.error(error);
      }
      this.ptys = this.ptys.filter((p) => p.pid !== pid);
    }
  }
  async destroyPool() {
    this.killIdlePty();
    this.disposer = null;
    this.idlePty = null;
    this.bufferedData = [];
    return new Promise((resolve) => {
      setTimeout(() => {
        this.ptys.forEach((p) => {
          termLog.info(`🐲 Killing stray pty ${p.pid}. Current pty count: ${this.ptys.length}`);
          try {
            p.kill();
          } catch (error) {
            termLog.error(error);
          }
        });
        resolve(null);
      }, 100);
    });
  }

  ptys: pty.IPty[] = [];

  private idlePty: pty.IPty | null = null;
  private bufferedData: any[] = [];

  private bufferData(d: any) {
    this.bufferedData.push(d);
  }

  private createPty(shell: string, args: string[], options: any): pty.IPty {
    termLog.info(`🐲 Creating pty with shell: ${shell}, args: ${args}`);
    options.windowsHide = true;
    const p = pty.spawn(shell, args, options);
    this.ptys.push(p);
    return p;
  }

  public killIdlePty() {
    if (this.idlePty) {
      this.bufferedData = [];
      termLog.info(`🐲 Killing idle pty ${this.idlePty?.pid}`);
      this.idlePty.kill();
      this.ptys = this.ptys.filter((p) => p !== this.idlePty);
      this.idlePty = null;
    }
    if (this?.disposer?.dispose) {
      termLog.info(`🐲 Disposing idle pty ${this.idlePty?.pid}. Current pty count: ${this.ptys.length}`);
      this.disposer.dispose();
    }
  }

  public getIdlePty(shell: string, args: string[], options: any, config: TermConfig): pty.IPty {
    const defaultOptions = getDefaultOptions();
    const defaultShell = getDefaultShell();
    const defaultArgs = getDefaultArgs(true);
    const sameShell = shell === defaultShell;
    const sameArgs = JSON.stringify(args) === JSON.stringify(defaultArgs);

    termLog.info(`🔧 [ptyPool] getIdlePty called with:`);
    termLog.info(`🔧 [ptyPool] - shell: ${shell} (default: ${defaultShell}, same: ${sameShell})`);
    termLog.info(
      `🔧 [ptyPool] - args: ${JSON.stringify(args)} (default: ${JSON.stringify(defaultArgs)}, same: ${sameArgs})`,
    );
    termLog.info(`🔧 [ptyPool] - hasIdlePty: ${!!this.idlePty}`);

    const allDefaults = this.idlePty && sameShell && sameArgs;
    termLog.info(`🔧 [ptyPool] - canReuseIdlePty: ${allDefaults}`);

    if (allDefaults) {
      const defaultPty = this.idlePty as pty.IPty;

      (defaultPty as any).bufferedData = this.bufferedData;
      if (options.cwd && options.cwd !== defaultOptions.cwd) {
        const command = process.platform === 'win32' ? `cd /d "${options.cwd}"\r` : `cd "${options.cwd}"\r`;
        defaultPty.write(command);
      }

      if (options.command && options.command !== defaultOptions.command) {
        config.command = '';
        defaultPty.write(options.command + '\r');
      }

      // if (options.env) {
      //   const exportCommands: string[] = [];
      //   for (const key in options.env) {
      //     if (Object.prototype.hasOwnProperty.call(options.env, key)) {
      //       const value = options.env[key];
      //       exportCommands.push(`export ${key}=${value}`);
      //     }
      //   }
      //   if (exportCommands.length > 0) {
      //     defaultPty.write(exportCommands.join(';') + '\r');
      //   }
      // }

      this?.disposer?.dispose();
      this.bufferedData = [];
      this.idlePty = null;
      setImmediate(() => {
        this.prepareNextIdlePty(); // Prepare the next idle pty asynchronously.
      });

      return defaultPty;
    }
    return this.createPty(shell, args, options);
  }

  onDataHandler = (data: any) => {
    this.bufferData(data); // Buffer the data from the idle pty
  };

  disposer: any;

  prepareNextIdlePty() {
    if (this.idlePty) {
      return;
    }
    termLog.info('🐲 >_ Preparing next idle pty');
    termLog.info('🔧 [ptyPool] Preparing next idle PTY');
    const shell = getDefaultShell();
    const args = getDefaultArgs(true);
    const options = getPtyOptions({});
    termLog.info(`🔧 [ptyPool] Creating idle PTY with shell: ${shell}, args: ${JSON.stringify(args)}`);
    this.idlePty = this.createPty(shell, args, options);
    this.idlePty.onExit(({ exitCode, signal }) => {
      termLog.info('🐲 Idle pty exited', { exitCode, signal });
      termLog.info(`🔧 [ptyPool] Idle PTY exited with code: ${exitCode}, signal: ${signal}`);
    });
    this.disposer = this.idlePty.onData(this.onDataHandler);
  }
}

const ptyPool = new PtyPool();
export const createIdlePty = () => {
  termLog.info(`🔧 [ptyPool] createIdlePty called, current PTY count: ${ptyPool.ptys.length}`);
  if (ptyPool.ptys.length === 0) {
    termLog.info('🐲 >_ Creating idle pty. Current pty count: ', ptyPool.ptys.length);
    termLog.info('🔧 [ptyPool] No PTYs exist, creating idle PTY');
    ptyPool.killIdlePty();
    ptyPool.prepareNextIdlePty();
  } else {
    termLog.info('🐲 >_ Idle pty already exists. Current pty count: ', ptyPool.ptys.length);
    termLog.info('🔧 [ptyPool] PTYs already exist, not creating new idle PTY');
  }
};

export const createPty = (prompt: KitPrompt) => {
  let t: pty.IPty | null = null;

  type TermSize = {
    cols: number;
    rows: number;
  };

  const resizeHandler = (_event: any, { cols, rows }: TermSize) => {
    if (t) {
      t?.resize(cols, rows);
    }
  };

  const inputHandler = (
    _event: any,
    data: {
      data: string;
      pid: number;
    },
  ) => {
    if (data?.pid !== prompt?.pid) {
      return;
    }
    try {
      t.write(data?.data);
    } catch (error) {
      termLog.error('Error writing to pty', error);
    }
  };

  const teardown = (pid?: number) => {
    termLog.info(`🐲 >_ Shell teardown. pid: ${pid ? `pid: ${pid}` : ''}`);
    ipcMain.off(AppChannel.TERM_RESIZE, resizeHandler);
    ipcMain.off(AppChannel.TERM_INPUT, inputHandler);
    try {
      if (t) {
        t?.kill();
        t = null;
      }
      if (pid) {
        ptyPool.killPty(pid);
      }
    } catch (error) {
      termLog.error(`Error killing pty ${pid} (probably already dead)`);
    }
  };

  const write = (text: string) => {
    if (USE_BINARY) {
      t?.write(`${text}\n`);
    } else {
      // Todo: on Windows this was also submitted the first prompt argument on
      t?.write(`${text}\r`);
    }
  };

  const handleTermReady = async (_event, config: TermConfig) => {
    termLog.info({
      termConfig: {
        command: config?.command || '<no command>',
        args: config?.args || '<no args>',
        cwd: config?.cwd || '<no cwd>',
        shell: config?.shell || '<no shell>',
      },
    });
    if (!prompt) {
      return;
    }
    if (config.pid !== prompt?.pid) {
      return;
    }

    function bufferString(timeout: number) {
      let s = '';
      let sender: any = null;
      return (data: any) => {
        s += data;
        if (!sender) {
          sender = setTimeout(() => {
            prompt?.sendToPrompt(AppChannel.TERM_OUTPUT as any, s);
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

            prompt?.sendToPrompt(AppChannel.TERM_OUTPUT as any, b);
            buffer = [];
            sender = null;
            length = 0;
          }, timeout);
        }
      };
    }

    const termWrite = (text: string) => {
      write(text);
    };

    const termKill = (pid: number) => {
      termLog.verbose('TERM_KILL', {
        pid,
        configPid: prompt?.pid,
      });
      if (pid === prompt?.pid) {
        ipcMain.off(AppChannel.TERM_EXIT, termExit);
        teardown(t?.pid);
      }
    };

    const termExit = (_: IpcMainEvent, config: TermConfig) => {
      if (config.pid !== prompt?.pid) {
        return;
      }
      emitter.off(KitEvent.TERM_KILL, termKill);
      emitter.off(KitEvent.TermWrite, termWrite);
      termLog.verbose('TERM_EXIT');
      teardown(t?.pid);
    };

    ipcMain.once(AppChannel.TERM_EXIT, termExit);

    termLog.info('🐲 >_ Handling TERM_KILL');
    emitter.once(KitEvent.TERM_KILL, termKill);

    ipcMain.on(AppChannel.TERM_RESIZE, resizeHandler);
    ipcMain.on(AppChannel.TERM_INPUT, inputHandler);

    const defaultShell = getDefaultShell();
    const { shell, args } = getShellConfig(config, defaultShell);
    const ptyOptions = getPtyOptions(config);

    termLog.info(
      `🐲 >_ Starting term with config: ${JSON.stringify({
        shell: config.shell,
        command: config.command,
        args: config.args,
        cwd: config.cwd,
      })}`,
    );

    try {
      t = ptyPool.getIdlePty(shell, args, ptyOptions, config);
      if ((t as any).bufferedData) {
        (t as any).bufferedData.forEach((d: any) => {
          prompt?.sendToPrompt(AppChannel.TERM_OUTPUT, d);
        });
      }
    } catch (error) {
      displayError(error as any);

      teardown(t?.pid);

      return;
    }

    prompt?.sendToPrompt(AppChannel.PTY_READY, {});

    emitter.on(KitEvent.TermWrite, termWrite);

    const sendData = USE_BINARY ? bufferUtf8(5) : bufferString(5);

    const invokeCommandWhenSettled = debounce(() => {
      termLog.silly(`Invoking command: ${config.command}`);
      if (config.command && t) {
        write(config.command);
      }

      config.command = '';
    }, 200);

    t.onData((data: any) => {
      try {
        sendData(data);
      } catch (ex) {
        termLog.error('Error sending data to pty', ex);
      }

      if (config.command) {
        invokeCommandWhenSettled();
      }
    });

    t.onExit(
      debounce(
        () => {
          termLog.info('🐲 Term process exited');
          try {
            if (typeof config?.closeOnExit === 'boolean' && !config.closeOnExit) {
              termLog.info('Process closed, but not closing pty because closeOnExit is false');
            } else {
              teardown(t?.pid);

              termLog.info('🐲 >_ Emit term process exited', config.pid);
              emitter.emit(KitEvent.TermExited, config.pid);
            }
            // t = null;
          } catch (error) {
            termLog.error('Error closing pty', error);
          }
        },
        500,
        { leading: true },
      ),
    );
  };

  ipcMain.once(AppChannel.TERM_READY, handleTermReady);
};

export const destroyPtyPool = async () => {
  termLog.info('🐲 >_ Destroying pty pool');
  await ptyPool.destroyPool();
};

export { ptyPool }; // Export the ptyPool instance
