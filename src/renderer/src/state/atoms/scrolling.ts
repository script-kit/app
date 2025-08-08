/**
 * Scrolling and list navigation atoms.
 * These atoms manage virtual list scrolling and item navigation.
 */

import { atom } from 'jotai';
import type { VariableSizeList } from 'react-window';

export const listAtom = atom<null | VariableSizeList>(null);
export const flagsListAtom = atom<null | VariableSizeList>(null);
export const requiresScrollAtom = atom(-1);
export const flagsRequiresScrollAtom = atom(-1);
export const isScrollingAtom = atom(false);
export const isFlagsScrollingAtom = atom(false);

const _scrollToItemAtom = atom(0);
export const scrollToItemAtom = atom(
  (g) => g(_scrollToItemAtom),
  (g, s, a: { index: number; reason?: string; align?: 'start' | 'end' | 'center' }) => {
    s(_scrollToItemAtom, a.index);
    const list = g(listAtom);
    if (list) {
      if (a.index === 0) {
        list.scrollToItem(a.index, 'start');
      } else {
        list.scrollToItem(a.index, a.align);
      }
    }
  },
);

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