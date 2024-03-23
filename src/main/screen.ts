import { Rectangle, screen } from 'electron';
import log from 'electron-log';
import { kitState } from '../shared/state';

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

export const getCurrentScreenFromBounds = (bounds: Rectangle) => {
  const currentScreen = screen.getDisplayNearestPoint(bounds);
  return currentScreen;
};

export const isBoundsWithinDisplays = (bounds: Rectangle) => {
  return screen.getAllDisplays().some((screen) => {
    const minX = screen.bounds.x;
    const minY = screen.bounds.y;
    const maxX = screen.bounds.x + screen.bounds.width;
    const maxY = screen.bounds.y + screen.bounds.height;

    return (
      bounds?.x >= minX &&
      bounds?.x + bounds?.width <= maxX &&
      bounds?.y >= minY &&
      bounds?.y + bounds?.height <= maxY
    );
  });
};

export const isBoundsWithinDisplayById = (
  bounds: Rectangle,
  displayId: number,
) => {
  const display = screen.getAllDisplays().find((d) => {
    return d.id === displayId;
  });

  if (display) {
    const minX = display.bounds.x;
    const minY = display.bounds.y;
    const maxX = display.bounds.x + display.bounds.width;
    const maxY = display.bounds.y + display.bounds.height;

    return (
      bounds?.x >= minX &&
      bounds?.x + bounds?.width <= maxX &&
      bounds?.y >= minY &&
      bounds?.y + bounds?.height <= maxY
    );
  }

  return false;
};
