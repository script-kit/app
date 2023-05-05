/* eslint-disable no-plusplus */

import { ipcRenderer } from 'electron';
import { Terminal, ITerminalAddon } from 'xterm';
import { AppChannel } from './enums';
import { TermConfig } from './types';

export class AttachIPCAddon implements ITerminalAddon {
  private terminal: Terminal | undefined;

  private config: TermConfig;

  constructor(config: TermConfig) {
    this.config = config;
  }

  private termOutputHandler = (_event: any, data: string | Buffer) => {
    if (this.terminal)
      this.terminal.write(
        typeof data === 'string' ? data : new Uint8Array(data)
      );
  };

  public activate(terminal: Terminal): void {
    this.terminal = terminal;

    ipcRenderer.on(AppChannel.TERM_OUTPUT, this.termOutputHandler);

    terminal.onData((data) => {
      if (this.terminal) ipcRenderer.send(AppChannel.TERM_INPUT, data);
    });

    terminal.onBinary((data) => {
      const buffer = new Uint8Array(data.length);
      for (let i = 0; i < data.length; ++i) {
        buffer[i] = data.charCodeAt(i) & 255;
      }
      if (this.terminal) ipcRenderer.send(AppChannel.TERM_INPUT, buffer);
    });

    if (this.terminal) ipcRenderer.send(AppChannel.TERM_READY, this.config);
  }

  public dispose(): void {
    ipcRenderer.off(AppChannel.TERM_OUTPUT, this.termOutputHandler);
    this.terminal?.dispose();
    this.terminal = undefined;
    ipcRenderer.send(AppChannel.TERM_EXIT, this.config.pid);
  }
}
