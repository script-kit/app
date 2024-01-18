import { contextBridge, ipcRenderer, webFrame } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { kitPath, getMainScriptPath } from '@johnlindquist/kit/core/utils';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Custom APIs for renderer
const api = {
  kitPath,
  getMainScriptPath,
  path,
  os,
  fs,
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.electron.ipcRenderer = ipcRenderer;
  // @ts-ignore (define in dts)
  window.electron.webFrame = webFrame;
  // @ts-ignore (define in dts)
  window.api = api;
}
