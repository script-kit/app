import { Notification } from 'electron';
import { KitEvent, emitter } from './shared/events';
import { AppChannel } from './shared/enums';

export interface ProcessMonitorDeps {
  pid: number;
  windowDestroyed: () => boolean;
  isMainMenu: boolean;
  scriptStartTime?: number;
  boundToProcess: boolean;
  logInfo: (...args: any[]) => void;
  logWarn: (...args: any[]) => void;
  logError: (...args: any[]) => void;
  focusPrompt: () => void;
  close: (reason: string) => void;
  hideInstant: () => void;
  isDestroyed: () => boolean;
  sendToAllPrompts: (channel: AppChannel, data: any) => void;
}

export function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}


