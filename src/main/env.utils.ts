import path from 'node:path';
import {
  KIT_FIRST_PATH,
  kenvPath,
  kitDotEnvPath,
  kitPath,
} from '@johnlindquist/kit/core/utils';
import { app } from 'electron';
import { snapshot } from 'valtio';
import { kitState, kitStore } from './state';
import { getVersion } from './version';
import { execSync } from 'node:child_process';

function loadShellEnv() {
  const shellEnv = {};

  try {
    const shell = process.env.SHELL || '/bin/zsh';
    // Capture shell environment as a string
    const userShellConfig = execSync(`${shell} -ilc 'env'`).toString();
    const envVars = userShellConfig.split('\n');

    envVars.forEach((line) => {
      const [key, value] = line.split('=');
      if (key && value) {
        shellEnv[key.trim()] = value.trim();
      }
    });
  } catch (err) {
    console.error('Error loading shell environment:', err);
  }

  return shellEnv;
}

export const createEnv = () => {
  const PATH = KIT_FIRST_PATH + path.delimiter + process?.env?.PATH;

  return {
    ...process.env,
    ...loadShellEnv(),
    NODE_NO_WARNINGS: '1',
    NODE_PATH: kitState.NODE_PATH,
    KIT_CONTEXT: 'app',
    KENV: kenvPath(),
    KIT: kitPath(),
    KIT_DOTENV_PATH: kitDotEnvPath(),
    KIT_APP_VERSION: getVersion(),
    FORCE_COLOR: '1',
    PATH,
    KIT_APP_PATH: app.getAppPath(),
    KIT_ACCESSIBILITY: kitState.isMac && kitStore.get('accessibilityAuthorized'),
    ...snapshot(kitState.kenvEnv),
  };
};
