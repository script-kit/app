/**
 * ScriptPrompt - Prompt class for user scripts
 *
 * This class handles standard user scripts with default behavior.
 * It does NOT have the special main menu initialization logic.
 */

import { BasePrompt } from './base-prompt';

export class ScriptPrompt extends BasePrompt {
  /**
   * ScriptPrompt is never the main menu.
   */
  get isMainMenu(): boolean {
    return false;
  }

  /**
   * ScriptPrompt does not initialize main bounds.
   * This is a no-op for user scripts.
   */
  initMainBounds(): void {
    // No-op for script prompts
    this.logInfo('initMainBounds called on ScriptPrompt - no-op');
  }

  /**
   * ScriptPrompt does not initialize main choices.
   * This is a no-op for user scripts.
   */
  initMainChoices(): void {
    // No-op for script prompts
  }

  /**
   * ScriptPrompt does not initialize main preview.
   * This is a no-op for user scripts.
   */
  initMainPreview(): void {
    // No-op for script prompts
  }

  /**
   * ScriptPrompt does not initialize main shortcuts.
   * This is a no-op for user scripts.
   */
  initMainShortcuts(): void {
    // No-op for script prompts
  }

  /**
   * ScriptPrompt does not initialize main flags.
   * This is a no-op for user scripts.
   */
  initMainFlags(): void {
    // No-op for script prompts
  }

  /**
   * ScriptPrompt does not have special blur handling for main menu.
   * Returns false to use default blur behavior.
   */
  protected handleBlurForMainMenu(_blurOpId: string): boolean {
    return false;
  }

  /**
   * ScriptPrompt does not need to reset main menu state.
   */
  protected onResetState(): void {
    // No main menu state to reset for script prompts
  }
}
