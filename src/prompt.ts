/* eslint-disable import/prefer-default-export */
import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { getAssetPath } from './assets';

let promptWindow: BrowserWindow | null = null;

export const getPromptWindow = () => {
  log.info('getPromptWindow', 'Prompt: ', promptWindow === null);

  if (promptWindow === null) {
    log.info(`Creating Prompt from getPromptWindow`);
    promptWindow = new BrowserWindow({
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      show: false,
      icon: getAssetPath('icon.png'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });
  }

  return promptWindow;
};

export const closePromptWindow = () => {
  if (promptWindow) {
    promptWindow?.blur();
    promptWindow?.close();
    promptWindow = null;
  }
};
