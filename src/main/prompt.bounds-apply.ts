import { Channel } from '@johnlindquist/kit/core/enum';
import type { Rectangle } from 'electron';
import { screen as electronScreen } from 'electron';
import { AppChannel } from '../shared/enums';
import { adjustBoundsToAvoidOverlap, ensureMinWindowHeight, getTitleBarHeight } from './prompt.bounds-utils';
import { OFFSCREEN_X, OFFSCREEN_Y } from './prompt.options';
import { setPromptBounds as applyWindowBounds } from './prompt.window-utils';
import { prompts } from './prompts';
import {
  getCurrentScreen,
  getCurrentScreenFromBounds,
  isBoundsWithinDisplayById,
  isBoundsWithinDisplays,
} from './screen';
import { kitState } from './state';
import { container } from './state/services/container';

export const applyPromptBounds = (prompt: any, bounds: Partial<Rectangle>, reason = ''): void => {
  if (!prompt?.window || prompt.window.isDestroyed()) {
    return;
  }

  prompt.logInfo(`${prompt.pid}: 🆒 Attempt ${prompt.scriptName}: setBounds reason: ${reason}`, bounds);
  if (!kitState.ready) {
    return;
  }
  const currentBounds = prompt.window.getBounds();
  const closeEnough = (target: number | undefined, current: number) =>
    typeof target === 'number' ? Math.abs(target - current) < 4 : true;
  const widthNotChanged = closeEnough(bounds?.width, currentBounds.width);
  const heightNotChanged = closeEnough(bounds?.height, currentBounds.height);
  const xNotChanged = closeEnough(bounds?.x, currentBounds.x);
  const yNotChanged = closeEnough(bounds?.y, currentBounds.y);

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

  const reasonUpper = (reason || '').toUpperCase();
  // Consider these reasons as "prompt change" events that should trigger recentering
  // when window is at work area origin (from moveToMouseScreen):
  // - PROMPT* (PROMPT_CHANGED, etc.)
  // - INIT* (initBounds, etc.)
  // - CONTROLLER* (CONTROLLER_TRIGGER from renderer resize)
  const isPromptChangeReason =
    reasonUpper.includes('PROMPT') || reasonUpper.includes('INIT') || reasonUpper.includes('CONTROLLER');

  const noChange =
    !isPromptChangeReason &&
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
      reason,
      widthNotChanged,
      heightNotChanged,
      xNotChanged,
      yNotChanged,
      sameXAndYAsAnotherPrompt,
      promptsFocused: prompts.focused,
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
  const cachedWithinAnyDisplay = isBoundsWithinDisplays(bounds as Rectangle);

  prompt.logInfo(
    `${prompt.pid}: boundsScreen.id ${boundsScreen.id} mouseScreen.id ${mouseScreen.id} boundsOnMouseScreen ${boundsOnMouseScreen ? 'true' : 'false'} isVisible: ${prompt.isVisible() ? 'true' : 'false'}`,
  );

  let currentScreen = boundsScreen;
  if (boundsScreen.id !== mouseScreen.id && boundsOnMouseScreen) {
    prompt.logInfo('🔀 Mouse screen is different, but bounds are within display. Using mouse screen.');
    currentScreen = mouseScreen;
  }

  // Prefer an explicit screenId from cached bounds (multi-display) if present.
  const boundsScreenId = (bounds as any)?.screenId;
  let targetScreen = currentScreen;
  let targetScreenFound = false;
  if (boundsScreenId !== undefined) {
    const target = electronScreen.getAllDisplays().find((d) => String(d.id) === String(boundsScreenId));
    if (target) {
      targetScreenFound = true;
      targetScreen = target;
      prompt.logInfo('🖥️ Using target screen from cached bounds', { targetScreenId: target.id });
    } else {
      prompt.logInfo('🖥️ Cached screen not found, will recenter on mouse screen', { boundsScreenId });
      targetScreen = mouseScreen;
    }
  }

  const { x, y, width, height } = { ...currentBounds, ...bounds } as Rectangle;
  const { x: workX, y: workY } = targetScreen.workArea;
  const { width: screenWidth, height: screenHeight } = targetScreen.workAreaSize;

  prompt.logInfo('🛰️ Bounds debug', {
    reason,
    incoming: bounds,
    currentBounds,
    boundsScreenId,
    targetScreenId: targetScreen.id,
    workX,
    workY,
    screenWidth,
    screenHeight,
    boundsOnMouseScreen,
    cachedWithinAnyDisplay,
    targetScreenFound,
  });

  const newBounds: Rectangle = {
    x: typeof bounds?.x === 'number' ? (bounds.x as number) : currentBounds.x,
    y: typeof bounds?.y === 'number' ? (bounds.y as number) : currentBounds.y,
    width: typeof bounds?.width === 'number' ? (bounds.width as number) : currentBounds.width,
    height: typeof bounds?.height === 'number' ? (bounds.height as number) : currentBounds.height,
  } as Rectangle;

  const xIsNumber = typeof x === 'number';

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

  const missingPosition = typeof bounds?.x !== 'number' || typeof bounds?.y !== 'number';
  const isDefaultPosition =
    currentBounds.x === 0 ||
    currentBounds.y === 0 ||
    currentBounds.x === OFFSCREEN_X ||
    currentBounds.y === OFFSCREEN_Y;
  const isZeroPosition = bounds?.x === 0 && bounds?.y === 0;
  const targetFitsCachedScreen = targetScreenFound && isBoundsWithinDisplayById(newBounds, targetScreen.id);
  const isAtWorkOrigin = Math.abs(newBounds.x - workX) < 4 && Math.abs(newBounds.y - workY) < 4;

  // Check if incoming bounds are near the work area origin (within 50px of top-left corner)
  // This catches cases where the cached position is at or near work origin but not exactly at (0,0)
  const incomingNearWorkOrigin =
    typeof bounds?.x === 'number' &&
    typeof bounds?.y === 'number' &&
    bounds.x >= workX &&
    bounds.x < workX + 50 &&
    bounds.y >= workY &&
    bounds.y < workY + 50;

  // Center only when we truly lack a position (initial show/prompt change) or the window sits at defaults/zero.
  if (
    missingPosition ||
    isDefaultPosition ||
    (isPromptChangeReason && isZeroPosition) ||
    !boundsOnMouseScreen ||
    !cachedWithinAnyDisplay ||
    (targetScreenFound && !targetFitsCachedScreen) ||
    (isPromptChangeReason && isAtWorkOrigin) ||
    (isPromptChangeReason && incomingNearWorkOrigin)
  ) {
    prompt.logInfo('📍 Recentering because missing position', {
      missingPosition,
      isPromptChangeReason,
      isDefaultPosition,
      isZeroPosition,
      isAtWorkOrigin,
      incomingNearWorkOrigin,
      boundsOnMouseScreen,
      cachedWithinAnyDisplay,
      targetScreenFound,
      targetFitsCachedScreen,
      workX,
      workY,
      screenWidth,
      screenHeight,
      newWidth: newBounds.width,
      newHeight: newBounds.height,
      incomingX: bounds?.x,
      incomingY: bounds?.y,
    });
    newBounds.x = Math.round(workX + (screenWidth - newBounds.width) / 2);
    newBounds.y = Math.round(workY + screenHeight / 8);
  }

  // If the proposed bounds fall off the current screen, recenter on the current screen.
  const fitsOnCurrent = isBoundsWithinDisplayById(newBounds, targetScreen.id);
  const fitsAny = isBoundsWithinDisplays(newBounds);
  if (!fitsOnCurrent || !fitsAny) {
    prompt.logInfo('📍 Recentering because bounds off-screen', {
      fitsOnCurrent,
      fitsAny,
      currentScreenId: currentScreen.id,
      proposed: newBounds,
      workX,
      workY,
      screenWidth,
      screenHeight,
    });
    newBounds.x = Math.round(workX + (screenWidth - newBounds.width) / 2);
    newBounds.y = Math.round(workY + screenHeight / 8);
  }

  const prefWidth = container.getConfig().getPreferredPromptWidth();
  if (prefWidth) newBounds.width = prefWidth;

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
