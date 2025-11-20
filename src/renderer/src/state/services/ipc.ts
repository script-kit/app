import { AppChannel, Channel } from '../../../../shared/enums';
import type { AppMessage } from '@johnlindquist/kit/types/kitapp';
import type { ResizeData } from '../../../../shared/types';

// Access ipcRenderer through the preloaded window.electron
const { ipcRenderer } = window.electron;

type IpcSender = (channel: string, ...args: any[]) => void;

let ipcSender: IpcSender = (channel, ...args) => ipcRenderer.send(channel, ...args);

export const setIpcSenderForTests = (fn: IpcSender) => {
  ipcSender = fn;
};

/**
 * Pure IPC helper functions.
 * No atom dependencies, just thin wrappers around ipcRenderer with an overridable sender for tests.
 */

export function sendResize(data: ResizeData) {
  ipcSender(AppChannel.RESIZE, data);
}

export function sendChannel(channel: Channel | AppChannel | string, ...args: any[]) {
  ipcSender(channel, ...args);
}

export function sendAppMessage(channel: Channel, message: AppMessage) {
  ipcSender(channel, message);
}

export function sendIPC(message: any) {
  if (message.type && message.payload !== undefined) {
    ipcSender(message.type, message.payload);
  } else if (message.channel && message.args) {
    ipcSender(message.channel, ...message.args);
  } else {
    console.warn('Invalid IPC message format:', message);
  }
}
