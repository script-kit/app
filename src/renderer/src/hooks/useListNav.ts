import { useCallback } from 'react';

export type ListNavReason = 'key' | 'hover' | 'click' | 'data' | 'open' | 'restore' | 'programmatic';

export type ListNavEvent =
  | { type: 'MOVE'; delta: number; source?: ListNavReason }
  | { type: 'PAGE'; delta: number; pageSize: number; source?: ListNavReason }
  | { type: 'SET'; index: number; source?: ListNavReason }
  | { type: 'HOVER'; index: number }
  | { type: 'CLICK'; index: number }
  | { type: 'RESET'; source?: ListNavReason };

export type ListNavConfig = {
  id: string;
  getCount: () => number;
  getIndex: () => number;
  setIndex: (next: number, reason: ListNavReason) => void;
  loop?: boolean;
};

function nextIndex(current: number, delta: number, count: number, loop: boolean) {
  if (count <= 0) return 0;
  const raw = current + delta;
  if (loop) {
    const m = ((raw % count) + count) % count; // positive modulo
    return m;
  }
  if (raw < 0) return 0;
  if (raw >= count) return count - 1;
  return raw;
}

export function useListNav(config: ListNavConfig) {
  const { id, getCount, getIndex, setIndex, loop = true } = config;

  const dispatch = useCallback(
    (e: ListNavEvent) => {
      const count = getCount();
      const current = getIndex();

      switch (e.type) {
        case 'MOVE': {
          const next = nextIndex(current, e.delta, count, loop);
          if (next !== current) setIndex(next, e.source ?? 'key');
          break;
        }
        case 'PAGE': {
          const step = e.pageSize > 0 ? e.pageSize : Math.max(1, Math.floor(count / 2));
          const next = nextIndex(current, e.delta * step, count, loop);
          if (next !== current) setIndex(next, e.source ?? 'key');
          break;
        }
        case 'SET': {
          const i = e.index;
          if (i >= 0 && i < count && i !== current) setIndex(i, e.source ?? 'programmatic');
          break;
        }
        case 'HOVER': {
          if (e.index >= 0 && e.index < count && e.index !== current) setIndex(e.index, 'hover');
          break;
        }
        case 'CLICK': {
          if (e.index >= 0 && e.index < count && e.index !== current) setIndex(e.index, 'click');
          break;
        }
        case 'RESET': {
          if (current !== 0 && count > 0) setIndex(0, e.source ?? 'programmatic');
          break;
        }
        default: {
          if ((window as any).DEBUG_LISTNAV) {
            // eslint-disable-next-line no-console
            console.warn(`ListNav(${id}): unhandled event`, e);
          }
        }
      }

      if ((window as any).DEBUG_LISTNAV) {
        const after = getIndex();
        // eslint-disable-next-line no-console
        console.log(`ListNav(${id}): index ${current} -> ${after}`, e);
      }
    },
    [config, getCount, getIndex, id, loop, setIndex],
  );

  const moveUp = useCallback(() => dispatch({ type: 'MOVE', delta: -1, source: 'key' }), [dispatch]);
  const moveDown = useCallback(() => dispatch({ type: 'MOVE', delta: +1, source: 'key' }), [dispatch]);
  const pageUp = useCallback(
    (pageSize?: number) => dispatch({ type: 'PAGE', delta: -1, pageSize: pageSize ?? 0, source: 'key' }),
    [dispatch],
  );
  const pageDown = useCallback(
    (pageSize?: number) => dispatch({ type: 'PAGE', delta: +1, pageSize: pageSize ?? 0, source: 'key' }),
    [dispatch],
  );

  return {
    dispatch,
    moveUp,
    moveDown,
    pageUp,
    pageDown,
  };
}

export default useListNav;
