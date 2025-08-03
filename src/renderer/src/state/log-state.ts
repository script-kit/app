// =================================================================================================
// Manages application logs and console output display.
// =================================================================================================

import { atom } from 'jotai';

// Stub implementations - these need to be properly extracted from jotai.ts
export const logHTMLAtom = atom<string>('');
export const logLinesAtom = atom<string[]>([]);

// Add other log related atoms here