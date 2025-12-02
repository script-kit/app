import * as pty from 'node-pty';
import type { TermConfig } from '../../shared/types';
import { termLog } from '../logs';
import { getDefaultArgs, getDefaultOptions, getDefaultShell, getPtyOptions } from '../pty-utils';

export class PtyPool {
  ptys: pty.IPty[] = [];
  private idlePty: pty.IPty | null = null;
  private bufferedData: any[] = [];
  disposer: { dispose: () => void } | null = null;

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

  public killPty(pid: number) {
    const p = this.ptys.find((pp) => pp.pid === pid);
    if (p) {
      termLog.info(`🐲 Killing pty ${pid}`);
      try {
        p.kill();
      } catch (error) {
        termLog.error(error);
      }
      this.ptys = this.ptys.filter((pp) => pp.pid !== pid);
    }
  }

  public async destroyPool() {
    this.killIdlePty();
    this.disposer = null;
    this.idlePty = null;
    this.bufferedData = [];
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        this.ptys.forEach((p) => {
          termLog.info(`🐲 Killing stray pty ${p.pid}. Current pty count: ${this.ptys.length}`);
          try {
            p.kill();
          } catch (error) {
            termLog.error(error);
          }
        });
        this.ptys = [];
        resolve();
      }, 100);
    });
  }

  public killIdlePty() {
    if (this.idlePty) {
      this.bufferedData = [];
      termLog.info(`🐲 Killing idle pty ${this.idlePty?.pid}`);
      try {
        this.idlePty.kill();
      } catch {}
      this.ptys = this.ptys.filter((p) => p !== this.idlePty);
      this.idlePty = null;
    }
    if (this?.disposer?.dispose) {
      termLog.info(`🐲 Disposing idle pty ${this.idlePty?.pid}. Current pty count: ${this.ptys.length}`);
      try {
        this.disposer.dispose();
      } catch {}
      this.disposer = null;
    }
  }

  public prepareNextIdlePty() {
    if (this.idlePty) return;
    termLog.info('🐲 >_ Preparing next idle pty');
    const shell = getDefaultShell();
    const args = getDefaultArgs(true);
    const options = getPtyOptions({});
    this.idlePty = this.createPty(shell, args, options);
    this.idlePty.onExit(({ exitCode, signal }) => {
      termLog.info('🐲 Idle pty exited', { exitCode, signal });
    });
    const disp = this.idlePty.onData(this.onDataHandler);
    this.disposer = { dispose: () => disp.dispose?.() } as any;
  }

  private onDataHandler = (data: any) => {
    this.bufferData(data);
  };

  public getIdlePty(shell: string, args: string[], options: any, config: TermConfig): pty.IPty {
    const defaultOptions = getDefaultOptions();
    const defaultShell = getDefaultShell();
    const defaultArgs = getDefaultArgs(true);
    const sameShell = shell === defaultShell;
    const sameArgs = JSON.stringify(args) === JSON.stringify(defaultArgs);

    termLog.info('🔧 [ptyPool] getIdlePty called with:');
    termLog.info(`🔧 [ptyPool] - shell: ${shell} (default: ${defaultShell}, same: ${sameShell})`);
    termLog.info(
      `🔧 [ptyPool] - args: ${JSON.stringify(args)} (default: ${JSON.stringify(defaultArgs)}, same: ${sameArgs})`,
    );
    termLog.info(`🔧 [ptyPool] - hasIdlePty: ${!!this.idlePty}`);

    const canReuse = this.idlePty && sameShell && sameArgs;
    termLog.info(`🔧 [ptyPool] - canReuseIdlePty: ${canReuse}`);

    if (canReuse) {
      const defaultPty = this.idlePty as pty.IPty;
      (defaultPty as any).bufferedData = this.bufferedData;

      if (options.cwd && options.cwd !== defaultOptions.cwd) {
        const command = process.platform === 'win32' ? `cd /d "${options.cwd}"\r` : `cd "${options.cwd}"\r`;
        defaultPty.write(command);
      }
      if (options.command && options.command !== defaultOptions.command) {
        // Side note: config.command will be sent separately, but preserve current logic
        config.command = '';
        defaultPty.write(options.command + '\r');
      }

      this.disposer?.dispose?.();
      this.bufferedData = [];
      this.idlePty = null;
      setImmediate(() => this.prepareNextIdlePty());
      return defaultPty;
    }
    return this.createPty(shell, args, options);
  }
}
