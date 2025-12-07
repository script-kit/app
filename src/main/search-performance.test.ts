import { Channel, Mode, ProcessType, UI } from '@johnlindquist/kit/core/enum';
import type { Choice, Script } from '@johnlindquist/kit/types/core';
import { afterEach, beforeEach, bench, describe, expect, type Mock, vi } from 'vitest';
import type { ScoredChoice } from '../shared/types';
import type { KitPrompt } from './prompt';

// Mock dependencies for realistic testing
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
    start: vi.fn(() => vi.fn()), // Returns a function that ends the perf measurement
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

import { invokeSearch, setChoices, setShortcodes } from './search';

// Performance measurement utilities
class PerformanceTracker {
  private measurements: Map<string, number[]> = new Map();

  startTimer(operation: string): () => number {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      if (!this.measurements.has(operation)) {
        this.measurements.set(operation, []);
      }
      this.measurements.get(operation)!.push(duration);
      return duration;
    };
  }

  getStats(operation: string) {
    const times = this.measurements.get(operation) || [];
    if (times.length === 0) {
      return null;
    }

    const sorted = times.slice().sort((a, b) => a - b);
    return {
      count: times.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  clear() {
    this.measurements.clear();
  }
}

// Generate realistic mock data
function generateMockChoices(count: number): Choice[] {
  const categories = ['File Operations', 'Git Tools', 'Development', 'System', 'Network', 'Utilities', 'DevOps'];
  const prefixes = ['Quick', 'Advanced', 'Simple', 'Super', 'Auto', 'Smart', 'Multi'];
  const actions = ['Manager', 'Tool', 'Helper', 'Runner', 'Creator', 'Generator', 'Converter', 'Analyzer'];
  const keywords = ['file', 'git', 'dev', 'sys', 'net', 'util', 'ops', 'test', 'build', 'deploy'];

  return Array.from({ length: count }, (_, i) => {
    const prefix = prefixes[i % prefixes.length];
    const action = actions[i % actions.length];
    const category = categories[i % categories.length];
    const keyword = keywords[i % keywords.length];
    const hasShortcode = i % 10 === 0; // 10% have shortcodes
    const isInfo = i % 100 === 0; // 1% are info choices
    const isHidden = i % 50 === 0; // 2% are hidden without input

    const choice: Choice = {
      id: `choice-${i}`,
      name: `${prefix} ${action} ${i}`,
      keyword: `${keyword}${i}`,
      group: category,
      tag: `tag-${keyword}`,
      description: `Description for ${prefix} ${action} ${i}`,
    };

    if (hasShortcode) {
      choice.name += ` [${keyword.slice(0, 2)}${i % 10}]`;
    }

    if (isInfo) {
      choice.info = true;
    }

    if (isHidden) {
      choice.hideWithoutInput = true;
    }

    // Add some variety
    if (i % 20 === 0) {
      choice.pass = true;
    }

    if (i % 30 === 0) {
      choice.miss = true;
    }

    return choice;
  });
}

// Generate realistic search terms based on the mock data
function generateSearchTerms(): string[] {
  return [
    // Common prefixes and actions
    'quick',
    'file',
    'git',
    'manager',
    'tool',
    'helper',
    // Progressive typing scenarios
    'f',
    'fi',
    'fil',
    'file',
    'g',
    'gi',
    'git',
    'q',
    'qu',
    'qui',
    'quick',
    // Partial matches
    'dev',
    'sys',
    'net',
    'ops',
    // Longer terms
    'file manager',
    'git tool',
    'quick helper',
    // Edge cases
    'xyz',
    '123',
    'nonexistent',
    // Empty and whitespace
    '',
    ' ',
    '  ',
    // Special characters
    '@#$',
    '🚀',
    'tëst',
  ];
}

describe('Search Performance Benchmarks', () => {
  let mockPrompt: KitPrompt;
  let mockSendToPrompt: Mock;
  let sentMessages: Array<{ channel: Channel; data: any }> = [];
  let choices: Choice[] = [];
  let performanceTracker: PerformanceTracker;

  beforeEach(async () => {
    vi.clearAllMocks();
    sentMessages = [];
    performanceTracker = new PerformanceTracker();

    mockSendToPrompt = vi.fn((channel: Channel, data: any) => {
      sentMessages.push({ channel, data });
    });

    mockPrompt = {
      ui: UI.arg,
      pid: 12345,
      scriptPath: '/test/script.ts',
      getLogPrefix: vi.fn(() => '[BENCH]'),
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
    choices = generateMockChoices(10000);

    // Set up choices with timing
    const setupTimer = performanceTracker.startTimer('setup-choices');
    setChoices(mockPrompt, choices, { preload: false });
    const setupTime = setupTimer();
  });

  afterEach(() => {
    performanceTracker.clear();
  });

  // Helper to simulate typing with performance measurement
  const measureSearch = (searchTerm: string): { duration: number; resultCount: number } => {
    sentMessages.length = 0;
    const timer = performanceTracker.startTimer(`search-${searchTerm || 'empty'}`);

    invokeSearch(mockPrompt, searchTerm, 'benchmark');

    const duration = timer();
    const scoredChoicesMessage = sentMessages.find((m) => m.channel === Channel.SET_SCORED_CHOICES);
    const resultCount = (scoredChoicesMessage?.data as ScoredChoice[])?.length || 0;

    return { duration, resultCount };
  };

  // Individual search benchmarks
  it('Single search with 10k choices - common term', () => {
    const result = measureSearch('file');
    expect(result.duration).toBeLessThan(100); // Should be fast
  });

  it('Single search with 10k choices - specific term', () => {
    const result = measureSearch('git manager');
    expect(result.duration).toBeLessThan(100);
  });

  it('Single search with 10k choices - no results', () => {
    const result = measureSearch('nonexistent');
    expect(result.duration).toBeLessThan(50); // Should be very fast for no results
  });

  it('Single search with 10k choices - empty input', () => {
    const result = measureSearch('');
    expect(result.duration).toBeLessThan(50);
  });

  // Progressive typing benchmark
  it('Progressive typing simulation', () => {
    const progressiveTerms = ['f', 'fi', 'fil', 'file', 'file m', 'file ma', 'file man'];
    const timings: number[] = [];

    progressiveTerms.forEach((term) => {
      const result = measureSearch(term);
      timings.push(result.duration);
    });

    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    expect(avgTime).toBeLessThan(75); // Progressive typing should be responsive
  });

  // Real-world usage pattern benchmark
  it('Real-world usage pattern', () => {
    const searchTerms = generateSearchTerms();
    const timings: number[] = [];

    searchTerms.forEach((term) => {
      const result = measureSearch(term);
      timings.push(result.duration);
    });

    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    const maxTime = Math.max(...timings);
    const minTime = Math.min(...timings);

    expect(avgTime).toBeLessThan(50); // Real-world usage should be fast
    expect(maxTime).toBeLessThan(200); // Even worst case should be reasonable
  });

  describe('Detailed Performance Analysis', () => {
    it('should provide comprehensive performance metrics', async () => {
      const searchTerms = generateSearchTerms();
      const results: Array<{ term: string; duration: number; resultCount: number }> = [];

      for (const term of searchTerms) {
        const result = measureSearch(term);
        results.push({ term, ...result });

        // Log individual results for terms that take longer
        if (result.duration > 50) {
        }
      }

      // Calculate overall statistics
      const durations = results.map((r) => r.duration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);
      const slowSearches = results.filter((r) => r.duration > 100);

      if (slowSearches.length > 0) {
        slowSearches.forEach((_s) => {});
      }

      // Performance assertions
      expect(avgDuration).toBeLessThan(50); // Average should be under 50ms
      expect(maxDuration).toBeLessThan(200); // No search should take more than 200ms
      expect(slowSearches.length).toBeLessThan(results.length * 0.1); // Less than 10% should be slow
    });

    it('should measure memory usage during search', () => {
      const initialMemory = process.memoryUsage();

      // Perform multiple searches (reduced for faster testing)
      const searchTerms = ['file', 'git', 'quick', 'manager', 'tool'];
      searchTerms.forEach((term) => {
        for (let i = 0; i < 20; i++) {
          // Reduced from 100 to 20
          measureSearch(term);
        }
      });

      const finalMemory = process.memoryUsage();
      const memoryDiff = {
        rss: finalMemory.rss - initialMemory.rss,
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
        heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
      };

      // Memory should not grow excessively
      expect(memoryDiff.heapUsed).toBeLessThan(200 * 1024 * 1024); // Less than 200MB growth
    });

    it('should test concurrent search performance', async () => {
      const concurrentSearches = 10;
      const searchTerm = 'file manager';

      const startTime = performance.now();

      const promises = Array.from({ length: concurrentSearches }, async (_, i) => {
        // Simulate slight delay between searches
        await new Promise((resolve) => setTimeout(resolve, i * 5));
        return measureSearch(searchTerm);
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      const avgConcurrentTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

      expect(avgConcurrentTime).toBeLessThan(100); // Should handle concurrency well
    });

    it('should benchmark different choice set sizes', () => {
      const sizes = [1000, 2500, 5000, 7500, 10000];
      const searchTerm = 'file manager';

      sizes.forEach((size) => {
        const subset = choices.slice(0, size);
        setChoices(mockPrompt, subset, { preload: false });

        const measurements = [];
        for (let i = 0; i < 10; i++) {
          const result = measureSearch(searchTerm);
          measurements.push(result.duration);
        }

        const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;

        // Performance should scale reasonably
        expect(avgTime).toBeLessThan(size * 0.02); // Max 0.02ms per choice
      });

      // Reset to full choice set
      setChoices(mockPrompt, choices, { preload: false });
    });
  });
});
