import type { Choice, ScoredChoice } from '../../../shared/types';

/**
 * Derives the actual choice to use when submitting, resolving the race condition
 * between focusedChoiceAtom and indexAtom.
 *
 * The indexAtom is updated by keyboard navigation (useKeyIndex) and is always
 * accurate. However, focusedChoiceAtom may be stale due to async updates.
 * This function ensures we always use the choice at the current index.
 *
 * @param index - The current index from indexAtom
 * @param scoredChoices - The current scored choices array
 * @param focusedChoice - The current focused choice (may be stale)
 * @returns The actual choice to use for submission
 */
export function deriveActualChoice(
  index: number,
  scoredChoices: ScoredChoice[],
  focusedChoice: Choice | undefined,
): Choice | undefined {
  // If index is valid and within bounds, use the choice at that index
  // This is the source of truth for what the user has selected
  if (index >= 0 && index < scoredChoices.length) {
    return scoredChoices[index]?.item;
  }
  // Fallback to focusedChoice if index is invalid
  return focusedChoice;
}

/**
 * Checks if there's a race condition between the focused choice and the
 * choice at the current index.
 *
 * @param actualChoice - The choice derived from scoredChoices[index]
 * @param focusedChoice - The choice from focusedChoiceAtom
 * @returns True if there's a mismatch (race condition detected)
 */
export function hasRaceCondition(
  actualChoice: Choice | undefined,
  focusedChoice: Choice | undefined,
): boolean {
  return !!(actualChoice && focusedChoice && actualChoice.id !== focusedChoice.id);
}
