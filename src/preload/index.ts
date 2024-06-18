import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { ipcRenderer, webFrame } from 'electron';

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
