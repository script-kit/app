/**
 * Scrolling and list navigation atoms.
 * Legacy atoms still in use - new code should use the unified scroll service
 * in src/renderer/src/state/scroll/
 */

import { atom } from 'jotai';

// v2 compatible scroll interface - works with wrappers created by components
interface ScrollableListRef {
  scrollToItem: (index: number, align?: string) => void;
  resetAfterIndex?: (index: number) => void;
}

// Still in use by components for storing list references
// v2: Uses wrapper interface instead of VariableSizeList type
export const listAtom = atom<null | ScrollableListRef>(null);
export const flagsListAtom = atom<null | ScrollableListRef>(null);

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
