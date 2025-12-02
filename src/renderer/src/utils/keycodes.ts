import log from 'electron-log';
import { KeyCode, KeyMod } from 'monaco-editor';

export function getMonacoKeyMod(key: string, isWindows: boolean): number {
  const keyModMap: { [key: string]: number } = {
    ctrl: isWindows ? KeyMod.WinCtrl : KeyMod.CtrlCmd,
    shift: KeyMod.Shift,
    alt: KeyMod.Alt,
    cmd: KeyMod.CtrlCmd,
    mod: KeyMod.CtrlCmd, // 'mod' is cross-platform: Cmd on Mac, Ctrl on Windows/Linux
  };
  const result = keyModMap[key.toLowerCase()];
  console.log('[getMonacoKeyMod] Mapping modifier:', key, '-> Monaco value:', result, 'isWindows:', isWindows);
  return result;
}

const keyCodeMap: { [key: string]: KeyCode } = {
  dependsonkblayout: KeyCode.DependsOnKbLayout,
  unknown: KeyCode.Unknown,
  backspace: KeyCode.Backspace,
  tab: KeyCode.Tab,
  enter: KeyCode.Enter,
  shift: KeyCode.Shift,
  ctrl: KeyCode.Ctrl,
  alt: KeyCode.Alt,
  pausebreak: KeyCode.PauseBreak,
  capslock: KeyCode.CapsLock,
  escape: KeyCode.Escape,
  space: KeyCode.Space,
  pageup: KeyCode.PageUp,
  pagedown: KeyCode.PageDown,
  end: KeyCode.End,
  home: KeyCode.Home,
  leftarrow: KeyCode.LeftArrow,
  uparrow: KeyCode.UpArrow,
  rightarrow: KeyCode.RightArrow,
  downarrow: KeyCode.DownArrow,
  insert: KeyCode.Insert,
  delete: KeyCode.Delete,
  '0': KeyCode.Digit0,
  '1': KeyCode.Digit1,
  '2': KeyCode.Digit2,
  '3': KeyCode.Digit3,
  '4': KeyCode.Digit4,
  '5': KeyCode.Digit5,
  '6': KeyCode.Digit6,
  '7': KeyCode.Digit7,
  '8': KeyCode.Digit8,
  '9': KeyCode.Digit9,
  a: KeyCode.KeyA,
  b: KeyCode.KeyB,
  c: KeyCode.KeyC,
  d: KeyCode.KeyD,
  e: KeyCode.KeyE,
  f: KeyCode.KeyF,
  g: KeyCode.KeyG,
  h: KeyCode.KeyH,
  i: KeyCode.KeyI,
  j: KeyCode.KeyJ,
  k: KeyCode.KeyK,
  l: KeyCode.KeyL,
  m: KeyCode.KeyM,
  n: KeyCode.KeyN,
  o: KeyCode.KeyO,
  p: KeyCode.KeyP,
  q: KeyCode.KeyQ,
  r: KeyCode.KeyR,
  s: KeyCode.KeyS,
  t: KeyCode.KeyT,
  u: KeyCode.KeyU,
  v: KeyCode.KeyV,
  w: KeyCode.KeyW,
  x: KeyCode.KeyX,
  y: KeyCode.KeyY,
  z: KeyCode.KeyZ,
  meta: KeyCode.Meta,
  contextmenu: KeyCode.ContextMenu,
  f1: KeyCode.F1,
  f2: KeyCode.F2,
  f3: KeyCode.F3,
  f4: KeyCode.F4,
  f5: KeyCode.F5,
  f6: KeyCode.F6,
  f7: KeyCode.F7,
  f8: KeyCode.F8,
  f9: KeyCode.F9,
  f10: KeyCode.F10,
  f11: KeyCode.F11,
  f12: KeyCode.F12,
  f13: KeyCode.F13,
  f14: KeyCode.F14,
  f15: KeyCode.F15,
  f16: KeyCode.F16,
  f17: KeyCode.F17,
  f18: KeyCode.F18,
  f19: KeyCode.F19,
  f20: KeyCode.F20,
  f21: KeyCode.F21,
  f22: KeyCode.F22,
  f23: KeyCode.F23,
  f24: KeyCode.F24,
  numlock: KeyCode.NumLock,
  scrolllock: KeyCode.ScrollLock,
  ';': KeyCode.Semicolon,
  '=': KeyCode.Equal,
  ',': KeyCode.Comma,
  '-': KeyCode.Minus,
  '.': KeyCode.Period,
  '/': KeyCode.Slash,
  '`': KeyCode.Backquote,
  '[': KeyCode.BracketLeft,
  '\\': KeyCode.Backslash,
  ']': KeyCode.BracketRight,
  "'": KeyCode.Quote,
  oem_8: KeyCode.OEM_8,
  intlbackslash: KeyCode.IntlBackslash,
  numpad0: KeyCode.Numpad0,
  numpad1: KeyCode.Numpad1,
  numpad2: KeyCode.Numpad2,
  numpad3: KeyCode.Numpad3,
  numpad4: KeyCode.Numpad4,
  numpad5: KeyCode.Numpad5,
  numpad6: KeyCode.Numpad6,
  numpad7: KeyCode.Numpad7,
  numpad8: KeyCode.Numpad8,
  numpad9: KeyCode.Numpad9,
  numpadmultiply: KeyCode.NumpadMultiply,
  numpadadd: KeyCode.NumpadAdd,
  numpadseparator: KeyCode.NUMPAD_SEPARATOR,
  numpadsubtract: KeyCode.NumpadSubtract,
  numpaddecimal: KeyCode.NumpadDecimal,
  numpaddivide: KeyCode.NumpadDivide,
  abnt_c1: KeyCode.ABNT_C1,
  abnt_c2: KeyCode.ABNT_C2,
  audiovolumemute: KeyCode.AudioVolumeMute,
  audiovolumeup: KeyCode.AudioVolumeUp,
  audiovolumedown: KeyCode.AudioVolumeDown,
  browsersearch: KeyCode.BrowserSearch,
  browserhome: KeyCode.BrowserHome,
  browserback: KeyCode.BrowserBack,
  browserforward: KeyCode.BrowserForward,
  mediatracknext: KeyCode.MediaTrackNext,
  mediatrackprevious: KeyCode.MediaTrackPrevious,
  mediastop: KeyCode.MediaStop,
  mediaplaypause: KeyCode.MediaPlayPause,
  launchmediaplayer: KeyCode.LaunchMediaPlayer,
  launchmail: KeyCode.LaunchMail,
  launchapp2: KeyCode.LaunchApp2,
  clear: KeyCode.Clear,
};
export function getMonacoKeyCode(key: string): KeyCode | undefined {
  const result = keyCodeMap[key.toLowerCase()];
  console.log(
    '[getMonacoKeyCode] Mapping key:',
    key,
    '-> KeyCode:',
    result,
    result === undefined ? '(undefined)' : `(${result} = ${result === 0 ? 'Unknown' : 'Valid'})`,
  );
  return result;
}

// Input: cmd+a
// Logic: split on "+"
// Output: KeyCode.CtrlCmd | KeyCode.KeyA
/*
Need to support this:

      mountEditor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
        () => {
          const value = mountEditor.getModel()?.getValue();
          setFlaggedChoiceValue(value || ui);
        },
      );
*/
export function convertStringShortcutToMoncacoNumber(shortcut: string, isWindows: boolean): number {
  console.log('[convertStringShortcutToMoncacoNumber] Input shortcut:', shortcut, 'isWindows:', isWindows);

  if (!shortcut) {
    console.log('[convertStringShortcutToMoncacoNumber] No shortcut provided');
    return 0;
  }
  const shortcutParts = shortcut.split('+');
  console.log('[convertStringShortcutToMoncacoNumber] Shortcut parts:', shortcutParts);

  // Get the key as the last part
  const key = shortcutParts.pop() as string;
  if (!key) {
    console.log('[convertStringShortcutToMoncacoNumber] No key found');
    return 0;
  }

  let result = getMonacoKeyCode(key);
  console.log('[convertStringShortcutToMoncacoNumber] Key:', key, '-> KeyCode:', result);

  if (!result) {
    console.log('[convertStringShortcutToMoncacoNumber] Invalid key:', key);
    return 0;
  }

  let hasModifier = false;
  for (const part of shortcutParts) {
    const code = getMonacoKeyMod(part, isWindows);
    if (code) {
      hasModifier = true;
      console.log('[convertStringShortcutToMoncacoNumber] Modifier:', part, '-> Code:', code);
      result |= code;
    }
  }

  if (!hasModifier) {
    console.log('[convertStringShortcutToMoncacoNumber] No modifier found for:', shortcut);
    return 0;
  }

  console.log(
    '[convertStringShortcutToMoncacoNumber] Final result:',
    result,
    'Binary:',
    result.toString(2),
    'Hex:',
    '0x' + result.toString(16),
  );
  return result;
}

/**
 * Normalizes a shortcut string to extract its components
 */
export function normalizeShortcut(shortcut: string): {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
  raw: string;
} {
  const raw = shortcut.trim().toLowerCase().replace(/\s+/g, '');
  const parts = raw.split('+').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const key = last.startsWith('key') ? last.slice(3) : last; // e.g., KeyV -> v
  const mod = parts.some(
    (p) => p === 'mod' || p === 'cmd' || p === 'cmdorctrl' || p === 'ctrl' || p === 'control' || p === 'meta',
  );
  const shift = parts.includes('shift');
  const alt = parts.includes('alt') || parts.includes('option');
  return { key, mod, shift, alt, raw };
}

// Reserved shortcuts that must never be overridden in Monaco Editor
const RESERVED_KEYS = new Set(['v', 'c', 'x', 'a', 'z', 'y']); // paste, copy, cut, select all, undo, redo
const RESERVED_FIND = new Set(['f', 'g']); // find, find next

/**
 * Returns true if this shortcut should never be bound inside Monaco's editor.
 * These are system/editor shortcuts that must remain functional.
 */
export function isReservedEditorShortcut(shortcut: string, includeFind = false): boolean {
  const s = normalizeShortcut(shortcut);
  if (!s.mod) return false; // we only care about mod+* shortcuts

  // Check basic clipboard/edit operations
  if (RESERVED_KEYS.has(s.key)) {
    console.log(`[isReservedEditorShortcut] Blocking reserved key: ${shortcut} (${s.key} is clipboard/edit operation)`);
    return true;
  }

  // Check find operations if requested
  if (includeFind && RESERVED_FIND.has(s.key)) {
    console.log(`[isReservedEditorShortcut] Blocking reserved key: ${shortcut} (${s.key} is find operation)`);
    return true;
  }

  // Also check for shift+insert (paste) and shift+delete (cut) on some systems
  if (s.shift && (s.key === 'insert' || s.key === 'delete')) {
    console.log(`[isReservedEditorShortcut] Blocking reserved key: ${shortcut} (shift+${s.key})`);
    return true;
  }

  return false;
}

/**
 * Safe converter that returns undefined for invalid keybindings.
 * This prevents registering modifier-only bindings that would catch all Cmd/Ctrl combos.
 */
export function toMonacoKeybindingOrUndefined(shortcut: string, isWindows: boolean): number | undefined {
  console.log('[toMonacoKeybindingOrUndefined] Input:', { shortcut, isWindows });

  const kb = convertStringShortcutToMoncacoNumber(shortcut, isWindows);
  console.log('[toMonacoKeybindingOrUndefined] Converted value:', {
    kb,
    binary: kb ? kb.toString(2) : 'null',
    hex: kb ? '0x' + kb.toString(16) : 'null',
  });

  if (!kb) {
    console.log('[toMonacoKeybindingOrUndefined] Returning undefined - no keybinding');
    return undefined;
  }

  // Monaco packs the keyCode in the low 8 bits
  const KEY_CODE_MASK = 0xff;
  const keyCode = kb & KEY_CODE_MASK;

  console.log('[toMonacoKeybindingOrUndefined] Key code check:', {
    keyCode,
    keyCodeHex: '0x' + keyCode.toString(16),
    isZero: keyCode === 0,
  });

  // 0 === KeyCode.Unknown. Never register modifier-only bindings.
  if (keyCode === 0) {
    console.warn(`[toMonacoKeybindingOrUndefined] REFUSING modifier-only binding for: ${shortcut}`);
    return undefined;
  }

  console.log('[toMonacoKeybindingOrUndefined] Returning valid keybinding:', kb);
  return kb;
}
