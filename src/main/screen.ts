import { Rectangle, desktopCapturer, screen } from 'electron';
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

export const getSourceFromRectangle = async (
  id: string,
  rectangle: Electron.Rectangle,
) => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: rectangle.width,
      height: rectangle.height,
    },
  });

  let source = sources.find((source) => source.display_id === id);

  if (!source) {
    const allDisplay = screen.getAllDisplays();

    const index = allDisplay.findIndex(
      (display) => display.id.toString() === id,
    );

    if (index !== -1) {
      source = sources[index];
    }
  }

  return source as Electron.DesktopCapturerSource;
};

export const getCurrentCursorDisplay = () => {
  const { x, y } = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint({ x, y });

  return currentDisplay;
};

export const getDisplayDetail = (display: Electron.Display) => {
  // win32 darwin linux platforms are handled separately
  const { x, y, width, height } =
    process.platform === 'linux' ? display.workArea : display.bounds;

  // The mac image is too large, causing the screenshot window to lag, and the screenshot window display delay is very serious
  const scale = process.platform === 'darwin' ? 1 : display.scaleFactor;

  return {
    id: display.id,
    rectangle: {
      x: x * scale,
      y: y * scale,
      width: width * scale,
      height: height * scale,
    },
  };
};

export type DisplayScreenDetail = {
  id: number;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const getAllDisplayScreenshots = () => {
  const displays = screen.getAllDisplays().map(getDisplayDetail);

  return Promise.all(
    displays.map(async ({ id, rectangle }) => {
      const img = await getSourceFromRectangle(id.toString(), rectangle);
      return {
        id,
        ...rectangle,
        src: img.thumbnail.toDataURL(),
      } as DisplayScreenDetail;
    }),
  );
};
