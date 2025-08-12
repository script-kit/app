import { bench } from 'vitest';
import { rebuildReverseKeyMap, convertKeyInternal } from '../src/main/state/keymap';

const ks: any = {
  kenvEnv: {},
  keymap: {} as any,
  isMac: true,
};

// generate a fake keymap of 200 entries
for (let i = 0; i < 200; i++) {
  const code = `Key${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}`;
  ks.keymap[code] = { value: String.fromCharCode(97 + (i % 26)) };
}
rebuildReverseKeyMap(ks.keymap);

bench('convertKeyInternal("q")', () => {
  convertKeyInternal(ks, 'q');
});

bench('convertKeyInternal("unknown")', () => {
  convertKeyInternal(ks, '¤');
});