import { kenvPath } from '@johnlindquist/kit/cjs/utils';

import log from 'electron-log';
import { pathExists, readFile } from 'fs-extra';
import { kitState } from './state';
import { appToPrompt, sendToPrompt } from './channel';
import { setTheme } from './process';
import { AppChannel } from './enums';

export const setCSSVariable = (name: string, value: undefined | string) => {
  if (value) {
    log.info(`Setting CSS`, name, value);
    appToPrompt(AppChannel.CSS_VARIABLE, { name, value });
  }
};

const extractAndSetCSSVariables = (css: string) => {
  const cssVarRegex = /--[\w-]+:\s*[^;]+;/g;
  const matches = css.match(cssVarRegex);

  log.info(`Extracting CSS Variables`, matches);

  const themeMap = matches?.reduce((acc, match) => {
    const [name, value] = match
      .split(':')
      .map((part) => part.trim().replace(';', ''));
    acc[name] = value;
    return acc;
  }, {});

  log.info(`Setting Theme`, themeMap);
  setTheme(themeMap);

  if (matches) {
    for (const match of matches) {
      const [name, value] = match
        .split(':')
        .map((part) => part.trim().replace(';', ''));
      setCSSVariable(name, value);
    }
  }
};

export const readKitCss = async (
  eventName: 'change' | 'unlink' | 'add' = 'change'
) => {
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
  sendToPrompt(AppChannel.CSS_CHANGED, css);
};
