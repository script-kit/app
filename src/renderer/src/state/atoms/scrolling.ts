/**
 * Scrolling and list navigation atoms.
 * Legacy atoms still in use - new code should use the unified scroll service
 * in src/renderer/src/state/scroll/
 */

import { atom } from 'jotai';
import type { VariableSizeList } from 'react-window';

// Still in use by components for storing list references
export const listAtom = atom<null | VariableSizeList>(null);
export const flagsListAtom = atom<null | VariableSizeList>(null);

// Still in use for scroll state tracking
export const isScrollingAtom = atom(false);
export const isFlagsScrollingAtom = atom(false);

// Legacy scrollToIndexAtom - still used by some reset functions
// TODO: Migrate remaining usages to scroll service
export const scrollToIndexAtom = atom((g) => {
  return (i: number) => {
    const list = g(listAtom);
    const gridReady = g(gridReadyAtom);
    if (list && !gridReady) {
      list.scrollToItem(i);
    }
  };
});

// Temporary - will be moved when gridReadyAtom is properly placed
const gridReadyAtom = atom(false);