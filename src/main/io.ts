import { app, Notification } from 'electron';
import { Channel } from '@johnlindquist/kit/core/enum';
import { createLogger } from './log-utils';
const log = createLogger('io.ts');
import { chars } from './chars';
import { sendToAllActiveChildren } from './process';
import shims, { supportsDependency, target } from './shims';
import { getAccessibilityAuthorized, kitState, kitStore } from './state';
import { keymapLog } from './logs';

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

let UiohookToName: Record<number, string>;
export function createUiohookToName() {
  if (!supportsDependency('uiohook-napi')) {
    log.warn('uiohook-napi is not supported on this platform', {
      target,
    });
    return;
  }
  const { UiohookKey } = shims['uiohook-napi'];

  if (typeof UiohookKey?.Comma !== 'number') {
    log.error('UiohookKey.Comma is not a number');
    return;
  }

  UiohookToName = {};
  for (const [k, v] of Object.entries(UiohookKey)) {
    if (typeof v !== 'number' || typeof k !== 'string') {
      log.error('UiohookKey is not a number or string', { k, v });
      return;
    }
    UiohookToName[v] = k;
  }

  UiohookToName[UiohookKey.Comma] = ',';
  UiohookToName[UiohookKey.Period] = '.';
  UiohookToName[UiohookKey.Slash] = '/';
  UiohookToName[UiohookKey.Backslash] = '\\';
  UiohookToName[UiohookKey.Semicolon] = ';';
  UiohookToName[UiohookKey.Equal] = '=';
  UiohookToName[UiohookKey.Minus] = '-';
  UiohookToName[UiohookKey.Quote] = "'";

  keymapLog.info('UiohookToName', UiohookToName);
}

export const toKey = (keycode: number, shift = false) => {
  if (!UiohookToName) {
    createUiohookToName();
  }
  try {
    let key: string = UiohookToName[keycode] || '';

    // Apply keymap modifications
    if (kitState.keymap) {
      const char = chars[keycode];
      if (char && kitState.keymap[char].value) {
        // log.info(`Found keymap for ${char}: ${kitState.keymap[char]}`);
        key = kitState.keymap[char].value;
      }
    }

    if (shift) {
      return ShiftMap[key as KeyCodes] || key;
    }
    if (key) {
      return key.toLowerCase();
    }
    return '';
  } catch (error) {
    log.error(error);
    return '';
  }
};

export const registerIO = async (handler: (event: any) => void) => {
  const { UiohookKey, uIOhook } = shims['uiohook-napi'];

  const notAuthorized = await getAccessibilityAuthorized();
  if (!notAuthorized) {
    log.info('Requesting accessibility access...');

    return;
  }

  if (!supportsDependency('uiohook-napi')) {
    log.info('uiohook-napi is not supported on this platform', {
      target,
    });
    return;
  }

  log.info('Adding click listeners...');
  uIOhook?.on('click', (event) => {
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

  uIOhook?.on('mousedown', (event) => {
    try {
      sendToAllActiveChildren({
        channel: Channel.SYSTEM_MOUSEDOWN,
        state: event,
      });
    } catch (error) {
      log.error(error);
    }
  });

  uIOhook?.on('mouseup', (event) => {
    try {
      sendToAllActiveChildren({
        channel: Channel.SYSTEM_MOUSEUP,
        state: event,
      });
    } catch (error) {
      log.error(error);
    }
  });

  uIOhook?.on('mousemove', (event) => {
    try {
      sendToAllActiveChildren({
        channel: Channel.SYSTEM_MOUSEMOVE,
        state: event,
      });
    } catch (error) {
      log.error(error);
    }
  });

  uIOhook?.on('wheel', (event) => {
    try {
      sendToAllActiveChildren({
        channel: Channel.SYSTEM_WHEEL,
        state: event,
      });
    } catch (error) {
      log.error(error);
    }
  });

  log.info('Adding keydown listeners...');
  let key = '';
  uIOhook?.on('keydown', (event) => {
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
        log.info('✋ Escape pressed');
        kitState.escapePressed = true;
      }
    } catch (error) {
      log.error(error);
    }
  });

  uIOhook?.on('keyup', (event) => {
    (event as any).key = key;
    (event as any).text = kitState.snippet;
    sendToAllActiveChildren({
      channel: Channel.SYSTEM_KEYUP,
      state: event,
    });
    if (event.keycode === UiohookKey.Escape) {
      // log.info('✋ Escape released');
      kitState.escapePressed = false;
    }
  });

  if (kitState.kenvEnv?.KIT_UIOHOOK?.trim() === 'true') {
    kitStore.set('uIOhookEnabled', true);
  }

  if (kitState.kenvEnv?.KIT_UIOHOOK?.trim() === 'false') {
    kitStore.set('uIOhookEnabled', false);
  }

  const uIOhookEnabled = kitStore.get('uIOhookEnabled');
  log.info('The line right before uIOhook.start()...');
  if (!uIOhookEnabled) {
    log.warn('uIOhook is disabled by the user');
    return;
  }
  const timeout = setTimeout(() => {
    const retryCount = kitStore.get('retryCount') || 0;
    if (retryCount > 2) {
      log.error('uIOhook.start() failed after 3 attempts. Force quitting the app...');
      new Notification({
        title: 'uIOhook.start() failed after 3 attempts. Disabling uIOhook permanently...',
      }).show();
      kitStore.set('uIOhookEnabled', false);
      app.relaunch();
      app.exit(1);
      return;
    }
    kitStore.set('retryCount', retryCount + 1);
    new Notification(`uIOhook.start() timed out. Retrying... (Attempt ${retryCount + 2}/3)`).show();
    log.error('uIOhook.start() timed out. Force quitting the app...');
    log.info('Please try opening the app again.');
    app.relaunch();
    app.exit(1);
  }, 3000);

  uIOhook.start();
  clearTimeout(timeout);
  kitStore.set('retryCount', 0);
  log.info('The line right after uIOhook.start()...');
};
