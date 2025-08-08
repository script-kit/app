/**
 * Caching atoms for main script state.
 * These atoms store cached data to improve performance when switching between scripts.
 */

import type { PromptData, FlagsObject, Shortcut } from '@johnlindquist/kit/types/core';
import type { ScoredChoice } from '../../../shared/types';
import { UI } from '@johnlindquist/kit/core/enum';
import { atom } from 'jotai';

export const cachedMainScoredChoices = atom<ScoredChoice[]>([]);
export const cachedMainScoredChoicesAtom = atom(
  (g) => g(cachedMainScoredChoices),
  (_g, s, a: ScoredChoice[]) => {
    s(cachedMainScoredChoices, a);
  },
);

export const cachedMainPromptDataAtom = atom<Partial<PromptData>>({
  ui: UI.arg,
  input: '',
  footerClassName: 'hidden',
  headerClassName: 'hidden',
  containerClassName: '',
  placeholder: 'Script Kit',
  enter: 'Run',
});

export const cachedMainShortcutsAtom = atom<Shortcut[]>([]);
export const cachedMainPreviewAtom = atom<string>('');
export const cachedMainFlagsAtom = atom<FlagsObject>({});