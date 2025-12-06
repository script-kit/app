import { describe, expect, it } from 'vitest';
import type { Choice, ScoredChoice } from '../../../../shared/types';
import { deriveActualChoice, hasRaceCondition } from '../enter-helpers';

describe('enter-helpers', () => {
  // Helper to create a scored choice
  const createScoredChoice = (id: string, name: string): ScoredChoice => ({
    item: { id, name },
    score: 100,
    matches: {},
  });

  // Helper to create a choice
  const createChoice = (id: string, name: string): Choice => ({
    id,
    name,
  });

  describe('deriveActualChoice', () => {
    const scoredChoices: ScoredChoice[] = [
      createScoredChoice('1', 'First'),
      createScoredChoice('2', 'Second'),
      createScoredChoice('3', 'Third'),
    ];

    it('should return the choice at the given index when index is valid', () => {
      const result = deriveActualChoice(0, scoredChoices, undefined);
      expect(result?.id).toBe('1');
      expect(result?.name).toBe('First');
    });

    it('should return the correct choice for any valid index', () => {
      expect(deriveActualChoice(0, scoredChoices, undefined)?.id).toBe('1');
      expect(deriveActualChoice(1, scoredChoices, undefined)?.id).toBe('2');
      expect(deriveActualChoice(2, scoredChoices, undefined)?.id).toBe('3');
    });

    it('should return focusedChoice when index is negative', () => {
      const focusedChoice = createChoice('fallback', 'Fallback');
      const result = deriveActualChoice(-1, scoredChoices, focusedChoice);
      expect(result?.id).toBe('fallback');
    });

    it('should return focusedChoice when index is out of bounds', () => {
      const focusedChoice = createChoice('fallback', 'Fallback');
      const result = deriveActualChoice(10, scoredChoices, focusedChoice);
      expect(result?.id).toBe('fallback');
    });

    it('should return undefined when index is invalid and no focusedChoice', () => {
      const result = deriveActualChoice(-1, scoredChoices, undefined);
      expect(result).toBeUndefined();
    });

    it('should return choice from index even when focusedChoice is stale (race condition scenario)', () => {
      // This is the key test case - simulates the race condition
      // focusedChoice says "Second" but index says "First"
      const staleChoice = createChoice('2', 'Second');
      const result = deriveActualChoice(0, scoredChoices, staleChoice);

      // Should use the choice at index 0 ("First"), not the stale focusedChoice
      expect(result?.id).toBe('1');
      expect(result?.name).toBe('First');
    });

    it('should handle empty scoredChoices array', () => {
      const focusedChoice = createChoice('fallback', 'Fallback');
      const result = deriveActualChoice(0, [], focusedChoice);
      expect(result?.id).toBe('fallback');
    });

    it('should handle scoredChoice with undefined item', () => {
      const choicesWithUndefined: ScoredChoice[] = [
        { item: undefined as any, score: 100, matches: {} },
      ];
      const focusedChoice = createChoice('fallback', 'Fallback');
      const result = deriveActualChoice(0, choicesWithUndefined, focusedChoice);
      // Should return undefined because scoredChoices[0]?.item is undefined
      expect(result).toBeUndefined();
    });
  });

  describe('hasRaceCondition', () => {
    it('should return true when IDs differ', () => {
      const actual = createChoice('1', 'First');
      const focused = createChoice('2', 'Second');
      expect(hasRaceCondition(actual, focused)).toBe(true);
    });

    it('should return false when IDs match', () => {
      const actual = createChoice('1', 'First');
      const focused = createChoice('1', 'First');
      expect(hasRaceCondition(actual, focused)).toBe(false);
    });

    it('should return false when actualChoice is undefined', () => {
      const focused = createChoice('1', 'First');
      expect(hasRaceCondition(undefined, focused)).toBe(false);
    });

    it('should return false when focusedChoice is undefined', () => {
      const actual = createChoice('1', 'First');
      expect(hasRaceCondition(actual, undefined)).toBe(false);
    });

    it('should return false when both are undefined', () => {
      expect(hasRaceCondition(undefined, undefined)).toBe(false);
    });

    it('should detect race condition with same name but different IDs', () => {
      // Edge case: same display name but different IDs
      const actual = createChoice('id-a', 'Same Name');
      const focused = createChoice('id-b', 'Same Name');
      expect(hasRaceCondition(actual, focused)).toBe(true);
    });
  });
});
