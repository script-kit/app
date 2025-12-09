/**
 * Prompt Module - Polymorphic prompt classes for Script Kit
 *
 * This module provides:
 * - BasePrompt: Abstract base class with shared functionality
 * - ScriptPrompt: For user scripts (standard behavior)
 * - MainPrompt: For the app launcher (main menu with special initialization)
 * - createPrompt: Factory function to instantiate the correct type
 *
 * Class Hierarchy:
 *
 *                    BasePrompt (abstract)
 *                         |
 *           +-------------+-------------+
 *           |                           |
 *      ScriptPrompt                MainPrompt
 *    (user scripts)            (app launcher)
 *
 * This design eliminates isMainScript conditionals throughout the codebase
 * by using polymorphism - each prompt type knows its own behavior.
 */

import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import { BasePrompt } from './base-prompt';
import { MainPrompt } from './main-prompt';
import { ScriptPrompt } from './script-prompt';

// Re-export the prompt classes
export { BasePrompt } from './base-prompt';
export { MainPrompt } from './main-prompt';
export { ScriptPrompt } from './script-prompt';

// Re-export types and utilities from base-prompt
export type { ScriptTrigger, ScriptSource, SetScriptMeta } from './base-prompt';
export {
  getCurrentScreenFromMouse,
  getAllScreens,
  getCurrentScreenPromptCache,
  pointOnMouseScreen,
} from './base-prompt';

/**
 * Union type for all prompt classes.
 * For backward compatibility, this includes BasePrompt since existing code
 * uses `new KitPrompt()` which now creates a BasePrompt.
 */
export type KitPrompt = BasePrompt | MainPrompt | ScriptPrompt;

/**
 * Factory function to create the appropriate prompt type.
 *
 * @param scriptPath - Optional script path to determine prompt type.
 *                     If it matches the main script path, creates MainPrompt.
 *                     Otherwise creates ScriptPrompt.
 * @returns The appropriate prompt instance
 */
export function createPrompt(scriptPath?: string): KitPrompt {
  const mainScriptPath = getMainScriptPath();

  // If scriptPath matches main script path, or no script (idle main menu)
  if (scriptPath === mainScriptPath || !scriptPath) {
    return new MainPrompt();
  }

  return new ScriptPrompt();
}

/**
 * Type guard to check if a prompt is MainPrompt
 */
export function isMainPrompt(prompt: BasePrompt): prompt is MainPrompt {
  return prompt.isMainMenu;
}

/**
 * Type guard to check if a prompt is ScriptPrompt
 */
export function isScriptPrompt(prompt: BasePrompt): prompt is ScriptPrompt {
  return !prompt.isMainMenu;
}
