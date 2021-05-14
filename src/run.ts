/* eslint-disable import/prefer-default-export */
import { fork } from 'child_process';
import {
  KIT,
  KENV,
  execPath,
  NODE_PATH,
  PATH,
  DOTENV,
  KIT_MAC_APP,
} from './helpers';
import { getVersion } from './version';

export const createChild = (script: string, ...args: string[]) => {
  return fork(KIT_MAC_APP, [script, ...args, '--app'], {
    silent: false,
    // stdio: 'inherit',
    execPath,
    env: {
      ...process.env,
      KIT_CONTEXT: 'app',
      KIT_MAIN: script,
      PATH,
      KENV,
      KIT,
      DOTENV,
      KIT_APP_VERSION: getVersion(),
    },
  });
};
