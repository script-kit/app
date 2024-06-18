import { kenvPath } from '@johnlindquist/kit/core/utils';

import { readFile } from 'node:fs/promises';
import log from 'electron-log';
import fsExtra from 'fs-extra';
const { pathExists } = fsExtra;
import { AppChannel } from '../shared/enums';
import { sendToAllPrompts } from './channel';
import type { WatchEvent } from './chokidar';
import { setTheme } from './process';
import { kitState } from './state';

export const setCSSVariable = (name: string, value: undefined | string) => {
  if (value) {
    log.info('Setting CSS', name, value);
    // TODO: Implement "appToSpecificPrompt" for CSS Variables?
    sendToAllPrompts(AppChannel.CSS_VARIABLE, { name, value });
  }
};

const extractAndSetCSSVariables = (css: string) => {
  const cssVarRegex = /--[\w-]+:\s*[^;]+;/g;
  const matches = css.match(cssVarRegex);

  log.info('Extracting CSS Variables', matches);

  const themeMap = matches?.reduce((acc, match) => {
    const [name, value] = match.split(':').map((part) => part.trim().replace(';', ''));
    acc[name] = value;
    return acc;
  }, {});

  log.info('Setting Theme', themeMap);
  setTheme(themeMap, 'extractAndSetCSSVariables()');

  if (matches) {
    for (const match of matches) {
      const [name, value] = match.split(':').map((part) => part.trim().replace(';', ''));
      setCSSVariable(name, value);
    }
  }
};

export const readKitCss = async (eventName: WatchEvent = 'change') => {
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
