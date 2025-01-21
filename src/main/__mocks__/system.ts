import { vi } from 'vitest';

// Version
export const getVersion = vi.fn(() => '1.0.0');

// Process
export const processes = {
  startHeartbeat: vi.fn(),
  stopHeartbeat: vi.fn(),
};

export const clearIdleProcesses = vi.fn();
export const ensureIdleProcess = vi.fn();
export const sendToAllActiveChildren = vi.fn();
export const spawnShebang = vi.fn();
export const updateTheme = vi.fn();

// Logs
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

// Shortcuts
export const shortcutScriptChanged = vi.fn();
export const unlinkShortcuts = vi.fn();

// System Events
export const systemScriptChanged = vi.fn();
export const unlinkEvents = vi.fn();

// Background
export const backgroundScriptChanged = vi.fn();
export const removeBackground = vi.fn();

// Schedule
export const scheduleScriptChanged = vi.fn();
export const cancelSchedule = vi.fn();

// Watch
export const watchScriptChanged = vi.fn();
export const removeWatch = vi.fn();

// Tick
export const addSnippet = vi.fn();
export const removeSnippet = vi.fn();
export const addTextSnippet = vi.fn();
