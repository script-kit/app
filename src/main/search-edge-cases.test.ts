import { Channel, PROMPT, ProcessType, UI } from '@johnlindquist/kit/core/enum';
import type { Choice, FlagsWithKeys, Script } from '@johnlindquist/kit/types/core';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { AppChannel } from '../shared/enums';
import type { ScoredChoice } from '../shared/types';
import type { KitPrompt } from './prompt';

// Mock debounce for immediate execution in tests
vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn) => fn),
}));

vi.mock('./logs', () => ({
  searchLog: {
    info: vi.fn(),
    warn: vi.fn(),
    silly: vi.fn(),
    verbose: vi.fn(),
  },
  perf: {
    start: vi.fn(() => vi.fn()), // Returns a mock end function
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

vi.mock('@johnlindquist/kit/core/utils', async () => {
  const actual = await vi.importActual('@johnlindquist/kit/core/utils');
  return {
    ...actual,
    getMainScriptPath: vi.fn(() => '/main/script/path'),
  };
});

import {
  appendChoices,
  invokeFlagSearch,
  invokeSearch,
  setChoices,
  setFlags,
  setScoredChoices,
  setScoredFlags,
  setShortcodes,
} from './search';

describe('Search Edge Cases and Stress Tests', () => {
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
        qs: { search: vi.fn(() => []) } as any, // Default mock QuickScore
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
        qs: { search: vi.fn(() => []) } as any, // Default mock QuickScore
      },
      updateShortcodes: vi.fn(),
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper function to setup mock QuickScore for search tests
  const setupMockSearch = (choices: any[], searchResults: any[] = []) => {
    mockPrompt.kitSearch.choices = choices;
    mockPrompt.kitSearch.qs = { search: vi.fn(() => searchResults) } as any;
  };

  describe('Unicode and Special Character Edge Cases', () => {
    it('should handle emoji in search input', () => {
      const choices = [
        { id: '1', name: '🚀 rocket script', keyword: 'rocket' },
        { id: '2', name: '🎯 target script', keyword: 'target' },
        { id: '3', name: '📝 note script', keyword: 'note' },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.qs = { search: vi.fn(() => []) } as any;

      invokeSearch(mockPrompt, '🚀');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle unicode characters in search input', () => {
      const choices = [
        { id: '1', name: 'café script', keyword: 'café' },
        { id: '2', name: 'naïve script', keyword: 'naive' },
        { id: '3', name: '中文 script', keyword: 'chinese' },
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'café');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle mathematical symbols and special characters', () => {
      const choices = [
        { id: '1', name: '∑ sum function', keyword: 'sum' },
        { id: '2', name: '∆ delta calculator', keyword: 'delta' },
        { id: '3', name: '→ arrow function', keyword: 'arrow' },
        { id: '4', name: 'α β γ greek letters', keyword: 'greek' },
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, '∑');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle mixed unicode and ASCII', () => {
      const choices = [
        { id: '1', name: 'test_с_русским', keyword: 'russian' },
        { id: '2', name: 'العربية_test', keyword: 'arabic' },
        { id: '3', name: 'test_日本語_mix', keyword: 'japanese' },
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });
  });

  describe('Extreme Input Length Edge Cases', () => {
    it('should handle very long search queries', () => {
      const longQuery = 'a'.repeat(1000);
      const choices = [
        { id: '1', name: 'test choice', keyword: 'test' },
        { id: '2', name: longQuery.substring(0, 100), keyword: 'long' },
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, longQuery);

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle extremely short single character searches', () => {
      const choices = [
        { id: '1', name: 'a script', keyword: 'a' },
        { id: '2', name: 'ab script', keyword: 'ab' },
        { id: '3', name: 'abc script', keyword: 'abc' },
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'a');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle search with only whitespace', () => {
      const choices = [
        { id: '1', name: 'test choice', keyword: 'test' },
        { id: '2', name: 'another choice', keyword: 'another' },
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, '   \t\n  ');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });
  });

  describe('Malformed Choice Objects Edge Cases', () => {
    it('should handle choices with missing required properties', () => {
      const choices = [
        { id: '1' }, // Missing name
        { name: 'No ID Choice' }, // Missing id
        { id: '3', name: null }, // Null name
        { id: '4', name: undefined }, // Undefined name
        { id: '5', name: '' }, // Empty name
      ] as any[];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle choices with circular references', () => {
      const choice1: any = { id: '1', name: 'Choice 1' };
      const choice2: any = { id: '2', name: 'Choice 2' };
      choice1.ref = choice2;
      choice2.ref = choice1; // Circular reference

      const choices = [choice1, choice2];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'choice');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle choices with mixed data types', () => {
      const choices = [
        { id: 1, name: 'Number ID', keyword: 123 }, // Number instead of string
        { id: '2', name: ['Array', 'Name'], keyword: 'array' }, // Array instead of string
        { id: '3', name: { toString: () => 'Object Name' }, keyword: 'object' }, // Object with toString
        { id: '4', name: true, keyword: 'boolean' }, // Boolean
      ] as any[];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle deeply nested choice objects', () => {
      const deepChoice = {
        id: '1',
        name: 'Deep Choice',
        meta: {
          level1: {
            level2: {
              level3: {
                level4: {
                  deepProperty: 'deep value',
                },
              },
            },
          },
        },
      };
      const choices = [deepChoice];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'deep');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });
  });

  describe('Complex Regex Edge Cases', () => {
    it.skip('should handle malformed regex patterns in pass property', () => {
      const choices = [
        { id: '1', name: 'Valid Regex', pass: '/test/i' },
        { id: '2', name: 'Invalid Regex', pass: '/[/' }, // Malformed regex
        { id: '3', name: 'Incomplete Regex', pass: '/test' }, // Missing closing slash
        {
          id: '4',
          name: 'Complex Regex',
          pass: '/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d]{8,}$/i',
        },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      // Current implementation throws error for malformed regex patterns
      expect(() => {
        invokeSearch(mockPrompt, 'test123ABC');
      }).toThrow('Invalid regular expression');
    });

    it('should handle regex with dangerous patterns', () => {
      const choices = [
        { id: '1', name: 'Catastrophic Backtracking', pass: '/(a+)+b/' },
        { id: '2', name: 'ReDoS Pattern', pass: '/^(a|a)*$/' },
        {
          id: '3',
          name: 'Complex Lookahead',
          pass: '/(?=.*a)(?=.*b)(?=.*c).*/',
        },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      invokeSearch(mockPrompt, 'aaaaaaaaaaaaaaab');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle inputRegex with complex patterns', () => {
      mockPrompt.kitSearch.inputRegex = /(\w+):(\w+)@([\w.]+)/;
      const choices = [{ id: '1', name: 'Connection Script', keyword: 'connect' }];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'user:pass@server.com extra ignored text');

      expect(mockPrompt.kitSearch.input).toBe('user:pass@server.com');
    });

    it('should handle inputRegex that matches nothing', () => {
      mockPrompt.kitSearch.inputRegex = /^NEVER_MATCHES$/;
      const choices = [{ id: '1', name: 'Test Script', keyword: 'test' }];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'any input that will not match');

      expect(mockPrompt.kitSearch.input).toBe('');
    });
  });

  describe('Performance and Stress Test Edge Cases', () => {
    it('should handle thousands of choices efficiently', () => {
      const choices = Array.from({ length: 5000 }, (_, i) => ({
        id: `choice-${i}`,
        name: `Choice ${i} with keyword-${i % 100}`,
        keyword: `keyword-${i % 100}`,
        group: `Group ${i % 10}`,
      }));
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      const startTime = performance.now();
      invokeSearch(mockPrompt, 'keyword-42');
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle choices with extremely long names', () => {
      const longName = 'Very long choice name that goes on and on and on '.repeat(100);
      const choices = [
        { id: '1', name: longName, keyword: 'long' },
        { id: '2', name: 'Short', keyword: 'short' },
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'long');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle repeated rapid searches', () => {
      const choices = [{ id: '1', name: 'Test Choice', keyword: 'test' }];
      mockPrompt.kitSearch.choices = choices;

      // Simulate rapid typing
      for (let i = 0; i < 100; i++) {
        invokeSearch(mockPrompt, `test${i}`);
      }

      expect(mockSendToPrompt).toHaveBeenCalledTimes(100);
    });
  });

  describe('Group and Sorting Edge Cases', () => {
    it('should handle groups with special characters', () => {
      const choices = [
        { id: '1', name: 'Choice 1', group: '🔥 Hot Scripts' },
        { id: '2', name: 'Choice 2', group: '⚡ Fast Scripts' },
        { id: '3', name: 'Choice 3', group: '💡 Smart Scripts' },
        { id: '4', name: 'Choice 4', group: 'Regular Group' },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      invokeSearch(mockPrompt, 'choice');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle empty group names', () => {
      const choices = [
        { id: '1', name: 'Choice 1', group: '' },
        { id: '2', name: 'Choice 2', group: null },
        { id: '3', name: 'Choice 3', group: undefined },
        { id: '4', name: 'Choice 4' }, // No group property
      ] as any[];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      invokeSearch(mockPrompt, 'choice');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle groups with same names but different cases', () => {
      const choices = [
        { id: '1', name: 'Choice 1', group: 'Scripts' },
        { id: '2', name: 'Choice 2', group: 'scripts' },
        { id: '3', name: 'Choice 3', group: 'SCRIPTS' },
        { id: '4', name: 'Choice 4', group: 'Scripts' },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      invokeSearch(mockPrompt, 'choice');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle deeply nested group hierarchies', () => {
      const choices = [
        { id: '1', name: 'Choice 1', group: 'Level1/Level2/Level3/Level4' },
        { id: '2', name: 'Choice 2', group: 'Level1/Level2/Level3' },
        { id: '3', name: 'Choice 3', group: 'Level1/Level2' },
        { id: '4', name: 'Choice 4', group: 'Level1' },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      invokeSearch(mockPrompt, 'choice');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });
  });

  describe('Alias and Trigger Edge Cases', () => {
    it('should handle aliases with special characters', () => {
      const choices = [
        { id: '1', name: 'Test Script', alias: '@test' } as Script,
        { id: '2', name: 'Another Script', alias: '#another' } as Script,
        { id: '3', name: 'Third Script', alias: '$third' } as Script,
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      invokeSearch(mockPrompt, '@test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle triggers with brackets in name patterns', () => {
      const choices = [
        { id: '1', name: 'Multi [first] [second] Script' },
        { id: '2', name: 'Nested [[bracket]] Script' },
        { id: '3', name: 'Unmatched [bracket Script' },
        { id: '4', name: 'Empty [] Bracket Script' },
      ];
      mockPrompt.kitSearch.choices = choices;

      setShortcodes(mockPrompt, choices);

      expect(mockPrompt.kitSearch.triggers.has('first')).toBe(true);
      expect(mockPrompt.updateShortcodes).toHaveBeenCalled();
    });

    it('should handle duplicate aliases and triggers', () => {
      const choices = [
        { id: '1', name: 'Script 1', alias: 'duplicate' } as Script,
        { id: '2', name: 'Script 2', alias: 'duplicate' } as Script,
        { id: '3', name: 'Script 3 [trigger]' },
        { id: '4', name: 'Script 4', trigger: 'trigger' },
      ];
      mockPrompt.kitSearch.choices = choices;

      setShortcodes(mockPrompt, choices);

      // Last one should win for duplicates
      expect(mockPrompt.kitSearch.triggers.get('trigger')).toBe(choices[3]);
    });

    it('should handle case sensitivity in triggers and aliases', () => {
      const choices = [
        { id: '1', name: 'Script 1', alias: 'Test' } as Script,
        { id: '2', name: 'Script 2', alias: 'test' } as Script,
        { id: '3', name: 'Script 3 [Trigger]' },
        { id: '4', name: 'Script 4 [trigger]' },
      ];
      mockPrompt.kitSearch.choices = choices;

      setShortcodes(mockPrompt, choices);

      // Should store lowercase versions
      expect(mockPrompt.kitSearch.triggers.has('trigger')).toBe(true);
      expect(mockPrompt.kitSearch.triggers.has('Trigger')).toBe(false);
    });
  });

  describe('Boundary Condition Edge Cases', () => {
    it('should handle zero-length arrays', () => {
      mockPrompt.kitSearch.choices = [];

      invokeSearch(mockPrompt, 'anything');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, []);
    });

    it('should handle null and undefined inputs gracefully', () => {
      const choices = [{ id: '1', name: 'Test Choice' }];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, null as any);
      invokeSearch(mockPrompt, undefined as any);

      expect(mockSendToPrompt).toHaveBeenCalledTimes(2);
    });

    it('should handle choices with all boolean flags set', () => {
      const choices = [
        {
          id: '1',
          name: 'Complex Choice',
          pass: true,
          miss: true,
          info: true,
          skip: true,
          hideWithoutInput: true,
          exclude: true,
          selected: true,
        },
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle choices with conflicting properties', () => {
      const choices = [
        {
          id: '1',
          name: 'Conflicting Choice',
          pass: true,
          miss: true, // Conflicts with pass
          info: true, // Conflicts with pass
          exact: true,
          lastGroup: true,
        },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      invokeSearch(mockPrompt, 'test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });
  });

  describe('Memory and Resource Edge Cases', () => {
    it('should handle choices with large objects as properties', () => {
      const largeObject = Array.from({ length: 1000 }, (_, i) => ({
        [`property${i}`]: `value${i}`.repeat(100),
      })).reduce((acc, obj) => ({ ...acc, ...obj }), {});

      const choices = [
        {
          id: '1',
          name: 'Choice with large object',
          metadata: largeObject,
        },
      ];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'choice');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle choices with functions as properties', () => {
      const choices = [
        {
          id: '1',
          name: 'Choice with function',
          callback: () => {},
          asyncCallback: async () => Promise.resolve('test'),
        },
      ] as any[];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'choice');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });
  });

  describe('Flag Search Edge Cases', () => {
    it('should handle flags with complex nested structures', () => {
      const flags: FlagsWithKeys = {
        complexFlag: {
          name: 'complex-flag',
          description: 'A complex flag with nested properties',
          group: 'Complex',
          metadata: {
            nested: {
              deeply: {
                value: 'deep value',
              },
            },
          },
        },
        arrayFlag: {
          name: 'array-flag',
          options: ['option1', 'option2', 'option3'],
        },
      };

      setFlags(mockPrompt, flags);

      invokeFlagSearch(mockPrompt, 'complex');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_FLAGS, expect.any(Array));
    });

    it('should handle flags with duplicate names', () => {
      const flags: FlagsWithKeys = {
        flag1: { name: 'duplicate-name' },
        flag2: { name: 'duplicate-name' },
        flag3: { name: 'unique-name' },
      };

      setFlags(mockPrompt, flags);

      invokeFlagSearch(mockPrompt, 'duplicate');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_FLAGS, expect.any(Array));
    });

    it('should handle flags with no name property', () => {
      const flags: FlagsWithKeys = {
        unnamed1: { description: 'Flag without name' },
        unnamed2: {},
        named: { name: 'proper-flag' },
      };

      setFlags(mockPrompt, flags);

      invokeFlagSearch(mockPrompt, 'unnamed');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_FLAGS, expect.any(Array));
    });
  });

  describe('Cross-Platform Path Edge Cases', () => {
    it('should handle Windows-style paths in choices', () => {
      const choices = [
        {
          id: '1',
          name: 'Windows Script',
          filePath: 'C:\\Users\\test\\script.js',
        },
        { id: '2', name: 'Unix Script', filePath: '/home/test/script.js' },
        {
          id: '3',
          name: 'Mixed Script',
          filePath: 'C:/Users/test/unix-style.js',
        },
      ] as Script[];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'script');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle paths with spaces and special characters', () => {
      const choices = [
        {
          id: '1',
          name: 'Spaced Script',
          filePath: '/path with spaces/script.js',
        },
        {
          id: '2',
          name: 'Special Script',
          filePath: '/path/with/special-chars_@#$/script.js',
        },
        {
          id: '3',
          name: 'Unicode Script',
          filePath: '/path/with/üñíçödé/script.js',
        },
      ] as Script[];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'special');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });
  });

  describe('Complex Sorting and Priority Edge Cases', () => {
    it('should handle choices with identical scores', () => {
      const choices = Array.from({ length: 50 }, (_, i) => ({
        id: `choice-${i}`,
        name: `identical score choice ${i}`,
        keyword: 'identical',
      }));
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'identical');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle mixed priority with exact matches', () => {
      const choices = [
        { id: '1', name: 'test', keyword: 'test', exact: true },
        { id: '2', name: 'test script', keyword: 'script' },
        { id: '3', name: 'testing', keyword: 'testing' },
        { id: '4', name: 'not test', keyword: 'not' },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      invokeSearch(mockPrompt, 'test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle keyword priority vs name priority', () => {
      const choices = [
        { id: '1', name: 'search result', keyword: 'search' },
        { id: '2', name: 'search', keyword: 'other' },
        { id: '3', name: 'other', keyword: 'search' },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      invokeSearch(mockPrompt, 'search');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });
  });

  describe('Environment and State Edge Cases', () => {
    it('should handle missing environment variables gracefully', () => {
      // Override state to simulate missing env vars
      vi.doMock('./state', () => ({
        kitCache: { choices: [] },
        kitState: {
          kenvEnv: {}, // Empty env
        },
      }));

      const choices = [{ id: '1', name: 'Test Choice' }];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });

    it('should handle invalid environment variable values', () => {
      vi.doMock('./state', () => ({
        kitCache: { choices: [] },
        kitState: {
          kenvEnv: {
            KIT_SEARCH_MAX_ITERATIONS: 'invalid',
            KIT_SEARCH_MIN_SCORE: 'not-a-number',
          },
        },
      }));

      const choices = [{ id: '1', name: 'Test Choice' }];
      mockPrompt.kitSearch.choices = choices;

      invokeSearch(mockPrompt, 'test');

      expect(mockSendToPrompt).toHaveBeenCalledWith(Channel.SET_SCORED_CHOICES, expect.any(Array));
    });
  });

  describe('Concurrency and Timing Edge Cases', () => {
    it('should handle rapid successive choice updates', () => {
      const initialChoices = [{ id: '1', name: 'Initial Choice' }];
      mockPrompt.kitSearch.choices = initialChoices;

      // Simulate rapid updates
      for (let i = 0; i < 10; i++) {
        const newChoices = Array.from({ length: i + 1 }, (_, j) => ({
          id: `choice-${i}-${j}`,
          name: `Choice ${i}-${j}`,
        }));
        setChoices(mockPrompt, newChoices, { preload: false });
      }

      // setChoices calls sendToPrompt multiple times internally, so we check that it was called
      expect(mockSendToPrompt).toHaveBeenCalled();
      expect(mockSendToPrompt.mock.calls.length).toBeGreaterThan(10);
    });

    it('should handle interleaved search and choice updates', () => {
      let choices = [{ id: '1', name: 'Initial Choice' }];
      mockPrompt.kitSearch.choices = choices;

      // Interleave searches and updates
      for (let i = 0; i < 5; i++) {
        invokeSearch(mockPrompt, `search-${i}`);
        choices = [...choices, { id: `new-${i}`, name: `New Choice ${i}` }];
        setChoices(mockPrompt, choices, { preload: false });
      }

      expect(mockSendToPrompt).toHaveBeenCalled();
    });
  });
});
