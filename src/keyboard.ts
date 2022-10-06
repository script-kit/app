import { keyboard, Key } from '@nut-tree/nut-js';

export const deleteText = async (stringToDelete: string) => {
  const prevDelay = keyboard.config.autoDelayMs;
  keyboard.config.autoDelayMs = 0;

  for await (const k of stringToDelete) {
    await keyboard.type(Key.Backspace);
  }

  keyboard.config.autoDelayMs = prevDelay;
};
