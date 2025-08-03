/// <reference types="vite/client" />

// Global type declarations for renderer process
declare global {
  interface Window {
    pid?: number;
    electron: {
      ipcRenderer: any;
      webFrame: any;
    };
    api: {
      path: any;
      os: any;
      fs: any;
      fsPromises: any;
      url: any;
    };
  }
}

export {};
