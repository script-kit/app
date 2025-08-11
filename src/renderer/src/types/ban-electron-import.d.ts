/**
 * Module augmentation to ban direct 'electron' imports in renderer process.
 * This makes TypeScript throw errors when trying to import from 'electron' directly.
 */

// Augment the 'electron' module to make it unusable in renderer
declare module 'electron' {
  // Create a branded type that will cause type errors
  type ForbiddenElectronImport = {
    readonly _brand: 'Direct electron imports are forbidden in renderer process! Use window.electron or import from @/utils/electron-renderer instead.';
  };

  // Override all exports to be the forbidden type
  export const ipcRenderer: ForbiddenElectronImport;
  export const webFrame: ForbiddenElectronImport;
  export const contextBridge: ForbiddenElectronImport;
  export const app: ForbiddenElectronImport;
  export const BrowserWindow: ForbiddenElectronImport;
  export const shell: ForbiddenElectronImport;
  export const clipboard: ForbiddenElectronImport;
  
  const electron: ForbiddenElectronImport;
  export default electron;
}