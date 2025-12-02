/**
 * Flag Freshness Tracking
 *
 * This module prevents stale flags from being resubmitted. Each flag selection
 * is tracked with a session key (promptId::pid) and an incrementing version.
 * When a flag is submitted, it's marked as "consumed" to prevent re-submission.
 *
 * Session scoping ensures flags from one prompt don't leak to another.
 */

/**
 * Metadata for tracking flag selection state within a prompt session.
 * @property sessionKey - Unique identifier for the prompt session (promptId::pid)
 * @property version - Incrementing counter for each flag selection
 */
export type FlagMeta = {
  sessionKey: string;
  version: number;
};

export type FlagFreshnessInput = {
  flag?: string;
  overlayOpen: boolean;
  flagMeta: FlagMeta;
  lastConsumed: FlagMeta;
};

/**
 * Determine if a flag is "fresh" (not yet consumed) and should be included in submission.
 *
 * Decision flow:
 * 1. No flag → not fresh (nothing to include)
 * 2. Overlay is open → always fresh (user is actively selecting)
 * 3. No valid flagMeta → not fresh (no tracked selection)
 * 4. Never consumed before → fresh (first submission)
 * 5. Different session or version → fresh (new selection since last consumption)
 *
 * This prevents the same flag from being submitted twice when the user presses
 * Enter multiple times quickly, while still allowing new flag selections.
 *
 * @param input - The flag state to evaluate
 * @returns true if the flag should be included in the submission
 */
export const hasFreshFlag = ({ flag, overlayOpen, flagMeta, lastConsumed }: FlagFreshnessInput): boolean => {
  // No flag value → nothing to include
  if (!flag) return false;

  // Overlay is open → user is actively selecting, always fresh
  if (overlayOpen) return true;

  // No valid flag metadata → can't verify freshness
  if (!flagMeta?.sessionKey || !flagMeta.version) return false;

  // Never consumed before → first submission is fresh
  if (!lastConsumed?.sessionKey && !lastConsumed?.version) {
    return true;
  }

  // Fresh if session or version differs from last consumed
  return flagMeta.sessionKey !== lastConsumed.sessionKey || flagMeta.version !== lastConsumed.version;
};
