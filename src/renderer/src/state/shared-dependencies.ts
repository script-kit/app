/**
 * Shared dependencies module.
 * This module re-exports core atoms that are needed by extracted atom files.
 * This breaks the circular dependency cycle by providing a single import point
 * for commonly used atoms without creating circular imports with jotai.ts.
 *
 * IMPORTANT: Only export atoms from jotai.ts that are:
 * 1. Frequently used by other atoms
 * 2. Have stable interfaces
 * 3. Are unlikely to be extracted themselves
 */

// Core atoms that many other atoms depend on
export {
  // Input atoms
  _inputAtom,
  _inputChangedAtom,
  channelAtom,
  choices,
  // Editor atoms
  editorAppendAtom,
  // Editor history
  editorHistory,
  enterLastPressedAtom,
  focusedChoiceAtom,
  // Hint/placeholder atoms
  hintAtom,
  inputAtom,
  loadingAtom,
  openAtom,
  // Foundation atoms
  pidAtom,
  processingAtom,
  // Core state atoms
  promptActiveAtom,
  // Choice atoms
  selectedChoicesAtom,
  // Shortcut atoms
  shortcutsAtom,
  submittedAtom,
  uiAtom,
} from '../jotai';
