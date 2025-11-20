/**
 * Utility atoms for various helper functions.
 * These atoms provide common functionality used across the app.
 */

import { atom } from 'jotai';
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import type { Choice } from '@johnlindquist/kit/types/core';

// Import dependencies from shared-dependencies to avoid circular imports
import {
  uiAtom,
  editorAppendAtom,
  _inputAtom,
  processingAtom,
  inputAtom,
  _inputChangedAtom,
  hintAtom,
  channelAtom,
  promptActiveAtom,
  submittedAtom,
  selectedChoicesAtom,
  choices,
  loadingAtom,
} from '../shared-dependencies';

/**
 * Appends text to the current input (text input or editor).
 */
export const appendInputAtom = atom(null, (g, s, a: string) => {
  const ui = g(uiAtom);
  if (ui === UI.editor) {
    s(editorAppendAtom, a);
  } else {
    const input = g(_inputAtom);
    s(_inputAtom, input + a);
  }
});

/**
 * Handles validation failure by clearing input and showing hint.
 */
export const valueInvalidAtom = atom(null, (g, s, a: string) => {
  // Re-enable prompt interactions after a validation failure
  s(promptActiveAtom, true);
  // Allow subsequent submissions (submitValueAtom guards on submittedAtom)
  s(submittedAtom, false);
  s(loadingAtom, false);
  s(processingAtom, false);
  s(inputAtom, '');
  s(_inputChangedAtom, false);

  if (typeof a === 'string') {
    // hintAtom setter handles the ANSI conversion
    s(hintAtom, a);
  }

  const channel = g(channelAtom);
  channel(Channel.ON_VALIDATION_FAILED);
});

/**
 * Prevents form submission and resets processing state.
 */
export const preventSubmitAtom = atom(null, (_g, s, _a: string) => {
  s(promptActiveAtom, true);
  s(submittedAtom, false);
  s(loadingAtom, false);
  s(processingAtom, false);
  s(_inputChangedAtom, false);
});

/**
 * Toggles selection state of a specific choice by ID.
 */
export const toggleSelectedChoiceAtom = atom(null, (g, s, id: string) => {
  const selectedChoices = [...g(selectedChoicesAtom)];
  const scoredChoice = g(choices).find((c) => c?.item?.id === id);
  const index = selectedChoices.findIndex((c) => c?.id === id);

  if (index > -1) {
    selectedChoices.splice(index, 1);
  } else if (scoredChoice?.item) {
    selectedChoices.push(scoredChoice.item as Choice);
  }

  s(selectedChoicesAtom, selectedChoices);
});

/**
 * Toggles selection state of all choices (select all/deselect all).
 */
export const toggleAllSelectedChoicesAtom = atom(null, (g, s) => {
  const selectedChoices = g(selectedChoicesAtom);
  const cs = g(choices).map((c) => c?.item as Choice);

  if (selectedChoices.length === cs.length) {
    s(selectedChoicesAtom, []);
  } else {
    s(selectedChoicesAtom, cs);
  }
});
