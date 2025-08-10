/**
 * Facade for jotai.ts exports.
 * This provides a migration path to gradually move atoms out of jotai.ts
 * while maintaining backward compatibility.
 * 
 * Strategy:
 * 1. Re-export everything from jotai.ts initially
 * 2. Gradually move atoms to feature-specific files
 * 3. Update imports to use this facade
 * 4. Eventually remove jotai.ts
 */

// Re-export everything from jotai.ts for backward compatibility
export * from '../../jotai';

// Override with extracted atoms - these take precedence
export {
  appendInputAtom,
  valueInvalidAtom,
  preventSubmitAtom,
  toggleSelectedChoiceAtom,
  toggleAllSelectedChoicesAtom,
} from '../atoms/utilities';

export {
  exitAtom,
  escapeAtom,
  blurAtom,
  resizeCompleteAtom,
  _open,
} from '../atoms/lifecycle';

export { colorAtom } from '../atoms/theme-utils';

export {
  sendShortcutAtom,
  sendActionAtom,
  triggerKeywordAtom,
  getEditorHistoryAtom,
} from '../atoms/actions-utils';

/**
 * Migration tracking:
 * 
 * ✅ Extracted to other files:
 * - Terminal atoms -> state/atoms/terminal.ts
 * - UI atoms -> state/atoms/ui.ts
 * - Preview atoms -> state/atoms/preview.ts
 * - Theme atoms -> state/atoms/theme.ts
 * - Actions atoms -> state/atoms/actions.ts
 * 
 * 🚧 Partially extracted:
 * - Choice atoms -> state/atoms/choices.ts (some still in jotai.ts)
 * - Input atoms -> state/atoms/input.ts (some still in jotai.ts)
 * 
 * ❌ Still in jotai.ts (high risk to move):
 * - promptDataAtom (complex dependencies)
 * - uiAtom (complex logic)
 * - scoredChoicesAtom (complex filtering)
 * - submitValueAtom (many dependencies)
 * - resize logic (DOM dependencies)
 * - channel logic (IPC dependencies)
 */