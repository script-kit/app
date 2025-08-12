/**
 * Channel communication utility atoms.
 * Note: Most atoms have been moved to more specific files:
 * - changeAtom -> remains in jotai.ts (returns function)
 * - runMainScriptAtom -> remains in jotai.ts (returns function)
 * - getEditorHistoryAtom -> actions-utils.ts
 * - colorAtom -> remains in jotai.ts (returns function)
 * - triggerKeywordAtom -> actions-utils.ts
 * - sendShortcutAtom -> actions-utils.ts
 * - sendActionAtom -> actions-utils.ts
 * 
 * This file is kept for backward compatibility but should be removed in future refactoring.
 */

// Re-export from the correct locations
export { 
  sendShortcutAtom, 
  sendActionAtom, 
  triggerKeywordAtom,
  getEditorHistoryAtom 
} from './actions-utils';