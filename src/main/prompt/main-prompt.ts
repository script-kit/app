/**
 * MainPrompt - Prompt class for the app launcher (main menu)
 *
 * This class handles the main Script Kit launcher with special behavior:
 * - initMainBounds for proper sizing
 * - initMainChoices, initMainPreview, initMainShortcuts, initMainFlags
 * - Special blur handling that hides and removes process
 * - Cached bounds for resize
 */

import { PROMPT } from '@johnlindquist/kit/core/enum';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import type { Rectangle } from 'electron';
import {
  initMainChoicesImpl,
  initMainFlagsImpl,
  initMainPreviewImpl,
  initMainShortcutsImpl,
} from '../prompt.init-main';
import { getCurrentScreenPromptCache } from '../prompt.screen-utils';
import { processWindowCoordinator } from '../process-window-coordinator';
import { processes } from '../process';
import type { ResizeData } from '../../shared/types';
import { BasePrompt } from './base-prompt';

export class MainPrompt extends BasePrompt {
  /**
   * MainPrompt is always the main menu.
   */
  get isMainMenu(): boolean {
    return true;
  }

  /**
   * Initialize bounds specifically for the main menu.
   * Uses cached bounds from the main script path.
   */
  initMainBounds(): void {
    const cached = getCurrentScreenPromptCache(getMainScriptPath());
    if (!cached.height || cached.height < PROMPT.HEIGHT.BASE) {
      cached.height = PROMPT.HEIGHT.BASE;
    }
    this.setBounds(cached as Partial<Rectangle>, 'initMainBounds');
  }

  /**
   * Initialize main menu choices from cache.
   */
  initMainChoices(): void {
    initMainChoicesImpl(this as any);
  }

  /**
   * Initialize main menu preview from cache.
   */
  initMainPreview(): void {
    initMainPreviewImpl(this as any);
  }

  /**
   * Initialize main menu shortcuts from cache.
   */
  initMainShortcuts(): void {
    initMainShortcutsImpl(this as any);
  }

  /**
   * Initialize main menu flags from cache.
   */
  initMainFlags(): void {
    initMainFlagsImpl(this as any);
  }

  /**
   * Initialize the full main menu prompt with all components.
   */
  initMainPrompt = (reason = 'unknown') => {
    this.logInfo(
      `initMainPrompt CALLED: reason="${reason}", scriptPath="${this.scriptPath}"`,
    );
    this.initPromptData();
    this.initMainChoices();
    this.initMainPreview();
    this.initMainShortcuts();
    this.initMainFlags();
    this.initTheme();
    this.logInfo(`Prompt init: ${reason}`);
    this.initPrompt();
  };

  /**
   * Handle blur specifically for main menu.
   * Main menu hides and removes process on blur (unless prevented).
   * Returns true if blur was handled, false to continue with default behavior.
   */
  protected handleBlurForMainMenu(blurOpId: string): boolean {
    if (!this.mainMenuPreventCloseOnBlur) {
      // Don't close main menu if DevTools are being opened
      if (this.devToolsOpening) {
        this.logInfo('Main menu blur ignored - DevTools are opening');
        processWindowCoordinator.completeOperation(blurOpId);
        return true;
      }
      this.logInfo('Main script. Hiding and removing process');
      this.hideAndRemoveProcess();
      processWindowCoordinator.completeOperation(blurOpId);
      return true;
    }
    return false;
  }

  /**
   * Get cached bounds for main menu resize.
   */
  protected getCachedBoundsForResize(resizeData: ResizeData): Partial<Rectangle> | undefined {
    if (resizeData.isMainScript) {
      return getCurrentScreenPromptCache(getMainScriptPath());
    }
    return undefined;
  }

  /**
   * Reset state for main menu - reinitialize all main menu components.
   */
  protected onResetState(): void {
    this.initMainPreview();
    this.initMainShortcuts();
    this.initMainChoices();
    this.initMainFlags();
  }
}
