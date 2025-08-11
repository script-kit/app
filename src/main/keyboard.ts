import shims from './shims';
import { kitState } from './state';
import { keyboardLog as log } from './logs';
import { expectBackspaces } from './io';

export const deleteText = async (stringToDelete = '') => {
  if (!kitState.supportsNut) {
    log.warn('Keyboard type: Nut not supported on Windows arm64 or Linux arm64. Hoping to find a solution soon!');
    return;
  }

  // REMOVE-NUT

  // const prevDelay = keyboard.config.autoDelayMs;
  // keyboard.config.autoDelayMs = 0;

  kitState.isTyping = true;
  try {
    const chars = stringToDelete.split('').reverse().join('');
    const charCount = chars.length;
    log.info('Deleting text', { stringToDelete, charCount });

    // Set up expectation for backspace keypresses
    const backspacePromise = expectBackspaces(charCount);

    // Send all backspace keypresses
    for (const k of chars) {
      // await keyboard.type(Key.Backspace);
      shims['@jitsi/robotjs'].keyTap('backspace');
      log.silly(`Sent backspace for ${k}`);
    }

    // Wait for all backspaces to be detected by io.ts
    log.info('Waiting for all backspaces to be detected...');
    await backspacePromise;
    log.info('All backspaces detected, deletion complete', { stringToDelete });

    // keyboard.config.autoDelayMs = prevDelay;
  } finally {
    kitState.isTyping = false;
  }
  // END-REMOVE-NUT
};
