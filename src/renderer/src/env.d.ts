/// <reference types="vite/client" />
/// <reference lib="dom" />
/// <reference path="./types/ban-electron-import.d.ts" />

import type { ElectronAPI, API } from '../../preload/index.d.ts';

declare global {
  interface Window {
    pid?: number;
    electron: ElectronAPI;
    api: API;
  }
  
  // Ensure global constructors are available
  const self: Window & typeof globalThis;
  const window: Window & typeof globalThis;
  const document: Document;
}

export {};