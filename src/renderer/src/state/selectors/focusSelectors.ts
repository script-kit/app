import { atom } from 'jotai';
import { _indexAtom } from '../atoms/choices';
import { scoredChoicesAtom } from '../facade';

/**
 * The requested index from user input or other sources.
 * This is what the user wants the index to be.
 */
export const requestedIndexAtom = _indexAtom;

/**
 * The effective index after bounds checking.
 * This ensures the index is always within valid bounds.
 */
export const effectiveIndexAtom = atom((g) => {
  const idx = g(requestedIndexAtom);
  const choices = g(scoredChoicesAtom);
  const len = choices.length;
  
  if (len === 0) return -1;
  return Math.max(0, Math.min(idx, len - 1));
});

/**
 * The ID of the currently focused choice.
 * Derived from the effective index.
 */
export const focusedChoiceIdAtom = atom((g) => {
  const idx = g(effectiveIndexAtom);
  const list = g(scoredChoicesAtom);
  
  if (idx >= 0 && idx < list.length) {
    return list[idx]?.item?.id;
  }
  return undefined;
});