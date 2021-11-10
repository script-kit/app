/* eslint-disable import/prefer-default-export */
import { EventEmitter } from 'events';

export enum KitEvent {
  PauseShortcuts = 'PauseShortcuts',
  ResumeShortcuts = 'ResumeShortcuts',
  TryPromptScript = 'TryPromptScript',
  SetKenv = 'SetKenv',
  Blur = 'Blur',
  ExitPrompt = 'HidePrompt',
  ToggleBackground = 'ToggleBackground',
  RunPromptProcess = 'RunPromptProcess',
  CheckForUpdates = 'CheckForUpdates',
}

interface KitEmitter {
  emit(event: KitEvent, data?: any): void;
  on(event: KitEvent, listener: (data: any) => void): void;
}

export const emitter: KitEmitter = new EventEmitter();
