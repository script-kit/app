import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { ipcRenderer, webFrame } from 'electron';
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
  ipcRenderer.on(channel, (_, data) => {
    // console.log('on', channel, data);
    callback(sanitizeForIPC(data));
  });
};

// @ts-ignore (define in dts)
window.document.addEventListener('DOMContentLoaded', () => {
  // console.log('Document ready event fired');
  // @ts-ignore (define in dts)
  ipcRenderer.send(Channel.WIDGET_GET);
});

// @ts-ignore (define in dts)
ipcRenderer.on(Channel.WIDGET_INIT, (_, data) => {
  // console.log(Channel.WIDGET_INIT, data);
  options = data;
});
// @ts-ignore (define in dts)

// @ts-ignore (define in dts)
window.api = api;
