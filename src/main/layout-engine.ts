/**
 * Layout Engine - Deterministic Window Layout Management
 *
 * This module provides a deterministic, unidirectional data flow for window layout:
 * 1. Renderer calculates content size
 * 2. Renderer sends LayoutRequest via IPC
 * 3. Main Process calculates target geometry (pure function)
 * 4. Main Process applies bounds
 * 5. Window is shown ONLY after final bounds are applied
 *
 * This eliminates the need for fragile synchronization flags like:
 * - boundsLockedForResize
 * - skipInitBoundsForResize
 * - showAfterNextResize
 */

import { PROMPT, UI } from '@johnlindquist/kit/core/enum';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import type { Display, Rectangle } from 'electron';
import { screen as electronScreen } from 'electron';
import { promptLog as log } from './logs';
import type { KitPrompt } from './prompt';
import { getCurrentScreenPromptCache as getPromptCache } from './prompt.screen-utils';
import { getCurrentScreen, getCurrentScreenFromBounds, isBoundsWithinDisplayById, isBoundsWithinDisplays } from './screen';

// ============================================================================
// Types
// ============================================================================

/**
 * Request from renderer for a layout update
 */
export interface LayoutRequest {
  /** Unique identifier for this request */
  requestId: string;
  /** Process ID */
  pid: number;
  /** Prompt ID */
  promptId: string;
  /** Script path */
  scriptPath: string;
  /** UI type */
  ui: UI;
  /** Content heights measured by renderer */
  contentHeight: {
    top: number;
    main: number;
    footer: number;
  };
  /** Whether preview panel is active */
  hasPreview: boolean;
  /** Whether panel is active */
  hasPanel: boolean;
  /** Whether this is the initial show (window should become visible) */
  isInitialShow: boolean;
  /** Whether window is already visible */
  isVisible: boolean;
  /** Whether this is the main script */
  isMainScript: boolean;
  /** Whether this is a splash screen */
  isSplash: boolean;
  /** Force-specific dimensions from promptData */
  forceDimensions?: {
    width?: number;
    height?: number;
  };
  /** Window mode (panel or window) */
  windowMode: 'panel' | 'window';
  /** Total number of choices (for placeholder detection) */
  totalChoices: number;
  /** Whether only placeholder content is visible */
  placeholderOnly: boolean;
}

/**
 * Response from layout engine with computed geometry
 */
export interface LayoutResponse {
  /** Echo back the request ID for correlation */
  requestId: string;
  /** Computed bounds to apply */
  bounds: Rectangle;
  /** Whether to show the window after applying bounds */
  shouldShow: boolean;
  /** Reason for the layout decision (for debugging) */
  reason: string;
}

/**
 * Configuration for layout computation
 */
export interface LayoutConfig {
  /** Current screen */
  screen: Display;
  /** Cached bounds for this script (if any) */
  cachedBounds?: Partial<Rectangle>;
  /** Current window bounds */
  currentBounds: Rectangle;
}

// ============================================================================
// Pure Functions for Geometry Calculation
// ============================================================================

/**
 * Calculate target dimensions based on content measurements
 * Pure function - no side effects
 */
export function calculateDimensions(
  request: LayoutRequest,
  config: LayoutConfig,
): Pick<Rectangle, 'width' | 'height'> {
  const { contentHeight, hasPreview, ui, isSplash, forceDimensions, isMainScript, placeholderOnly, totalChoices } = request;
  const { currentBounds, cachedBounds } = config;

  // Splash screen has fixed dimensions
  if (isSplash) {
    return {
      width: PROMPT.WIDTH.BASE,
      height: PROMPT.HEIGHT.BASE,
    };
  }

  // Calculate base height from content
  const totalContentHeight = contentHeight.top + contentHeight.main + contentHeight.footer;
  const maxHeight = Math.max(PROMPT.HEIGHT.BASE, currentBounds.height);
  let height = Math.round(Math.min(totalContentHeight, maxHeight));
  let width = cachedBounds?.width ?? currentBounds.width;

  // Apply force dimensions if provided
  if (typeof forceDimensions?.height === 'number') {
    height = forceDimensions.height;
  } else if (isMainScript && cachedBounds?.height) {
    // For main script, use cached height when in placeholder state
    const useCachedHeight = placeholderOnly || totalChoices === 0;
    if (useCachedHeight) {
      height = cachedBounds.height;
    }
  }

  if (typeof forceDimensions?.width === 'number') {
    width = forceDimensions.width;
  }

  // Enforce minimum heights for certain UI types
  const heightBelowBase = height < PROMPT.HEIGHT.BASE;

  if ([UI.term, UI.editor].includes(ui) && heightBelowBase) {
    height = PROMPT.HEIGHT.BASE;
  }

  // Main menu: allow shrinking only when there are actionable choices
  if (isMainScript && heightBelowBase) {
    const allowShrink = totalChoices > 0 && !placeholderOnly;
    if (!allowShrink) {
      height = PROMPT.HEIGHT.BASE;
    }
  }

  // Preview panel affects dimensions
  if (hasPreview) {
    if (!isMainScript) {
      width = Math.max(PROMPT.WIDTH.BASE, width);
    }
    const minPreviewHeight = PROMPT.HEIGHT.BASE;
    height = Math.max(currentBounds.height, minPreviewHeight, height);
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * Calculate target position for the window
 * Pure function - no side effects
 */
export function calculatePosition(
  targetDimensions: Pick<Rectangle, 'width' | 'height'>,
  config: LayoutConfig,
): Pick<Rectangle, 'x' | 'y'> {
  const { screen, cachedBounds, currentBounds } = config;
  const { workArea, workAreaSize } = screen;

  // If we have valid cached position that fits on screen, use it
  if (
    typeof cachedBounds?.x === 'number' &&
    typeof cachedBounds?.y === 'number' &&
    cachedBounds.x >= workArea.x &&
    cachedBounds.y >= workArea.y
  ) {
    // Verify the cached position still makes sense (window fits on screen)
    const fitsOnScreen =
      cachedBounds.x + targetDimensions.width <= workArea.x + workAreaSize.width &&
      cachedBounds.y + targetDimensions.height <= workArea.y + workAreaSize.height;

    if (fitsOnScreen) {
      return {
        x: cachedBounds.x,
        y: cachedBounds.y,
      };
    }
  }

  // If current position is valid and not at default/origin, adjust for size change
  const isAtOrigin = Math.abs(currentBounds.x - workArea.x) < 4 && Math.abs(currentBounds.y - workArea.y) < 4;
  const isOffscreen = currentBounds.x === -10000 || currentBounds.y === -10000;

  if (!isAtOrigin && !isOffscreen && isBoundsWithinDisplayById(currentBounds, screen.id)) {
    // Keep existing position, but adjust X to center horizontally if width changed
    return {
      x: Math.round(currentBounds.x + (currentBounds.width - targetDimensions.width) / 2),
      y: currentBounds.y,
    };
  }

  // Default: center on screen (horizontal center, 1/8 from top)
  return {
    x: Math.round(workArea.x + (workAreaSize.width - targetDimensions.width) / 2),
    y: Math.round(workArea.y + workAreaSize.height / 8),
  };
}

/**
 * Compute the complete layout geometry
 * Pure function - no side effects
 */
export function computeLayout(request: LayoutRequest, config: LayoutConfig): LayoutResponse {
  const dimensions = calculateDimensions(request, config);
  const position = calculatePosition(dimensions, config);

  const bounds: Rectangle = {
    ...position,
    ...dimensions,
  };

  // Ensure bounds fit on screen
  const { workArea, workAreaSize } = config.screen;

  // Clamp to screen bounds
  if (bounds.x < workArea.x) {
    bounds.x = workArea.x;
  }
  if (bounds.y < workArea.y) {
    bounds.y = workArea.y;
  }
  if (bounds.width > workAreaSize.width) {
    bounds.width = workAreaSize.width;
  }
  if (bounds.height > workAreaSize.height) {
    bounds.height = workAreaSize.height;
  }
  if (bounds.x + bounds.width > workArea.x + workAreaSize.width) {
    bounds.x = workArea.x + workAreaSize.width - bounds.width;
  }
  if (bounds.y + bounds.height > workArea.y + workAreaSize.height) {
    bounds.y = workArea.y + workAreaSize.height - bounds.height;
  }

  // Determine if we should show after layout
  const shouldShow = request.isInitialShow && !request.isVisible;

  // Build reason for debugging
  const reasonParts: string[] = [];
  if (request.isInitialShow) reasonParts.push('initial');
  if (request.forceDimensions?.width || request.forceDimensions?.height) reasonParts.push('forced');
  if (config.cachedBounds) reasonParts.push('cached');
  if (request.hasPreview) reasonParts.push('preview');

  return {
    requestId: request.requestId,
    bounds,
    shouldShow,
    reason: reasonParts.join('+') || 'standard',
  };
}

// ============================================================================
// Layout Engine State Machine
// ============================================================================

/**
 * Pending layout state for a prompt
 */
interface PendingLayout {
  request: LayoutRequest;
  resolveShow: () => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * The Layout Engine manages the layout lifecycle for prompts
 */
export class LayoutEngine {
  private pendingLayouts: Map<number, PendingLayout> = new Map();
  private readonly LAYOUT_TIMEOUT_MS = 500;

  constructor() {
    log.info('[LayoutEngine] Initialized');
  }

  /**
   * Process a layout request from the renderer
   */
  processLayoutRequest(prompt: KitPrompt, request: LayoutRequest): LayoutResponse {
    const logPrefix = `[LayoutEngine] pid=${request.pid}`;

    log.info(`${logPrefix} Processing layout request`, {
      requestId: request.requestId,
      ui: request.ui,
      contentHeight: request.contentHeight,
      isInitialShow: request.isInitialShow,
      isVisible: request.isVisible,
    });

    // Cancel any pending layout for this prompt
    this.cancelPendingLayout(request.pid);

    // Get configuration
    const config = this.getLayoutConfig(prompt, request);

    // Compute layout
    const response = computeLayout(request, config);

    log.info(`${logPrefix} Computed layout`, {
      requestId: response.requestId,
      bounds: response.bounds,
      shouldShow: response.shouldShow,
      reason: response.reason,
    });

    return response;
  }

  /**
   * Apply the layout response to a prompt
   */
  applyLayout(prompt: KitPrompt, response: LayoutResponse): void {
    const logPrefix = `[LayoutEngine] pid=${prompt.pid}`;

    if (prompt.window?.isDestroyed()) {
      log.warn(`${logPrefix} Window destroyed, cannot apply layout`);
      return;
    }

    log.info(`${logPrefix} Applying layout`, {
      requestId: response.requestId,
      bounds: response.bounds,
      shouldShow: response.shouldShow,
    });

    // Apply bounds
    prompt.setBounds(response.bounds, `LAYOUT_ENGINE:${response.reason}`);

    // Show window if needed
    if (response.shouldShow) {
      log.info(`${logPrefix} Showing window after layout`);
      prompt.showPrompt();
    }
  }

  /**
   * Request a layout update with "show after complete" guarantee
   * Returns a promise that resolves when the window is shown
   */
  async requestLayoutWithShow(prompt: KitPrompt, request: LayoutRequest): Promise<void> {
    return new Promise((resolve) => {
      const logPrefix = `[LayoutEngine] pid=${request.pid}`;

      // Set up pending layout with timeout
      const timeoutId = setTimeout(() => {
        log.warn(`${logPrefix} Layout timeout, showing anyway`);
        this.cancelPendingLayout(request.pid);
        prompt.showPrompt();
        resolve();
      }, this.LAYOUT_TIMEOUT_MS);

      this.pendingLayouts.set(request.pid, {
        request,
        resolveShow: () => {
          clearTimeout(timeoutId);
          resolve();
        },
        timeoutId,
      });

      // Process the layout
      const response = this.processLayoutRequest(prompt, request);

      // Apply the layout and resolve
      this.applyLayout(prompt, response);

      // Clear pending and resolve
      const pending = this.pendingLayouts.get(request.pid);
      if (pending) {
        this.pendingLayouts.delete(request.pid);
        pending.resolveShow();
      }
    });
  }

  /**
   * Cancel any pending layout for a prompt
   */
  private cancelPendingLayout(pid: number): void {
    const pending = this.pendingLayouts.get(pid);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingLayouts.delete(pid);
      log.info(`[LayoutEngine] Cancelled pending layout for pid=${pid}`);
    }
  }

  /**
   * Build layout configuration from current state
   */
  private getLayoutConfig(prompt: KitPrompt, request: LayoutRequest): LayoutConfig {
    const currentBounds = prompt.window?.getBounds() || { x: 0, y: 0, width: PROMPT.WIDTH.BASE, height: PROMPT.HEIGHT.BASE };

    // Get the appropriate screen
    let screen = getCurrentScreen();
    const boundsScreen = getCurrentScreenFromBounds(currentBounds);

    // If the current bounds are on a different screen but valid, use that screen
    if (boundsScreen.id !== screen.id && isBoundsWithinDisplayById(currentBounds, boundsScreen.id)) {
      screen = boundsScreen;
    }

    // Get cached bounds for this script
    let cachedBounds: Partial<Rectangle> | undefined;
    if (request.scriptPath) {
      const cacheKey = `${request.scriptPath}::${request.windowMode}`;
      cachedBounds = getPromptCache(cacheKey);
    }

    return {
      screen,
      cachedBounds,
      currentBounds,
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    for (const pending of this.pendingLayouts.values()) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingLayouts.clear();
    log.info('[LayoutEngine] Disposed');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let layoutEngineInstance: LayoutEngine | null = null;

export function getLayoutEngine(): LayoutEngine {
  if (!layoutEngineInstance) {
    layoutEngineInstance = new LayoutEngine();
  }
  return layoutEngineInstance;
}

export function disposeLayoutEngine(): void {
  if (layoutEngineInstance) {
    layoutEngineInstance.dispose();
    layoutEngineInstance = null;
  }
}

// ============================================================================
// Migration Helpers
// ============================================================================

/**
 * Convert ResizeData to LayoutRequest format
 * This helps with gradual migration from the old resize system
 */
export function resizeDataToLayoutRequest(
  resizeData: {
    id: string;
    pid: number;
    scriptPath: string;
    ui: UI;
    topHeight: number;
    mainHeight: number;
    footerHeight: number;
    hasPreview: boolean;
    hasPanel: boolean;
    isSplash: boolean;
    isMainScript: boolean;
    forceHeight?: number;
    forceWidth?: number;
    totalChoices: number;
    placeholderOnly: boolean;
    isWindow: boolean;
    justOpened: boolean;
  },
  isVisible: boolean,
): LayoutRequest {
  return {
    requestId: `resize-${resizeData.id}-${Date.now()}`,
    pid: resizeData.pid,
    promptId: resizeData.id,
    scriptPath: resizeData.scriptPath,
    ui: resizeData.ui,
    contentHeight: {
      top: resizeData.topHeight,
      main: resizeData.mainHeight,
      footer: resizeData.footerHeight,
    },
    hasPreview: resizeData.hasPreview,
    hasPanel: resizeData.hasPanel,
    isInitialShow: resizeData.justOpened && !isVisible,
    isVisible,
    isMainScript: resizeData.isMainScript,
    isSplash: resizeData.isSplash,
    forceDimensions: {
      width: resizeData.forceWidth,
      height: resizeData.forceHeight,
    },
    windowMode: resizeData.isWindow ? 'window' : 'panel',
    totalChoices: resizeData.totalChoices,
    placeholderOnly: resizeData.placeholderOnly,
  };
}
