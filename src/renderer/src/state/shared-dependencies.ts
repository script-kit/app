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
  // Foundation atoms
  pidAtom,
  channelAtom,
  uiAtom,
  openAtom,
  
  // Input atoms
  _inputAtom,
  inputAtom,
  _inputChangedAtom,
  
  // Core state atoms
  promptActiveAtom,
  submittedAtom,
  processingAtom,
  
  // Editor atoms
  editorAppendAtom,
  
  // Hint/placeholder atoms
  hintAtom,
  
  // Shortcut atoms
  shortcutsAtom,
  enterLastPressedAtom,
  
  // Choice atoms
  selectedChoicesAtom,
  choices,
  focusedChoiceAtom,
  
  // Editor history
  editorHistory,
} from '../jotai';
