import { keyboard, Key } from '@nut-tree/nut-js';
import log from 'electron-log';
import { kitState } from './state';

export const deleteText = async (stringToDelete = '') => {
  const prevDelay = keyboard.config.autoDelayMs;
  keyboard.config.autoDelayMs = 0;

  kitState.isTyping = true;
  for await (const k of stringToDelete.split('').reverse().join('')) {
    await keyboard.type(Key.Backspace);
    log.silly(`Deleted ${k}`);
  }

  keyboard.config.autoDelayMs = prevDelay;

  kitState.isTyping = false;
};
