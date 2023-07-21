// REMOVE-NUT
import { getActiveWindow } from '@nut-tree/nut-js';
// END-REMOVE-NUT
import { screen } from 'electron';

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
  let appBounds = await getCurrentActiveWindow();
  if (!appBounds) {
    appBounds = { title: '', ...screen.getPrimaryDisplay().bounds };
  }
  const currentScreen = screen.getDisplayNearestPoint(appBounds);

  return currentScreen;
};
