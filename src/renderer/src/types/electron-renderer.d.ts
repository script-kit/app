/**
 * Type definitions for Electron APIs available in the renderer process.
 *
 * IMPORTANT: In the renderer process, you must NEVER import directly from 'electron'.
 * Instead, use window.electron which is properly exposed by the preload script.
 *
 * ❌ WRONG: import { ipcRenderer } from 'electron';
 * ✅ RIGHT: const { ipcRenderer } = window.electron;
 */

// Minimal ambient declarations to avoid DOM 'true' parsing issues in d.ts
declare const electronAPI: any;
declare const ipcRenderer: any;
declare const webFrame: any;

// Type guard to ensure we're in renderer context
export function assertRendererContext(): asserts boolean {
  if (typeof window === 'undefined' || !window.electron) {
    throw new Error('This code must run in the renderer process with preload script');
  }
}

// Helper type to extract ipcRenderer for use in function signatures
export type RendererIpcRenderer = typeof window.electron.ipcRenderer;
