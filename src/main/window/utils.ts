import type { BrowserWindow } from 'electron';
import { createLogger } from '.././log-utils';

const log = createLogger('utils.ts');

export const prepForClose = (window: BrowserWindow) => {
  // No-op: mac-panel-window functionality removed
  if (!window.isDestroyed()) {
    log.info(`${window.id}: 📌 Prepping for close (no-op)`);
  }
};

export const makeWindow = (window: BrowserWindow) => {
  // No-op: mac-panel-window functionality removed
  if (!window.isDestroyed()) {
    log.info(`${window.id}: 📌 Making window (no-op)`);
  }
};

export const makeKeyPanel = (window: BrowserWindow) => {
  // No-op: mac-panel-window functionality removed
  if (!window.isDestroyed()) {
    log.info(`${window.id}: 📌 Making key panel (no-op)`);
  }
};

export const setAppearance = (window: BrowserWindow, appearance: 'light' | 'dark' | 'auto') => {
  // No-op: mac-panel-window functionality removed
  if (!window.isDestroyed()) {
    log.info(`${window.id}: 📌 Setting appearance to ${appearance} (no-op)`);
  }
};

export const prepQuitWindow = async () => {
  // No-op: mac-panel-window functionality removed
  log.info('👋 Prep quit window (no-op)');
};
