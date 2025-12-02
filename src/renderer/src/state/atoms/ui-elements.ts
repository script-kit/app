/**
 * UI element state atoms.
 * These atoms manage state for various UI components and their visibility.
 */

import { PROMPT } from '@johnlindquist/kit/core/enum';
import { atom } from 'jotai';

// --- UI Element Visibility ---
export const headerHiddenAtom = atom(false);
export const footerHiddenAtom = atom(false);

// --- Component Heights ---
export const itemHeightAtom = atom(PROMPT.ITEM.HEIGHT.SM);
export const inputHeightAtom = atom(PROMPT.INPUT.HEIGHT.SM);
export const actionsItemHeightAtom = atom(PROMPT.ITEM.HEIGHT.SM);
export const actionsInputHeightAtom = atom(PROMPT.INPUT.HEIGHT.XS - 2);
export const choicesHeightAtom = atom(0);
export const flagsHeightAtom = atom(0);
// Internal primitive atom for mainHeight
export const _mainHeight = atom(0);
// A simple "please recompute resize" signal. Increment to trigger.
export const resizeTickAtom = atom(0);
// mainHeightAtom is defined in jotai.ts with complex setter logic
export const prevMh = atom(0);
export const logHeightAtom = atom<number>(0);

// --- UI Text and Labels ---
export const hintAtom = atom('');
export const placeholderAtom = atom('');
export const enterAtom = atom<string>('');
export const descriptionAtom = atom<string>('');
export const nameAtom = atom<string>('');
export const footerAtom = atom('');
export const containerClassNameAtom = atom('');
export const cssAtom = atom('');

// --- Grid and Layout ---
export const gridReadyAtom = atom(false);
export const zoomAtom = atom(0);
export const hasBorderAtom = atom((g) => g(zoomAtom) === 0);
export const isWindowAtom = atom<boolean>(false);
export const devToolsOpenAtom = atom<boolean>(false);
