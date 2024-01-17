import { kitPath } from '@johnlindquist/kit/core/utils';
import { debugInfo } from 'electron-util';
import log from 'electron-log';
import { debounce } from 'lodash-es';
import { Trigger } from './enums';
import { emitter, KitEvent } from './events';
import { TrackEvent, trackEvent } from './track';

export const displayError = debounce((error: Error) => {
  log.error(error);
  trackEvent(TrackEvent.Error, {
    error: error?.name || 'Unknown error',
    message: error?.message || 'Unknown error message',
    stack: error?.stack || 'Unknown error stack',
  });
  emitter.emit(KitEvent.RunPromptProcess, {
    scriptPath: kitPath('cli', 'info.js'),
    args: [
      `${error?.name || 'An unknown error'} has occurred...`,
      `Caught Error`,
      `# ${error?.message || 'Unknown error message'} 😅
Please report to our [GitHub Discussions](https://github.com/johnlindquist/kit/discussions/categories/errors)

## ${debugInfo()?.replaceAll('\n', '')}

~~~
${error?.stack || 'Unknown error stack'}
~~~
`,
    ],
    options: {
      force: true,
      trigger: Trigger.Info,
    },
  });
}, 500);
