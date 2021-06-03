/* eslint-disable import/prefer-default-export */
import { EventEmitter } from 'events';

export enum AppEvent {
  PAUSE_SHORTCUTS = 'PAUSE_SHORTCUTS',
  RESUME_SHORTCUTS = 'RESUME_SHORTCUTS',
  TRY_KIT_SCRIPT = 'TRY_KIT_SCRIPT',
  SET_KENV = 'SET_KENV',
}

export const emitter = new EventEmitter();
