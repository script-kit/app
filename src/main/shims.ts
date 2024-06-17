import log from 'electron-log';

import { importMacFrontmostOrShim } from '../shims/macos/mac-frontmost';
import { importMacPanelWindowOrShim } from '../shims/macos/mpw';
import { importNodeMacPermissionsOrShim } from '../shims/macos/nmp';
import { kitState } from './state';
import { importMacClipboardListenerOrShim } from '../shims/macos/mac-clipboard-listener';

type Shims = {
  makeKeyWindow: typeof import('@johnlindquist/mac-panel-window').makeKeyWindow;
  makeWindow: typeof import('@johnlindquist/mac-panel-window').makeWindow;
  makePanel: typeof import('@johnlindquist/mac-panel-window').makePanel;
  hideInstant: typeof import('@johnlindquist/mac-panel-window').hideInstant;

  getAuthStatus: typeof import('node-mac-permissions').getAuthStatus;
  askForAccessibilityAccess: typeof import('node-mac-permissions').askForAccessibilityAccess;

  getFrontmostApp: typeof import('@johnlindquist/mac-frontmost').getFrontmostApp;

  startMacClipboardListener: typeof import('@johnlindquist/mac-clipboard-listener').start;
  onClipboardImageChange: typeof import('@johnlindquist/mac-clipboard-listener').onClipboardImageChange;
  onClipboardTextChange: typeof import('@johnlindquist/mac-clipboard-listener').onClipboardTextChange;
};

const notImplemented = (name: string) => () => {
  throw new Error(`${name} not implemented`);
};

const shims: Shims = {
  makeKeyWindow: notImplemented('makeKeyWindow'),
  makeWindow: notImplemented('makeWindow'),
  makePanel: notImplemented('makePanel'),
  hideInstant: notImplemented('hideInstant'),
  getAuthStatus: notImplemented('getAuthStatus'),
  askForAccessibilityAccess: notImplemented('askForAccessibilityAccess'),
  getFrontmostApp: notImplemented('getFrontmostApp'),
  startMacClipboardListener: notImplemented('startMacClipboardListener'),
  onClipboardImageChange: notImplemented('onClipboardImageChange'),
  onClipboardTextChange: notImplemented('onClipboardTextChange'),
};

export async function loadShims() {
  // Load Mac Shims
  if (kitState.isMac) {
    const { makeKeyWindow, makeWindow, makePanel, hideInstant } =
      await importMacPanelWindowOrShim();
    log.info('Loaded mac-panel-window shim');

    shims.makeKeyWindow = makeKeyWindow;
    shims.makeWindow = makeWindow;
    shims.makePanel = makePanel;
    shims.hideInstant = hideInstant;

    const { getAuthStatus } = await importNodeMacPermissionsOrShim();
    log.info('Loaded node-mac-permissions shim');

    shims.getAuthStatus = getAuthStatus;

    const { getFrontmostApp } = await importMacFrontmostOrShim();
    log.info('Loaded mac-frontmost shim');

    shims.getFrontmostApp = getFrontmostApp;

    const { start, onClipboardImageChange, onClipboardTextChange } =
      await importMacClipboardListenerOrShim();
    log.info('Loaded mac-clipboard-listener shim');

    shims.startMacClipboardListener = start;
    shims.onClipboardImageChange = onClipboardImageChange;
    shims.onClipboardTextChange = onClipboardTextChange;
  }
}

export default shims;
