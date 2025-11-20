/**
 * Terminal state atoms.
 * These atoms manage the terminal emulator configuration and output.
 */

import { atom } from 'jotai';
import type { TermConfig } from '../../../../shared/types';

export const termConfigDefaults: TermConfig = {
  command: '',
  cwd: '',
  env: {},
  shell: '',
  promptId: '',
  args: [],
  closeOnExit: true,
  pid: 0,
};

const termConfig = atom<TermConfig>(termConfigDefaults);
export const termConfigAtom = atom(
  (g) => g(termConfig),
  (_g, s, a: Partial<TermConfig> | null) => {
    const config = {
      ...termConfigDefaults,
      ...(a || {}),
    };
    s(termConfig, config);
  },
);

export const termFontAtom = atom('monospace');
export const termExitAtom = atom<string | null>(null);

export const _termOutputAtom = atom('');
export const termOutputAtom = atom(
  (g) => g(_termOutputAtom),
  (g, s, a: string) => {
    // Append output
    s(_termOutputAtom, g(_termOutputAtom) + a);
  },
);
