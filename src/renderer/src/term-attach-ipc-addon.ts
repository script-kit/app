/* eslint-disable no-plusplus */

const { ipcRenderer } = window.electron;
import { Terminal, ITerminalAddon } from 'xterm';
import { AppChannel } from '../../shared/enums';
import { TermConfig } from '../../shared/types';
import log from 'electron-log/renderer';

export class AttachIPCAddon implements ITerminalAddon {
  private terminal: Terminal | undefined;

  private config: TermConfig;

  constructor(config: TermConfig) {
    this.config = config;
  }

  private termOutputHandler = (_event: any, data: string | Buffer) => {
    if (this.terminal)
      this.terminal.write(
        typeof data === 'string' ? data : new Uint8Array(data),
      );
  };

  public activate(terminal: Terminal): void {
    this.terminal = terminal;

    ipcRenderer.on(AppChannel.TERM_OUTPUT, this.termOutputHandler);

    terminal.onData((data) => {
      if (this.terminal)
        ipcRenderer.send(AppChannel.TERM_INPUT, { pid: this.config.pid, data });
    });

    terminal.onBinary((data) => {
      const buffer = new Uint8Array(data.length);
      for (let i = 0; i < data.length; ++i) {
        buffer[i] = data.charCodeAt(i) & 255;
      }
      if (this.terminal)
        ipcRenderer.send(AppChannel.TERM_INPUT, {
          pid: this.config.pid,
          data: buffer,
        });
    });

    log.info(`Sending config`, { config: this.config });
    if (this.terminal) ipcRenderer.send(AppChannel.TERM_READY, this.config);
  }

  public dispose(): void {
    ipcRenderer.off(AppChannel.TERM_OUTPUT, this.termOutputHandler);
    this.terminal?.dispose();
    this.terminal = undefined;
    ipcRenderer.send(AppChannel.TERM_EXIT, this.config);
  }
}
