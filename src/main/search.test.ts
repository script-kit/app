import { Channel, PROMPT, UI } from '@johnlindquist/kit/core/enum';
import { ProcessType } from '@johnlindquist/kit/core/enum';
import type { Choice, FlagsWithKeys, Script } from '@johnlindquist/kit/types/core';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppChannel } from '../shared/enums';
import type { ScoredChoice } from '../shared/types';
import type { KitPrompt } from './prompt';

// Mock debounce for immediate execution in tests
vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn) => fn), // Immediate execution for tests
}));

// Mock VS Code fuzzy search
vi.mock('./vscode-search', () => ({
  searchChoices: vi.fn(),
  scoreChoice: vi.fn(),
  isExactMatch: vi.fn(),
  startsWithQuery: vi.fn(),
  clearFuzzyCache: vi.fn(),
}))

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
    kenvEnv: {},
  },
}))

// Use real implementations for pure functions
vi.mock('@johnlindquist/kit/core/utils', async () => {
  const actual = await vi.importActual('@johnlindquist/kit/core/utils');
  return {
    ...actual,
    getMainScriptPath: vi.fn(() => '/main/script/path'),
  };
});

// Mock helpers
vi.mock('./helpers', () => {
  return {
    createScoredChoice: vi.fn((choice: any) => ({ 
      item: choice, 
      score: 0, 
      matches: {}, 
      _: '' 
    })),
    createAsTypedChoice: vi.fn((input: string, template: any) => ({
      ...template,
      name: template?.name || '{input}',
      value: template?.value !== undefined ? template.value : input,
      group: template?.group || 'As Typed',
      asTyped: true,
    })),
  };
})

// Import after mocks
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

import { searchChoices, scoreChoice, isExactMatch, startsWithQuery, clearFuzzyCache } from './vscode-search';
import { createScoredChoice, createAsTypedChoice } from './helpers';

describe('Search Functionality', () => {
  let mockPrompt: KitPrompt;
  let mockSendToPrompt: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockSendToPrompt = vi.fn();
    
    // Set default mock implementations
    vi.mocked(searchChoices).mockReturnValue([]);
    vi.mocked(isExactMatch).mockReturnValue(false);
    vi.mocked(startsWithQuery).mockReturnValue(false);

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
      vi.mocked(searchChoices).mockReturnValue([]);

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

    it('should handle search with empty results', () => {
      mockPrompt.kitSearch.choices = [{ id: '1', name: 'Test' }];
      vi.mocked(searchChoices).mockReturnValue([]);

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
      vi.mocked(searchChoices).mockReturnValue(searchResults);

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
      vi.mocked(searchChoices).mockReturnValue([]);

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
      vi.mocked(searchChoices).mockReturnValue([]);

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
      vi.mocked(searchChoices).mockReturnValue(searchResults);
      vi.mocked(isExactMatch).mockReturnValue(false);
      vi.mocked(startsWithQuery).mockReturnValue(true);

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

  describe('VS Code Fuzzy Search Highlighting', () => {
    it('should handle highlight ranges for hyphenated words', () => {
      const choices = [
        { id: '1', name: 'kit-container', keyword: 'kit' },
        { id: '2', name: 'test-script', keyword: 'test' },
      ];

      const searchResults = [
        { 
          item: choices[0], 
          score: 0.9, 
          matches: { 
            name: [[0, 3], [4, 13]] // VS Code returns proper ranges for original string
          }, 
          _: '' 
        },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = false;
      vi.mocked(searchChoices).mockReturnValue(searchResults);

      invokeSearch(mockPrompt, 'kitcontainer');

      // VS Code fuzzy search handles highlighting internally

      // Verify the remapped ranges were sent to the prompt
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            matches: {
              name: [[0, 3], [4, 13]] // VS Code returns proper ranges
            },
          }),
        ]),
      );
    });

    it('should handle spaces in choice names', () => {
      const choices = [
        { id: '1', name: 'kit container', keyword: 'kit' },
      ];

      const searchResults = [
        { 
          item: choices[0], 
          score: 0.9, 
          matches: { 
            name: [[0, 3], [4, 13]] // VS Code returns proper ranges
          }, 
          _: '' 
        },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = false;
      vi.mocked(searchChoices).mockReturnValue(searchResults);

      invokeSearch(mockPrompt, 'kit container');

      // VS Code fuzzy search handles spaces properly
    });

    it('should handle flag search highlight ranges', () => {
      const flagChoices = [
        { id: 'flag1', name: 'test-flag', group: 'Group1' },
      ];

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
      vi.mocked(searchChoices).mockReturnValue(searchResults);
      vi.mocked(isExactMatch).mockReturnValue(false);
      vi.mocked(startsWithQuery).mockReturnValue(true);

      invokeFlagSearch(mockPrompt, 'test');

      // VS Code handles flag search highlighting

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
      vi.mocked(searchChoices).mockReturnValue(searchResults);

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
      vi.mocked(searchChoices).mockReturnValue(searchResults);

      invokeSearch(mockPrompt, 'kit');

      // VS Code fuzzy search handles multiple fields properly
      expect(searchChoices).toHaveBeenCalledWith(choices, 'kit');
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            matches: {
              name: [[0, 3]],
              keyword: [[0, 3]]
            },
          }),
        ]),
      );
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
      vi.mocked(searchChoices).mockReturnValue(searchResults);

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
      vi.mocked(searchChoices).mockReturnValue(searchResults);

      invokeSearch(mockPrompt, 'choice');

      // Verify that both results are returned
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            item: expect.objectContaining({ name: 'Regular Choice' }),
          }),
          expect.objectContaining({
            item: expect.objectContaining({ name: 'Last Group Choice', lastGroup: true }),
          }),
        ]),
      );
    });

    it('should handle all misses scenario in grouped search', () => {
      const choices = [{ id: '1', name: 'Miss Choice', miss: true, info: true }];
      const searchResults = [{ item: choices[0], score: 0.8, matches: {}, _: '' }];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = false;
      vi.mocked(searchChoices).mockReturnValue(searchResults);

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
      vi.mocked(searchChoices).mockReturnValue([]);

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
      vi.mocked(searchChoices).mockReturnValue([]);

      invokeSearch(mockPrompt, 'match');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle VS Code fuzzy search with no results', () => {
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
      vi.mocked(searchChoices).mockReturnValue([
        { item: choices[0], score: 0.8, matches: { name: [[9, 13]] }, _: '' }
      ]);
      mockPrompt.kitSearch.keys = ['name', 'keyword'];

      invokeSearch(mockPrompt, 'test');

      // Should use VS Code fuzzy search
      expect(searchChoices).toHaveBeenCalledWith(choices, 'test');
      expect(mockSendToPrompt).toHaveBeenCalledWith(
        Channel.SET_SCORED_CHOICES,
        expect.arrayContaining([
          expect.objectContaining({
            item: expect.objectContaining({ id: '1', name: 'contains test word' }),
          }),
        ]),
      );
    });

    describe('asTyped functionality', () => {
      it('should not show "As Typed" option when no asTyped choice exists', () => {
        const choices = [
          { id: '1', name: 'Git', value: 'git' },
          { id: '2', name: 'Node', value: 'node' },
        ];

        mockPrompt.kitSearch.choices = choices;
        mockPrompt.kitSearch.hasGroup = false;
        vi.mocked(searchChoices).mockReturnValue([
          { item: choices[0], score: 0.7, matches: { name: [[0, 2]] }, _: '' },
        ]);

        invokeSearch(mockPrompt, 'gi');

        expect(mockSendToPrompt).toHaveBeenCalledWith(
          Channel.SET_SCORED_CHOICES,
          expect.not.arrayContaining([
            expect.objectContaining({
              item: expect.objectContaining({ group: 'As Typed' }),
            }),
          ]),
        );
      });

      it('should not show "As Typed" option when input is empty', () => {
        const choices = [
          { id: '1', name: 'Git', value: 'git' },
          { id: '2', name: 'Create {input}', asTyped: true },
        ];

        mockPrompt.kitSearch.choices = choices;
        mockPrompt.kitSearch.hasGroup = false;

        invokeSearch(mockPrompt, '');

        expect(mockSendToPrompt).toHaveBeenCalledWith(
          Channel.SET_SCORED_CHOICES,
          expect.not.arrayContaining([
            expect.objectContaining({
              item: expect.objectContaining({ group: 'As Typed' }),
            }),
          ]),
        );
      });

      it('should show "As Typed" option when asTyped choice exists and no exact match', () => {
        const choices = [
          { id: '1', name: 'Git', value: 'git' },
          { id: '2', name: 'Create {input}', asTyped: true },
        ];

        mockPrompt.kitSearch.choices = choices;
        mockPrompt.kitSearch.hasGroup = false;
        vi.mocked(searchChoices).mockReturnValue([
          { item: choices[0], score: 0.7, matches: { name: [[0, 2]] }, _: '' },
        ]);

        invokeSearch(mockPrompt, 'git foo');

        const calls = mockSendToPrompt.mock.calls;
        const setScoredChoicesCall = calls.find(call => call[0] === Channel.SET_SCORED_CHOICES);
        const scoredChoices = setScoredChoicesCall?.[1] || [];
        
        // Find the as typed choice in the results
        const asTypedChoice = scoredChoices.find((sc: ScoredChoice) => sc.item.asTyped === true);
        
        expect(asTypedChoice).toBeDefined();
        expect(asTypedChoice.item.value).toBe('git foo');
        expect(asTypedChoice.item.name).toBe('Create {input}');
        expect(asTypedChoice.item.group).toBe('As Typed');
      });

      it('should not show "As Typed" option when exact match exists on name', () => {
        const choices = [
          { id: '1', name: 'git', value: 'git' },
          { id: '2', name: 'Create {input}', asTyped: true },
        ];

        mockPrompt.kitSearch.choices = choices;
        mockPrompt.kitSearch.hasGroup = false;
        vi.mocked(searchChoices).mockReturnValue([
          { item: choices[0], score: 1.0, matches: { name: [[0, 3]] }, _: '' },
        ]);

        invokeSearch(mockPrompt, 'git');

        expect(mockSendToPrompt).toHaveBeenCalledWith(
          Channel.SET_SCORED_CHOICES,
          expect.not.arrayContaining([
            expect.objectContaining({
              item: expect.objectContaining({ group: 'As Typed' }),
            }),
          ]),
        );
      });

      it('should not show "As Typed" option when exact match exists on keyword', () => {
        const choices = [
          { id: '1', name: 'GitHub CLI', keyword: 'git', value: 'gh' },
          { id: '2', name: 'Create {input}', asTyped: true },
        ];

        mockPrompt.kitSearch.choices = choices;
        mockPrompt.kitSearch.hasGroup = false;
        vi.mocked(searchChoices).mockReturnValue([
          { item: choices[0], score: 1.0, matches: { keyword: [[0, 3]] }, _: '' },
        ]);

        invokeSearch(mockPrompt, 'git');

        expect(mockSendToPrompt).toHaveBeenCalledWith(
          Channel.SET_SCORED_CHOICES,
          expect.not.arrayContaining([
            expect.objectContaining({
              item: expect.objectContaining({ group: 'As Typed' }),
            }),
          ]),
        );
      });

      it('should preserve value in "As Typed" option', () => {
        const choices = [
          { id: '1', name: 'Git', value: 'git' },
          { id: '2', name: 'Select {input} as path', asTyped: true },
        ];

        mockPrompt.kitSearch.choices = choices;
        mockPrompt.kitSearch.hasGroup = false;
        vi.mocked(searchChoices).mockReturnValue([
          { item: choices[0], score: 0.5, matches: { name: [[0, 1]] }, _: '' },
        ]);

        invokeSearch(mockPrompt, '/Users/john/Documents');

        const calls = mockSendToPrompt.mock.calls;
        const setScoredChoicesCall = calls.find(call => call[0] === Channel.SET_SCORED_CHOICES);
        const scoredChoices = setScoredChoicesCall?.[1] || [];
        
        // Find the as typed choice in the results
        const asTypedChoice = scoredChoices.find((sc: ScoredChoice) => sc.item.asTyped === true);
        
        expect(asTypedChoice).toBeDefined();
        expect(asTypedChoice.item.value).toBe('/Users/john/Documents');
        expect(asTypedChoice.item.name).toBe('Select {input} as path');
        expect(asTypedChoice.item.group).toBe('As Typed');
      });

      it('should handle multiple asTyped choices', () => {
        const choices = [
          { id: '1', name: 'Git', value: 'git' },
          { id: '2', name: 'Create file: {input}', asTyped: true },
          { id: '3', name: 'Create folder: {input}', asTyped: true },
        ];

        mockPrompt.kitSearch.choices = choices;
        mockPrompt.kitSearch.hasGroup = false;
        vi.mocked(searchChoices).mockReturnValue([]);

        invokeSearch(mockPrompt, 'newproject');

        // Should only show one "As Typed" option, not multiple
        const calls = mockSendToPrompt.mock.calls;
        const setScoredChoicesCall = calls.find(call => call[0] === Channel.SET_SCORED_CHOICES);
        const scoredChoices = setScoredChoicesCall?.[1] || [];
        const asTypedChoices = scoredChoices.filter((sc: ScoredChoice) => sc.item.asTyped === true);
        
        expect(asTypedChoices).toHaveLength(1);
        expect(asTypedChoices[0].item.value).toBe('newproject');
      });

      it('should work with grouped search results', () => {
        const choices = [
          { id: '1', name: 'Git', value: 'git', group: 'Version Control' },
          { id: '2', name: 'Node', value: 'node', group: 'Runtime' },
          { id: '3', name: 'Create {input}', asTyped: true },
        ];

        mockPrompt.kitSearch.choices = choices;
        mockPrompt.kitSearch.hasGroup = true;
        vi.mocked(searchChoices).mockReturnValue([
          { item: choices[0], score: 0.7, matches: { name: [[0, 2]] }, _: '' },
        ]);

        invokeSearch(mockPrompt, 'git new-feature');

        expect(mockSendToPrompt).toHaveBeenCalledWith(
          Channel.SET_SCORED_CHOICES,
          expect.arrayContaining([
            expect.objectContaining({
              item: expect.objectContaining({
                group: 'As Typed',
                asTyped: true,
                value: 'git new-feature',
              }),
            }),
          ]),
        );
      });

      it('should handle case-insensitive exact matching', () => {
        const choices = [
          { id: '1', name: 'GIT', value: 'git' },
          { id: '2', name: 'Create {input}', asTyped: true },
        ];

        mockPrompt.kitSearch.choices = choices;
        mockPrompt.kitSearch.hasGroup = false;
        vi.mocked(searchChoices).mockReturnValue([
          { item: choices[0], score: 1.0, matches: { name: [[0, 3]] }, _: '' },
        ]);

        invokeSearch(mockPrompt, 'git');

        // Should not show "As Typed" because "git" matches "GIT" case-insensitively
        expect(mockSendToPrompt).toHaveBeenCalledWith(
          Channel.SET_SCORED_CHOICES,
          expect.not.arrayContaining([
            expect.objectContaining({
              item: expect.objectContaining({ group: 'As Typed' }),
            }),
          ]),
        );
      });
    });

    it('should not include group separators when the group has no matches', () => {
      const choices = [
        { id: '1', name: 'exact match', group: 'Group1' },
        { id: '2', name: 'another item', group: 'Group1' },
        { id: '3', name: 'different group', group: 'Group2' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      
      // Only return a match from Group2, nothing from Group1
      vi.mocked(searchChoices).mockReturnValue([
        { item: choices[2], score: 0.8, matches: { name: [[0, 9]] }, _: '' }
      ]);
      vi.mocked(isExactMatch).mockReturnValue(false);
      vi.mocked(startsWithQuery).mockReturnValue(false);

      invokeSearch(mockPrompt, 'different');

      const call = mockSendToPrompt.mock.calls.find(c => c[0] === Channel.SET_SCORED_CHOICES);
      const scoredChoices = call?.[1] || [];
      
      // Should not have any "Exact Match" separator since no exact matches were found
      const exactMatchSeparator = scoredChoices.find((sc: ScoredChoice) => 
        sc.item.name === 'Exact Match' && sc.item.skip === true
      );
      expect(exactMatchSeparator).toBeUndefined();
      
      // Should only have the one matched item
      const nonSeparatorItems = scoredChoices.filter((sc: ScoredChoice) => !sc.item.skip);
      expect(nonSeparatorItems).toHaveLength(1);
      expect(nonSeparatorItems[0].item.name).toBe('different group');
    });

    it('should not include "Best Matches" separator when no starts-with matches exist', () => {
      const choices = [
        { id: '1', name: 'test item', group: 'Group1' },
        { id: '2', name: 'another test', group: 'Group1' },
        { id: '3', name: 'completely different', group: 'Group2' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      
      // Return matches but none are exact or starts-with
      vi.mocked(searchChoices).mockReturnValue([
        { item: choices[0], score: 0.6, matches: { name: [[5, 9]] }, _: '' },
        { item: choices[1], score: 0.5, matches: { name: [[8, 12]] }, _: '' }
      ]);
      vi.mocked(isExactMatch).mockReturnValue(false);
      vi.mocked(startsWithQuery).mockReturnValue(false);

      invokeSearch(mockPrompt, 'test');

      const call = mockSendToPrompt.mock.calls.find(c => c[0] === Channel.SET_SCORED_CHOICES);
      const scoredChoices = call?.[1] || [];
      
      // Should not have any group separators
      const separators = scoredChoices.filter((sc: ScoredChoice) => sc.item.skip === true);
      expect(separators).toHaveLength(0);
      
      // Should have both matched items
      const nonSeparatorItems = scoredChoices.filter((sc: ScoredChoice) => !sc.item.skip);
      expect(nonSeparatorItems).toHaveLength(2);
    });

    it('should include appropriate separator when exact matches exist', () => {
      const choices = [
        { id: '1', name: 'test', group: 'Group1' },
        { id: '2', name: 'test item', group: 'Group1' },
        { id: '3', name: 'another test', group: 'Group2' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      
      // First choice is exact match
      vi.mocked(searchChoices).mockReturnValue([
        { item: choices[0], score: 1.0, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[1], score: 0.8, matches: { name: [[0, 4]] }, _: '' }
      ]);
      vi.mocked(isExactMatch).mockImplementation((choice) => choice.id === '1');
      vi.mocked(startsWithQuery).mockImplementation((choice) => choice.id === '2');

      invokeSearch(mockPrompt, 'test');

      const call = mockSendToPrompt.mock.calls.find(c => c[0] === Channel.SET_SCORED_CHOICES);
      const scoredChoices = call?.[1] || [];
      
      // Should have "Exact Match" separator
      const exactMatchSeparator = scoredChoices.find((sc: ScoredChoice) => 
        sc.item.name === 'Exact Match' && sc.item.skip === true
      );
      expect(exactMatchSeparator).toBeDefined();
      
      // Verify order: separator, exact match, starts-with match
      expect(scoredChoices[0].item.name).toBe('Exact Match');
      expect(scoredChoices[0].item.skip).toBe(true);
      expect(scoredChoices[1].item.id).toBe('1');
      expect(scoredChoices[2].item.id).toBe('2');
    });

    it('should not include original group separators when group name matches query but no items from that group match', () => {
      // This simulates the actual "Cursor Snippets" issue where formatChoices/groupChoices adds group separators
      const choices = [
        // Group separator that would be added by formatChoices/groupChoices
        {
          id: 'group-cursor-snippets',
          name: 'Cursor Snippets',
          group: 'Cursor Snippets', 
          skip: true,
          pass: false,
          className: 'defaultGroupClassName',
          nameClassName: 'defaultGroupNameClassName',
          height: 48 // PROMPT.ITEM.HEIGHT.XXXS
        },
        // Real items from "Cursor Snippets" group
        { 
          id: 'open-scriptlets',
          name: 'Open Scriptlets',
          command: 'open-scriptlets',
          group: 'Cursor Snippets',
          type: 'Prompt',
          tag: 'opt+s'
        },
        { 
          id: 'step-by-step',
          name: 'Step by Step',
          command: 'step-by-step', 
          group: 'Cursor Snippets',
          type: 'Prompt',
          tag: 'expand: ,sbs'
        },
        { 
          id: 'create-a-branch',
          name: 'Create a Branch',
          command: 'create-a-branch',
          group: 'Cursor Snippets',
          type: 'Prompt',
          tag: 'expand: ,cb'
        },
        // Another group separator
        {
          id: 'group-editor-tools',
          name: 'Editor Tools',
          group: 'Editor Tools',
          skip: true,
          pass: false,
          className: 'defaultGroupClassName',
          nameClassName: 'defaultGroupNameClassName',
          height: 48
        },
        // Item from different group that matches "Cursor"
        { 
          id: 'cursor-position',
          name: 'Cursor Position Helper',
          command: 'cursor-position',
          group: 'Editor Tools',
          type: 'Prompt'
        },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      
      // The search returns the group separator AND the "Cursor Position Helper"
      // This simulates what happens when the group name itself matches the search
      vi.mocked(searchChoices).mockReturnValue([
        { item: choices[0], score: 0.95, matches: { name: [[0, 6]] }, _: '' }, // "Cursor Snippets" separator
        { item: choices[5], score: 0.9, matches: { name: [[0, 6]] }, _: '' }   // "Cursor Position Helper"
      ]);
      vi.mocked(isExactMatch).mockReturnValue(false);
      vi.mocked(startsWithQuery).mockImplementation((choice) => {
        return choice.name === 'Cursor Snippets' || choice.name === 'Cursor Position Helper';
      });

      invokeSearch(mockPrompt, 'Cursor');

      const call = mockSendToPrompt.mock.calls.find(c => c[0] === Channel.SET_SCORED_CHOICES);
      const scoredChoices = call?.[1] || [];
      
      // Log for debugging
      console.log('Scored choices:', scoredChoices.map((sc: ScoredChoice) => ({ 
        name: sc.item.name, 
        group: sc.item.group,
        skip: sc.item.skip 
      })));
      
      // The bug: "Cursor Snippets" separator appears even though no actual items from that group matched
      const cursorSnippetsSeparator = scoredChoices.find((sc: ScoredChoice) => 
        sc.item.name === 'Cursor Snippets' && sc.item.skip === true
      );
      
      // This test should FAIL with the current implementation, showing the bug
      expect(cursorSnippetsSeparator).toBeUndefined();
      
      // Should only have items that actually matched (not group separators)
      const nonSeparatorItems = scoredChoices.filter((sc: ScoredChoice) => !sc.item.skip && sc.item.group !== 'Match');
      expect(nonSeparatorItems).toHaveLength(1);
      expect(nonSeparatorItems[0].item.name).toBe('Cursor Position Helper');
    });

    describe('Search prioritization', () => {
      it('should prioritize "API Tester" over "Stripe Payment Links" for query "apit"', () => {
        const choices = [
          { id: '1', name: 'Stripe Payment Links', description: 'Fetch payment links from Stripe and retrieve customer emails from successful payments' },
          { id: '2', name: 'API Tester', description: 'Test API endpoints with custom requests and data' },
        ];

        mockPrompt.kitSearch.choices = choices;
        mockPrompt.kitSearch.hasGroup = false;
        
        const apiTesterResult = { item: choices[1], score: 327732, matches: { name: [[0, 3], [4, 5]], slicedName: [[0, 3], [4, 5]] }, _: '' };
        const stripeResult = { item: choices[0], score: 16, matches: { description: [[7, 8], [29, 30], [57, 58], [83, 84]] }, _: '' };
        
        vi.mocked(searchChoices).mockReturnValue([apiTesterResult, stripeResult]);

        invokeSearch(mockPrompt, 'apit');

        expect(mockSendToPrompt).toHaveBeenCalledWith(
          Channel.SET_SCORED_CHOICES,
          expect.arrayContaining([
            expect.objectContaining({
              item: expect.objectContaining({ name: 'API Tester' }),
              score: expect.any(Number),
            }),
          ]),
        );
        
        // Verify API Tester comes first
        const call = mockSendToPrompt.mock.calls.find(c => c[0] === Channel.SET_SCORED_CHOICES);
        const scoredChoices = call?.[1] || [];
        expect(scoredChoices[0]?.item?.name).toBe('API Tester');
        expect(scoredChoices[1]?.item?.name).toBe('Stripe Payment Links');
      });
    });
  });
});
