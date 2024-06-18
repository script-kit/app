import path from 'node:path';
import { KIT_FIRST_PATH, kenvPath, kitDotEnvPath, kitPath } from '@johnlindquist/kit/core/utils';
import { app } from 'electron';
import { snapshot } from 'valtio';
import { kitState, kitStore } from './state';
import { getVersion } from './version';

export const createEnv = () => {
  const PATH = KIT_FIRST_PATH + path.delimiter + process?.env?.PATH;

  return {
    ...process.env,
    NODE_NO_WARNINGS: '1',
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
