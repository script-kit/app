/**
 * Safe electron API access for renderer process.
 * 
 * This module provides the correct way to access Electron APIs in the renderer process.
 * Direct imports from 'electron' will cause runtime errors due to Node.js modules
 * being unavailable in the browser context.
 * 
 * Usage:
 * ```typescript
 * import { ipcRenderer } from '@/utils/electron-renderer';
 * 
 * // Now use ipcRenderer safely
 * ipcRenderer.send('channel', data);
 * ```
 */

// Type check to ensure window.electron exists
if (typeof window === 'undefined' || !window.electron) {
  throw new Error(
    'Electron APIs are not available. Ensure this code runs in the renderer process with a proper preload script.'
  );
}

// Export the properly exposed Electron APIs
export const { ipcRenderer, webFrame } = window.electron;

// Export the entire electron API object if needed
export const electronAPI = window.electron;

// Helper to get ipcRenderer with runtime check
export function getIpcRenderer() {
  if (!window.electron?.ipcRenderer) {
    throw new Error('ipcRenderer is not available in this context');
  }
  return window.electron.ipcRenderer;
}