import { AppChannel, Channel } from '../../../../shared/enums';
import type { ResizeData } from '../../../../shared/types';

// Access ipcRenderer through the preloaded window.electron
const { ipcRenderer } = window.electron;

/**
 * Pure IPC helper functions.
 * No atom dependencies, just thin wrappers around ipcRenderer.
 */

export function sendResize(data: ResizeData) {
  ipcRenderer.send(AppChannel.RESIZE, data);
}

export function sendChannel(channel: Channel, ...args: any[]) {
  ipcRenderer.send(channel, ...args);
}

export function sendIPC(message: any) {
  if (message.type && message.payload !== undefined) {
    ipcRenderer.send(message.type, message.payload);
  } else if (message.channel && message.args) {
    ipcRenderer.send(message.channel, ...message.args);
  } else {
    console.warn('Invalid IPC message format:', message);
  }
}