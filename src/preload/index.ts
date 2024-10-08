import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { ipcRenderer, webFrame, webUtils } from 'electron';
import { Channel } from '@johnlindquist/kit/core/enum';

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
  webUtils
};

function sanitizeForIPC(obj: any) {
  return JSON.parse(JSON.stringify(obj));
}

let options = {};
// @ts-ignore (define in dts)
window.send = (channel: string, data: any = {}) => {
  // console.log('send', {
  //   channel: channel || 'no channel',
  //   data: data || 'no data',
  //   options: options || 'no options...',
  // });
  ipcRenderer.send(
    Channel.VITE_WIDGET_SEND,
    sanitizeForIPC({
      ...options,
      data,
      widgetChannel: channel,
    }),
  );
};

// @ts-ignore (define in dts)
window.on = (channel: string, callback: (data: any) => void) => {
  const handler = (_: any, data: any) => {
    callback(sanitizeForIPC(data));
  };

  ipcRenderer.on(channel, handler);

  // Return a teardown function
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
};
// @ts-ignore (define in dts)

// @ts-ignore (define in dts)
window.api = api;
