import type { ForkOptions } from 'node:child_process';
import { KIT_FIRST_PATH, kenvPath, kitPath } from '@johnlindquist/kit/core/utils';
import { homedir } from 'node:os';
import { kitState } from './state';

const forkOptions: ForkOptions = {
  cwd: homedir(),
  windowsHide: true,
  execPath: kitState.NODE_PATH,
  env: {
    KIT: kitPath(),
    KENV: kenvPath(),
    NODE_PATH: kitState.NODE_PATH,
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
      NODE_PATH: kitState.NODE_PATH,
    },
  };

  return updatedForkOptions;
};
