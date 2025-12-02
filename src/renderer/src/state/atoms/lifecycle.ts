/**
 * Application lifecycle atoms for open/close state management.
 * These atoms handle the app window visibility lifecycle.
 */

import { atom } from 'jotai';
import { pidAtom } from './app-core';
import { mouseEnabledAtom } from './input';

export const _open = atom(false);

// This will be properly implemented after extracting all dependencies
// export const openAtom = atom(
//   (g) => g(_open),
//   (g, s, a: boolean) => {
//     if (g(_open) === a) return;
//
//     s(mouseEnabledAtom, 0);
//
//     // TODO: Will add reset logic after all atoms are extracted
//     if (g(_open) && a === false) {
//       // resetPromptState will be added here
//     }
//     s(_open, a);
//   },
// ); // Complex version with computed properties is in jotai.ts

// export const exitAtom = atom(
//   (g) => g(openAtom),
//   (g, s, pid: number) => {
//     if (g(pidAtom) === pid) {
//       s(openAtom, false);
//     }
//   },
// ); // Complex version with computed properties is in jotai.ts

export const resizeCompleteAtom = atom(false);
