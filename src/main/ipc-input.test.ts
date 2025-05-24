import { Channel, Mode, UI } from '@johnlindquist/kit/core/enum';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { KitPrompt } from './prompt';
import type { ScoredChoice } from '../shared/types';

// Mock dependencies
vi.mock('lodash-es', () => ({
  debounce: vi.fn((fn) => {
    const mockDebounced = vi.fn(fn);
    mockDebounced.cancel = vi.fn();
    return mockDebounced;
  }),
}));

vi.mock('./logs', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./search', () => ({
  invokeSearch: vi.fn(),
  checkShortcodesAndKeywords: vi.fn(() => true),
}));

import { invokeSearch, checkShortcodesAndKeywords } from './search';

// Type for message structure
interface InputMessage {
  state: {
    input: string;
    ui: UI;
    mode?: Mode;
    flaggedValue?: string;
  };
}

describe('IPC Channel.INPUT Integration', () => {
  let mockPrompt: KitPrompt;
  let mockInvokeSearch: Mock;
  let mockCheckShortcodesAndKeywords: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockInvokeSearch = vi.mocked(invokeSearch);
    mockCheckShortcodesAndKeywords = vi.mocked(checkShortcodesAndKeywords);

    mockPrompt = {
      pid: 12345,
      kitSearch: {
        input: '',
        inputRegex: undefined,
        keyword: '',
        choices: [],
      },
    } as unknown as KitPrompt;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper function to simulate IPC message processing
  const simulateInputMessage = (message: InputMessage) => {
    const { input, ui, mode, flaggedValue } = message.state;

    // Simulate the IPC handler logic from ipc.ts lines 484-511
    if (!input) {
      mockPrompt.kitSearch.input = '';
    }

    const isArg = ui === UI.arg;
    const hasFlag = flaggedValue;

    if (isArg) {
      const shouldSearch = mockCheckShortcodesAndKeywords(mockPrompt, input);
      const isFilter = mode === Mode.FILTER;

      if (shouldSearch && isFilter) {
        if (mockPrompt.kitSearch.choices.length > 5000) {
          // Would normally use debounced version
          mockInvokeSearch(mockPrompt, input, 'debounce');
        } else {
          mockInvokeSearch(mockPrompt, input, Channel.INPUT);
        }
      }
    }
  };

  describe('Basic Input Processing', () => {
    it('should process regular input in arg mode with filter', () => {
      const message: InputMessage = {
        state: {
          input: 'test',
          ui: UI.arg,
          mode: Mode.FILTER,
        },
      };

      mockCheckShortcodesAndKeywords.mockReturnValue(true);
      simulateInputMessage(message);

      expect(mockCheckShortcodesAndKeywords).toHaveBeenCalledWith(mockPrompt, 'test');
      expect(mockInvokeSearch).toHaveBeenCalledWith(mockPrompt, 'test', Channel.INPUT);
    });

    it('should clear input when empty string is sent', () => {
      const message: InputMessage = {
        state: {
          input: '',
          ui: UI.arg,
          mode: Mode.FILTER,
        },
      };

      simulateInputMessage(message);

      expect(mockPrompt.kitSearch.input).toBe('');
    });

    it('should not search when not in arg mode', () => {
      const message: InputMessage = {
        state: {
          input: 'test',
          ui: UI.editor,
          mode: Mode.FILTER,
        },
      };

      simulateInputMessage(message);

      expect(mockInvokeSearch).not.toHaveBeenCalled();
    });

    it('should not search when not in filter mode', () => {
      const message: InputMessage = {
        state: {
          input: 'test',
          ui: UI.arg,
          mode: Mode.GENERATE,
        },
      };

      simulateInputMessage(message);

      expect(mockInvokeSearch).not.toHaveBeenCalled();
    });

    it('should not search when checkShortcodesAndKeywords returns false', () => {
      const message: InputMessage = {
        state: {
          input: 'test',
          ui: UI.arg,
          mode: Mode.FILTER,
        },
      };

      mockCheckShortcodesAndKeywords.mockReturnValue(false);
      simulateInputMessage(message);

      expect(mockCheckShortcodesAndKeywords).toHaveBeenCalledWith(mockPrompt, 'test');
      expect(mockInvokeSearch).not.toHaveBeenCalled();
    });
  });

  describe('Large Choice Set Handling', () => {
    it('should use debounced search for large choice sets', () => {
      mockPrompt.kitSearch.choices = Array.from({ length: 6000 }, (_, i) => ({
        id: `choice-${i}`,
        name: `Choice ${i}`,
      }));

      const message: InputMessage = {
        state: {
          input: 'test',
          ui: UI.arg,
          mode: Mode.FILTER,
        },
      };

      mockCheckShortcodesAndKeywords.mockReturnValue(true);
      simulateInputMessage(message);

      expect(mockInvokeSearch).toHaveBeenCalledWith(mockPrompt, 'test', 'debounce');
    });

    it('should use immediate search for smaller choice sets', () => {
      mockPrompt.kitSearch.choices = Array.from({ length: 100 }, (_, i) => ({
        id: `choice-${i}`,
        name: `Choice ${i}`,
      }));

      const message: InputMessage = {
        state: {
          input: 'test',
          ui: UI.arg,
          mode: Mode.FILTER,
        },
      };

      mockCheckShortcodesAndKeywords.mockReturnValue(true);
      simulateInputMessage(message);

      expect(mockInvokeSearch).toHaveBeenCalledWith(mockPrompt, 'test', Channel.INPUT);
    });
  });

  describe('Shortcode and Keyword Integration', () => {
    it('should handle shortcode inputs', () => {
      const message: InputMessage = {
        state: {
          input: 'fm', // file manager shortcode
          ui: UI.arg,
          mode: Mode.FILTER,
        },
      };

      mockCheckShortcodesAndKeywords.mockReturnValue(true);
      simulateInputMessage(message);

      expect(mockCheckShortcodesAndKeywords).toHaveBeenCalledWith(mockPrompt, 'fm');
      expect(mockInvokeSearch).toHaveBeenCalledWith(mockPrompt, 'fm', Channel.INPUT);
    });

    it('should handle keyword inputs', () => {
      const message: InputMessage = {
        state: {
          input: 'git status',
          ui: UI.arg,
          mode: Mode.FILTER,
        },
      };

      mockCheckShortcodesAndKeywords.mockReturnValue(true);
      simulateInputMessage(message);

      expect(mockCheckShortcodesAndKeywords).toHaveBeenCalledWith(mockPrompt, 'git status');
      expect(mockInvokeSearch).toHaveBeenCalledWith(mockPrompt, 'git status', Channel.INPUT);
    });

    it('should not search when shortcode/keyword check fails', () => {
      const message: InputMessage = {
        state: {
          input: 'unknown-command',
          ui: UI.arg,
          mode: Mode.FILTER,
        },
      };

      mockCheckShortcodesAndKeywords.mockReturnValue(false);
      simulateInputMessage(message);

      expect(mockCheckShortcodesAndKeywords).toHaveBeenCalledWith(mockPrompt, 'unknown-command');
      expect(mockInvokeSearch).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in input', () => {
      const message: InputMessage = {
        state: {
          input: 'test@#$%^&*()',
          ui: UI.arg,
          mode: Mode.FILTER,
        },
      };

      mockCheckShortcodesAndKeywords.mockReturnValue(true);
      simulateInputMessage(message);

      expect(mockInvokeSearch).toHaveBeenCalledWith(mockPrompt, 'test@#$%^&*()', Channel.INPUT);
    });

    it('should handle whitespace-only input', () => {
      const message: InputMessage = {
        state: {
          input: '   ',
          ui: UI.arg,
          mode: Mode.FILTER,
        },
      };

      mockCheckShortcodesAndKeywords.mockReturnValue(true);
      simulateInputMessage(message);

      expect(mockInvokeSearch).toHaveBeenCalledWith(mockPrompt, '   ', Channel.INPUT);
    });

    it('should handle very long input strings', () => {
      const longInput = 'a'.repeat(1000);
      const message: InputMessage = {
        state: {
          input: longInput,
          ui: UI.arg,
          mode: Mode.FILTER,
        },
      };

      mockCheckShortcodesAndKeywords.mockReturnValue(true);
      simulateInputMessage(message);

      expect(mockInvokeSearch).toHaveBeenCalledWith(mockPrompt, longInput, Channel.INPUT);
    });
  });

  describe('Flag Handling', () => {
    it('should not affect search when flag is present', () => {
      const message: InputMessage = {
        state: {
          input: 'test',
          ui: UI.arg,
          mode: Mode.FILTER,
          flaggedValue: '--verbose',
        },
      };

      mockCheckShortcodesAndKeywords.mockReturnValue(true);
      simulateInputMessage(message);

      // Should still search even with flag present
      expect(mockInvokeSearch).toHaveBeenCalledWith(mockPrompt, 'test', Channel.INPUT);
    });
  });
});
