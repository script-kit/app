// =================================================================================================
// Atoms related to UI appearance, dimensions, resizing, and layout orchestration.
// =================================================================================================

import { atom } from 'jotai';

// Stub implementations - these need to be properly extracted from jotai.ts
export const resizeCompleteAtom = atom(false);
export const promptBoundsAtom = atom({});
export const promptBoundsDefault = {};
export const requiresScrollAtom = atom(-1);
export const scrollToIndexAtom = atom((g: any) => (index: number) => {});

// Add other UI layout related atoms here