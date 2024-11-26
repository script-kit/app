import type{ BrowserWindow } from 'electron';
import { kitState } from '../state';
import shims from '../shims';
import { prompts } from '../prompts';
import { createLogger } from '../../shared/log-utils';
import { AppChannel } from '../../shared/enums';
const log = createLogger('utils.ts');

export const prepForClose = (window: BrowserWindow) => {
  if (kitState.isMac && !window.isDestroyed()) {
    log.info(`${window.id}: 📌 Prepping for close`);
    shims['@johnlindquist/mac-panel-window'].prepForClose(window);
  }
};

export const makeWindow = (window: BrowserWindow) => {
  if (kitState.isMac && !window.isDestroyed()) {
    log.info(`${window.id}: 📌 Making window`);
    shims['@johnlindquist/mac-panel-window'].makeWindow(window);
    // add 20px padding to the top of the body
    window.webContents.send(AppChannel.MAKE_WINDOW, true);
  }
};

export const makeKeyWindow = (window: BrowserWindow) => {
  if (kitState.isMac && !window.isDestroyed()) {
    log.info(`${window.id}: 📌 Making key window`);
    shims['@johnlindquist/mac-panel-window'].makeKeyWindow(window);
    window.webContents.send(AppChannel.MAKE_WINDOW, false);
  }
};

export const makePanel = (window: BrowserWindow) => {
  if (kitState.isMac && !window.isDestroyed()) {
    log.info(`${window.id}: 📌 Making panel`);
    shims['@johnlindquist/mac-panel-window'].makePanel(window);
  }
};

export const setAppearance = (window: BrowserWindow, appearance: 'light' | 'dark' | 'auto') => {
  if (kitState.isMac && !window.isDestroyed()) {
    log.info(`${window.id}: 📌 Setting appearance to ${appearance}`);
    shims['@johnlindquist/mac-panel-window'].setAppearance(window, appearance);
  }
};

export const prepQuitWindow = async () => {
  if (!kitState.isMac) {
    return;
  }
  log.info('👋 Prep quit window');

  await new Promise((resolve) => {
    setTimeout(() => {
      log.info('👋 Prep quit window timeout');

      for (const prompt of prompts) {
        if (prompt?.window?.isDestroyed()) {
          continue;
        }
        shims['@johnlindquist/mac-panel-window'].makeWindow(prompt.window);
      }
      log.info('👋 Prep quit window done');
      resolve(null);
    }, 0); // Added a delay of 0 to explicitly set timeout delay
  });
};
