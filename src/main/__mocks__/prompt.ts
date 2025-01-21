import { vi } from 'vitest';

export const subs = [];

export const clearPromptCache = vi.fn();
export const clearPromptCacheFor = vi.fn();
export const setKitStateAtom = vi.fn();

export const subIsSponsor = vi.fn();
export const subScriptPath = vi.fn();
export const subPromptData = vi.fn();
export const subTheme = vi.fn();
export const subNoPreview = vi.fn();
export const subFirstBatch = vi.fn();
