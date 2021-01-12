/* eslint-disable import/prefer-default-export */
import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { getAssetPath } from './assets';

let promptWindow: BrowserWindow | null = null;

export const createPromptWindow = () => {
  log.info('icon:', getAssetPath('icon.png'));
  promptWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
    },
  });

  log.info('createPromptWindow', 'Prompt: ', promptWindow === null);
};

export const setPromptPosition = (x: number, y: number) => {
  log.info('Setting position to: ', { x, y });
  promptWindow?.setBounds({ x, y });
};

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
      },
    });
  }

  return promptWindow;
};
