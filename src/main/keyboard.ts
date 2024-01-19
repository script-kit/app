import log from 'electron-log';
import { kitState } from '../shared/state';

export const deleteText = async (stringToDelete = '') => {
  if (!kitState.supportsNut) {
    log.warn(
      `Keyboard type: Nut not supported on Windows arm64 or Linux arm64. Hoping to find a solution soon!`
    );
    return;
  }

  // REMOVE-NUT
  const { keyboard, Key } = await import('@nut-tree/nut-js');
  const prevDelay = keyboard.config.autoDelayMs;
  keyboard.config.autoDelayMs = 0;

  kitState.isTyping = true;
  for await (const k of stringToDelete.split('').reverse().join('')) {
    await keyboard.type(Key.Backspace);
    log.silly(`Deleted ${k}`);
  }

  keyboard.config.autoDelayMs = prevDelay;

  kitState.isTyping = false;
  // END-REMOVE-NUT
};
