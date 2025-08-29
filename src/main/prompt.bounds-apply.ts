import { Channel } from '@johnlindquist/kit/core/enum';
import { AppChannel } from '../shared/enums';
import type { Rectangle } from 'electron';
import { getCurrentScreen, getCurrentScreenFromBounds, isBoundsWithinDisplayById } from './screen';
import { prompts } from './prompts';
import { kitState } from './state';
import { adjustBoundsToAvoidOverlap, ensureMinWindowHeight, getTitleBarHeight } from './prompt.bounds-utils';
import { setPromptBounds as applyWindowBounds } from './prompt.window-utils';

export const applyPromptBounds = (prompt: any, bounds: Partial<Rectangle>, reason = ''): void => {
  if (!prompt?.window || prompt.window.isDestroyed()) {
    return;
  }

  prompt.logInfo(`${prompt.pid}: 🆒 Attempt ${prompt.scriptName}: setBounds reason: ${reason}`, bounds);
  if (!kitState.ready) {
    return;
  }
  const currentBounds = prompt.window.getBounds();
  const widthNotChanged = bounds?.width && Math.abs((bounds.width as number) - currentBounds.width) < 4;
  const heightNotChanged = bounds?.height && Math.abs((bounds.height as number) - currentBounds.height) < 4;
  const xNotChanged = bounds?.x && Math.abs((bounds.x as number) - currentBounds.x) < 4;
  const yNotChanged = bounds?.y && Math.abs((bounds.y as number) - currentBounds.y) < 4;

  let sameXAndYAsAnotherPrompt = false;
  for (const p of prompts) {
    if (p?.window?.id === prompt.window?.id) continue;
    if (p.getBounds().x === bounds.x && p.getBounds().y === bounds.y) {
      if (p?.isFocused() && p?.isVisible()) {
        prompt.logInfo(`🔀 Prompt ${p.id} has same x and y as ${prompt.id}. Scooching x and y!`);
        sameXAndYAsAnotherPrompt = true;
      }
    }
  }

  const noChange =
    heightNotChanged &&
    widthNotChanged &&
    xNotChanged &&
    yNotChanged &&
    !sameXAndYAsAnotherPrompt &&
    !prompts.focused;

  if (noChange) {
    prompt.logInfo('📐 No change in bounds, ignoring', {
      currentBounds,
      bounds,
    });
    return;
  }

  prompt.sendToPrompt(Channel.SET_PROMPT_BOUNDS, {
    id: prompt.id,
    ...bounds,
  });

  const boundsScreen = getCurrentScreenFromBounds(prompt.window?.getBounds());
  const mouseScreen = getCurrentScreen();
  const boundsOnMouseScreen = isBoundsWithinDisplayById(bounds as Rectangle, mouseScreen.id);

  prompt.logInfo(
    `${prompt.pid}: boundsScreen.id ${boundsScreen.id} mouseScreen.id ${mouseScreen.id} boundsOnMouseScreen ${boundsOnMouseScreen ? 'true' : 'false'} isVisible: ${prompt.isVisible() ? 'true' : 'false'}`,
  );

  let currentScreen = boundsScreen;
  if (boundsScreen.id !== mouseScreen.id && boundsOnMouseScreen) {
    prompt.logInfo('🔀 Mouse screen is different, but bounds are within display. Using mouse screen.');
    currentScreen = mouseScreen;
  }

  const { x, y, width, height } = { ...currentBounds, ...bounds } as Rectangle;
  const { x: workX, y: workY } = currentScreen.workArea;
  const { width: screenWidth, height: screenHeight } = currentScreen.workAreaSize;

  const newBounds: Rectangle = {
    x: typeof bounds?.x === 'number' ? (bounds.x as number) : currentBounds.x,
    y: typeof bounds?.y === 'number' ? (bounds.y as number) : currentBounds.y,
    width: typeof bounds?.width === 'number' ? (bounds.width as number) : currentBounds.width,
    height: typeof bounds?.height === 'number' ? (bounds.height as number) : currentBounds.height,
  } as Rectangle;

  const xIsNumber = typeof x === 'number';

  if (!boundsOnMouseScreen) {
    prompt.window.center();
  }

  if (xIsNumber && x < workX) {
    newBounds.x = workX;
  } else if (width && (xIsNumber ? x : currentBounds.x) + width > workX + screenWidth) {
    newBounds.x = workX + screenWidth - (width as number);
  } else if (xIsNumber) {
    newBounds.x = x;
  }

  if (typeof y === 'number' && y < workY) {
    newBounds.y = workY;
  } else if (height && (y || currentBounds.y) + height > workY + screenHeight) {
    // keep inside height bounds below
  }

  if (width && (width as number) > screenWidth) {
    newBounds.x = workX;
    newBounds.width = screenWidth;
  }
  if (height && (height as number) > screenHeight) {
    newBounds.y = workY;
    newBounds.height = screenHeight;
  }

  if (kitState?.kenvEnv?.KIT_WIDTH) {
    newBounds.width = Number.parseInt(kitState?.kenvEnv?.KIT_WIDTH, 10);
  }

  prompt.logInfo(`${prompt.pid}: Apply ${prompt.scriptName}: setBounds reason: ${reason}`, newBounds);

  const rounded = {
    x: Math.round(newBounds.x),
    y: Math.round(newBounds.y),
    width: Math.round(newBounds.width),
    height: Math.round(newBounds.height),
  } as Rectangle;

  const peers = Array.from(prompts).map((p) => ({ id: p.id, bounds: p.getBounds() }));
  const finalBounds = adjustBoundsToAvoidOverlap(peers, prompt.id, rounded);

  const titleBarHeight = getTitleBarHeight(prompt.window);
  const minHeight = ensureMinWindowHeight(finalBounds.height, titleBarHeight);
  if (minHeight !== finalBounds.height) {
    prompt.logInfo('too small, setting to min height');
    finalBounds.height = minHeight;
  }

  applyWindowBounds(prompt.window, prompt.id, finalBounds, prompt.sendToPrompt as any);
  prompt.promptBounds = { id: prompt.id, ...prompt.window.getBounds() } as any;

  try {
    // Hint renderer to perform a single post-apply measurement if needed
    prompt.sendToPrompt(AppChannel.TRIGGER_RESIZE, undefined);
  } catch {}
};

