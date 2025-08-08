/**
 * Choice management atoms.
 * Handles choices, filtering, indexing, and selection.
 */

import type { Choice } from '@johnlindquist/kit/types/core';
import type { ScoredChoice } from '../../../shared/types';
import { atom } from 'jotai';
import { noChoice } from '../../../shared/defaults';
import { arraysEqual } from '../../utils/state-utils';

// --- Core Choices State ---
const choices = atom<ScoredChoice[]>([]);
export const choicesReadyAtom = atom(false);
export const filteredChoicesIdAtom = atom<number>(0);
const prevScoredChoicesIdsAtom = atom<string[]>([]);

// Configuration for how choices are loaded
export const choicesConfig = atom({ preload: false });
export const prevChoicesConfig = atom({ preload: false });

// Export the choices atom for read-only access
export const scoredChoicesAtom = atom((g) => g(choices));
export const choicesAtom = atom((g) => g(choices).map((result) => result.item));

// --- Choice Heights ---
const _currentChoiceHeights = atom<number[]>([]);
export const currentChoiceHeightsAtom = atom(
  (g) => g(_currentChoiceHeights),
  (_g, s, a: number[]) => {
    s(_currentChoiceHeights, a);
  },
);

// --- Choice Selection and Indexing ---
export const defaultValueAtom = atom('');
export const defaultChoiceIdAtom = atom('');
export const prevIndexAtom = atom(0);
export const _indexAtom = atom(0);
export const indexAtom = atom((g) => g(_indexAtom));

// --- Skip State ---
export const hasSkipAtom = atom(false);
export const allSkipAtom = atom(false);

// --- Focused Choice ---
const _focused = atom<Choice | null>(noChoice as Choice);
export const focusedChoiceAtom = atom((g) => g(_focused));
export const hasFocusedChoiceAtom = atom((g) => g(_focused) && g(_focused)?.name !== noChoice.name);

// --- Multiple Selection ---
export const selectedChoicesAtom = atom<Choice[]>([]);
export const selectedAtom = atom('');

// --- Choice Inputs (for Scriptlets/Dynamic Inputs) ---
type ChoiceInputId = string;
const _choiceInputsAtom = atom<ChoiceInputId[]>([]);
export const choiceInputsAtom = atom(
  (g) => g(_choiceInputsAtom),
  (_g, s, a: ChoiceInputId[]) => {
    s(_choiceInputsAtom, a);
  },
);

const _invalidateChoiceInputsAtom = atom(false);
export const invalidateChoiceInputsAtom = atom(
  (g) => g(_invalidateChoiceInputsAtom),
  (_g, s, a: boolean) => {
    s(_invalidateChoiceInputsAtom, a);
  },
);

// Utilities will be moved to index when wiring everything together
export const shouldHighlightDescriptionAtom = atom(() => false);

// Temporary exports for setter atoms that will be properly wired later
export const setChoicesAtom = atom(null, (_g, s, a: ScoredChoice[]) => {
  s(choices, a);
  s(choicesReadyAtom, true);
  const csIds = a.map((c) => c.item.id) as string[];
  s(prevScoredChoicesIdsAtom, csIds);
});

export const setIndexAtom = atom(null, (_g, s, a: number) => {
  s(_indexAtom, a);
});

export const setFocusedChoiceAtom = atom(null, (_g, s, a: Choice | null) => {
  s(_focused, a);
});

export const setCurrentChoiceHeightsAtom = atom(null, (g, s, a: ScoredChoice[]) => {
  const itemHeight = 32; // Will be imported from proper place later
  const currentChoiceHeights = a?.map((c) => c?.item?.height || itemHeight);
  const previousChoiceHeights = g(_currentChoiceHeights);
  if (!arraysEqual(previousChoiceHeights, currentChoiceHeights)) {
    s(_currentChoiceHeights, currentChoiceHeights);
  }
});