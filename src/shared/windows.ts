import type { UI } from '@johnlindquist/kit/core/enum';
import log from 'electron-log';
import { subscribeKey } from 'valtio/utils';
import { proxy } from 'valtio/vanilla';
import { KitEvent, emitter } from './events';

export type WindowOptions = {
  scriptPath: string;
  id: number;
  ui: UI;
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
