// =================================================================================================
// Utility atoms, helpers, and derived states.
// =================================================================================================

import { atom } from 'jotai';
import type { ScoredChoice } from '../../../shared/types';
import { MAX_VLIST_HEIGHT } from './constants';

// Stub implementations - these need to be properly extracted from jotai.ts
export const miniShortcutsHoveredAtom = atom(false);

// Helper: remove top border class from first item if present
export function removeTopBorderOnFirstItem(list: ScoredChoice[]) {
  const first = list?.[0]?.item as any;
  if (first?.className) first.className = first.className.replace('border-t-1', '');
}

// Helper: compute total virtual list height with cap
export function calcVirtualListHeight(list: ScoredChoice[], defaultItemHeight: number, cap = MAX_VLIST_HEIGHT) {
  let h = 0;
  for (const sc of list) {
    const height = (sc?.item as any)?.height;
    h += height || defaultItemHeight;
    if (h > cap) return cap;
  }
  return h;
}