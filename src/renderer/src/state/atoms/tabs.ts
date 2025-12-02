/**
 * Tab navigation atoms.
 * These atoms manage tab state and navigation.
 */

import { atom } from 'jotai';
import { isEqual } from 'lodash-es';

const tabs = atom<string[]>([]);
export const tabsAtom = atom(
  (g) => g(tabs),
  (g, s, a: string[]) => {
    const prevTabs = g(tabs);
    if (isEqual(prevTabs, a)) return;
    s(tabs, a || []);
  },
);

export const tabChangedAtom = atom(false);
export const _tabIndex = atom(0);
// export const tabIndexAtom = atom(
//   (g) => g(_tabIndex),
//   (_g, s, a: number) => {
//     // Will be properly implemented after all dependencies are extracted
//     s(_tabIndex, a);
//   },
// ); // Complex version with computed properties is in jotai.ts
