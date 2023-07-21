// REMOVE-NUT
import { getActiveWindow } from '@nut-tree/nut-js';
// END-REMOVE-NUT
import { screen } from 'electron';
import log from 'electron-log';
import { kitState } from './state';

export const getCurrentActiveWindow = async () => {
  // REMOVE-NUT
  const activeWindow = await getActiveWindow();

  const app = {
    title: await activeWindow.title,
    region: await activeWindow.region,
  };

  const bounds = {
    title: app?.title,
    x: app?.region?.left,
    y: app?.region?.top,
    width: app?.region?.width,
    height: app?.region?.height,
  };

  return bounds;
  // REMOVE-NUT

  return null;
};

export const getCurrentScreen = async () => {
  if (kitState?.kenvEnv?.KIT_DISPLAY) {
    const display = screen.getAllDisplays().find((d) => {
      return d.id === Number(kitState.kenvEnv.KIT_DISPLAY);
    });

    if (display) {
      return display;
    }
  }

  let appBounds = await getCurrentActiveWindow();
  if (!appBounds || !appBounds.title) {
    log.info(`No active window found. Using cursor position.`);
    appBounds = {
      title: '',
      ...screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds,
    };
  } else {
    log.info(`Positioning on display containing app: ${appBounds.title}}`);
  }
  const currentScreen = screen.getDisplayNearestPoint(appBounds);

  return currentScreen;
};
