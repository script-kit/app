import log from 'electron-log';
import { UiohookKey, uIOhook } from 'uiohook-napi';
import { Channel } from '@johnlindquist/kit/cjs/enum';
import { getAccessibilityAuthorized, kitState } from './state';
import { sendToAllActiveChildren } from './process';
import { chars } from './chars';

export const UiohookToName = Object.fromEntries(
  Object.entries(UiohookKey).map(([k, v]) => [v, k])
);

UiohookToName[UiohookKey.Comma] = ',';
UiohookToName[UiohookKey.Period] = '.';
UiohookToName[UiohookKey.Slash] = '/';
UiohookToName[UiohookKey.Backslash] = '\\';
UiohookToName[UiohookKey.Semicolon] = ';';
UiohookToName[UiohookKey.Equal] = '=';
UiohookToName[UiohookKey.Minus] = '-';
UiohookToName[UiohookKey.Quote] = "'";

export const ShiftMap = {
  '`': '~',
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
  '0': ')',
  '-': '_',
  '=': '+',
  '[': '{',
  ']': '}',
  '\\': '|',
  ';': ':',
  "'": '"',
  ',': '<',
  '.': '>',
  '/': '?',
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  e: 'E',
  f: 'F',
  g: 'G',
  h: 'H',
  i: 'I',
  j: 'J',
  k: 'K',
  l: 'L',
  m: 'M',
  n: 'N',
  o: 'O',
  p: 'P',
  q: 'Q',
  r: 'R',
  s: 'S',
  t: 'T',
  u: 'U',
  v: 'V',
  w: 'W',
  x: 'X',
  y: 'Y',
  z: 'Z',
};
type KeyCodes = keyof typeof ShiftMap;

export const toKey = (keycode: number, shift = false) => {
  try {
    let key: string = UiohookToName[keycode] || '';
    if (kitState.keymap) {
      const char = chars[keycode];
      if (char) {
        const keymapChar = kitState.keymap?.[char];
        if (keymapChar) {
          key = keymapChar?.value;
        }
      }
    }

    if (shift) {
      return ShiftMap[key as KeyCodes] || key;
    }
    return key.toLowerCase();
  } catch (error) {
    log.error(error);
    return '';
  }
};

export const registerIO = async (handler: (event: any) => void) => {
  const notAuthorized = await getAccessibilityAuthorized();
  if (!notAuthorized) {
    log.info(`Requesting accessibility access...`);

    return;
  }

  log.info(`Adding click listeners...`);
  uIOhook.on('click', (event) => {
    try {
      handler(event);
      sendToAllActiveChildren({
        channel: Channel.SYSTEM_CLICK,
        state: event,
      });
    } catch (error) {
      log.error(error);
    }
  });

  uIOhook.on('mousedown', (event) => {
    try {
      sendToAllActiveChildren({
        channel: Channel.SYSTEM_MOUSEDOWN,
        state: event,
      });
    } catch (error) {
      log.error(error);
    }
  });

  uIOhook.on('mouseup', (event) => {
    try {
      sendToAllActiveChildren({
        channel: Channel.SYSTEM_MOUSEUP,
        state: event,
      });
    } catch (error) {
      log.error(error);
    }
  });

  uIOhook.on('mousemove', (event) => {
    try {
      sendToAllActiveChildren({
        channel: Channel.SYSTEM_MOUSEMOVE,
        state: event,
      });
    } catch (error) {
      log.error(error);
    }
  });

  uIOhook.on('wheel', (event) => {
    try {
      sendToAllActiveChildren({
        channel: Channel.SYSTEM_WHEEL,
        state: event,
      });
    } catch (error) {
      log.error(error);
    }
  });

  log.info(`Adding keydown listeners...`);
  let key = '';
  uIOhook.on('keydown', (event) => {
    try {
      key = toKey(event.keycode, event.shiftKey);
      (event as any).key = key;
      (event as any).text = kitState.snippet;
      handler(event);

      sendToAllActiveChildren({
        channel: Channel.SYSTEM_KEYDOWN,
        state: event,
      });

      if (event.keycode === UiohookKey.Escape) {
        log.info(`✋ Escape pressed`);
        kitState.escapePressed = true;
      }
    } catch (error) {
      log.error(error);
    }
  });

  uIOhook.on('keyup', (event) => {
    (event as any).key = key;
    (event as any).text = kitState.snippet;
    sendToAllActiveChildren({
      channel: Channel.SYSTEM_KEYUP,
      state: event,
    });
    if (event.keycode === UiohookKey.Escape) {
      log.info(`✋ Escape released`);
      kitState.escapePressed = false;
    }
  });

  // TODO: Is there a way to detect that this has hung and restart the app if so?
  log.info(`The line right before uIOhook.start()...`);
  uIOhook.start();
  log.info(`The line right after uIOhook.start()...`);
};
