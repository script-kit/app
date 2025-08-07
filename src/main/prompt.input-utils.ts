import type { Input } from 'electron';

export function isCloseCombo(input: Input, isMac: boolean) {
  const isW = input.key === 'w';
  return isW && (isMac ? input.meta : input.control);
}


