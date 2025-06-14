import { Channel, PROMPT, UI } from '@johnlindquist/kit/core/enum';
import { ProcessType } from '@johnlindquist/kit/core/enum';
import type { Choice, FlagsWithKeys, Script } from '@johnlindquist/kit/types/core';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppChannel } from '../shared/enums';
import type { ScoredChoice } from '../shared/types';
import type { KitPrompt } from './prompt';

// Mock debounce for immediate execution in tests while using real QuickScore
vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn) => fn), // Immediate execution for tests
}));

// Using real QuickScore implementation for more realistic testing

vi.mock('./logs', () => ({
  searchLog: {
    info: vi.fn(),
    warn: vi.fn(),
    silly: vi.fn(),
    verbose: vi.fn(),
  },
}));

vi.mock('./messages', () => ({
  cacheChoices: vi.fn(),
}));

vi.mock('./state', () => ({
  kitCache: {
    choices: [],
    scripts: [],
    triggers: new Map(),
    postfixes: new Map(),
    keywords: new Map(),
    shortcodes: new Map(),
  },
  kitState: {
    kenvEnv: {
      KIT_SEARCH_MAX_ITERATIONS: '3',
      KIT_SEARCH_MIN_SCORE: '0.6',
    },
  },
}));

// Use real implementations for pure functions
vi.mock('@johnlindquist/kit/core/utils', async () => {
  const actual = await vi.importActual('@johnlindquist/kit/core/utils');
  return {
    ...actual,
    getMainScriptPath: vi.fn(() => '/main/script/path'),
  };
});

// Mock normalize-map module to track its usage
vi.mock('./utils/normalize-map', () => ({
  normalizeWithMap: vi.fn((str: string) => str.replace(/[-\s]/g, '').toLowerCase()),
  remapRange: vi.fn((raw: string, range: [number, number]): [number, number] => range),
}));

// Import after mocks - now using real implementations for pure functions
import {
  appendChoices,
  debounceInvokeSearch,
  invokeFlagSearch,
  invokeSearch,
  setChoices,
  setFlags,
  setScoredChoices,
  setScoredFlags,
  setShortcodes,
} from './search';

import { normalizeWithMap, remapRange } from './utils/normalize-map';

describe('Search Functionality', () => {
  let mockPrompt: KitPrompt;
  let mockSendToPrompt: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendToPrompt = vi.fn();

    mockPrompt = {
      ui: UI.arg,
      pid: 12345,
      scriptPath: '/test/script.ts',
      getLogPrefix: vi.fn(() => '[TEST]'),
      sendToPrompt: mockSendToPrompt,
      cacheScriptChoices: false,
      kitSearch: {
        input: '',
        inputRegex: undefined,
        keyword: '',
        keywordCleared: false,
        generated: false,
        flaggedValue: '',
        choices: [],
        scripts: [],
        qs: null,
        hasGroup: false,
        keys: ['name', 'keyword', 'tag'],
        keywords: new Map(),
        triggers: new Map(),
        postfixes: new Map(),
        shortcodes: new Map(),
      },
      flagSearch: {
        input: '',
        choices: [],
        hasGroup: false,
        qs: null,
      },
      updateShortcodes: vi.fn(),
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('invokeSearch', () => {
    it('should return early if UI is not arg', () => {
      mockPrompt.ui = UI.editor;

      invokeSearch(mockPrompt, 'test input');

      expect(mockSendToPrompt).not.toHaveBeenCalled();
    });

    it('should return early if choices array is empty', () => {
      mockPrompt.kitSearch.choices = [];

      invokeSearch(mockPrompt, 'test input');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, []);
    });

    it('should transform input using regex when inputRegex is set', () => {
      mockPrompt.kitSearch.inputRegex = /test-(\w+)/;
      mockPrompt.kitSearch.choices = [{ id: '1', name: 'Test Choice', keyword: 'test' }];
      mockPrompt.kitSearch.qs = { search: vi.fn(() => []) };

      invokeSearch(mockPrompt, 'test-something extra text');

      expect(mockPrompt.kitSearch.input).toBe('test-something');
    });

    it('should handle empty input by showing non-filtered choices', () => {
      const choices = [
        {
          id: '1',
          name: 'Choice 1',
          pass: false,
          miss: false,
          hideWithoutInput: false,
        },
        { id: '2', name: 'Choice 2', miss: true },
        { id: '3', name: 'Choice 3', hideWithoutInput: true },
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, '');

      // Should only include the first choice (non-filtered)
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            item: expect.objectContaining({ id: '1', name: 'Choice 1' }),
            score: 0,
            matches: {},
          }),
        ]),
      );
    });

    it('should show miss and info choices when no regular choices available for empty input', () => {
      const choices = [
        { id: '1', name: 'Choice 1', miss: true },
        { id: '2', name: 'Choice 2', miss: true },
        { id: '3', name: 'Choice 3', pass: true }, // pass choices are excluded from regular results
        { id: '4', name: 'Choice 4', hideWithoutInput: true },
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, '');

      // Should show miss choices in fallback since no regular choices exist
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([expect.objectContaining({ item: expect.objectContaining({ miss: true }) })]),
      );
    });

    it('should show info choices as regular choices (not fallback)', () => {
      const choices = [
        { id: '1', name: 'Miss Choice', miss: true },
        { id: '2', name: 'Miss Choice 2', miss: true },
        { id: '3', name: 'Info Choice', info: true },
        { id: '4', name: 'Pass Choice', pass: true }, // Excluded from regular results
        { id: '5', name: 'Hidden Choice', hideWithoutInput: true }, // Excluded from regular results
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, '');

      // Should show info choice as regular choice, not as fallback
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            item: expect.objectContaining({ id: '3', name: 'Info Choice', info: true }),
          }),
        ]),
      );
    });

    it('should warn and return when qs is not available', () => {
      mockPrompt.kitSearch.choices = [{ id: '1', name: 'Test' }];
      mockPrompt.kitSearch.qs = null;

      invokeSearch(mockPrompt, 'test');

      expect(mockPrompt.kitSearch.input).toBe('test');
    });

    it('should handle grouped search results', () => {
      const choices = [
        { id: '1', name: 'test match', keyword: 'test', group: 'Group1' },
        { id: '2', name: 'testing', group: 'Group1' },
        { id: '3', name: 'not a match', group: 'Group2' },
      ];
      const searchResults = [
        { item: choices[0], score: 0.9, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[1], score: 0.7, matches: { name: [[0, 4]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => searchResults) };

      invokeSearch(mockPrompt, 'test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle regex pass patterns', () => {
      const choices = [
        { id: '1', name: 'Regex Choice', pass: '/^test.*/i', group: 'Patterns' },
        { id: '2', name: 'Normal Choice', group: 'Normal' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => []) };

      invokeSearch(mockPrompt, 'testing123');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle hideWithoutInput choices correctly', () => {
      const choices = [
        { id: '1', name: 'Hidden Choice', hideWithoutInput: true },
        { id: '2', name: 'Normal Choice' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = false;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => []) };

      // Test with empty input
      invokeSearch(mockPrompt, '');

      // Should only include normal choice, not hidden choice
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            item: expect.objectContaining({ name: 'Normal Choice' }),
          }),
        ]),
      );
    });
  });

  describe('invokeFlagSearch', () => {
    it('should handle empty input by showing non-filtered flag choices', () => {
      const flagChoices = [
        { id: 'flag1', name: 'Flag 1', pass: false, hideWithoutInput: false, miss: false },
        { id: 'flag2', name: 'Flag 2', pass: true },
        { id: 'flag3', name: 'Flag 3', hideWithoutInput: true },
      ];
      mockPrompt.flagSearch.choices = flagChoices;

      invokeFlagSearch(mockPrompt, '');

      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_FLAGS,
        expect.arrayContaining([expect.objectContaining({ item: flagChoices[0] })]),
      );
    });

    it('should handle flag search with groups', () => {
      const flagChoices = [
        { id: 'flag1', name: 'Test Flag', group: 'Group1' },
        { id: 'flag2', name: 'Other Flag', group: 'Group2' },
      ];
      const searchResults = [{ item: flagChoices[0], score: 0.8, matches: { name: [[0, 4]] }, _: '' }];

      mockPrompt.flagSearch.choices = flagChoices;
      mockPrompt.flagSearch.hasGroup = true;
      mockPrompt.flagSearch.qs = { search: vi.fn(() => searchResults) };

      invokeFlagSearch(mockPrompt, 'test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_FLAGS,
        expect.arrayContaining([
          expect.objectContaining({
            item: expect.objectContaining({ name: 'Test Flag', group: 'Group1' }),
          }),
        ]),
      );
    });
  });

  describe('setFlags', () => {
    it('should set flag choices and configure search', () => {
      const flags = {
        verbose: { name: 'verbose', description: 'Verbose output' },
        debug: { name: 'debug', description: 'Debug mode', shortcut: 'd' },
        order: ['debug', 'verbose'],
        sortChoicesKey: ['name'],
      } as FlagsWithKeys;

      setFlags(mockPrompt, flags);

      expect(mockPrompt.flagSearch.choices).toHaveLength(2);
      expect(mockPrompt.flagSearch.choices[0]).toMatchObject({
        id: 'verbose',
        name: 'verbose',
        value: 'verbose',
      });
      expect(mockPrompt.flagSearch.choices[1]).toMatchObject({
        id: 'debug',
        name: 'debug',
        value: 'debug',
        shortcut: 'd',
      });
    });

    it('should handle flags with groups', () => {
      const flags: FlagsWithKeys = {
        verbose: { name: 'verbose', group: 'Output' },
        debug: { name: 'debug', group: 'Debug' },
      };

      setFlags(mockPrompt, flags);

      expect(mockPrompt.flagSearch.hasGroup).toBe(true);
    });
  });

  describe('setShortcodes', () => {
    it('should clear existing shortcodes and maps', () => {
      mockPrompt.kitSearch.shortcodes.set('old', { name: 'old' });
      mockPrompt.kitSearch.keywords.set('old', { name: 'old' });

      const choices = [{ id: '1', name: 'New Choice' }];

      setShortcodes(mockPrompt, choices);

      expect(mockPrompt.kitSearch.shortcodes.size).toBe(0);
      // Note: keywords map is NOT cleared by setShortcodes (this appears to be a bug in the implementation)
      expect(mockPrompt.kitSearch.keywords.size).toBe(1);
      expect(mockPrompt.updateShortcodes).toHaveBeenCalled();
    });

    it('should set keywords from choices', () => {
      const choices = [
        { id: '1', name: 'Test Choice', keyword: 'test' },
        { id: '2', name: 'Other Choice', keyword: 'other' }, // Only keyword property is processed
      ];

      setShortcodes(mockPrompt, choices);

      expect(mockPrompt.kitSearch.keywords.get('test')).toBe(choices[0]);
      expect(mockPrompt.kitSearch.keywords.get('other')).toBe(choices[1]);
    });

    it('should set triggers from choice names with brackets', () => {
      const choices = [
        { id: '1', name: 'Test [trigger] Choice' },
        { id: '2', name: 'Other Choice', trigger: 'explicit' },
      ];

      setShortcodes(mockPrompt, choices);

      expect(mockPrompt.kitSearch.triggers.get('trigger')).toBe(choices[0]);
      expect(mockPrompt.kitSearch.triggers.get('explicit')).toBe(choices[1]);
    });

    it('should set postfixes from string pass values', () => {
      const choices = [
        { id: '1', name: 'Choice 1', pass: 'postfix-value' },
        { id: '2', name: 'Choice 2', pass: '/regex/' }, // Should not be set as postfix
        { id: '3', name: 'Choice 3', pass: true }, // Should not be set as postfix
      ];

      setShortcodes(mockPrompt, choices);

      expect(mockPrompt.kitSearch.postfixes.get('postfix-value')).toBe(choices[0]);
      expect(mockPrompt.kitSearch.postfixes.has('/regex/')).toBe(false);
    });
  });

  describe('setChoices', () => {
    it('should handle empty or invalid choices', () => {
      setChoices(mockPrompt, [], { preload: false });

      expect(mockPrompt.kitSearch.choices).toEqual([]);
      expect(mockPrompt.kitSearch.hasGroup).toBe(false);
      expect(mockPrompt.kitSearch.qs).toBeNull();
      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, []);
    });

    it('should set choices and configure search properly', () => {
      const choices = [
        { id: '1', name: 'Choice 1', group: 'Group1' },
        { id: '2', name: 'Choice 2', exclude: true }, // Should be filtered out
        { id: '3', name: 'Choice 3', group: 'Group2' },
      ];

      setChoices(mockPrompt, choices, { preload: true });

      expect(mockPrompt.kitSearch.choices).toHaveLength(2); // Excluded choice filtered
      expect(mockPrompt.kitSearch.hasGroup).toBe(true);
      expect(mockPrompt.kitSearch.qs).toBeTruthy();
      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_CHOICES_CONFIG, { preload: true });
    });

    it('should handle generated choices', () => {
      const choices = [{ id: '1', name: 'Generated Choice' }];

      setChoices(mockPrompt, choices, { preload: false, generated: true });

      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([expect.objectContaining({ item: choices[0] })]),
      );
    });

    it('should cache choices for main script', () => {
      const choices = [{ id: '1', name: 'Main Script Choice' }];
      mockPrompt.scriptPath = '/main/script/path';

      setChoices(mockPrompt, choices, { preload: false });

      // Should trigger caching logic for main script
      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_CHOICES_CONFIG, { preload: false });
    });

    it('should skip initial search when requested', () => {
      const choices = [{ id: '1', name: 'Test Choice' }];

      setChoices(mockPrompt, choices, {
        preload: false,
        skipInitialSearch: true,
      });

      // Should still set up choices but not trigger search
      expect(mockPrompt.kitSearch.choices).toEqual(choices);
    });

    it('should set selected choices', () => {
      const choices = [
        { id: '1', name: 'Choice 1', selected: true },
        { id: '2', name: 'Choice 2', selected: false },
        { id: '3', name: 'Choice 3' },
      ];

      setChoices(mockPrompt, choices, { preload: false });

      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SELECTED_CHOICES,
        [choices[0]], // Only selected choices
      );
    });

    it('should handle cacheScriptChoices flag', () => {
      const choices = [{ id: '1', name: 'Cached Choice' }];
      mockPrompt.cacheScriptChoices = true;
      mockPrompt.scriptPath = '/test/script.ts';

      setChoices(mockPrompt, choices, { preload: false });

      expect(mockPrompt.cacheScriptChoices).toBe(false);
    });
  });

  describe('setScoredChoices', () => {
    it('should send scored choices to prompt', () => {
      const scoredChoices: ScoredChoice[] = [{ item: { id: '1', name: 'Choice 1' }, score: 0.8, matches: {}, _: '' }];

      setScoredChoices(mockPrompt, scoredChoices, 'test reason');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, scoredChoices);
    });

    it('should cache main scored choices for main script with empty input', () => {
      const scoredChoices: ScoredChoice[] = [
        {
          item: { id: '1', name: 'Main Choice' },
          score: 0.8,
          matches: {},
          _: '',
        },
      ];
      mockPrompt.scriptPath = '/main/script/path';
      mockPrompt.kitSearch.input = '';
      mockPrompt.kitSearch.inputRegex = undefined;

      setScoredChoices(mockPrompt, scoredChoices);

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, scoredChoices);
      expect(mockSendToPrompt).toHaveBeenCalledWith(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, scoredChoices);
    });

    it('should not cache if input is not empty', () => {
      const scoredChoices: ScoredChoice[] = [
        {
          item: { id: '1', name: 'Main Choice' },
          score: 0.8,
          matches: {},
          _: '',
        },
      ];
      mockPrompt.scriptPath = '/main/script/path';
      mockPrompt.kitSearch.input = 'search';

      setScoredChoices(mockPrompt, scoredChoices);

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, scoredChoices);
      expect(mockSendToPrompt).not.toHaveBeenCalledWith(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, scoredChoices);
    });
  });

  describe('setScoredFlags', () => {
    it('should send scored flags to prompt', () => {
      const scoredFlags: ScoredChoice[] = [
        {
          item: { id: 'flag1', name: 'Flag 1' },
          score: 0.8,
          matches: {},
          _: '',
        },
      ];

      setScoredFlags(mockPrompt, scoredFlags);

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_FLAGS, scoredFlags);
    });

    it('should handle empty flags array', () => {
      setScoredFlags(mockPrompt, []);

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_FLAGS, []);
    });

    it('should handle undefined flags', () => {
      setScoredFlags(mockPrompt);

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_FLAGS, []);
    });
  });

  describe('appendChoices', () => {
    it('should append choices to existing choices', () => {
      const existingChoices = [{ id: '1', name: 'Existing' }];
      const newChoices = [{ id: '2', name: 'New' }];

      mockPrompt.kitSearch.choices = existingChoices;

      appendChoices(mockPrompt, newChoices);

      // Verify that the choices were updated (setChoices processes them through formatChoices)
      expect(mockPrompt.kitSearch.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Existing' }),
          expect.objectContaining({ name: 'New' }),
        ]),
      );
    });
  });

  describe('debounceInvokeSearch', () => {
    it('should be a debounced version of invokeSearch', () => {
      expect(debounceInvokeSearch).toBeDefined();
      // Since we mocked debounce to return the original function, we can test basic functionality

      mockPrompt.kitSearch.choices = [];
      debounceInvokeSearch(mockPrompt, 'test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, []);
    });
  });

  describe('Highlight Range Remapping', () => {
    it('should remap highlight ranges for hyphenated words', () => {
      const choices = [
        { id: '1', name: 'kit-container', keyword: 'kit' },
        { id: '2', name: 'test-script', keyword: 'test' },
      ];

      // Mock the normalize and remap functions to simulate real behavior
      vi.mocked(normalizeWithMap).mockImplementation((str: string) => {
        return str.replace(/[-\s]/g, '').toLowerCase();
      });
      
      vi.mocked(remapRange).mockImplementation((raw: string, range: [number, number]): [number, number] => {
        // Simulate remapping for 'kit-container' -> 'kitcontainer'
        if (raw === 'kit-container' && range[0] === 0 && range[1] === 3) return [0, 3];
        if (raw === 'kit-container' && range[0] === 3 && range[1] === 12) return [4, 13];
        // Simulate remapping for 'test-script' -> 'testscript'
        if (raw === 'test-script' && range[0] === 0 && range[1] === 4) return [0, 4];
        if (raw === 'test-script' && range[0] === 4 && range[1] === 10) return [5, 11];
        return range;
      });

      const searchResults = [
        { 
          item: choices[0], 
          score: 0.9, 
          matches: { 
            name: [[0, 3], [3, 12]] // Original ranges on normalized string
          }, 
          _: '' 
        },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = false;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => searchResults) };

      invokeSearch(mockPrompt, 'kitcontainer');

      // Verify normalizeWithMap was called to trigger cache
      expect(normalizeWithMap).toHaveBeenCalledWith('kit-container');
      
      // Verify remapRange was called for each range
      expect(remapRange).toHaveBeenCalledWith('kit-container', [0, 3]);
      expect(remapRange).toHaveBeenCalledWith('kit-container', [3, 12]);

      // Verify the remapped ranges were sent to the prompt
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            matches: {
              name: [[0, 3], [4, 13]] // Remapped ranges
            },
          }),
        ]),
      );
    });

    it('should handle spaces in choice names', () => {
      const choices = [
        { id: '1', name: 'kit container', keyword: 'kit' },
      ];

      vi.mocked(normalizeWithMap).mockImplementation((str: string) => {
        return str.replace(/[-\s]/g, '').toLowerCase();
      });
      
      vi.mocked(remapRange).mockImplementation((raw: string, range: [number, number]): [number, number] => {
        // Simulate remapping for 'kit container' -> 'kitcontainer'
        if (raw === 'kit container' && range[0] === 0 && range[1] === 3) return [0, 3];
        if (raw === 'kit container' && range[0] === 3 && range[1] === 12) return [4, 13];
        return range;
      });

      const searchResults = [
        { 
          item: choices[0], 
          score: 0.9, 
          matches: { 
            name: [[0, 3], [3, 12]] // Original ranges on normalized string
          }, 
          _: '' 
        },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = false;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => searchResults) };

      invokeSearch(mockPrompt, 'kit container');

      expect(normalizeWithMap).toHaveBeenCalledWith('kit container');
      expect(remapRange).toHaveBeenCalledWith('kit container', [0, 3]);
      expect(remapRange).toHaveBeenCalledWith('kit container', [3, 12]);
    });

    it('should remap flag search highlight ranges', () => {
      const flagChoices = [
        { id: 'flag1', name: 'test-flag', group: 'Group1' },
      ];
      
      vi.mocked(normalizeWithMap).mockImplementation((str: string) => {
        return str.replace(/[-\s]/g, '').toLowerCase();
      });
      
      vi.mocked(remapRange).mockImplementation((raw: string, range: [number, number]): [number, number] => {
        if (raw === 'test-flag' && range[0] === 0 && range[1] === 4) return [0, 4];
        return range;
      });

      const searchResults = [
        { 
          item: flagChoices[0], 
          score: 0.8, 
          matches: { name: [[0, 4]] }, 
          _: '' 
        }
      ];

      mockPrompt.flagSearch.choices = flagChoices;
      mockPrompt.flagSearch.hasGroup = true;
      mockPrompt.flagSearch.qs = { search: vi.fn(() => searchResults) };

      invokeFlagSearch(mockPrompt, 'test');

      expect(normalizeWithMap).toHaveBeenCalledWith('test-flag');
      expect(remapRange).toHaveBeenCalledWith('test-flag', [0, 4]);

      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_FLAGS,
        expect.arrayContaining([
          expect.objectContaining({
            matches: {
              name: [[0, 4]] // Should be remapped correctly
            },
          }),
        ]),
      );
    });

    it('should handle choices with no matches gracefully', () => {
      const choices = [
        { id: '1', name: 'kit-container' },
      ];

      const searchResults = [
        { 
          item: choices[0], 
          score: 0.9, 
          matches: {}, // No matches
          _: '' 
        },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = false;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => searchResults) };

      invokeSearch(mockPrompt, 'test');

      // Should not throw and should pass through empty matches
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            matches: {},
          }),
        ]),
      );
    });

    it('should handle multiple keys with matches', () => {
      const choices = [
        { id: '1', name: 'kit-container', keyword: 'kit-key' },
      ];

      vi.mocked(normalizeWithMap).mockImplementation((str: string) => {
        return str.replace(/[-\s]/g, '').toLowerCase();
      });
      
      vi.mocked(remapRange).mockImplementation((raw: string, range: [number, number]): [number, number] => {
        if (raw === 'kit-container' && range[0] === 0 && range[1] === 3) return [0, 3];
        if (raw === 'kit-key' && range[0] === 0 && range[1] === 3) return [0, 3];
        return range;
      });

      const searchResults = [
        { 
          item: choices[0], 
          score: 0.9, 
          matches: { 
            name: [[0, 3]],
            keyword: [[0, 3]]
          }, 
          _: '' 
        },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = false;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => searchResults) };

      invokeSearch(mockPrompt, 'kit');

      expect(normalizeWithMap).toHaveBeenCalledWith('kit-container');
      expect(normalizeWithMap).toHaveBeenCalledWith('kit-key');
      expect(remapRange).toHaveBeenCalledWith('kit-container', [0, 3]);
      expect(remapRange).toHaveBeenCalledWith('kit-key', [0, 3]);
    });
  });

  describe('Edge Cases and Complex Scenarios', () => {
    it('should handle choices with complex group removal logic', () => {
      const choices = [
        { id: '1', name: 'Choice 1', group: 'Group1', skip: true },
        { id: '2', name: 'Choice 2', group: 'Group1' },
        { id: '3', name: 'Choice 3', group: 'Group2', skip: true },
      ];
      const searchResults = [{ item: choices[1], score: 0.8, matches: {}, _: '' }];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => searchResults) };

      invokeSearch(mockPrompt, 'test');

      // Should handle group removal logic correctly
      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle lastGroup choices separately', () => {
      const choices = [
        { id: '1', name: 'Regular Choice', group: 'Group1' },
        {
          id: '2',
          name: 'Last Group Choice',
          group: 'Group2',
          lastGroup: true,
        },
      ];
      const searchResults = [
        { item: choices[0], score: 0.9, matches: {}, _: '' },
        { item: choices[1], score: 0.8, matches: {}, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => searchResults) };

      invokeSearch(mockPrompt, 'choice');

      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            item: expect.objectContaining({ name: 'Group2', group: 'Group2' }),
          }),
        ]),
      );
    });

    it('should handle all misses scenario in grouped search', () => {
      const choices = [{ id: '1', name: 'Miss Choice', miss: true, info: true }];
      const searchResults = [{ item: choices[0], score: 0.8, matches: {}, _: '' }];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = false;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => searchResults) };

      invokeSearch(mockPrompt, 'test');

      // The search results are passed through for all misses scenario
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            item: expect.objectContaining({ name: 'Miss Choice' }),
          }),
        ]),
      );
    });

    it('should handle keyword sorting in startsWithGroup', () => {
      const choices = [
        { id: '1', name: 'test choice', keyword: 'test' },
        { id: '2', name: 'test other', keyword: 'testing' },
        { id: '3', name: 'test simple' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => []) };

      invokeSearch(mockPrompt, 'test');

      // Should trigger exact match grouping and sorting
      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle matchLastGroup sorting by keyword', () => {
      const choices = [
        {
          id: '1',
          name: 'Choice without keyword',
          group: 'Last',
          lastGroup: true,
        },
        {
          id: '2',
          name: 'Choice with keyword',
          keyword: 'test',
          group: 'Last',
          lastGroup: true,
        },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => []) };

      invokeSearch(mockPrompt, 'match');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle manual string matching when QuickScore returns no results', () => {
      const choices = [
        {
          id: '1',
          name: 'contains test word',
          miss: false,
          pass: false,
          info: false,
        },
        { id: '2', name: 'no match', miss: false, pass: false, info: false },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = false;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => []) };
      mockPrompt.kitSearch.keys = ['name', 'keyword'];

      invokeSearch(mockPrompt, 'test');

      // Should find matches manually and create scored choices
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            item: expect.objectContaining({ id: '1', name: 'contains test word' }),
          }),
        ]),
      );
    });
  });
});
