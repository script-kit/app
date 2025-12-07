import { Channel, Mode, PROMPT, ProcessType, UI } from '@johnlindquist/kit/core/enum';
import type { Choice, Script } from '@johnlindquist/kit/types/core';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { ScoredChoice } from '../shared/types';
import type { KitPrompt } from './prompt';

// Mock dependencies
vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn) => {
    const mockDebounced = vi.fn(fn);
    mockDebounced.cancel = vi.fn();
    return mockDebounced;
  }),
}));

vi.mock('./logs', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  searchLog: { info: vi.fn(), warn: vi.fn(), silly: vi.fn(), verbose: vi.fn() },
  perf: {
    start: vi.fn(() => vi.fn()), // start returns an end function
    end: vi.fn(),
  },
}));

vi.mock('./messages', () => ({ cacheChoices: vi.fn() }));

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

import { invokeSearch, setShortcodes } from './search';

// Helper function to simulate checkShortcodesAndKeywords behavior
const simulateShortcodeCheck = (_prompt: KitPrompt, input: string): boolean => {
  // Simple implementation that returns true for most cases
  // In real implementation this would check for keywords, shortcodes, etc.
  return input.length > 0 || input === '';
};

describe('End-to-End Search Integration', () => {
  let mockPrompt: KitPrompt;
  let mockSendToPrompt: Mock;
  let sentMessages: Array<{ channel: Channel; data: any }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    sentMessages = [];

    mockSendToPrompt = vi.fn((channel: Channel, data: any) => {
      sentMessages.push({ channel, data });
    });

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
    } as unknown as KitPrompt;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to simulate the complete UI → IPC → Search flow
  const simulateUserTyping = (
    input: string,
    choices: Choice[],
    options: {
      mode?: Mode;
      ui?: UI;
      hasShortcodes?: boolean;
      expectSearch?: boolean;
    } = {},
  ) => {
    const { mode = Mode.FILTER, ui = UI.arg, hasShortcodes = true, expectSearch = true } = options;

    // Step 1: Set up choices (like setChoices would do)
    mockPrompt.kitSearch.choices = choices;
    mockPrompt.kitSearch.hasGroup = choices.some((c) => !!c.group);

    // Set up a simple QuickScore mock
    const mockQs = {
      search: vi.fn((searchInput: string) => {
        // Simple fuzzy search simulation
        return choices
          .filter((choice) => {
            // Handle hideWithoutInput choices - don't include them for empty/whitespace input
            if (choice.hideWithoutInput && (!searchInput || searchInput.trim() === '')) {
              return false;
            }

            return (
              choice.name?.toLowerCase().includes(searchInput.toLowerCase()) ||
              choice.keyword?.toLowerCase().includes(searchInput.toLowerCase()) ||
              choice.info === true
            ); // Include info choices in search results
          })
          .map((choice) => ({
            item: choice,
            score: 0.8,
            matches: { name: [[0, searchInput.length]] },
            _: '',
          }));
      }),
    };
    mockPrompt.kitSearch.qs = mockQs as any;

    if (hasShortcodes) {
      setShortcodes(mockPrompt, choices);
    }

    // Step 2: Simulate UI sending Channel.INPUT message
    const shouldSearch = simulateShortcodeCheck(mockPrompt, input);

    if (ui === UI.arg && shouldSearch && mode === Mode.FILTER) {
      // Step 3: IPC handler calls invokeSearch
      invokeSearch(mockPrompt, input, 'user-input');
    }

    return {
      sentMessages,
      shouldSearch,
      searchWasCalled: sentMessages.some((m) => m.channel === Channel.SET_SCORED_CHOICES),
    };
  };

  describe('Complete User Flow Scenarios', () => {
    it('should handle user typing a script name and getting filtered results', () => {
      const choices: Choice[] = [
        { id: '1', name: 'File Manager', keyword: 'file', group: 'Utilities' },
        { id: '2', name: 'Git Status', keyword: 'git', group: 'Development' },
        { id: '3', name: 'Test Runner', keyword: 'test', group: 'Development' },
        { id: '4', name: 'File Explorer', keyword: 'explore', group: 'Utilities' },
      ];

      const result = simulateUserTyping('file', choices);

      expect(result.shouldSearch).toBe(true);
      expect(result.searchWasCalled).toBe(true);

      // Should have sent scored choices
      const scoredChoicesMessage = sentMessages.find((m) => m.channel === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesMessage).toBeDefined();
      expect(scoredChoicesMessage?.data).toBeInstanceOf(Array);
    });

    it('should handle shortcode input with immediate selection', () => {
      const choices: Script[] = [
        {
          id: '1',
          name: 'File Manager [fm]',
          keyword: 'file',
          group: 'Utilities',
          command: 'node',
          filePath: '/scripts/file-manager.js',
          type: ProcessType.Background,
          kenv: 'main',
        },
        {
          id: '2',
          name: 'Git Status [gs]',
          alias: 'gst',
          keyword: 'git',
          group: 'Development',
          command: 'node',
          filePath: '/scripts/git-status.js',
          type: ProcessType.Background,
          kenv: 'main',
        },
      ];

      const result = simulateUserTyping('fm', choices);

      expect(result.shouldSearch).toBe(true);
      expect(result.searchWasCalled).toBe(true);

      // Should prioritize the shortcode match
      const scoredChoicesMessage = sentMessages.find((m) => m.channel === Channel.SET_SCORED_CHOICES);
      const results = scoredChoicesMessage?.data as ScoredChoice[];

      // First non-skip result should be the trigger match
      const firstResult = results?.find((r) => !r.item.skip);
      expect(firstResult?.item.name).toBe('File Manager [fm]');
    });

    it('should handle empty input showing all available choices', () => {
      const choices: Choice[] = [
        { id: '1', name: 'Available Choice', keyword: 'available' },
        { id: '2', name: 'Hidden Choice', hideWithoutInput: true },
        { id: '3', name: 'Pass Choice', pass: true },
        { id: '4', name: 'Miss Choice', miss: true },
      ];

      const result = simulateUserTyping('', choices);

      expect(result.shouldSearch).toBe(true);
      expect(result.searchWasCalled).toBe(true);

      const scoredChoicesMessage = sentMessages.find((m) => m.channel === Channel.SET_SCORED_CHOICES);
      const results = scoredChoicesMessage?.data as ScoredChoice[];

      // Should only show available choices (not hidden, pass, or miss)
      expect(results.length).toBe(1);
      expect(results[0].item.name).toBe('Available Choice');
    });

    it('should handle no matches showing fallback choices', () => {
      const choices: Choice[] = [
        { id: '1', name: 'Alpha Script', keyword: 'alpha' },
        { id: '2', name: 'Beta Tool', keyword: 'beta' },
        { id: '3', name: 'Always Available', pass: true },
        { id: '4', name: 'No Results Found', miss: true },
      ];

      const result = simulateUserTyping('nonexistent', choices);

      expect(result.shouldSearch).toBe(true);
      expect(result.searchWasCalled).toBe(true);

      const scoredChoicesMessage = sentMessages.find((m) => m.channel === Channel.SET_SCORED_CHOICES);
      const results = scoredChoicesMessage?.data as ScoredChoice[];

      // Should show pass and miss choices as fallback
      expect(results.some((r) => r.item.pass === true)).toBe(true);
      expect(results.some((r) => r.item.miss === true)).toBe(true);
    });

    it('should handle large choice sets with debouncing', () => {
      const choices: Choice[] = Array.from({ length: 6000 }, (_, i) => ({
        id: `choice-${i}`,
        name: `Choice ${i}`,
        keyword: `keyword${i}`,
      }));

      const result = simulateUserTyping('choice', choices);

      expect(result.shouldSearch).toBe(true);
      expect(result.searchWasCalled).toBe(true);

      // Should still get results even with large choice set
      const scoredChoicesMessage = sentMessages.find((m) => m.channel === Channel.SET_SCORED_CHOICES);
      expect(scoredChoicesMessage).toBeDefined();
    });
  });

  describe('UI State Integration', () => {
    it('should not search when not in arg mode', () => {
      const choices: Choice[] = [{ id: '1', name: 'Test Choice', keyword: 'test' }];

      const result = simulateUserTyping('test', choices, { ui: UI.editor });

      expect(result.searchWasCalled).toBe(false);
    });

    it('should not search when not in filter mode', () => {
      const choices: Choice[] = [{ id: '1', name: 'Test Choice', keyword: 'test' }];

      const result = simulateUserTyping('test', choices, { mode: Mode.GENERATE });

      expect(result.searchWasCalled).toBe(false);
    });

    it('should handle mode transitions correctly', () => {
      const choices: Choice[] = [{ id: '1', name: 'Test Choice', keyword: 'test' }];

      // First in GENERATE mode (no search)
      let result = simulateUserTyping('test', choices, { mode: Mode.GENERATE });
      expect(result.searchWasCalled).toBe(false);

      // Clear messages
      sentMessages.length = 0;

      // Then switch to FILTER mode (should search)
      result = simulateUserTyping('test', choices, { mode: Mode.FILTER });
      expect(result.searchWasCalled).toBe(true);
    });
  });

  describe('Complex Real-world Scenarios', () => {
    it('should handle progressive typing with live search updates', () => {
      const choices: Choice[] = [
        { id: '1', name: 'git status', keyword: 'git' },
        { id: '2', name: 'git commit', keyword: 'git' },
        { id: '3', name: 'git push', keyword: 'git' },
        { id: '4', name: 'file manager', keyword: 'file' },
      ];

      // Simulate progressive typing: g -> gi -> git -> git st
      const progressiveInputs = ['g', 'gi', 'git', 'git st'];

      progressiveInputs.forEach((input, _index) => {
        sentMessages.length = 0; // Clear previous messages

        const result = simulateUserTyping(input, choices);
        expect(result.searchWasCalled).toBe(true);

        const scoredChoicesMessage = sentMessages.find((m) => m.channel === Channel.SET_SCORED_CHOICES);
        const results = scoredChoicesMessage?.data as ScoredChoice[];

        if (input.startsWith('git')) {
          // Should show git-related choices
          const gitChoices = results.filter((r) => r.item.name?.includes('git'));
          expect(gitChoices.length).toBeGreaterThan(0);
        }
      });
    });

    it('should handle script execution flow after search', () => {
      const choices: Script[] = [
        {
          id: '1',
          name: 'Deploy Script',
          keyword: 'deploy',
          group: 'DevOps',
          command: 'node',
          filePath: '/scripts/deploy.js',
          type: ProcessType.Background,
          kenv: 'main',
        },
      ];

      const result = simulateUserTyping('deploy', choices);

      expect(result.searchWasCalled).toBe(true);

      const scoredChoicesMessage = sentMessages.find((m) => m.channel === Channel.SET_SCORED_CHOICES);
      const results = scoredChoicesMessage?.data as ScoredChoice[];

      // Should have the deploy script available for selection
      const deployScript = results.find((r) => r.item.name === 'Deploy Script');
      expect(deployScript).toBeDefined();
      expect(deployScript?.item.filePath).toBe('/scripts/deploy.js');
    });

    it.skip('should handle info and help scenarios', () => {
      const choices: Choice[] = [
        { id: '1', name: 'Help', info: true },
        { id: '2', name: 'Usage Guide', info: true },
        { id: '3', name: 'test script', keyword: 'test' },
      ];

      const result = simulateUserTyping('test', choices);

      expect(result.searchWasCalled).toBe(true);

      const scoredChoicesMessage = sentMessages.find((m) => m.channel === Channel.SET_SCORED_CHOICES);
      const results = scoredChoicesMessage?.data as ScoredChoice[];

      // Info choices should appear first
      const infoChoices = results.filter((r) => r.item.info === true);
      expect(infoChoices.length).toBe(2);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle rapid successive inputs', () => {
      const choices: Choice[] = [{ id: '1', name: 'Test Choice', keyword: 'test' }];

      // Simulate rapid typing
      const rapidInputs = ['t', 'te', 'tes', 'test'];

      rapidInputs.forEach((input) => {
        const result = simulateUserTyping(input, choices);
        expect(result.searchWasCalled).toBe(true);
      });

      // Should have called search for each input
      const searchCalls = sentMessages.filter((m) => m.channel === Channel.SET_SCORED_CHOICES);
      expect(searchCalls.length).toBe(rapidInputs.length);
    });

    it('should handle special characters and unicode', () => {
      const choices: Choice[] = [
        { id: '1', name: 'Special @#$% Script', keyword: 'special' },
        { id: '2', name: 'Unicode 🚀 Script', keyword: 'unicode' },
      ];

      const specialInputs = ['@#$%', '🚀', 'special', 'unicode'];

      specialInputs.forEach((input) => {
        sentMessages.length = 0;
        const result = simulateUserTyping(input, choices);
        expect(result.searchWasCalled).toBe(true);
      });
    });

    it('should handle empty and whitespace scenarios', () => {
      const choices: Choice[] = [
        { id: '1', name: 'Normal Choice', keyword: 'normal' },
        { id: '2', name: 'Hidden Choice', hideWithoutInput: true },
      ];

      const emptyInputs = ['', ' ', '  ', '\t', '\n'];

      emptyInputs.forEach((input) => {
        sentMessages.length = 0;
        const result = simulateUserTyping(input, choices);

        if (input.trim() === '') {
          // Empty input should show only non-hidden choices
          const scoredChoicesMessage = sentMessages.find((m) => m.channel === Channel.SET_SCORED_CHOICES);
          const results = scoredChoicesMessage?.data as ScoredChoice[];
          expect(results.some((r) => r.item.hideWithoutInput === true)).toBe(false);
        }
      });
    });
  });
});
