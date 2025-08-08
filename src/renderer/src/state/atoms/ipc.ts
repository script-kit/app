/**
 * IPC and channel communication atoms.
 * Handles inter-process communication with the main process.
 */

import { atom } from 'jotai';
import { Channel } from '@johnlindquist/kit/core/enum';
import { AppChannel } from '../../../shared/enums';
import type { AppState, AppMessage, Survey } from '@johnlindquist/kit/types/core';
import type { ResizeData } from '../../../shared/types';
import { createLogger } from '../../log-utils';

const { ipcRenderer } = window.electron;
const log = createLogger('ipc.ts');

// --- Channel State ---
export const pauseChannelAtom = atom(false);

// --- Submission State ---
export const _submitValue = atom('');
export const submitValueAtom = atom((g) => g(_submitValue));
export const disableSubmitAtom = atom(false);

// --- Shortcodes ---
type OnInputSubmit = { [key: string]: any };
export const onInputSubmitAtom = atom<OnInputSubmit>({});
type OnShortcut = { [key: string]: any };
export const onShortcutAtom = atom<OnShortcut>({});
export const shortcodesAtom = atom<string[]>([]);

// --- IPC Actions ---
export const runMainScriptAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
});

export const runKenvTrustScriptAtom = atom(() => (kenv: string) => {
  log.info(`🔑 Running kenv-trust script for ${kenv}`);
  ipcRenderer.send(AppChannel.RUN_KENV_TRUST_SCRIPT, { kenv });
});

export const runProcessesAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.RUN_PROCESSES_SCRIPT);
});

export const applyUpdateAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.APPLY_UPDATE);
});

export const loginAtom = atom((_g) => {
  return () => {
    ipcRenderer.send(AppChannel.LOGIN);
  };
});

export const submitSurveyAtom = atom(null, (_g, _s, a: Survey) => {
  ipcRenderer.send(AppChannel.FEEDBACK, a);
});

export const logAtom = atom((_g) => {
  type levelType = 'debug' | 'info' | 'warn' | 'error' | 'silly';
  return (message: any, level: levelType = 'info') => {
    ipcRenderer.send(AppChannel.LOG, { message, level });
  };
});