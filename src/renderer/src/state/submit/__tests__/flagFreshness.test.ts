import { describe, expect, it } from 'vitest';
import { hasFreshFlag } from '../flagFreshness';

const baseMeta = (version = 1) => ({ sessionKey: 'prompt::pid', version });

describe('hasFreshFlag', () => {
  it('returns false when no flag value provided', () => {
    expect(
      hasFreshFlag({
        flag: '',
        overlayOpen: false,
        flagMeta: baseMeta(),
        lastConsumed: { sessionKey: '', version: 0 },
      }),
    ).toBe(false);
  });

  it('returns true when overlay is open regardless of consumption', () => {
    expect(
      hasFreshFlag({
        flag: 'edit-script',
        overlayOpen: true,
        flagMeta: baseMeta(5),
        lastConsumed: baseMeta(5),
      }),
    ).toBe(true);
  });

  it('returns true when flag version differs from last consumed', () => {
    expect(
      hasFreshFlag({
        flag: 'edit-script',
        overlayOpen: false,
        flagMeta: baseMeta(2),
        lastConsumed: baseMeta(1),
      }),
    ).toBe(true);
  });

  it('returns false when flag version matches last consumed and overlay closed', () => {
    expect(
      hasFreshFlag({
        flag: 'edit-script',
        overlayOpen: false,
        flagMeta: baseMeta(3),
        lastConsumed: baseMeta(3),
      }),
    ).toBe(false);
  });
});
