export const KNOWN_KEYBOARD_LAYOUTS = {
  UNKNOWN: 'UNKNOWN',
  QWERTY: 'QWERTY',
  AZERTY: 'AZERTY',
  QZERTY: 'QZERTY',
  DVORAK: 'DVORAK',
  COLEMAK: 'COLEMAK',
  QWERTZ: 'QWERTZ',
  PORTUGUESE_PT: 'PORTUGUESE_PT',
};

export const QWERTY = {
  KeyE: 'e',
  KeyD: 'd',
  KeyU: 'u',
  Minus: '-',
  KeyH: 'h',
  KeyZ: 'z',
  Equal: '=',
  KeyP: 'p',
  Semicolon: ';',
  BracketRight: ']',
  Slash: '/',
  BracketLeft: '[',
  KeyL: 'l',
  Digit8: '8',
  KeyW: 'w',
  KeyS: 's',
  Digit5: '5',
  Digit9: '9',
  KeyO: 'o',
  Period: '.',
  Digit6: '6',
  KeyV: 'v',
  Digit3: '3',
  Backquote: '`',
  KeyG: 'g',
  KeyJ: 'j',
  KeyQ: 'q',
  Digit1: '1',
  KeyT: 't',
  KeyY: 'y',
  Quote: "'",
  IntlBackslash: '§',
  Backslash: '\\',
  KeyK: 'k',
  KeyF: 'f',
  KeyI: 'i',
  KeyR: 'r',
  KeyX: 'x',
  KeyA: 'a',
  Digit2: '2',
  Digit7: '7',
  KeyM: 'm',
  Digit4: '4',
  Digit0: '0',
  KeyN: 'n',
  KeyB: 'b',
  KeyC: 'c',
  Comma: ',',
};

export const detectKeyboardLayout = (layoutMap: Record<string, string>): keyof typeof KNOWN_KEYBOARD_LAYOUTS => {
  if (layoutMap.KeyA === 'q' && layoutMap.KeyZ === 'w' && layoutMap.KeyE === 'e') {
    return 'AZERTY';
  }

  if (layoutMap.KeyQ === 'q' && layoutMap.KeyW === 'w' && layoutMap.KeyY === 'z') {
    return 'QWERTZ';
  }

  if (layoutMap.KeyQ === "'" && layoutMap.KeyW === ',' && layoutMap.KeyE === '.') {
    return 'DVORAK';
  }

  if (layoutMap.KeyQ === 'q' && layoutMap.KeyW === 'w' && layoutMap.KeyF === 'e') {
    return 'COLEMAK';
  }

  // Check for Portuguese (Portugal) layout
  if (
    layoutMap.KeyQ === 'q' &&
    layoutMap.KeyW === 'w' &&
    layoutMap.KeyE === 'e' &&
    layoutMap.Semicolon === 'ç' &&
    layoutMap.BracketLeft === '+' &&
    layoutMap.Quote === 'º'
  ) {
    return 'PORTUGUESE_PT';
  }

  for (const [code, key] of Object.entries(layoutMap)) {
    if (QWERTY[code] !== key) {
      return 'UNKNOWN';
    }
  }

  return 'QWERTY';
};
