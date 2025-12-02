import { PROMPT, UI } from '@johnlindquist/kit/core/enum';
import type { PromptBounds } from '@johnlindquist/kit/types/core';
import type { Rectangle } from 'electron';
import { screen } from 'electron';
import { EMOJI_HEIGHT, EMOJI_WIDTH } from '../shared/defaults';
import { promptLog as log } from './logs';
import { OFFSCREEN_X, OFFSCREEN_Y } from './prompt.options';
import {
  getCurrentScreen,
  getCurrentScreenFromBounds,
  isBoundsWithinDisplayById,
  isBoundsWithinDisplays,
} from './screen';
import { promptState } from './state';

// Small, focused helpers for screen/display utilities used by prompts

export const getCurrentScreenFromMouse = () => {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
};

export const getAllScreens = () => {
  return screen.getAllDisplays();
};

export const getCurrentScreenPromptCache = (
  scriptPath: string,
  { ui, resize, bounds }: { ui: UI; resize: boolean; bounds: Partial<Rectangle> } = {
    ui: UI.arg,
    resize: false,
    bounds: {},
  },
): Partial<Rectangle> & { screenId: string } => {
  const currentScreen = getCurrentScreen();
  const screenId = String(currentScreen.id);

  let savedPromptBounds = promptState?.screens?.[screenId]?.[scriptPath];

  // Fallback: if nothing stored for the current screen, try any screen entry for this script.
  if (!savedPromptBounds && promptState?.screens) {
    for (const [sid, scripts] of Object.entries(promptState.screens)) {
      const candidate = (scripts as any)?.[scriptPath];
      if (candidate) {
        savedPromptBounds = candidate;
        log.info(`📱 Fallback bounds found on screen ${sid} for ${scriptPath}`, candidate);
        break;
      }
    }
  }

  if (savedPromptBounds) {
    log.info(`📱 Screen: ${screenId}: `, savedPromptBounds);
    log.info(`Bounds: found saved bounds for ${scriptPath}`);
    return savedPromptBounds;
  }

  const { width: screenWidth, height: screenHeight, x: workX, y: workY } = currentScreen.workArea;

  let width = PROMPT.WIDTH.BASE;
  let height = PROMPT.HEIGHT.BASE;

  if (ui !== UI.none && resize) {
    if (ui === UI.emoji) {
      width = EMOJI_WIDTH;
      height = EMOJI_HEIGHT;
    }
    if (ui === UI.form) {
      width /= 2;
    }
    if (ui === UI.drop) {
      height /= 2;
    }
    // editor/textarea minimums
    if (ui === UI.editor || ui === UI.textarea) {
      width = Math.max(width, PROMPT.WIDTH.BASE);
      height = Math.max(height, PROMPT.HEIGHT.BASE);
    }
  }

  if (typeof bounds?.width === 'number') width = bounds.width;
  if (typeof bounds?.height === 'number') height = bounds.height;

  let x = Math.round(screenWidth / 2 - width / 2 + workX);
  let y = Math.round(workY + screenHeight / 8);

  log.info('Screen bounds:', {
    topLeft: { x: workX, y: workY },
    bottomRight: { x: workX + screenWidth, y: workY + screenHeight },
  });

  log.info('Center screen', {
    x: screenWidth / 2,
    y: screenHeight / 2,
  });

  log.info('Window bounds:', {
    topLeft: { x, y },
    bottomRight: { x: x + width, y: y + height },
  });

  if (typeof bounds?.x === 'number' && bounds.x !== OFFSCREEN_X) {
    log.info(`x is a number and not ${OFFSCREEN_X}`);
    x = bounds.x;
  }
  if (typeof bounds?.y === 'number' && bounds.y !== OFFSCREEN_Y) {
    log.info(`y is a number and not ${OFFSCREEN_Y}`);
    y = bounds.y;
  }

  const promptBounds = { x, y, width, height, screenId };

  if (ui === UI.arg) {
    const rb = {
      ...promptBounds,
      width: PROMPT.WIDTH.BASE,
      height: PROMPT.HEIGHT.BASE,
      screenId,
    };
    log.verbose('Bounds: No UI', rb);
    return rb;
  }

  log.info(`Bounds: No saved bounds for ${scriptPath}, returning default bounds`, promptBounds);
  return promptBounds;
};

export const pointOnMouseScreen = ({ x, y }: { x: number; y: number }) => {
  const mouseScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const onMouseScreen =
    x > mouseScreen.bounds.x &&
    y > mouseScreen.bounds.y &&
    x < mouseScreen.bounds.x + mouseScreen.bounds.width &&
    y < mouseScreen.bounds.y + mouseScreen.bounds.height;
  return onMouseScreen;
};
