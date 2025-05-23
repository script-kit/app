/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
import log from 'electron-log';

import type { kenvEnv } from '@johnlindquist/kit/types/env';
import { subscribeKey } from 'valtio/utils';
import { clearIdleProcesses, ensureIdleProcess, processes } from './process';
import { createIdlePty } from './pty';
import { checkOpenAtLogin } from './settings';
import { updateMainShortcut } from './shortcuts';
import { kitState } from './state';
import { checkTray } from './tray';

let prevKenvEnv: kenvEnv = {};
subscribeKey(kitState, 'kenvEnv', (kenvEnv: kenvEnv) => {
  // log.info(`🔑 kenvEnv updated`, kenvEnv);
  // Compare prevKenvEnv to kenvEnv
  const keys = Object.keys(kenvEnv) as Array<keyof kenvEnv>;
  const prevKeys = Object.keys(prevKenvEnv) as Array<keyof kenvEnv>;

  const addedKeys = keys.filter((key) => !prevKeys.includes(key));
  const removedKeys = prevKeys.filter((key) => !keys.includes(key));
  const changedKeys = keys.filter((key) => prevKeys.includes(key) && prevKenvEnv[key] !== kenvEnv[key]);
  const updatedKeys = addedKeys.concat(removedKeys, changedKeys);
  prevKenvEnv = kenvEnv;
  if (updatedKeys.length > 0) {
    log.info('🔑 kenvEnv changes', {
      addedKeys,
      changedKeys,
      removedKeys,
    });
  } else {
    log.info('🔑 kenvEnv no changes');
    return;
  }
  if (Object.keys(kenvEnv).length === 0) {
    return;
  }
  if (processes.getAllProcessInfo().length === 0) {
    return;
  }
  clearIdleProcesses();
  ensureIdleProcess();
  createIdlePty();

  if (updatedKeys.includes('KIT_OPEN_AT_LOGIN')) {
    checkOpenAtLogin();
  }

  if (updatedKeys.includes('KIT_TRAY')) {
    checkTray();
  }

  if (updatedKeys.length > 0) {
    if (updatedKeys.includes('KIT_MAIN_SHORTCUT')) {
      log.info('🔑 kenvEnv.KIT_MAIN_SHORTCUT updated', kenvEnv.KIT_MAIN_SHORTCUT);
      updateMainShortcut(kenvEnv.KIT_MAIN_SHORTCUT);
    }
  }
});
