import { optionalSpawnSetup } from './install';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { createLogger } from '../shared/log-utils';
import { kitState } from './state';
import { debounce } from 'lodash-es';

const log = createLogger('apps.ts');

export const reloadApps = debounce(async () => {
  if (kitState.isLinux) {
    log.info('Reloading apps on Linux is not supported');
    return;
  }

  try {
    log.info('Attempting to reload apps...');
    const result = await optionalSpawnSetup(kitPath('main', 'app-launcher.js'), '--prep', '--trust', '--refresh');
    log.info('Reloaded apps', result);
    return result;
  } catch (error) {
    log.error('Failed to reload apps', error);
    return 'error';
  }
}, 500);
