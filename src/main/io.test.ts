import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { expectBackspaces, registerIO, toKey } from './io';

// Mock dependencies
vi.mock('./logs', () => ({
  ioLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  keymapLog: {
    info: vi.fn(),
  },
}));

vi.mock('./process', () => ({
  sendToAllActiveChildren: vi.fn(),
}));

vi.mock('./shims', () => ({
  default: {
    'uiohook-napi': {
      UiohookKey: {
        Comma: 188,
        Period: 190,
        Slash: 191,
        Backslash: 220,
        Semicolon: 186,
        Equal: 187,
        Minus: 189,
        Quote: 222,
        Escape: 27,
      },
      uIOhook: {
        on: vi.fn(),
        start: vi.fn(),
      },
    },
  },
  supportsDependency: vi.fn(() => true),
  target: 'test',
}));

vi.mock('./state', () => ({
  getAccessibilityAuthorized: vi.fn(() => Promise.resolve(true)),
  kitState: {
    keymap: null,
    kenvEnv: {},
    snippet: '',
    escapePressed: false,
  },
  kitStore: {
    get: vi.fn(() => true),
    set: vi.fn(),
  },
}));

import shims from './shims';
// Import after mocks
import { kitState } from './state';

describe('Backspace Tracking Tests', () => {
  let clearTimeoutSpy: Mock;
  let setTimeoutSpy: Mock;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock timers
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;
    setTimeoutSpy = vi.fn((fn, ms) => originalSetTimeout(fn, ms));
    clearTimeoutSpy = vi.fn((id) => originalClearTimeout(id));
    global.setTimeout = setTimeoutSpy as any;
    global.clearTimeout = clearTimeoutSpy as any;
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });

  describe('expectBackspaces', () => {
    it('should return resolved promise for count of 0', async () => {
      const promise = expectBackspaces(0);
      await expect(promise).resolves.toBeUndefined();
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    });

    it('should create promise for positive count', () => {
      const promise = expectBackspaces(5);
      expect(promise).toBeInstanceOf(Promise);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it('should reject after 5 second timeout', async () => {
      vi.useFakeTimers();
      const promise = expectBackspaces(3);

      // Add a catch handler to suppress unhandled rejection warning
      const rejectionHandler = vi.fn();
      promise.catch(rejectionHandler);

      // Advance time by 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      await expect(promise).rejects.toThrow('Backspace timeout...');
      vi.useRealTimers();
    });

    it('should clear timeout when resolved', async () => {
      const { uIOhook } = shims['uiohook-napi'];
      let keydownHandler: any;

      // Capture the keydown handler
      (uIOhook.on as Mock).mockImplementation((event, handler) => {
        if (event === 'keydown') {
          keydownHandler = handler;
        }
      });

      await registerIO(vi.fn());

      // Start tracking 1 backspace
      const promise = expectBackspaces(1);

      // Simulate backspace keypress
      keydownHandler({ keycode: 14, shiftKey: false });

      await promise;

      // Timeout should have been cleared
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should prevent double resolution', async () => {
      const { uIOhook } = shims['uiohook-napi'];
      let keydownHandler: any;

      (uIOhook.on as Mock).mockImplementation((event, handler) => {
        if (event === 'keydown') {
          keydownHandler = handler;
        }
      });

      await registerIO(vi.fn());

      const promise = expectBackspaces(2);

      // Simulate two backspace keypresses
      keydownHandler({ keycode: 14, shiftKey: false });
      keydownHandler({ keycode: 14, shiftKey: false });

      // Try to simulate more backspaces after resolution
      keydownHandler({ keycode: 14, shiftKey: false });
      keydownHandler({ keycode: 14, shiftKey: false });

      // Should still resolve normally without errors
      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle concurrent backspace expectations', async () => {
      const { uIOhook } = shims['uiohook-napi'];
      let keydownHandler: any;

      (uIOhook.on as Mock).mockImplementation((event, handler) => {
        if (event === 'keydown') {
          keydownHandler = handler;
        }
      });

      await registerIO(vi.fn());

      // Start first expectation
      const promise1 = expectBackspaces(2);

      // Simulate backspaces
      keydownHandler({ keycode: 14, shiftKey: false });
      keydownHandler({ keycode: 14, shiftKey: false });

      await promise1;

      // Start second expectation
      const promise2 = expectBackspaces(3);

      // Simulate more backspaces
      keydownHandler({ keycode: 14, shiftKey: false });
      keydownHandler({ keycode: 14, shiftKey: false });
      keydownHandler({ keycode: 14, shiftKey: false });

      await promise2;
    });
  });

  describe('registerIO with backspace tracking', () => {
    it('should track backspaces in keydown handler', async () => {
      const { uIOhook, UiohookKey } = shims['uiohook-napi'];
      let keydownHandler: any;

      (uIOhook.on as Mock).mockImplementation((event, handler) => {
        if (event === 'keydown') {
          keydownHandler = handler;
        }
      });

      await registerIO(vi.fn());

      const promise = expectBackspaces(3);

      // Simulate three backspace keypresses
      keydownHandler({ keycode: 14, shiftKey: false });
      keydownHandler({ keycode: 14, shiftKey: false });
      keydownHandler({ keycode: 14, shiftKey: false });

      await expect(promise).resolves.toBeUndefined();
    });

    it('should ignore backspaces when not expecting them', async () => {
      const { uIOhook } = shims['uiohook-napi'];
      let keydownHandler: any;

      (uIOhook.on as Mock).mockImplementation((event, handler) => {
        if (event === 'keydown') {
          keydownHandler = handler;
        }
      });

      const mockHandler = vi.fn();
      await registerIO(mockHandler);

      // Simulate backspace without expectation
      keydownHandler({ keycode: 14, shiftKey: false });

      // Handler should still be called
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          keycode: 14,
          key: '', // backspace doesn't have a key representation
        }),
      );
    });

    it('should only count backspaces when expected', async () => {
      const { uIOhook } = shims['uiohook-napi'];
      let keydownHandler: any;

      (uIOhook.on as Mock).mockImplementation((event, handler) => {
        if (event === 'keydown') {
          keydownHandler = handler;
        }
      });

      await registerIO(vi.fn());

      // Start expecting 2 backspaces
      const promise = expectBackspaces(2);

      // Simulate other keys
      keydownHandler({ keycode: 65, shiftKey: false }); // 'a'
      keydownHandler({ keycode: 66, shiftKey: false }); // 'b'

      // These should not resolve the promise

      // Now simulate backspaces
      keydownHandler({ keycode: 14, shiftKey: false });
      keydownHandler({ keycode: 14, shiftKey: false });

      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle escape key tracking alongside backspace', async () => {
      const { uIOhook, UiohookKey } = shims['uiohook-napi'];
      let keydownHandler: any;
      let keyupHandler: any;

      (uIOhook.on as Mock).mockImplementation((event, handler) => {
        if (event === 'keydown') {
          keydownHandler = handler;
        } else if (event === 'keyup') {
          keyupHandler = handler;
        }
      });

      await registerIO(vi.fn());

      // Simulate escape keypress
      keydownHandler({ keycode: UiohookKey.Escape, shiftKey: false });
      expect(kitState.escapePressed).toBe(true);

      // Simulate escape release
      keyupHandler({ keycode: UiohookKey.Escape });
      expect(kitState.escapePressed).toBe(false);
    });
  });

  describe('Memory leak prevention', () => {
    it('should clean up references after resolution', async () => {
      const { uIOhook } = shims['uiohook-napi'];
      let keydownHandler: any;

      (uIOhook.on as Mock).mockImplementation((event, handler) => {
        if (event === 'keydown') {
          keydownHandler = handler;
        }
      });

      await registerIO(vi.fn());

      const promise = expectBackspaces(1);

      // Simulate backspace
      keydownHandler({ keycode: 14, shiftKey: false });

      await promise;

      // Try to trigger more backspaces - should not cause issues
      keydownHandler({ keycode: 14, shiftKey: false });
      keydownHandler({ keycode: 14, shiftKey: false });

      // No errors should occur
    });

    it.skip('should clean up on timeout', async () => {
      vi.useFakeTimers();

      const promise = expectBackspaces(5);

      // Add a catch handler to suppress unhandled rejection warning
      const rejectionHandler = vi.fn();
      promise.catch(rejectionHandler);

      // Advance past timeout
      vi.runAllTimers();

      // Expect the promise to reject with a timeout error
      await expect(promise).rejects.toThrow('Backspace timeout...');

      // Clear timeout should have been called internally
      expect(clearTimeoutSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('toKey function', () => {
    beforeEach(() => {
      // Reset UiohookToName for each test
      vi.resetModules();
    });

    it.skip('should convert keycode to lowercase key', () => {
      // Mock UiohookKey entries
      const mockUiohookToName: Record<number, string> = {
        65: 'A',
        66: 'B',
        188: ',',
        190: '.',
      };

      // Mock the module to return our test data
      vi.doMock('./io', async () => {
        const actual = await vi.importActual('./io');
        return {
          ...actual,
          UiohookToName: mockUiohookToName,
        };
      });

      const { toKey } = require('./io');

      expect(toKey(65)).toBe('a');
      expect(toKey(66)).toBe('b');
      expect(toKey(188)).toBe(',');
      expect(toKey(190)).toBe('.');
    });

    it.skip('should apply shift modifications', () => {
      const mockUiohookToName: Record<number, string> = {
        49: '1',
        50: '2',
        188: ',',
        190: '.',
      };

      vi.doMock('./io', async () => {
        const actual = await vi.importActual('./io');
        return {
          ...actual,
          UiohookToName: mockUiohookToName,
        };
      });

      const { toKey } = require('./io');

      expect(toKey(49, true)).toBe('!');
      expect(toKey(50, true)).toBe('@');
      expect(toKey(188, true)).toBe('<');
      expect(toKey(190, true)).toBe('>');
    });
  });
});
