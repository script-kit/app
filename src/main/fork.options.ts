import type { ForkOptions } from 'node:child_process';
import { KIT_FIRST_PATH, kenvPath, kitPath } from '@johnlindquist/kit/core/utils';
import { homedir } from 'node:os';
import { kitState } from './state';


export const createForkOptions = () => {
  const forkOptions: ForkOptions = {
    cwd: homedir(),
    windowsHide: true,
    execPath: kitState.NODE_PATH,
    stdio: 'pipe',
    shell: true,
  };
  const updatedForkOptions = {
    ...forkOptions,
    env: {
      KIT: kitPath(),
      KENV: kenvPath(),
      NODE_PATH: kitState.NODE_PATH,
      PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
    },
  };

  return updatedForkOptions;
};
