import { debounce } from 'lodash-es';
import { AppChannel } from '../../shared/enums';
import type { TermConfig } from '../../shared/types';
import { termLog } from '../logs';
import type { KitPrompt } from '../prompt';
import { ipcMain, type IpcMainEvent } from 'electron';
import { USE_BINARY, getDefaultArgs, getDefaultShell, getPtyOptions, getShellConfig } from '../pty-utils';
import { OutputAggregator } from './output';
import { PtyPool } from './pool';
import { KitEvent, emitter } from '../../shared/events';
import { displayError } from '../error';
import { TranscriptBuilder, type TermCapture } from '../transcript-builder';

export function registerTerminalIpc(prompt: KitPrompt, pool: PtyPool) {
  let t: any = null;

  // Capture config from promptData
  const promptData = (prompt?.promptData as any) || {};
  const capture = promptData?.capture;
  const capOpts: TermCapture = capture === true ? { mode: 'full' } : capture ? (capture as TermCapture) : { mode: 'none' };
  const tb = new TranscriptBuilder({
    mode: capOpts.mode ?? 'full',
    tailLines: capOpts.tailLines ?? 1000,
    stripAnsi: capOpts.stripAnsi ?? true,
    sentinelStart: capOpts.sentinelStart ?? '<<START>>',
    sentinelEnd: capOpts.sentinelEnd ?? '<<END>>',
  });

  type TermSize = { cols: number; rows: number };

  const resizeHandler = (_event: any, { cols, rows }: TermSize) => {
    if (t) t.resize?.(cols, rows);
  };

  const inputHandler = (_event: any, data: { data: string; pid: number }) => {
    if (data?.pid !== prompt?.pid) return;
    try {
      t?.write?.(data?.data);
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
        t.kill?.();
        t = null;
      }
      if (pid) {
        pool.killPty(pid);
      }
    } catch (error) {
      termLog.error(`Error killing pty ${pid} (probably already dead)`);
    }
  };

  const write = (text: string) => {
    if (USE_BINARY) t?.write(`${text}\n`);
    else t?.write(`${text}\r`);
  };

  const handleTermReady = async (_event: IpcMainEvent, config: TermConfig) => {
    termLog.info({ termConfig: { command: config?.command || '<no command>', args: config?.args || '<no args>', cwd: config?.cwd || '<no cwd>', shell: config?.shell || '<no shell>' } });
    if (!prompt) return;
    if (config.pid !== prompt?.pid) return;

    const termWrite = (text: string) => write(text);

    const termKill = (pid: number) => {
      termLog.verbose('TERM_KILL', { pid, configPid: prompt?.pid });
      if (pid === prompt?.pid) {
        ipcMain.off(AppChannel.TERM_EXIT, termExit);
        teardown(t?.pid);
      }
    };

    const termExit = (_: IpcMainEvent, c: TermConfig) => {
      if (c.pid !== prompt?.pid) return;
      // Return focus to input on explicit TERM_EXIT
      try {
        prompt?.sendToPrompt(AppChannel.TRIGGER_INPUT_FOCUS, true);
      } catch {}
      prompt?.sendToPrompt(AppChannel.TERM_CAPTURE_READY, { pid: prompt.pid, text: tb.result(), exitCode: 0 });
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
      `🐲 >_ Starting term with config: ${JSON.stringify({ shell: config.shell, command: config.command, args: config.args, cwd: config.cwd })}`,
    );

    try {
      t = pool.getIdlePty(shell, args, ptyOptions, config);
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

    const aggregator = new OutputAggregator({
      binary: USE_BINARY,
      flushMs: 5,
      onFlush: (payload) => prompt?.sendToPrompt(AppChannel.TERM_OUTPUT as any, payload),
    });

    const invokeCommandWhenSettled = debounce(() => {
      termLog.silly(`Invoking command: ${config.command}`);
      if (config.command && t) write(config.command);
      config.command = '';
    }, 200);

    t.onData((data: any) => {
      try {
        aggregator.push(data);
        const dataStr = typeof data === 'string' ? data : data.toString('utf8');
        tb.push(dataStr);
      } catch (ex) {
        termLog.error('Error sending data to pty', ex);
      }
      if (config.command) invokeCommandWhenSettled();
    });

    t.onExit(
      debounce(({ exitCode }) => {
        termLog.info('🐲 Term process exited');
        try {
          if (typeof config?.closeOnExit === 'boolean' && !config.closeOnExit) {
            termLog.info('Process closed, but not closing pty because closeOnExit is false');
          } else {
            const captureResult = tb.result();
            prompt?.sendToPrompt(AppChannel.TERM_CAPTURE_READY, { pid: prompt.pid, text: captureResult, exitCode });
            teardown(t?.pid);
            termLog.info('🐲 >_ Emit term process exited', config.pid);
            emitter.emit(KitEvent.TermExited, config.pid);
          }
        } catch (error) {
          termLog.error('Error closing pty', error);
        }
      }, 500, { leading: true }),
    );
  };

  ipcMain.once(AppChannel.TERM_READY, handleTermReady);
}
