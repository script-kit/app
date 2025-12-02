import { createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';
import { noChoice } from '../../../../../shared/defaults';
import type { ScoredChoice } from '../../../../../shared/types';
import {
  _focused,
  allSkipAtom,
  choices,
  choicesAtom,
  choicesConfig,
  choicesReadyAtom,
  currentChoiceHeightsAtom,
  defaultChoiceIdAtom,
  defaultValueAtom,
  filteredChoicesIdAtom,
  hasSkipAtom,
  prevIndexAtom,
  prevScoredChoicesIdsAtom,
} from '../choices';

describe('Choices Atoms', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  describe('Core Choices State', () => {
    it('should initialize with empty choices', () => {
      const result = store.get(choices);
      expect(result).toEqual([]);
    });

    it('should initialize choicesReady as false', () => {
      const result = store.get(choicesReadyAtom);
      expect(result).toBe(false);
    });

    it('should update choices and derive choicesAtom', () => {
      const testChoices: ScoredChoice[] = [
        { item: { id: '1', name: 'Choice 1' }, score: 100, matches: {} },
        { item: { id: '2', name: 'Choice 2' }, score: 90, matches: {} },
      ];

      store.set(choices, testChoices);

      const storedChoices = store.get(choices);
      expect(storedChoices).toEqual(testChoices);

      const derivedChoices = store.get(choicesAtom);
      expect(derivedChoices).toEqual([
        { id: '1', name: 'Choice 1' },
        { id: '2', name: 'Choice 2' },
      ]);
    });
  });

  describe('Choice Configuration', () => {
    it('should have default preload config', () => {
      const config = store.get(choicesConfig);
      expect(config).toEqual({ preload: false });
    });

    it('should update choices config', () => {
      store.set(choicesConfig, { preload: true });
      const config = store.get(choicesConfig);
      expect(config).toEqual({ preload: true });
    });
  });

  describe('Choice Heights', () => {
    it('should initialize with empty heights array', () => {
      const heights = store.get(currentChoiceHeightsAtom);
      expect(heights).toEqual([]);
    });

    it('should update choice heights', () => {
      const testHeights = [50, 60, 55, 70];
      store.set(currentChoiceHeightsAtom, testHeights);
      const heights = store.get(currentChoiceHeightsAtom);
      expect(heights).toEqual(testHeights);
    });
  });

  describe('Choice Selection', () => {
    it('should have empty default value', () => {
      const defaultValue = store.get(defaultValueAtom);
      expect(defaultValue).toBe('');
    });

    it('should have empty default choice ID', () => {
      const defaultId = store.get(defaultChoiceIdAtom);
      expect(defaultId).toBe('');
    });

    it('should initialize prev index as 0', () => {
      const prevIndex = store.get(prevIndexAtom);
      expect(prevIndex).toBe(0);
    });
  });

  describe('Skip State', () => {
    it('should initialize skip states as false', () => {
      expect(store.get(hasSkipAtom)).toBe(false);
      expect(store.get(allSkipAtom)).toBe(false);
    });

    it('should update skip states', () => {
      store.set(hasSkipAtom, true);
      expect(store.get(hasSkipAtom)).toBe(true);

      store.set(allSkipAtom, true);
      expect(store.get(allSkipAtom)).toBe(true);
    });
  });

  describe('Focused Choice', () => {
    it('should initialize with noChoice', () => {
      const focused = store.get(_focused);
      expect(focused).toEqual(noChoice);
    });

    it('should update focused choice', () => {
      const testChoice = { id: 'test', name: 'Test Choice' };
      store.set(_focused, testChoice);
      const focused = store.get(_focused);
      expect(focused).toEqual(testChoice);
    });

    it('should convert null to noChoice for safety', () => {
      store.set(_focused, null);
      const focused = store.get(_focused);
      // The atom implementation converts null to noChoice for safety
      expect(focused).toEqual(noChoice);
    });
  });

  describe('Filtered Choices ID', () => {
    it('should track filtered choices ID', () => {
      expect(store.get(filteredChoicesIdAtom)).toBe(0);

      store.set(filteredChoicesIdAtom, 5);
      expect(store.get(filteredChoicesIdAtom)).toBe(5);
    });
  });

  describe('Previous Scored Choices IDs', () => {
    it('should track previous choice IDs', () => {
      expect(store.get(prevScoredChoicesIdsAtom)).toEqual([]);

      const ids = ['id1', 'id2', 'id3'];
      store.set(prevScoredChoicesIdsAtom, ids);
      expect(store.get(prevScoredChoicesIdsAtom)).toEqual(ids);
    });
  });
});
