import { screen } from 'electron';
import { kitState } from './state';

export const getCurrentScreen = async () => {
  if (kitState?.kenvEnv?.KIT_DISPLAY) {
    const display = screen.getAllDisplays().find((d) => {
      return d.id === Number(kitState.kenvEnv.KIT_DISPLAY);
    });

    if (display) {
      return display;
    }
  }

  const currentScreen =
    screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) ||
    screen.getPrimaryDisplay();

  return currentScreen;
};
