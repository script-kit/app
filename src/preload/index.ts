import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { Channel } from '@johnlindquist/kit/core/enum';
import { ipcRenderer, webFrame, webUtils } from 'electron';
import log from 'electron-log';

log.transports.console.level = false;

// Extend Window interface
declare global {
  interface Window {
    options: any;
    widgetId?: string;
    send: (channel: string, data?: any) => void;
    onSetState?: (state: any) => void;
  }
}

// Custom APIs for renderer
const api = {
  path,
  os,
  fs,
  fsPromises,
  url,
};

// @ts-expect-error (define in dts)
window.electron = {
  ipcRenderer,
  webFrame,
  webUtils,
};

function sanitizeForIPC(obj: any) {
  return JSON.parse(JSON.stringify(obj));
}

window.options = {};
// @ts-expect-error (define in dts)
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

// @ts-expect-error (define in dts)
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
// @ts-expect-error (define in dts)

// @ts-expect-error (define in dts)
window.api = api;

window.addEventListener('load', () => {
  log.info(`Waiting for ${Channel.WIDGET_INIT}`);
  ipcRenderer.once(Channel.WIDGET_INIT, (_, options) => {
    log.info(`Received ${Channel.WIDGET_INIT}`, options);
    window.options = options;
    window.widgetId = options.widgetId;
  });
  ipcRenderer.send(Channel.WIDGET_GET);
});
