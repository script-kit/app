/**
 * Shared atoms that are used by multiple modules.
 * These are placed here to avoid circular dependencies.
 */
import { atom } from 'jotai';

// Indicates if the current script is the main script
export const isMainScriptAtom = atom(false);