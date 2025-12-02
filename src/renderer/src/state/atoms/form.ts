/**
 * Form and component state atoms.
 * These atoms manage form data, textarea configuration, and splash screen state.
 */

import type { TextareaConfig } from '@johnlindquist/kit/types/kitapp';
import { atom } from 'jotai';

// --- Textarea ---
const textareaConfig = atom<TextareaConfig>({
  value: '',
  placeholder: '',
});

export const textareaValueAtom = atom<string>('');

export const textareaConfigAtom = atom(
  (g) => g(textareaConfig),
  (_g, s, a: TextareaConfig) => {
    s(textareaConfig, a);
    s(textareaValueAtom, a?.value || '');
  },
);

// --- Form ---
export const formHTMLAtom = atom('');
export const formDataAtom = atom({});

// --- Splash Screen ---
export const splashBodyAtom = atom('');
export const splashHeaderAtom = atom('');
export const splashProgressAtom = atom(0);
