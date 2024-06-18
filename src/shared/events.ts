import { EventEmitter } from 'node:events';
/* eslint-disable import/prefer-default-export */
import type { Channel } from '@johnlindquist/kit/core/enum';

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
  RemoveProcess = 'RemoveProcess',
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
  DID_FINISH_LOAD = 'DID_FINISH_LOAD',
  SetSubmitValue = 'SetSubmitValue',
  TermExited = 'TermExited',
  TERM_KILL = 'TERM_KILL',
  Sync = 'Sync',
  TermWrite = 'TermWrite',
  ShowDock = 'ShowDock',
  HideDock = 'HideDock',
  ForceQuit = 'ForceQuit',
  MAIN_SCRIPT_TRIGGERED = 'MAIN_SCRIPT_TRIGGERED',
  ProcessGone = 'ProcessGone',
  SetScriptTimestamp = 'SetScriptTimestamp',
}

interface KitEmitter {
  emit(event: KitEvent | Channel, data?: any): void;
  on(event: KitEvent | Channel, listener: (data: any) => void): void;
  once(event: KitEvent | Channel, listener: (data: any) => void): void;
  off(event: KitEvent | Channel, listener: (data: any) => void): void;
  removeAllListeners(): ReturnType<EventEmitter['removeAllListeners']>;
}

export const emitter: KitEmitter = new EventEmitter();
