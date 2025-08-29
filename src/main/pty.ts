import { termLog } from './logs';
import { PtyPool } from './pty/pool';
import { registerTerminalIpc } from './pty/ipc-router';
import type { KitPrompt } from './prompt';

export const ptyPool = new PtyPool();

export const createIdlePty = () => {
  termLog.info(`🔧 [ptyPool] createIdlePty called, current PTY count: ${ptyPool.ptys.length}`);
  if (ptyPool.ptys.length === 0) {
    termLog.info('🐲 >_ Creating idle pty. Current pty count: ', ptyPool.ptys.length);
    ptyPool.killIdlePty();
    ptyPool.prepareNextIdlePty();
  } else {
    termLog.info('🐲 >_ Idle pty already exists. Current pty count: ', ptyPool.ptys.length);
  }
};

export const createPty = (prompt: KitPrompt) => {
  registerTerminalIpc(prompt, ptyPool);
};

export const destroyPtyPool = async () => {
  termLog.info('🐲 >_ Destroying pty pool');
  await ptyPool.destroyPool();
};

export { ptyPool as default };

