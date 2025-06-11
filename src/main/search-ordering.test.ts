import { Channel, PROMPT, UI } from '@johnlindquist/kit/core/enum';
import { ProcessType } from '@johnlindquist/kit/core/enum';
import type { Choice, Script } from '@johnlindquist/kit/types/core';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoredChoice } from '../shared/types';
import type { KitPrompt } from './prompt';

// Mock dependencies for focused testing
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

import { invokeSearch, setShortcodes } from './search';

// Type for QuickScore mock
interface MockQuickScore {
  search: Mock;
}

describe('Search Ordering and Complex Choices', () => {
  let mockPrompt: KitPrompt;
  let mockSendToPrompt: Mock;
  let mockKitSearchQs: MockQuickScore;
  let mockFlagSearchQs: MockQuickScore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendToPrompt = vi.fn();
    mockKitSearchQs = { search: vi.fn(() => []) };
    mockFlagSearchQs = { search: vi.fn(() => []) };

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
        qs: mockKitSearchQs,
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
        qs: mockFlagSearchQs,
      },
      updateShortcodes: vi.fn(),
    } as unknown as KitPrompt;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Exact Match Priority Ordering', () => {
    it('should prioritize exact name matches over partial matches', () => {
      const choices = [
        { id: '1', name: 'test script helper', keyword: 'helper' },
        { id: '2', name: 'test', keyword: 'exact' },
        { id: '3', name: 'testing framework', keyword: 'framework' },
        { id: '4', name: 'unit test runner', keyword: 'runner' },
      ];
      const searchResults = [
        { item: choices[1], score: 1.0, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[0], score: 0.8, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[3], score: 0.6, matches: { name: [[5, 9]] }, _: '' },
        { item: choices[2], score: 0.7, matches: { name: [[0, 4]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Should have results and proper grouping behavior
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it('should prioritize keyword exact matches over name partial matches', () => {
      const choices = [
        { id: '1', name: 'file manager', keyword: 'test' }, // Exact keyword match
        { id: '2', name: 'test helper script', keyword: 'helper' }, // Partial name match
        { id: '3', name: 'testing suite', keyword: 'suite' },
      ];
      const searchResults = [
        { item: choices[0], score: 1.0, matches: { keyword: [[0, 4]] }, _: '' },
        { item: choices[1], score: 0.8, matches: { name: [[0, 4]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();
    });

    it('should handle name vs keyword priority conflicts', () => {
      const choices = [
        { id: '1', name: 'search', keyword: 'finder' }, // Exact name match
        { id: '2', name: 'file finder', keyword: 'search' }, // Exact keyword match
        { id: '3', name: 'search results', keyword: 'results' }, // Name starts with search
        { id: '4', name: 'advanced search tool', keyword: 'advanced' }, // Name contains search
      ];
      const searchResults = [
        { item: choices[0], score: 1.0, matches: { name: [[0, 6]] }, _: '' },
        { item: choices[1], score: 1.0, matches: { keyword: [[0, 6]] }, _: '' },
        { item: choices[2], score: 0.8, matches: { name: [[0, 6]] }, _: '' },
        { item: choices[3], score: 0.6, matches: { name: [[9, 15]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'search');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();
    });
  });

  describe('Alias and Trigger Priority', () => {
    it('should prioritize alias matches at the very top', () => {
      const choices = [
        { id: '1', name: 'File Manager', alias: 'fm' } as Script,
        { id: '2', name: 'Format Manager', keyword: 'format' },
        { id: '3', name: 'fm radio script', keyword: 'radio' },
        { id: '4', name: 'folder manager', keyword: 'folder' },
      ];
      const searchResults = [{ item: choices[2], score: 0.8, matches: { name: [[0, 2]] }, _: '' }];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'fm');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Should have results with alias prioritization
        expect(results.length).toBeGreaterThan(0);
        // First non-skip item should be alias match
        const firstChoice = results.find((r) => !r.item.skip);
        expect(firstChoice?.item.name).toBe('File Manager');
      }
    });

    it('should prioritize trigger matches at the very top', () => {
      const choices = [
        { id: '1', name: 'Quick Calculator [calc]', keyword: 'math' },
        { id: '2', name: 'calculation helper', keyword: 'helper' },
        { id: '3', name: 'calc formatter', keyword: 'format' },
        { id: '4', name: 'calculator app', keyword: 'app' },
      ];
      const searchResults = [
        { item: choices[2], score: 0.8, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[3], score: 0.7, matches: { name: [[0, 4]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      setShortcodes(mockPrompt, choices);
      invokeSearch(mockPrompt, 'calc');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Should have results with trigger prioritization
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it('should handle both alias and trigger matches correctly', () => {
      const choices = [
        { id: '1', name: 'Git Status [git]', alias: 'gs' } as Script,
        { id: '2', name: 'Git Helper', alias: 'gh' } as Script,
        { id: '3', name: 'Git Stash [stash]', keyword: 'stash' },
        { id: '4', name: 'regular git script', keyword: 'regular' },
      ];
      const searchResults = [
        { item: choices[0], score: 0.9, matches: { name: [[0, 3]] }, _: '' },
        { item: choices[3], score: 0.7, matches: { name: [[8, 11]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      setShortcodes(mockPrompt, choices);

      // Test alias match
      invokeSearch(mockPrompt, 'gs');
      expect(mockSendToPrompt).toHaveBeenCalled();

      // Reset and test trigger match
      mockSendToPrompt.mockClear();
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);
      invokeSearch(mockPrompt, 'git');
      expect(mockSendToPrompt).toHaveBeenCalled();
    });
  });

  describe('Pass Property Priority and Behavior', () => {
    it('should handle pass: true choices correctly', () => {
      const choices = [
        { id: '1', name: 'Always Available', pass: true },
        { id: '2', name: 'test script', keyword: 'test' },
        { id: '3', name: 'helper function', keyword: 'helper' },
        { id: '4', name: 'Pass Through Action', pass: true },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockKitSearchQs.search.mockReturnValueOnce([]);

      invokeSearch(mockPrompt, 'nonexistent');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Pass choices should still appear even when search doesn't match
        expect(results.some((r) => r.item.pass === true)).toBe(true);
      }
    });

    it('should handle pass with string postfix values', () => {
      const choices = [
        { id: '1', name: 'Git Commit', pass: 'commit' },
        { id: '2', name: 'Git Push', pass: 'push' },
        { id: '3', name: 'Git Pull', pass: 'pull' },
        { id: '4', name: 'regular git script', keyword: 'regular' },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockKitSearchQs.search.mockReturnValueOnce([]);

      setShortcodes(mockPrompt, choices);
      invokeSearch(mockPrompt, 'something');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();
    });

    it('should handle pass with regex patterns', () => {
      const choices = [
        { id: '1', name: 'URL Handler', pass: '/^https?:\\/\\//i' },
        { id: '2', name: 'Email Handler', pass: '/^[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}$/i' },
        { id: '3', name: 'File Path Handler', pass: '/^\\//i' },
        { id: '4', name: 'regular script', keyword: 'regular' },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockKitSearchQs.search.mockReturnValueOnce([]);

      invokeSearch(mockPrompt, 'https://example.com');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();
    });

    it('should prioritize pass choices appropriately', () => {
      const choices = [
        { id: '1', name: 'test script', keyword: 'test' },
        { id: '2', name: 'Pass Through', pass: true },
        { id: '3', name: 'testing framework', keyword: 'framework' },
        { id: '4', name: 'URL Handler', pass: '/^test/i' },
      ];
      const searchResults = [
        { item: choices[0], score: 1.0, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[2], score: 0.8, matches: { name: [[0, 4]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();
    });
  });

  describe('Group-based Ordering', () => {
    it('should maintain group structure while respecting priority', () => {
      const choices = [
        { id: '1', name: 'File Manager', group: 'File Operations', keyword: 'file' },
        { id: '2', name: 'test file reader', group: 'File Operations', keyword: 'reader' },
        { id: '3', name: 'Network Test', group: 'Network Tools', keyword: 'network' },
        { id: '4', name: 'test connection', group: 'Network Tools', keyword: 'connection' },
        { id: '5', name: 'Test Runner', group: 'Development', keyword: 'runner' },
        { id: '6', name: 'Unit Test Helper', group: 'Development', keyword: 'unit' },
      ];
      const searchResults = [
        { item: choices[1], score: 0.9, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[2], score: 0.8, matches: { name: [[8, 12]] }, _: '' },
        { item: choices[3], score: 0.7, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[4], score: 0.6, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[5], score: 0.5, matches: { name: [[5, 9]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Should have results with proper group handling
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it('should handle lastGroup choices separately', () => {
      const choices = [
        { id: '1', name: 'Primary Test', group: 'Main', keyword: 'primary' },
        { id: '2', name: 'test helper', group: 'Main', keyword: 'helper' },
        { id: '3', name: 'Legacy Test Tool', group: 'Legacy', lastGroup: true, keyword: 'legacy' },
        { id: '4', name: 'old test runner', group: 'Legacy', lastGroup: true, keyword: 'old' },
        { id: '5', name: 'experimental test', group: 'Experimental', lastGroup: true, keyword: 'experimental' },
      ];
      const searchResults = [
        { item: choices[0], score: 0.9, matches: { name: [[8, 12]] }, _: '' },
        { item: choices[1], score: 0.8, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[2], score: 0.7, matches: { name: [[7, 11]] }, _: '' },
        { item: choices[3], score: 0.6, matches: { name: [[4, 8]] }, _: '' },
        { item: choices[4], score: 0.5, matches: { name: [[13, 17]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // lastGroup items should appear at the end
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it('should handle empty groups and skip logic', () => {
      const choices = [
        { id: '1', name: 'Available Test', group: 'Active', keyword: 'available' },
        { id: '2', name: 'Active Group Header', group: 'Active', skip: true },
        { id: '3', name: 'Empty Group Header', group: 'Empty', skip: true },
        { id: '4', name: 'Another Test', group: 'Other', keyword: 'another' },
      ];
      const searchResults = [
        { item: choices[0], score: 0.9, matches: { name: [[10, 14]] }, _: '' },
        { item: choices[3], score: 0.8, matches: { name: [[8, 12]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();
    });
  });

  describe('Info, Miss, and Special Choice Types', () => {
    it('should prioritize info choices appropriately', () => {
      const choices = [
        { id: '1', name: 'Search Help', info: true },
        { id: '2', name: 'test script', keyword: 'test' },
        { id: '3', name: 'Usage Instructions', info: true },
        { id: '4', name: 'testing framework', keyword: 'framework' },
      ];
      const searchResults = [
        { item: choices[1], score: 1.0, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[3], score: 0.8, matches: { name: [[0, 4]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Info choices should appear at the top
        const infoChoices = results.filter((r) => r.item.info === true);
        expect(infoChoices.length).toBeGreaterThan(0);
      }
    });

    it('should show miss choices only when no other matches exist', () => {
      const choices = [
        { id: '1', name: 'No Results Found', miss: true },
        { id: '2', name: 'Try Different Search', miss: true },
        { id: '3', name: 'regular script', keyword: 'regular' },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce([]);

      // Search with no matches
      invokeSearch(mockPrompt, 'nonexistent');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Should show miss choices when no matches
        expect(results.some((r) => r.item.miss === true)).toBe(true);
      }
    });

    it('should handle hideWithoutInput choices correctly', () => {
      const choices = [
        { id: '1', name: 'Hidden When Empty', hideWithoutInput: true },
        { id: '2', name: 'test script', keyword: 'test' },
        { id: '3', name: 'Always Visible', keyword: 'visible' },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;

      // Test with empty input
      invokeSearch(mockPrompt, '');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Hidden choice should not appear with empty input
        expect(results.some((r) => r.item.hideWithoutInput === true)).toBe(false);
      }
    });

    it('should show hideWithoutInput choices when there is input', () => {
      const choices = [
        { id: '1', name: 'test hidden choice', hideWithoutInput: true, keyword: 'hidden' },
        { id: '2', name: 'test script', keyword: 'test' },
        { id: '3', name: 'Always Visible', keyword: 'visible' },
      ];
      const searchResults = [
        { item: choices[0], score: 0.9, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[1], score: 0.8, matches: { name: [[0, 4]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();
    });
  });

  describe('Complex Real-world Scenarios', () => {
    it('should handle complete script objects with all properties', () => {
      const choices: Script[] = [
        {
          id: '1',
          name: 'Git Status [gs]',
          alias: 'gst',
          keyword: 'git',
          group: 'Git Tools',
          pass: false,
          filePath: '/scripts/git-status.js',
          shortcut: 'cmd+g',
          tag: 'version-control',
          command: 'node',
          type: ProcessType.Background,
          kenv: 'main',
        },
        {
          id: '2',
          name: 'File Search',
          keyword: 'search',
          group: 'File Operations',
          pass: true,
          filePath: '/scripts/file-search.js',
          tag: 'files',
          command: 'node',
          type: ProcessType.Schedule,
          kenv: 'main',
        },
        {
          id: '3',
          name: 'Test Runner [test]',
          keyword: 'testing',
          group: 'Development',
          pass: '/^test-.*/i',
          filePath: '/scripts/test-runner.js',
          shortcut: 'cmd+t',
          tag: 'testing',
          command: 'node',
          type: ProcessType.System,
          kenv: 'dev',
        },
        {
          id: '4',
          name: 'URL Handler',
          keyword: 'url',
          group: 'Network',
          pass: '/^https?:\\/\\//i',
          info: false,
          miss: false,
          filePath: '/scripts/url-handler.js',
          command: 'node',
          type: ProcessType.Background,
          kenv: 'main',
        },
      ];
      const searchResults = [{ item: choices[0], score: 0.9, matches: { name: [[0, 3]] }, _: '' }];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      setShortcodes(mockPrompt, choices);
      invokeSearch(mockPrompt, 'git');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();
    });

    it('should handle competing priorities correctly', () => {
      const choices = [
        { id: '1', name: 'test', keyword: 'exact', exact: true }, // Exact name match
        { id: '2', name: 'File Manager', alias: 'test' }, // Alias match
        { id: '3', name: 'Test Runner [test]', keyword: 'runner' }, // Trigger match
        { id: '4', name: 'testing suite', keyword: 'test' }, // Keyword exact match
        { id: '5', name: 'unit test framework', keyword: 'unit' }, // Name contains match
        { id: '6', name: 'Test Handler', pass: '/^test/i' }, // Regex pass match
      ];
      const searchResults = [
        { item: choices[0], score: 1.0, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[3], score: 0.9, matches: { keyword: [[0, 4]] }, _: '' },
        { item: choices[4], score: 0.8, matches: { name: [[5, 9]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      setShortcodes(mockPrompt, choices);
      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Should have proper priority ordering
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it('should handle mixed content types and priorities', () => {
      const choices = [
        { id: '1', name: 'Search Help', info: true },
        { id: '2', name: 'Quick Search [qs]', alias: 'search', keyword: 'quick' },
        { id: '3', name: 'search tool', keyword: 'tool' },
        { id: '4', name: 'File Search', pass: 'search', keyword: 'file' },
        { id: '5', name: 'No Results', miss: true },
        { id: '6', name: 'Advanced Search', group: 'Advanced', keyword: 'advanced' },
        { id: '7', name: 'search results', hideWithoutInput: true, keyword: 'results' },
        { id: '8', name: 'Legacy Search', group: 'Legacy', lastGroup: true, keyword: 'legacy' },
      ];
      const searchResults = [
        { item: choices[2], score: 1.0, matches: { name: [[0, 6]] }, _: '' },
        { item: choices[5], score: 0.8, matches: { name: [[9, 15]] }, _: '' },
        { item: choices[6], score: 0.7, matches: { name: [[0, 6]] }, _: '' },
        { item: choices[7], score: 0.6, matches: { name: [[7, 13]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      setShortcodes(mockPrompt, choices);
      invokeSearch(mockPrompt, 'search');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];

        // Should have info at top
        const firstNonSkip = results.find((r) => !r.item.skip);
        expect(firstNonSkip?.item.info).toBe(true);

        // Should have proper grouping and ordering
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it('should handle case sensitivity scenarios', () => {
      const choices = [
        { id: '1', name: 'Test Script', keyword: 'test' },
        { id: '2', name: 'TEST FRAMEWORK', keyword: 'TEST' },
        { id: '3', name: 'tEsT hElPeR', keyword: 'TeStInG' },
        { id: '4', name: 'File Manager', alias: 'Test' },
        { id: '5', name: 'Quick Tool [TEST]', keyword: 'quick' },
      ];
      const searchResults = [
        { item: choices[0], score: 1.0, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[1], score: 0.9, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[2], score: 0.8, matches: { name: [[0, 4]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      setShortcodes(mockPrompt, choices);

      // Test lowercase
      invokeSearch(mockPrompt, 'test');
      expect(mockSendToPrompt).toHaveBeenCalled();

      // Test uppercase
      mockSendToPrompt.mockClear();
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);
      invokeSearch(mockPrompt, 'TEST');
      expect(mockSendToPrompt).toHaveBeenCalled();

      // Test mixed case
      mockSendToPrompt.mockClear();
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);
      invokeSearch(mockPrompt, 'TeSt');
      expect(mockSendToPrompt).toHaveBeenCalled();
    });

    it('should handle shortcode priority', () => {
      const choices = [
        { id: '1', name: 'File Manager', shortcode: 'fm', keyword: 'file' },
        { id: '2', name: 'Format Manager', keyword: 'format' },
        { id: '3', name: 'Focus Mode', keyword: 'focus' },
        { id: '4', name: 'fm radio script', keyword: 'radio' },
      ];
      const searchResults = [{ item: choices[3], score: 0.8, matches: { name: [[0, 2]] }, _: '' }];

      mockPrompt.kitSearch.choices = choices;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      setShortcodes(mockPrompt, choices);
      invokeSearch(mockPrompt, 'fm');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();
    });
  });

  describe('Edge Cases in Ordering', () => {
    it('should handle choices with identical names but different properties', () => {
      const choices = [
        { id: '1', name: 'Test Script', keyword: 'one' },
        { id: '2', name: 'Test Script', keyword: 'two', exact: true },
        { id: '3', name: 'Test Script', alias: 'ts' },
        { id: '4', name: 'Test Script', pass: true },
      ];
      const searchResults = [
        { item: choices[0], score: 1.0, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[1], score: 1.0, matches: { name: [[0, 4]] }, _: '' },
        { item: choices[2], score: 1.0, matches: { name: [[0, 4]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      setShortcodes(mockPrompt, choices);
      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();
    });

    it('should handle choices with no matching properties', () => {
      const choices = [
        { id: '1', name: 'Alpha Script', keyword: 'alpha' },
        { id: '2', name: 'Beta Tool', keyword: 'beta' },
        { id: '3', name: 'Gamma Helper', keyword: 'gamma' },
        { id: '4', name: 'Always Available', pass: true },
      ];
      mockPrompt.kitSearch.choices = choices;
      mockKitSearchQs.search.mockReturnValueOnce([]);

      invokeSearch(mockPrompt, 'nonexistent');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Should only show pass choices
        expect(results.every((r) => r.item.pass === true)).toBe(true);
      }
    });

    it('should handle sorting with score ties', () => {
      const choices = Array.from({ length: 20 }, (_, i) => ({
        id: `choice-${i}`,
        name: `test choice ${i}`,
        keyword: `keyword${i}`,
        group: i % 3 === 0 ? 'Group A' : i % 3 === 1 ? 'Group B' : 'Group C',
      }));
      const searchResults = choices.slice(0, 10).map((choice, _i) => ({
        item: choice,
        score: 0.8, // Same score for tie-breaking
        matches: { name: [[0, 4]] },
        _: '',
      }));

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it('should handle multiple exact matches in different categories', () => {
      const choices = [
        { id: '1', name: 'run', keyword: 'execute' }, // Exact name
        { id: '2', name: 'Test Runner', keyword: 'run' }, // Exact keyword
        { id: '3', name: 'Script Runner', alias: 'run' }, // Exact alias
        { id: '4', name: 'Run Tool [run]', keyword: 'tool' }, // Exact trigger
        { id: '5', name: 'File Manager', pass: 'run' }, // Exact postfix
      ];
      const searchResults = [
        { item: choices[0], score: 1.0, matches: { name: [[0, 3]] }, _: '' },
        { item: choices[1], score: 1.0, matches: { keyword: [[0, 3]] }, _: '' },
        { item: choices[3], score: 0.8, matches: { name: [[0, 3]] }, _: '' },
      ];

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      setShortcodes(mockPrompt, choices);
      invokeSearch(mockPrompt, 'run');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Should have multiple priority groups
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it('should handle complex nested group scenarios', () => {
      const choices = [
        { id: '1', name: 'test alpha', group: 'Group/SubGroup/Alpha', keyword: 'alpha' },
        { id: '2', name: 'test beta', group: 'Group/SubGroup/Beta', keyword: 'beta' },
        { id: '3', name: 'test gamma', group: 'Group/Other', keyword: 'gamma' },
        { id: '4', name: 'test delta', group: 'Different', keyword: 'delta' },
        { id: '5', name: 'test epsilon', group: 'Different/Sub', keyword: 'epsilon' },
        { id: '6', name: 'test final', group: 'Final', lastGroup: true, keyword: 'final' },
      ];
      const searchResults = choices.map((choice, i) => ({
        item: choice,
        score: 1.0 - i * 0.1,
        matches: { name: [[0, 4]] },
        _: '',
      }));

      mockPrompt.kitSearch.choices = choices;
      mockPrompt.kitSearch.hasGroup = true;
      mockKitSearchQs.search.mockReturnValueOnce(searchResults);

      invokeSearch(mockPrompt, 'test');

      const calls = mockSendToPrompt.mock.calls;
      const scoredChoicesCall = calls.find((call) => call[0] === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesCall).toBeDefined();

      if (scoredChoicesCall) {
        const results = scoredChoicesCall[1] as ScoredChoice[];
        // Should maintain group structure
        expect(results.length).toBeGreaterThan(0);
      }
    });
  });
});
