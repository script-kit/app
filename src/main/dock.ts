import { Menu, app } from 'electron';
import { KitEvent, emitter } from '../shared/events';
import log from 'electron-log';
import { kitState, promptState } from './state';
import { windowsState } from '../shared/windows';
import { getAssetPath } from '../shared/assets';
import { widgetState } from '../shared/widget';
import { prompts } from './prompts';
import { debounce } from 'lodash-es';

let hideIntervalId: NodeJS.Timeout | null = null;

export const hideDock = debounce(() => {
  if (!kitState.isMac) return;
  if (kitState.devToolsCount > 0) return;
  if (widgetState.widgets.length) return;
  if (windowsState.windows.length) return;
  if (prompts.isAnyPromptVisible()) return;
  if (!kitState.dockShown) return;

  actualHideDock();

  if (hideIntervalId) clearInterval(hideIntervalId);
}, 200);

export const showDock = () => {
  if (!kitState.isMac) return;
  if (
    kitState.devToolsCount === 0 &&
    !prompts.isAnyPromptVisible() &&
    widgetState.widgets.length === 0
  )
    return;

  if (!app?.dock.isVisible()) {
    hideDock.cancel();
    app?.dock?.setIcon(getAssetPath('icon.png'));
    app?.dock?.show();
    kitState.dockShown = true;
    app?.dock?.setMenu(
      Menu.buildFromTemplate([
        {
          label: 'Quit',
          click: () => {
            emitter.emit(KitEvent.ForceQuit);
          },
        },
      ]),
    );

    app?.dock?.setIcon(getAssetPath('icon.png'));

    if (hideIntervalId) clearInterval(hideIntervalId);

    hideIntervalId = setInterval(() => {
      hideDock();
    }, 1000);
  }
};

export const clearStateTimers = () => {
  if (hideIntervalId) clearInterval(hideIntervalId);
};

export const actualHideDock = () => {
  log.info(`🚢 Hiding dock`);
  app?.dock?.setIcon(getAssetPath('icon.png'));
  app?.dock?.hide();
  kitState.dockShown = false;
};

emitter.on(KitEvent.ShowDock, showDock);
emitter.on(KitEvent.HideDock, hideDock);
