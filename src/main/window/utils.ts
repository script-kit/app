import { BrowserWindow } from 'electron';
import { kitState } from '../state';
import { getPromptOptions } from '../prompt.options';
import shims from '../shims';
import { prompts } from '../prompts';
import { createLogger } from '../../shared/log-utils';
const log = createLogger('utils.ts');

export const makeWindow = (window: BrowserWindow) => {
  if (kitState.isMac) {
    log.info(`${window.id}: 📌 Making window`);
    shims['@johnlindquist/mac-panel-window'].makeWindow(window);
  }
};

export const makeKeyWindow = (window: BrowserWindow) => {
  if (kitState.isMac) {
    log.info(`${window.id}: 📌 Making key window`);
    shims['@johnlindquist/mac-panel-window'].makeKeyWindow(window);
  }
};

export const makePanel = (window: BrowserWindow) => {
  if (kitState.isMac) {
    log.info(`${window.id}: 📌 Making panel`);
    shims['@johnlindquist/mac-panel-window'].makePanel(window);
  }
};

export const setAppearance = (window: BrowserWindow, appearance: 'light' | 'dark' | 'auto') => {
  if (kitState.isMac) {
    log.info(`${window.id}: 📌 Setting appearance to ${appearance}`);
    shims['@johnlindquist/mac-panel-window'].setAppearance(window, appearance);
  }
};

export const prepQuitWindow = async () => {
  if (!kitState.isMac) {
    return;
  }
  log.info('👋 Prep quit window');
  const options = getPromptOptions();
  const window = new BrowserWindow(options);

  await new Promise((resolve) => {
    setTimeout(() => {
      log.info('👋 Prep quit window timeout');
      if (!window?.isDestroyed()) {
        shims['@johnlindquist/mac-panel-window'].makeKeyWindow(window);
      }

      for (const prompt of prompts) {
        if (prompt?.window?.isDestroyed()) {
          continue;
        }
        shims['@johnlindquist/mac-panel-window'].makeWindow(prompt.window);
      }
      if (!window?.isDestroyed()) {
        window?.close();
      }
      log.info('👋 Prep quit window done');
      resolve(null);
    }, 0); // Added a delay of 0 to explicitly set timeout delay
  });
};
