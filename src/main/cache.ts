import type { PromptData } from '@johnlindquist/kit/types/core';
import type { ScoredChoice } from '../shared/types';

export const preloadScoredChoicesMap = new Map<string, ScoredChoice[]>();
export const preloadPreviewMap = new Map<string, string>();
export const preloadPromptDataMap = new Map<string, PromptData>();
