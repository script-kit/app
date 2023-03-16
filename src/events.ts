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
  RestartWatcher = 'RestartWatcher',
  TeardownWatchers = 'TeardownWatchers',
  RestartKeyWatcher = 'RestartKeyWatcher',
  KeymapChanged = 'KeymapChanged',
  RemoveMostRecent = 'RemoveMostRecent',
  PROMPT_RELOAD = 'PROMPT_RELOAD',
  DID_FINISH_LOAD = 'DID_FINISH_LOAD',
  SetSubmitValue = 'SetSubmitValue',
  TermExited = 'TermExited',
  TERM_KILL = 'TERM_KILL',
}

interface KitEmitter {
  emit(event: KitEvent | Channel, data?: any): void;
  on(event: KitEvent | Channel, listener: (data: any) => void): void;
  removeAllListeners(): ReturnType<EventEmitter['removeAllListeners']>;
}

export const emitter: KitEmitter = new EventEmitter();
