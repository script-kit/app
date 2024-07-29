/* eslint-disable no-plusplus */

const { ipcRenderer } = window.electron;
import type { ITerminalAddon, Terminal } from 'xterm';
import { AppChannel } from '../../shared/enums';
import type { TermConfig } from '../../shared/types';
import { createLogger } from '../../shared/log-utils';
const log = createLogger('term-attach-ipc-addon.ts');

export class AttachIPCAddon implements ITerminalAddon {
  private terminal: Terminal | undefined;

  private config: TermConfig;

  constructor(config: TermConfig) {
    this.config = config;
  }

  public activate(terminal: Terminal): void {
    this.terminal = terminal;

    terminal.onData((data) => {
      if (this.terminal) {
        ipcRenderer.send(AppChannel.TERM_INPUT, { pid: this.config.pid, data });
      }
    });

    terminal.onBinary((data) => {
      const buffer = new Uint8Array(data.length);
      for (let i = 0; i < data.length; ++i) {
        buffer[i] = data.charCodeAt(i) & 255;
      }
      if (this.terminal) {
        ipcRenderer.send(AppChannel.TERM_INPUT, {
          pid: this.config.pid,
          data: buffer,
        });
      }
    });

    if (this.terminal) {
      ipcRenderer.send(AppChannel.TERM_READY, this.config);
    }
  }

  public dispose(): void {
    this.terminal?.dispose();
    this.terminal = undefined;
    ipcRenderer.send(AppChannel.TERM_EXIT, this.config);
  }
}
