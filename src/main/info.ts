import { kitPath } from '@johnlindquist/kit/core/utils';
import log from 'electron-log';
import { debounce } from 'lodash-es';
import { Trigger } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';

// TODO: use in for TRUSTED KENVS
export const showInfo = debounce(
  (name: string, description: string, markdown: string) => {
    log.info(`${name} ${description} ${markdown}`);
    emitter.emit(KitEvent.RunPromptProcess, {
      scriptPath: kitPath('cli', 'info.js'),
      args: [name, description, markdown],
      options: {
        force: true,
        trigger: Trigger.Info,
      },
    });
  },
  500,
  {
    leading: true,
    trailing: false,
  },
);
