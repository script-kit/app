// =================================================================================================
// State specific to the Monaco editor component.
// =================================================================================================

import { atom } from 'jotai';
import type { EditorConfig } from '@johnlindquist/kit/types/kitapp';

// Stub implementations - these need to be properly extracted from jotai.ts
export const editorConfigAtom = atom<EditorConfig>({});

// Add other editor related atoms here