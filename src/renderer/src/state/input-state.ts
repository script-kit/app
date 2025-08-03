// =================================================================================================
// Manages user input, modifiers, and focus state.
// =================================================================================================

import { Channel, Mode, UI } from '@johnlindquist/kit/core/enum';
import { atom } from 'jotai';
import { createLogger } from '../log-utils';
import { submittedAtom, loading, loadingAtom } from './app-core';
import { modeAtom, uiAtom, tabChangedAtom } from './prompt-data';

const log = createLogger('input-state.ts');

export const _inputAtom = atom('');
export const prevInputAtom = atom('');
export const closedInput = atom('');
export const _inputChangedAtom = atom(false);
export const typingAtom = atom<boolean>(false);
export const beforeInputAtom = atom(''); // Seems potentially unused, but kept for export compatibility.

export const inputAtom = atom(
  (g) => g(_inputAtom),
  async (g, s, a: string) => {
    // s(directionAtom, 1);
    // const selected = g(showSelectedAtom);
    const prevInput = g(_inputAtom);

    // Reset index when input is cleared
    if (prevInput && a === '') {
      // s(selected ? flagsIndexAtom : indexAtom, 0);
    }

    if (a !== prevInput) {
      s(_inputChangedAtom, true);
    } else {
      s(tabChangedAtom, false);
      return;
    }

    s(_inputAtom, a);

    // Notify backend of input change
    if (!g(submittedAtom)) {
      // const channel = g(channelAtom);
      // channel(Channel.INPUT);
    }

    s(mouseEnabledAtom, 0);

    // if (selected) {
    //   s(selected ? flagsIndexAtom : indexAtom, 0);
    // }

    const mode = g(modeAtom);
    // const flaggedValue = g(flaggedChoiceValueAtom);

    // Handle input change immediately following a tab change
    if (g(tabChangedAtom) && a && prevInput !== a) {
      s(tabChangedAtom, false);
      return;
    }

    // Trigger loading state for GENERATE mode
    if (mode === Mode.GENERATE /* && !flaggedValue */) {
      s(loading, true);
      s(loadingAtom, true);
    }

    // Trigger resize if input was cleared
    if (g(_inputChangedAtom) && a === '') {
      // resize(g, s, 'INPUT_CLEARED');
    }
  },
);

export const appendInputAtom = atom(null, (g, s, a: string) => {
  const ui = g(uiAtom);
  if (ui === UI.editor) {
    // s(editorAppendAtom, a);
  } else {
    const input = g(_inputAtom);
    s(_inputAtom, input + a);
  }
});

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
    setTimeout(() => s(enterPressed, false), 100);
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