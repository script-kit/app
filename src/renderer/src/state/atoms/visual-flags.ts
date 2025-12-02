/**
 * Visual and display flag atoms.
 * Simple boolean flags for UI state with no dependencies.
 */

import { atom } from 'jotai';

// --- Window State ---
export const isWindowAtom = atom(false);
export const isFullScreenAtom = atom(false);

// --- Theme State ---
export const isDarkAtom = atom(false);

// --- Visual Indicators ---
export const audioDotAtom = atom(false);
export const loadingAtom = atom(false);
export const processingAtom = atom(false);
export const progressAtom = atom(0);

// --- Display Flags ---
export const showSelectedAtom = atom(false);
export const showTabsAtom = atom(false);
export const headerHiddenAtom = atom(false);
export const footerHiddenAtom = atom(false);
