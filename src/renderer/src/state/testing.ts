import type { Getter, Setter } from 'jotai';
import { resetPromptState } from './reset';

// Simple wrapper for tests and diagnostics
export function resetAllState(g: Getter, s: Setter) {
  resetPromptState(g, s);
}
