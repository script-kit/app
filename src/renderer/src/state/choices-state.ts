// =================================================================================================
// Management of choices, filtering, indexing, and selection.
// =================================================================================================

import { atom } from 'jotai';
import type { ScoredChoice } from '../../../shared/types';

// Stub implementations - these need to be properly extracted from jotai.ts
export const scoredChoicesAtom = atom<ScoredChoice[]>([]);

// Add other choices related atoms here