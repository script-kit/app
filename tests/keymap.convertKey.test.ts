import { describe, it, expect, beforeEach } from 'vitest';
import { rebuildReverseKeyMap, convertKeyInternal } from '../src/main/state/keymap';

const makeKitState = () =>
  ({
    kenvEnv: {},
    keymap: {
      KeyQ: { value: 'q' },
      KeyW: { value: 'w' },
    },
    isMac: true,
  } as any);

describe('convertKeyInternal', () => {
  let ks: any;
  beforeEach(() => {
    ks = makeKitState();
    rebuildReverseKeyMap(ks.keymap);
  });

  it('returns uppercase mapped key when present', () => {
    expect(convertKeyInternal(ks, 'q')).toBe('Q');
    expect(convertKeyInternal(ks, 'w')).toBe('W');
  });

  it('returns input when not in map', () => {
    expect(convertKeyInternal(ks, 'z')).toBe('z');
  });

  it('skips when KIT_CONVERT_KEY=false', () => {
    ks.kenvEnv.KIT_CONVERT_KEY = 'false';
    expect(convertKeyInternal(ks, 'q')).toBe('q');
  });
});