import log from 'electron-log';
import { proxy } from 'valtio/vanilla';
import { KitEvent, emitter } from './events';
import { subscribeKey } from 'valtio/utils';

export type WindowOptions = {
  id: string;
  wid: number;
};

const initWindows = {
  windows: [] as WindowOptions[],
};

export const windowsState: typeof initWindows = proxy(initWindows);

const subWindows = subscribeKey(windowsState, 'windows', (windows) => {
  log.info(`👀 Windows: ${JSON.stringify(windows)}`);
  if (windows.length !== 0) {
    emitter.emit(KitEvent.ShowDock);
  } else {
    emitter.emit(KitEvent.HideDock);
  }
});
