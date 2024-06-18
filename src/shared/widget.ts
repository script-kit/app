import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { subscribeKey } from 'valtio/utils';
import { proxy } from 'valtio/vanilla';
import { KitEvent, emitter } from './events';

export type WidgetOptions = {
  id: string;
  wid: number;
  pid: number;
  moved: boolean;
  ignoreMouse: boolean;
  ignoreMeasure: boolean;
};

const initWidgets = {
  widgets: [] as WidgetOptions[],
};

export const widgetState: typeof initWidgets = proxy(initWidgets);

export const findWidget = (id: string, reason = '') => {
  const options = widgetState.widgets.find((opts) => opts.id === id);
  if (!options) {
    log.warn(`${reason}: widget not found: ${id}`);
    return null;
  }

  return BrowserWindow.fromId(options.wid);
};

const subWidgets = subscribeKey(widgetState, 'widgets', (widgets) => {
  log.info(`👀 Widgets: ${JSON.stringify(widgets)}`);
  if (widgets.length !== 0) {
    emitter.emit(KitEvent.ShowDock);
  } else {
    emitter.emit(KitEvent.HideDock);
  }
});
