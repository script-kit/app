/**
 * Unified Shortcut Utilities
 *
 * This module provides consistent shortcut normalization and conversion
 * across main process (Electron) and renderer (react-hotkeys-hook).
 *
 * Flow:
 * 1. User writes: "cmd k" or "ctrl+k" in script metadata
 * 2. SDK's shortcutNormalizer -> "Command+K" (Electron format)
 * 3. Main process uses Electron format directly
 * 4. Renderer converts to "mod+k" (react-hotkeys format)
 */

/**
 * Reserved system shortcuts that scripts should NOT be allowed to override globally.
 * These are critical OS-level shortcuts that could break user workflows.
 */
export const RESERVED_SYSTEM_SHORTCUTS = new Set([
  // Clipboard operations
  'CommandOrControl+C',
  'CommandOrControl+V',
  'CommandOrControl+X',
  'Command+C',
  'Command+V',
  'Command+X',
  'Control+C',
  'Control+V',
  'Control+X',

  // Undo/Redo
  'CommandOrControl+Z',
  'CommandOrControl+Shift+Z',
  'CommandOrControl+Y',
  'Command+Z',
  'Command+Shift+Z',
  'Control+Z',
  'Control+Y',

  // Select All
  'CommandOrControl+A',
  'Command+A',
  'Control+A',

  // Quit (macOS)
  'Command+Q',

  // Force Quit (macOS)
  'Command+Option+Escape',

  // Task Manager / Force Quit (Windows/Linux)
  'Control+Alt+Delete',
  'Control+Shift+Escape',

  // Screen Lock
  'Command+Control+Q', // macOS
  'Super+L', // Windows/Linux
]);

/**
 * Characters that need special handling in react-hotkeys-hook
 */
export const KEY_REPLACEMENT_MAP: Record<string, string> = {
  '.': 'period',
  '/': 'slash',
  ',': 'comma',
  ';': 'semicolon',
  "'": 'quote',
  '[': 'bracketleft',
  ']': 'bracketright',
  '\\': 'backslash',
  '`': 'backquote',
  '-': 'minus',
  '=': 'equal',
  // Arrow keys: event.key returns 'ArrowLeft' etc, but shortcuts use 'left' etc
  'arrowleft': 'left',
  'arrowright': 'right',
  'arrowup': 'up',
  'arrowdown': 'down',
};

/**
 * Reverse map for converting keywords back to characters
 */
export const KEYWORD_TO_CHAR_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(KEY_REPLACEMENT_MAP).map(([char, keyword]) => [keyword, char]),
);

/**
 * Parsed shortcut representation for consistent handling
 */
export interface ParsedShortcut {
  /** Original raw string */
  raw: string;
  /** Array of modifiers in lowercase: ['cmd', 'shift'] */
  modifiers: string[];
  /** The main key in lowercase */
  key: string;
  /** Whether it has Command/Meta modifier */
  hasCmd: boolean;
  /** Whether it has Control modifier */
  hasCtrl: boolean;
  /** Whether it has Shift modifier */
  hasShift: boolean;
  /** Whether it has Alt/Option modifier */
  hasAlt: boolean;
}

/**
 * Parse a shortcut string into a structured representation.
 * Handles various formats: "cmd+k", "Command+K", "ctrl shift k", etc.
 */
export function parseShortcut(shortcut: string): ParsedShortcut {
  if (!shortcut) {
    return {
      raw: '',
      modifiers: [],
      key: '',
      hasCmd: false,
      hasCtrl: false,
      hasShift: false,
      hasAlt: false,
    };
  }

  const raw = shortcut.trim();
  // Split on + or space, filter empty
  const parts = raw
    .split(/[+\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const modifiers: string[] = [];
  let key = '';
  let hasCmd = false;
  let hasCtrl = false;
  let hasShift = false;
  let hasAlt = false;

  for (const part of parts) {
    // Check for modifiers
    if (['cmd', 'command', 'meta', 'super', 'win'].includes(part)) {
      modifiers.push('cmd');
      hasCmd = true;
    } else if (['ctrl', 'control', 'ctl', 'cntrl'].includes(part)) {
      modifiers.push('ctrl');
      hasCtrl = true;
    } else if (['shift', 'shft'].includes(part)) {
      modifiers.push('shift');
      hasShift = true;
    } else if (['alt', 'option', 'opt'].includes(part)) {
      modifiers.push('alt');
      hasAlt = true;
    } else if (['cmdorctrl', 'commandorcontrol'].includes(part)) {
      modifiers.push('mod');
      hasCmd = true; // Will be treated as cmd on mac, ctrl on others
      hasCtrl = true;
    } else if (['mod'].includes(part)) {
      modifiers.push('mod');
      hasCmd = true;
      hasCtrl = true;
    } else {
      // Last non-modifier part is the key
      key = part;
    }
  }

  return {
    raw,
    modifiers: [...new Set(modifiers)], // dedupe
    key,
    hasCmd,
    hasCtrl,
    hasShift,
    hasAlt,
  };
}

/**
 * Convert a shortcut to react-hotkeys-hook format.
 * Input: "Command+K" or "cmd+k" or "ctrl shift k"
 * Output: "mod+k"
 */
export function toHotkeysFormat(shortcut: string): string {
  const parsed = parseShortcut(shortcut);
  if (!parsed.key) return '';

  const parts: string[] = [];

  // Use 'mod' for cmd/ctrl (cross-platform)
  if (parsed.modifiers.includes('mod') || parsed.hasCmd || parsed.hasCtrl) {
    parts.push('mod');
  }
  if (parsed.hasShift) {
    parts.push('shift');
  }
  if (parsed.hasAlt) {
    parts.push('alt');
  }

  // Convert special characters to keywords
  const keyPart = KEY_REPLACEMENT_MAP[parsed.key] || parsed.key;
  parts.push(keyPart);

  return parts.join('+');
}

/**
 * Convert a shortcut to Electron globalShortcut format.
 * Input: "cmd+k" or "ctrl shift k"
 * Output: "Command+K" (macOS) or "Control+K" (Windows/Linux)
 */
export function toElectronFormat(shortcut: string, isMac: boolean): string {
  const parsed = parseShortcut(shortcut);
  if (!parsed.key) return '';

  const parts: string[] = [];

  // Handle modifiers in Electron's expected order
  if (parsed.modifiers.includes('mod')) {
    parts.push(isMac ? 'Command' : 'Control');
  } else {
    if (parsed.hasCmd) {
      parts.push(isMac ? 'Command' : 'Control');
    }
    if (parsed.hasCtrl && !parsed.hasCmd) {
      parts.push('Control');
    }
  }
  if (parsed.hasAlt) {
    parts.push(isMac ? 'Option' : 'Alt');
  }
  if (parsed.hasShift) {
    parts.push('Shift');
  }

  // Capitalize the key
  const key = parsed.key.length === 1 ? parsed.key.toUpperCase() : capitalizeFirst(parsed.key);
  parts.push(key);

  return parts.join('+');
}

/**
 * Check if a shortcut is reserved and should not be overridden by scripts.
 */
export function isReservedShortcut(shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed.key) return false;

  // Check against reserved set in both mac and windows formats
  const macFormat = toElectronFormat(shortcut, true);
  const winFormat = toElectronFormat(shortcut, false);
  const cmdOrCtrlFormat = shortcut.replace(/Command|Cmd|Control|Ctrl/gi, 'CommandOrControl');

  return (
    RESERVED_SYSTEM_SHORTCUTS.has(macFormat) ||
    RESERVED_SYSTEM_SHORTCUTS.has(winFormat) ||
    RESERVED_SYSTEM_SHORTCUTS.has(cmdOrCtrlFormat)
  );
}

/**
 * Normalize a keyboard event to a hotkeys-format string for matching.
 */
export function normalizeEventToHotkeysKey(event: KeyboardEvent): string {
  const parts: string[] = [];

  // Use 'mod' for meta on mac or ctrl on others
  if (event.metaKey || event.ctrlKey) {
    parts.push('mod');
  }
  if (event.shiftKey) {
    parts.push('shift');
  }
  if (event.altKey) {
    parts.push('alt');
  }

  const rawKey = (event.key || '').toLowerCase();
  // Convert punctuation characters to react-hotkeys keywords
  const keyPart = KEY_REPLACEMENT_MAP[rawKey] || rawKey;
  parts.push(keyPart);

  return parts.join('+');
}

/**
 * Get the display-friendly version of a shortcut.
 * Input: "Command+Shift+K"
 * Output: "⌘⇧K" (macOS) or "Ctrl+Shift+K" (Windows)
 */
export function toDisplayFormat(shortcut: string, isMac: boolean): string {
  const parsed = parseShortcut(shortcut);
  if (!parsed.key) return '';

  if (isMac) {
    const symbols: string[] = [];
    if (parsed.hasCmd || parsed.modifiers.includes('mod')) symbols.push('⌘');
    if (parsed.hasCtrl && !parsed.hasCmd) symbols.push('⌃');
    if (parsed.hasAlt) symbols.push('⌥');
    if (parsed.hasShift) symbols.push('⇧');
    symbols.push(parsed.key.toUpperCase());
    return symbols.join('');
  }

  // Windows/Linux format
  const parts: string[] = [];
  if (parsed.hasCtrl || parsed.hasCmd || parsed.modifiers.includes('mod')) parts.push('Ctrl');
  if (parsed.hasAlt) parts.push('Alt');
  if (parsed.hasShift) parts.push('Shift');
  parts.push(parsed.key.toUpperCase());
  return parts.join('+');
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
