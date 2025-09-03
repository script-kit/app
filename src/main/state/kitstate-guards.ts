import { kitState } from '../state';
import { createLogger } from '../log-utils';

const log = createLogger('kitstate-guards');

// Central allowlist for fields that child processes may mutate via SET_KIT_STATE
export const MUTABLE_KITSTATE_KEYS = new Set<string>([
  'resizePaused',
  'hiddenByUser',
  'tabIndex',
  'shortcutsPaused',
  'snippet',
  'typedText',
  'tempTheme',
  'appearance',
  'status',
  'shortcutPressed',
]);

export type KitStatePatch = Record<string, unknown> | undefined | null;

/**
 * Applies a safe subset of incoming patch keys to kitState based on MUTABLE_KITSTATE_KEYS.
 */
export function applyKitStatePatch(patch: KitStatePatch) {
  if (!patch || typeof patch !== 'object') return;
  for (const [key, value] of Object.entries(patch)) {
    if (MUTABLE_KITSTATE_KEYS.has(key)) {
      log.info(`Setting kitState.${key} to`, value);
      (kitState as any)[key] = value as any;
    } else {
      log.warn(`Blocked attempt to set disallowed kitState key: ${key}`);
    }
  }
}

