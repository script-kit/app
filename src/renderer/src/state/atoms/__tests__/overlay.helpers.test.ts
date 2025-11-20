import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'jotai';

import {
  actionsOverlayOpenAtom,
  actionsOverlaySourceAtom,
  openActionsOverlayAtom,
  closeActionsOverlayAtom,
  pendingFlagAtom,
  actionsInputAtom,
  focusedFlagValueAtom,
  focusedActionAtom,
} from '../../../jotai';

describe('Actions overlay helpers', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  it('opens overlay with source and flag, resets index and scroll', () => {
    store.set(openActionsOverlayAtom as any, { source: 'input', flag: 'abc' });
    expect(store.get(actionsOverlayOpenAtom)).toBe(true);
    expect(store.get(actionsOverlaySourceAtom)).toBe('input');
    expect(store.get(pendingFlagAtom)).toBe('abc');
  });

  it('closes overlay and clears focused flag/action and actions input', () => {
    // open first
    store.set(openActionsOverlayAtom as any, { source: 'ui', flag: 'xyz' });

    // set a focused flag and action like a user selection would
    store.set(focusedFlagValueAtom as any, 'build');
    store.set(focusedActionAtom as any, { hasAction: true, flag: 'build' } as any);
    store.set(actionsInputAtom as any, 'dep');

    // close overlay
    store.set(closeActionsOverlayAtom as any, null);

    expect(store.get(actionsOverlayOpenAtom)).toBe(false);
    expect(store.get(focusedFlagValueAtom)).toBe('');
    const fa = store.get(focusedActionAtom) as any;
    expect(Boolean(fa?.hasAction)).toBe(false);
    expect(store.get(actionsInputAtom)).toBe('');
  });

  it('clears any pending flag payload when overlay closes after selection', () => {
    store.set(openActionsOverlayAtom as any, { source: 'ui' });
    store.set(pendingFlagAtom as any, 'build');
    store.set(focusedFlagValueAtom as any, 'build');

    store.set(closeActionsOverlayAtom as any, null);

    expect(store.get(pendingFlagAtom)).toBe('');
    expect(store.get(focusedFlagValueAtom)).toBe('');
  });
});
