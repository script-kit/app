import os from 'node:os';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { Notification, app, shell } from 'electron';
import log from 'electron-log';
import { debounce } from 'lodash-es';
import { Trigger } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import { mainLogPath } from './logs';
import { TrackEvent, trackEvent } from './track';

const electronVersion = process.versions.electron ?? '0.0.0';
export const debugInfo = () =>
  `
${app.name} ${app.getVersion()}
Electron ${electronVersion}
${process.platform} ${os.release()}
Locale: ${app.getLocale()}
`.trim();

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
      'Caught Error',
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

  try {
    const notification = new Notification({
      title: error?.name || 'Unknown error',
      body: `${error?.message || 'Unknown error message'}\nClick to open logs`,
      silent: true,
    });

    notification.on('click', () => {
      shell.openPath(mainLogPath);
    });

    notification.show();
  } catch (notifyError) {
    log.warn('Failed to show error notification', notifyError);
  }
}, 500);
