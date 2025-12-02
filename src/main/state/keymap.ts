import type { kenvEnv } from '@johnlindquist/kit/types/env';
import type { IKeyboardMapping } from 'native-keymap';
import { subscribeKey } from 'valtio/utils';
import { createLogger } from '../log-utils';
import type { kitStateType } from '../state';

const keymapLog = createLogger('keymapLog');

export const defaultKeyMap: { [code: string]: string } = {
  KeyA: 'a',
  KeyB: 'b',
  KeyC: 'c',
  KeyD: 'd',
  KeyE: 'e',
  KeyF: 'f',
  KeyG: 'g',
  KeyH: 'h',
  KeyI: 'i',
  KeyJ: 'j',
  KeyK: 'k',
  KeyL: 'l',
  KeyM: 'm',
  KeyN: 'n',
  KeyO: 'o',
  KeyP: 'p',
  KeyQ: 'q',
  KeyR: 'r',
  KeyS: 's',
  KeyT: 't',
  KeyU: 'u',
  KeyV: 'v',
  KeyW: 'w',
  KeyX: 'x',
  KeyY: 'y',
  KeyZ: 'z',
  Digit0: '0',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
  Numpad0: '0',
  Numpad1: '1',
  Numpad2: '2',
  Numpad3: '3',
  Numpad4: '4',
  Numpad5: '5',
  Numpad6: '6',
  Numpad7: '7',
  Numpad8: '8',
  Numpad9: '9',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
  Space: ' ',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
};

// Reverse lookup: physical key "value" (e.g., 'q') -> code ('KeyQ')
export const reverseKeyValueToCode = new Map<string, string>();

export const rebuildReverseKeyMap = (keymap: IKeyboardMapping) => {
  reverseKeyValueToCode.clear();
  for (const [code, entry] of Object.entries(keymap || {})) {
    const v = (entry as any)?.value;
    if (typeof v === 'string' && v) {
      reverseKeyValueToCode.set(v.toLowerCase(), code);
    }
  }
  keymapLog.debug(`🔑 Rebuilt reverse keymap with ${reverseKeyValueToCode.size} entries`);
};

export const wireKeymapSubscriptions = (kitState: kitStateType) => {
  // Keep reverse map in sync as keymap updates
  const subKeymap = subscribeKey(kitState, 'keymap', () => {
    rebuildReverseKeyMap(kitState.keymap);
  });
  // ensure initial build
  rebuildReverseKeyMap(kitState.keymap);

  return subKeymap;
};

export const convertKeyInternal = (kitState: kitStateType, sourceKey: string): string => {
  const hasMap = reverseKeyValueToCode.size > 0;
  keymapLog.debug('🔑 Has reverse keymap:', { hasMap });
  if (kitState.kenvEnv?.KIT_CONVERT_KEY === 'false' || !hasMap) {
    keymapLog.debug(`🔑 Skipping key conversion: ${sourceKey}`);
    return sourceKey;
  }
  const code = reverseKeyValueToCode.get(sourceKey.toLowerCase());
  if (!code) {
    keymapLog.debug(`🔑 No conversion for key: ${sourceKey}`);
    return sourceKey;
  }
  const target = defaultKeyMap[code]?.toUpperCase();
  if (target) {
    keymapLog.debug(`🔑 Converted key: ${code} -> ${target}`);
    return target;
  }
  return sourceKey;
};

export const getEmojiShortcutInternal = (kitState: kitStateType) => {
  return kitState?.kenvEnv?.KIT_EMOJI_SHORTCUT || (kitState.isMac ? 'Command+Control+Space' : 'Super+.');
};
