import type fs from 'node:fs';
import type fsPromises from 'node:fs/promises';
import type os from 'node:os';
import type path from 'node:path';
import type url from 'node:url';
import type { ipcRenderer, webFrame } from 'electron';

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
