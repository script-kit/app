import { vi } from 'vitest';

export const subs = [];

export const shortcutScriptChanged = vi.fn();
export const unlinkShortcuts = vi.fn();

export const subShortcutsPaused = vi.fn();
export const shortcutMap = new Map();
