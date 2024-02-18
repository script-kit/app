import { ipcRenderer, webFrame } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import fsPromises from 'fs/promises';
import url from 'url';

// Custom APIs for renderer
const api = {
  path,
  os,
  fs,
  fsPromises,
  url,
};

// @ts-ignore (define in dts)
window.electron = {
  ipcRenderer,
  webFrame,
};

// @ts-ignore (define in dts)
window.api = api;
