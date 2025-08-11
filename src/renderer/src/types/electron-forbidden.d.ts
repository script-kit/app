/**
 * This file intentionally provides incorrect types for 'electron' imports
 * in the renderer process to catch misuse at compile time.
 * 
 * Direct imports from 'electron' in renderer code will cause runtime errors
 * because Node.js modules like 'path' are not available in the browser context.
 * 
 * ❌ NEVER DO THIS in renderer code:
 * import { ipcRenderer } from 'electron';
 * 
 * ✅ INSTEAD DO THIS:
 * import { ipcRenderer } from '@/utils/electron-renderer';
 * 
 * Or access directly:
 * const { ipcRenderer } = window.electron;
 */

export const ELECTRON_IMPORT_ERROR: never = 'ERROR: Direct electron imports are forbidden in renderer process! Use window.electron or import from @/utils/electron-renderer instead.' as never;

// Intentionally export nothing useful to cause type errors
export const ipcRenderer: never = ELECTRON_IMPORT_ERROR;
export const webFrame: never = ELECTRON_IMPORT_ERROR;
export const contextBridge: never = ELECTRON_IMPORT_ERROR;
export const shell: never = ELECTRON_IMPORT_ERROR;
export const clipboard: never = ELECTRON_IMPORT_ERROR;

// Make default export also fail
const electron: never = ELECTRON_IMPORT_ERROR;
export default electron;