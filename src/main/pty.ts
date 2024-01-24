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
  getDefaultShell,
  getPtyOptions,
  getShellConfig,
  USE_BINARY,
} from './pty-utils';
import { KitPrompt } from './prompt';

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
    }
  ) => {
    if (data?.pid !== prompt?.pid) return;
    try {
      t.write(data?.data);
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

  const handleTermReady = async (event, config: TermConfig) => {
    if (!prompt) return;
    if (config.pid !== prompt?.pid) return;
    const sendToPrompt = prompt?.sendToPrompt;
    const appToPrompt = prompt?.appToPrompt;

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
        teardown();
      }
    };

    const termExit = (config: TermConfig) => {
      if (config.pid !== prompt?.pid) return;
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

    appToPrompt(AppChannel.PTY_READY, {});

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
  };

  ipcMain.once(AppChannel.TERM_READY, handleTermReady);
};
