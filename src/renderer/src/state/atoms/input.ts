/**
 * Input state atoms.
 * Manages user input, modifiers, and focus state.
 */

import { atom } from 'jotai';
import { createLogger } from '../../log-utils';

const log = createLogger('input.ts');

// --- Core Input State ---
export const _inputAtom = atom('');
export const prevInputAtom = atom('');
export const closedInput = atom('');
export const _inputChangedAtom = atom(false);
export const typingAtom = atom<boolean>(false);
export const beforeInputAtom = atom('');

// --- Input While Submitted ---
export const _inputWhileSubmittedAtom = atom('');
export const inputWhileSubmittedAtom = atom(
  (g) => g(_inputWhileSubmittedAtom),
  (_g, s, a: string) => {
    log.info(`🔥 Input while submitted: ${a}`);
    s(_inputWhileSubmittedAtom, a);
  },
);

// --- Modifiers and Key State ---
export const modifiers = [
  'Alt',
  'AltGraph',
  'CapsLock',
  'Control',
  'Fn',
  'FnLock',
  'Meta',
  'NumLock',
  'ScrollLock',
  'Shift',
  'Symbol',
  'SymbolLock',
];

export const _modifiers = atom<string[]>([]);
export const _lastKeyDownWasModifierAtom = atom(false);
export const lastKeyDownWasModifierAtom = atom(
  (g) => g(_lastKeyDownWasModifierAtom),
  (_g, s, a: boolean) => {
    s(_lastKeyDownWasModifierAtom, a);
  },
);

export const enterLastPressedAtom = atom<Date | null>(null);
const enterPressed = atom(false);
export const enterPressedAtom = atom(
  (g) => g(enterPressed),
  (_g, s) => {
    s(enterPressed, true);
    // Will use constant from constants file later
    setTimeout(() => s(enterPressed, false), 250);
  },
);

// --- Focus and Interaction ---
export const inputFocusAtom = atom<number>(Math.random());
export const focusedElementAtom = atom<null | HTMLElement>(null);
export const selectionStartAtom = atom(0);
export const isMouseDownAtom = atom(false);

const mouseEnabled = atom(0);
// Requires a small amount of movement (5 units) before enabling mouse interaction
export const mouseEnabledAtom = atom(
  (g) => g(mouseEnabled) > 5,
  (g, s, a: number) => {
    s(mouseEnabled, a ? g(mouseEnabled) + a : a);
  },
);

// --- Direction for navigation ---
export const directionAtom = atom<1 | -1>(1);