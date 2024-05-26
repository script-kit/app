/* eslint-disable no-nested-ternary */
import log from 'electron-log';
import { ipcMain } from 'electron';
import * as pty from 'node-pty';
import { debounce } from 'lodash-es';
import { AppChannel } from '../shared/enums';
import { emitter, KitEvent } from '../shared/events';
import { TermConfig } from '../shared/types';
import { displayError } from './error';

import {
  getDefaultArgs,
  getDefaultOptions,
  getDefaultShell,
  getPtyOptions,
  getShellConfig,
  USE_BINARY,
} from './pty-utils';
import { KitPrompt } from './prompt';

class PtyPool {
  killPty(pid: number) {
    const p = this.ptys.find((p) => p.pid === pid);
    if (p) {
      log.info(`🐲 Killing pty ${pid}`);
      p.kill();
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
          log.info(`🐲 Killing stray pty ${p.pid}`);
          p.kill();
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
    log.info(`🐲 Creating pty with shell: ${shell}, args: ${args}`);
    options.windowsHide = true;
    const p = pty.spawn(shell, args, options);
    this.ptys.push(p);
    return p;
  }

  public killIdlePty() {
    if (this.idlePty) {
      this.bufferedData = [];
      log.info(`🐲 Killing idle pty ${this.idlePty?.pid}`);
      this.idlePty.kill();
      this.ptys = this.ptys.filter((p) => p !== this.idlePty);
      this.idlePty = null;
    }
    if (this?.disposer?.dispose) {
      log.info(`🐲 Disposing idle pty ${this.idlePty?.pid}`);
      this.disposer.dispose();
    }
  }

  public getIdlePty(
    shell: string,
    args: string[],
    options: any,
    config: TermConfig,
  ): pty.IPty {
    const defaultOptions = getDefaultOptions();
    const sameShell = shell === getDefaultShell();

    const sameArgs =
      JSON.stringify(args) === JSON.stringify(getDefaultArgs(true));

    const allDefaults = this.idlePty && sameShell && sameArgs;

    if (allDefaults) {
      const defaultPty = this.idlePty as pty.IPty;

      (defaultPty as any).bufferedData = this.bufferedData;
      if (options.cwd && options.cwd !== defaultOptions.cwd) {
        const command =
          process.platform === 'win32'
            ? `cd /d "${options.cwd}"\r`
            : `cd "${options.cwd}"\r`;
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
    } else {
      return this.createPty(shell, args, options);
    }
  }

  onDataHandler = (data: any) => {
    this.bufferData(data); // Buffer the data from the idle pty
  };

  disposer: any;

  prepareNextIdlePty() {
    if (this.idlePty) {
      return;
    }
    log.info(`🐲 >_ Preparing next idle pty`);
    const shell = getDefaultShell();
    const args = getDefaultArgs(true);
    const options = getPtyOptions({});
    this.idlePty = this.createPty(shell, args, options);
    this.idlePty.onExit(({ exitCode, signal }) => {
      log.info(`🐲 Idle pty exited`, { exitCode, signal });
    });
    this.disposer = this.idlePty.onData(this.onDataHandler);
  }
}

const ptyPool = new PtyPool();
export const createIdlePty = () => {
  ptyPool.killIdlePty();
  ptyPool.prepareNextIdlePty();
};

export const createPty = (prompt: KitPrompt) => {
  let t: pty.IPty | null = null;

  type TermSize = {
    cols: number;
    rows: number;
  };

  const resizeHandler = (_event: any, { cols, rows }: TermSize) => {
    if (t) t?.resize(cols, rows);
  };

  const inputHandler = (
    _event: any,
    data: {
      data: string;
      pid: number;
    },
  ) => {
    if (data?.pid !== prompt?.pid) return;
    try {
      t.write(data?.data);
    } catch (error) {
      log.error(`Error writing to pty`, error);
    }
  };

  const teardown = (pid?: number) => {
    log.verbose(`🐲 >_ Shell teardown. pid: ${pid ? `pid: ${pid}` : ''}`);
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
      log.error(`Error killing pty ${pid} (probably already dead)`);
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

  const handleTermReady = async (event, config: TermConfig) => {
    log.info({ termConfig: config });
    if (!prompt) return;
    if (config.pid !== prompt?.pid) return;

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
      log.verbose(`TERM_KILL`, {
        pid,
        configPid: prompt?.pid,
      });
      if (pid === prompt?.pid) {
        ipcMain.off(AppChannel.TERM_EXIT, termExit);
        teardown(t?.pid);
      }
    };

    const termExit = (config: TermConfig) => {
      if (config.pid !== prompt?.pid) return;
      emitter.off(KitEvent.TERM_KILL, termKill);
      emitter.off(KitEvent.TermWrite, termWrite);
      log.verbose(`TERM_EXIT`);
      teardown(t?.pid);
    };

    ipcMain.once(AppChannel.TERM_EXIT, termExit);

    log.info(`🐲 >_ Handling TERM_KILL`);
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
      log.silly(`Invoking command: ${config.command}`);
      if (config.command && t) {
        write(config.command);
      }

      config.command = '';
    }, 200);

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
                `Process closed, but not closing pty because closeOnExit is false`,
              );
            } else {
              teardown(t?.pid);

              log.info(`🐲 >_ Emit term process exited`);
              emitter.emit(KitEvent.TermExited, '');
            }
            // t = null;
          } catch (error) {
            log.error(`Error closing pty`, error);
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
  log.info(`🐲 >_ Destroying pty pool`);
  await ptyPool.destroyPool();
};
