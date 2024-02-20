import path from 'path';
import { snapshot } from 'valtio';
import {
  KIT_FIRST_PATH,
  kitDotEnvPath,
  kenvPath,
  kitPath,
} from '@johnlindquist/kit/core/utils';
import { getVersion } from './version';
import { app } from 'electron';
import { kitState, kitStore } from '../shared/state';

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
    KIT_ACCESSIBILITY:
      kitState.isMac && kitStore.get('accessibilityAuthorized'),
    ...snapshot(kitState.kenvEnv),
  };
};
