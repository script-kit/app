import type { ipcRenderer, webFrame } from 'electron';
import type path from 'path';
import type os from 'os';
import type fs from 'fs';
import type fsPromises from 'fs/promises';
import type url from 'url';

interface ElectronAPI {
  ipcRenderer: typeof ipcRenderer;
  webFrame: typeof webFrame;
}

interface API {
  path: typeof path;
  os: typeof os;
  fs: typeof fs;
  fsPromises: typeof fsPromises;
  url: typeof url;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: API;
  }
}
