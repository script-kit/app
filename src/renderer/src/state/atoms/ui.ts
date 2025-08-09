/**
 * UI state atoms.
 * Manages the current UI mode and related states.
 */

import { atom } from 'jotai';
import { UI, Mode } from '@johnlindquist/kit/core/enum';
import type { PromptData } from '@johnlindquist/kit/types/core';

// --- Core UI State ---
export const _ui = atom<UI>(UI.arg);
// export const uiAtom = atom((g) => g(_ui)); // Complex version with computed properties is in jotai.ts
export const setUiAtom = atom(null, (_g, s, a: UI) => {
  s(_ui, a);
});

// --- Prompt Data ---
export const promptData = atom<null | Partial<PromptData>>({
  ui: UI.arg,
  input: '',
  footerClassName: 'hidden',
  headerClassName: 'hidden',
  containerClassName: '',
  placeholder: 'Script Kit',
});

// export const promptDataAtom = atom((g) => g(promptData)); // Complex version with computed properties is in jotai.ts
export const setPromptDataAtom = atom(null, (_g, s, a: null | Partial<PromptData>) => {
  s(promptData, a);
});

export const promptReadyAtom = atom(false);
export const modeAtom = atom((g) => g(promptData)?.mode || Mode.FILTER);

// --- Show/Hide States ---
export const showSelectedAtom = atom(() => false);
export const showTabsAtom = atom(() => false);

// --- Other UI-related atoms ---
export const isMainScriptInitialAtom = atom<boolean>(() => false);
// export const choicesConfigAtom = atom(
//   () => ({ preload: false }),
//   (_g, _s, _a: { preload: boolean }) => {}
// ); // Complex version with computed properties is in jotai.ts