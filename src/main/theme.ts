import { kenvPath } from '@johnlindquist/kit/core/utils';

import { readFile } from 'node:fs/promises';
import log from 'electron-log';
import { pathExists } from './cjs-exports';
import { AppChannel } from '../shared/enums';
import { sendToAllPrompts } from './channel';
import type { WatchEvent } from './chokidar';
import { kitState } from './state';

export const setCSSVariable = (name: string, value: undefined | string) => {
  if (value) {
    log.info('Setting CSS', name, value);
    // TODO: Implement "appToSpecificPrompt" for CSS Variables?
    sendToAllPrompts(AppChannel.CSS_VARIABLE, { name, value });
  }
};

export const readKitCss = async (eventName: WatchEvent = 'change') => {
  return;
  log.info(`kit.css ${eventName}`);
  let css = '';
  kitState.hasCss = eventName !== 'unlink';
  if (eventName !== 'unlink') {
    const filePath = kenvPath('kit.css');
    const exists = await pathExists(filePath);
    if (exists) {
      css = await readFile(filePath, 'utf8');
    }
  }

  if (css) {
    extractAndSetCSSVariables(css);
  }
  // TODO: Implement "sendToAllPrompts"
  // sendToSpecificPrompt(AppChannel.CSS_CHANGED, css);
  sendToAllPrompts(AppChannel.CSS_CHANGED, css);
};
