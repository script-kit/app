import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'jotai';
import { scheduleResizeAtom, resizePendingMaskAtom, resizeEpochAtom } from '../../../src/renderer/src/state/resize/scheduler';
import { ResizeReason } from '../../../src/renderer/src/state/resize/reasons';
import { resizeTickAtom, devToolsOpenAtom } from '../../../src/renderer/src/state/atoms/ui-elements';

describe('resize scheduler', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  it('coalesces reasons and bumps tick', () => {
    const initialTick = store.get(resizeTickAtom);
    const initialMask = store.get(resizePendingMaskAtom);
    expect(initialMask).toBe(ResizeReason.NONE);

    store.set(scheduleResizeAtom, 'DOM');
    const mask1 = store.get(resizePendingMaskAtom);
    const tick1 = store.get(resizeTickAtom);
    expect(mask1 & ResizeReason.DOM).toBe(ResizeReason.DOM);
    expect(tick1).toBe(initialTick + 1);

    // Setting another overlapping reason should OR the mask and bump tick
    store.set(scheduleResizeAtom, 'UI');
    const mask2 = store.get(resizePendingMaskAtom);
    const tick2 = store.get(resizeTickAtom);
    expect(mask2 & ResizeReason.UI).toBe(ResizeReason.UI);
    expect(mask2 & ResizeReason.DOM).toBe(ResizeReason.DOM);
    expect(tick2).toBe(initialTick + 2);
  });

  it('bumps epoch on MAIN_ACK', () => {
    const initialEpoch = store.get(resizeEpochAtom);
    store.set(scheduleResizeAtom, 'MAIN_ACK');
    const nextEpoch = store.get(resizeEpochAtom);
    expect(nextEpoch).toBe(initialEpoch + 1);
  });

  it('respects devtools gate when enabled', () => {
    const initialTick = store.get(resizeTickAtom);
    // emulate window/localStorage flags
    (global as any).window = { RESIZE_GATE_DEVTOOLS: true } as any;
    store.set(devToolsOpenAtom, true);
    store.set(scheduleResizeAtom, 'DOM');
    const tick = store.get(resizeTickAtom);
    expect(tick).toBe(initialTick); // should not bump while gated

    // disable gate and try again
    (global as any).window = { RESIZE_GATE_DEVTOOLS: false } as any;
    store.set(scheduleResizeAtom, 'DOM');
    expect(store.get(resizeTickAtom)).toBe(initialTick + 1);
  });
});
