// =================================================================================================
// State specific to the terminal component.
// =================================================================================================

import { atom } from 'jotai';
import type { TermConfig } from '../../../../shared/types';

// Stub implementations - these need to be properly extracted from jotai.ts
export const termConfigAtom = atom<TermConfig>({
  promptId: '',
  command: '',
  cwd: '',
  env: {},
  args: [],
  closeOnExit: true,
  pid: 0,
} as TermConfig);

// Add other terminal related atoms here