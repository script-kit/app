import { screen } from 'electron';
import { kitState } from './state';

export const getCurrentScreen = () => {
  if (kitState?.kenvEnv?.KIT_DISPLAY) {
    const display = screen.getAllDisplays().find((d) => {
      return d.id === Number(kitState.kenvEnv.KIT_DISPLAY);
    });

    if (display) {
      return display;
    }
  }

  const point = screen.getCursorScreenPoint();
  const currentScreen =
    screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();

  return currentScreen;
};
