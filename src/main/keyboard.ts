import log from 'electron-log';
import { kitState } from '../shared/state';
import { enigo } from './enigo';

export const deleteText = async (stringToDelete = '') => {
  if (!kitState.supportsNut) {
    log.warn(
      `Keyboard type: Nut not supported on Windows arm64 or Linux arm64. Hoping to find a solution soon!`,
    );
    return;
  }

  // REMOVE-NUT

  const { KeyboardKey } = await import('@johnlindquist/kit-enigo');
  // const prevDelay = keyboard.config.autoDelayMs;
  // keyboard.config.autoDelayMs = 0;

  kitState.isTyping = true;
  for await (const k of stringToDelete.split('').reverse().join('')) {
    // await keyboard.type(Key.Backspace);
    enigo.pressKey([KeyboardKey.Backspace]);
    enigo.releaseKey([KeyboardKey.Backspace]);
    log.silly(`Deleted ${k}`);
  }

  // keyboard.config.autoDelayMs = prevDelay;

  kitState.isTyping = false;
  // END-REMOVE-NUT
};
