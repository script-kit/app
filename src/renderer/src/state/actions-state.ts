// =================================================================================================
// State management for actions, flags, and the actions menu (Cmd+K/Ctrl+K).
// =================================================================================================

import { atom } from 'jotai';
import type { FlagsObject, Choice } from '@johnlindquist/kit/types/core';

// Stub implementations - these need to be properly extracted from jotai.ts
export const flagsAtom = atom<FlagsObject>({});
export const _flaggedValue = atom<Choice | string>('');

// Add other actions related atoms here