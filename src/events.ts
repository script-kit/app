/* eslint-disable import/prefer-default-export */
import { Channel } from '@johnlindquist/kit/cjs/enum';
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
  RunBackgroundProcess = 'RunBackgroundProcess',
  RemoveBackground = 'REMOVE_BACKGROUND',
  KillProcess = 'KillProcess',
  OpenLog = 'OpenLog',
  OpenScript = 'OpenScript',
  TrayClick = 'TrayClick',
  OpenDevTools = 'OpenDevTools',
  MainScript = 'MainScript',
}

interface KitEmitter {
  emit(event: KitEvent | Channel, data?: any): void;
  on(event: KitEvent | Channel, listener: (data: any) => void): void;
}

export const emitter: KitEmitter = new EventEmitter();
