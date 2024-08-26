import { optionalSpawnSetup } from './install';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { createLogger } from '../shared/log-utils';
import { kitState } from './state';
import { debounce } from 'lodash-es';

const log = createLogger('apps.ts');

export function reloadApps() {
  if (kitState.isLinux) {
    return;
  }
  return debounce(async () => {
    try {
      log.info('Attempting to reload apps...');
      const result = await optionalSpawnSetup(kitPath('main', 'app-launcher.js'), '--prep', '--trust');
      log.info('Reloaded apps', result);
      return result;
    } catch (error) {
      log.error('Failed to reload apps', error);
      return 'error';
    }
  }, 500);
}
