/**
 * Mouse and keyboard interaction state atoms.
 * These are simple, independent atoms with no cross-dependencies.
 */

import { atom } from 'jotai';

// --- Mouse State ---
export const mouseEnabledAtom = atom(0);
export const isMouseDownAtom = atom(false);

// --- Keyboard State ---
export const lastKeyDownWasModifierAtom = atom(false);

// --- Interaction Flags ---
export const hasInteractedAtom = atom(false);
export const isTypingAtom = atom(false);

// --- Focus Management ---
export const focusedElementAtom = atom<HTMLElement | null>(null);