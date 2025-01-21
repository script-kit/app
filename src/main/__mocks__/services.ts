import { vi } from 'vitest';

export const watchScriptChanged = vi.fn();
export const removeWatch = vi.fn();

export const backgroundScriptChanged = vi.fn();
export const removeBackground = vi.fn();

export const scheduleScriptChanged = vi.fn();
export const cancelSchedule = vi.fn();

export const shortcutScriptChanged = vi.fn();
export const unlinkShortcuts = vi.fn();

export const systemScriptChanged = vi.fn();
export const unlinkEvents = vi.fn();

export const addSnippet = vi.fn();
export const removeSnippet = vi.fn();
export const addTextSnippet = vi.fn();

export const scriptLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

export const watcherLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  verbose: vi.fn(),
};

export const runScript = vi.fn();
export const setupKit = vi.fn();

export const clearPromptCache = vi.fn();
export const clearPromptCacheFor = vi.fn();
export const setKitStateAtom = vi.fn();

export const setupTray = vi.fn();
export const updateTray = vi.fn();

export const setupMessages = vi.fn();
