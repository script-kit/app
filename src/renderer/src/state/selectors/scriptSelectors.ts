import { atom } from 'jotai';
import { isMainScriptAtom } from '../shared-atoms';
import { _inputAtom } from '../atoms/input';

/**
 * Selector atoms related to script state.
 * These are placed here to avoid circular dependencies.
 */

// Checks if we're on the main script with no input
export const isMainScriptInitialAtom = atom<boolean>((g) => {
  return g(isMainScriptAtom) && g(_inputAtom) === '';
});