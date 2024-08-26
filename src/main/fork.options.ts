import type { ForkOptions } from 'node:child_process';
import { KIT_FIRST_PATH, kenvPath, kitPath, knodePath } from '@johnlindquist/kit/core/utils';
import { homedir } from 'node:os';

export const forkOptions: ForkOptions = {
  cwd: homedir(),
  windowsHide: true,
  env: {
    KIT: kitPath(),
    KENV: kenvPath(),
    KNODE: knodePath(),
    PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
    USER: process?.env?.USER,
    USERNAME: process?.env?.USERNAME,
    HOME: process?.env?.HOME,
  },
  stdio: 'pipe',
};
