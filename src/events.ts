/* eslint-disable import/prefer-default-export */
import { EventEmitter } from 'events';

export enum EVENT {
  PAUSE_SHORTCUTS = 'PAUSE_SHORTCUTS',
  RESUME_SHORTCUTS = 'RESUME_SHORTCUTS',
  RUN_APP_SCRIPT = 'RUN_APP_SCRIPT',
}

export const emitter = new EventEmitter();
