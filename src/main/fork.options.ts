import type { ForkOptions } from 'node:child_process';
import { KIT_FIRST_PATH, kenvPath, kitPath } from '@johnlindquist/kit/core/utils';
import { homedir } from 'node:os';
import { kitState } from './state';

const forkOptions: ForkOptions = {
  cwd: homedir(),
  windowsHide: true,
  execPath: kitState.execPath,
  env: {
    KIT: kitPath(),
    KENV: kenvPath(),
    EXEC_PATH: kitState.execPath,
    PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
    USER: process?.env?.USER,
    USERNAME: process?.env?.USERNAME,
    HOME: process?.env?.HOME,
  },
  stdio: 'pipe',
};

export const createForkOptions = () => {
  const updatedForkOptions = {
    ...forkOptions,
    env: {
      ...forkOptions.env,
      EXEC_PATH: kitState.execPath,
    },
  };

  return updatedForkOptions;
};
