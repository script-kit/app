/**
 * Type definitions for Electron APIs available in the renderer process.
 * 
 * IMPORTANT: In the renderer process, you must NEVER import directly from 'electron'.
 * Instead, use window.electron which is properly exposed by the preload script.
 * 
 * ❌ WRONG: import { ipcRenderer } from 'electron';
 * ✅ RIGHT: const { ipcRenderer } = window.electron;
 */

import type { IpcRenderer, WebFrame } from 'electron';

// Re-export the properly typed electron API from window
export const electronAPI = window.electron;
export const { ipcRenderer, webFrame } = window.electron;

// Type guard to ensure we're in renderer context
export function assertRendererContext(): asserts true {
  if (typeof window === 'undefined' || !window.electron) {
    throw new Error('This code must run in the renderer process with preload script');
  }
}

// Helper type to extract ipcRenderer for use in function signatures
export type RendererIpcRenderer = typeof window.electron.ipcRenderer;