import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { subscribeKey } from 'valtio/utils';
import { proxy } from 'valtio/vanilla';
import { emitter, KitEvent } from './events';

export type WidgetOptions = {
  id: string;
  wid: number;
  pid: number;
  moved: boolean;
  ignoreMouse: boolean;
  ignoreMeasure: boolean;
  /** Script path that created the widget (for persistence) */
  scriptPath?: string;
  /** Current widget state (for persistence) */
  state?: any;
  /** Widget creation options (for persistence) */
  options?: any;
};

const initWidgets = {
  widgets: [] as WidgetOptions[],
};

export const widgetState: typeof initWidgets = proxy(initWidgets);

export const findWidget = (id: string, reason = ''): (BrowserWindow & { pid: number }) | null => {
  const options = widgetState.widgets.find((opts) => opts.id === id);
  if (!options) {
    log.warn(`${reason}: widget not found: ${id}`);
    return null;
  }

  const window = BrowserWindow.fromId(options.wid);
  (window as any).pid = options.pid; //hack
  return window as BrowserWindow & { pid: number };
};

const subWidgets = subscribeKey(widgetState, 'widgets', (widgets) => {
  log.info(`👀 Widgets: ${JSON.stringify(widgets)}`);
  if (widgets.length > 0) {
    emitter.emit(KitEvent.ShowDock);
  } else {
    emitter.emit(KitEvent.HideDock);
  }
});
