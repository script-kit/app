import os from 'node:os';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { app, Notification, shell } from 'electron';
import log from 'electron-log';
import { debounce } from 'lodash-es';
import { Trigger } from '../shared/enums';
import { emitter, KitEvent } from '../shared/events';
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

export const displayError = debounce(async (error: Error) => {
  log.error(error);

  // Try to get enhanced error info if sourcemap support is available
  let enhancedStack = error?.stack || 'Unknown error stack';
  try {
    const { SourcemapErrorFormatter } = await import('@johnlindquist/kit/core/sourcemap-formatter');
    const formattedError = SourcemapErrorFormatter.formatError(error);
    enhancedStack = formattedError.stack;

    // Track with enhanced telemetry
    const errorLocation = SourcemapErrorFormatter.extractErrorLocation(error);
    trackEvent(TrackEvent.Error, {
      error: error?.name || 'Unknown error',
      message: error?.message || 'Unknown error message',
      stack: enhancedStack,
      originalFile: errorLocation?.file,
      line: errorLocation?.line,
      column: errorLocation?.column,
      mappingSuccess: !!errorLocation,
    });
  } catch (e) {
    // Fallback to original telemetry if formatter fails
    log.warn('Failed to format error with sourcemap support:', e);
    trackEvent(TrackEvent.Error, {
      error: error?.name || 'Unknown error',
      message: error?.message || 'Unknown error message',
      stack: error?.stack || 'Unknown error stack',
    });
  }

  emitter.emit(KitEvent.RunPromptProcess, {
    scriptPath: kitPath('cli', 'info.js'),
    args: [
      `${error?.name || 'An unknown error'} has occurred...`,
      'Caught Error',
      `# ${error?.message || 'Unknown error message'} 😅
Please report to our [GitHub Discussions](https://github.com/johnlindquist/kit/discussions/categories/errors)

## ${debugInfo()?.replaceAll('\n', '')}

~~~
${enhancedStack}
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
