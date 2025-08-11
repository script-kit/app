import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteText } from './keyboard';

// Mock dependencies
vi.mock('./logs', () => ({
  keyboardLog: {
    info: vi.fn(),
    warn: vi.fn(),
    silly: vi.fn(),
  },
}));

vi.mock('./state', () => ({
  kitState: {
    supportsNut: true,
    isTyping: false,
  },
}));

vi.mock('./shims', () => ({
  default: {
    '@jitsi/robotjs': {
      keyTap: vi.fn(),
    },
  },
}));

vi.mock('./io', () => ({
  expectBackspaces: vi.fn(),
}));

// Import after mocks
import { expectBackspaces } from './io';
import { keyboardLog as log } from './logs';
import shims from './shims';
import { kitState } from './state';

describe('DeleteText Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kitState.supportsNut = true;
    kitState.isTyping = false;
    // Reset the keyTap mock to default behavior (no-op)
    (shims['@jitsi/robotjs'].keyTap as Mock).mockImplementation(() => {});
  });

  describe('Basic functionality', () => {
    it('should handle empty string', async () => {
      (expectBackspaces as Mock).mockResolvedValue(undefined);
      
      await deleteText('');
      
      expect(expectBackspaces).toHaveBeenCalledWith(0);
      expect(shims['@jitsi/robotjs'].keyTap).not.toHaveBeenCalled();
    });

    it('should delete single character', async () => {
      (expectBackspaces as Mock).mockResolvedValue(undefined);
      
      await deleteText('a');
      
      expect(expectBackspaces).toHaveBeenCalledWith(1);
      expect(shims['@jitsi/robotjs'].keyTap).toHaveBeenCalledTimes(1);
      expect(shims['@jitsi/robotjs'].keyTap).toHaveBeenCalledWith('backspace');
    });

    it('should delete multiple characters in reverse order', async () => {
      (expectBackspaces as Mock).mockResolvedValue(undefined);
      
      await deleteText('hello');
      
      expect(expectBackspaces).toHaveBeenCalledWith(5);
      expect(shims['@jitsi/robotjs'].keyTap).toHaveBeenCalledTimes(5);
      
      // Verify all calls were for backspace
      for (let i = 0; i < 5; i++) {
        expect(shims['@jitsi/robotjs'].keyTap).toHaveBeenNthCalledWith(i + 1, 'backspace');
      }
    });

    it('should handle special characters and emojis', async () => {
      (expectBackspaces as Mock).mockResolvedValue(undefined);
      
      const specialString = 'Hello! 👋 @user';
      const charCount = specialString.split('').length;
      
      await deleteText(specialString);
      
      expect(expectBackspaces).toHaveBeenCalledWith(charCount);
      expect(shims['@jitsi/robotjs'].keyTap).toHaveBeenCalledTimes(charCount);
    });
  });

  describe('Platform support', () => {
    it('should warn and exit early when Nut is not supported', async () => {
      kitState.supportsNut = false;
      
      await deleteText('test');
      
      expect(log.warn).toHaveBeenCalledWith(
        'Keyboard type: Nut not supported on Windows arm64 or Linux arm64. Hoping to find a solution soon!'
      );
      expect(expectBackspaces).not.toHaveBeenCalled();
      expect(shims['@jitsi/robotjs'].keyTap).not.toHaveBeenCalled();
    });
  });

  describe('State management', () => {
    it('should set isTyping to true during deletion', async () => {
      let isTypingDuringDelete = false;
      
      (expectBackspaces as Mock).mockImplementation(() => {
        isTypingDuringDelete = kitState.isTyping;
        return Promise.resolve();
      });
      
      await deleteText('test');
      
      expect(isTypingDuringDelete).toBe(true);
    });

    it('should set isTyping to false after deletion', async () => {
      (expectBackspaces as Mock).mockResolvedValue(undefined);
      
      await deleteText('test');
      
      expect(kitState.isTyping).toBe(false);
    });

    it('should reset isTyping even if expectBackspaces fails', async () => {
      (expectBackspaces as Mock).mockRejectedValue(new Error('Timeout'));
      
      await expect(deleteText('test')).rejects.toThrow('Timeout');
      
      expect(kitState.isTyping).toBe(false);
    });
  });

  describe('Synchronization with io.ts', () => {
    it('should wait for all backspaces to be detected', async () => {
      let resolveBackspaces: () => void;
      const backspacePromise = new Promise<void>((resolve) => {
        resolveBackspaces = resolve;
      });
      
      (expectBackspaces as Mock).mockReturnValue(backspacePromise);
      
      const deletePromise = deleteText('hello');
      
      // Verify keyTaps were sent
      expect(shims['@jitsi/robotjs'].keyTap).toHaveBeenCalledTimes(5);
      
      // deleteText should still be waiting
      let deleteCompleted = false;
      deletePromise.then(() => { deleteCompleted = true; });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(deleteCompleted).toBe(false);
      
      // Resolve backspace detection
      resolveBackspaces!();
      await deletePromise;
      
      expect(deleteCompleted).toBe(true);
    });

    it('should log waiting and completion messages', async () => {
      (expectBackspaces as Mock).mockResolvedValue(undefined);
      
      await deleteText('hi');
      
      expect(log.info).toHaveBeenCalledWith('Deleting text', {
        stringToDelete: 'hi',
        charCount: 2,
      });
      expect(log.info).toHaveBeenCalledWith('Waiting for all backspaces to be detected...');
      expect(log.info).toHaveBeenCalledWith('All backspaces detected, deletion complete', {
        stringToDelete: 'hi',
      });
    });

    it('should send all backspaces before waiting', async () => {
      const callOrder: string[] = [];
      
      (shims['@jitsi/robotjs'].keyTap as Mock).mockImplementation(() => {
        callOrder.push('keyTap');
      });
      
      (expectBackspaces as Mock).mockImplementation(() => {
        callOrder.push('expectBackspaces');
        return Promise.resolve();
      });
      
      await deleteText('abc');
      
      // expectBackspaces should be called first, then all keyTaps
      expect(callOrder[0]).toBe('expectBackspaces');
      expect(callOrder.slice(1)).toEqual(['keyTap', 'keyTap', 'keyTap']);
    });
  });

  describe('Error handling', () => {
    it('should propagate errors from expectBackspaces', async () => {
      const error = new Error('Backspace timeout');
      (expectBackspaces as Mock).mockRejectedValue(error);
      
      await expect(deleteText('test')).rejects.toThrow('Backspace timeout');
    });

    it('should handle robotjs keyTap errors gracefully', async () => {
      (expectBackspaces as Mock).mockResolvedValue(undefined);
      (shims['@jitsi/robotjs'].keyTap as Mock).mockImplementation(() => {
        throw new Error('keyTap failed');
      });
      
      await expect(deleteText('test')).rejects.toThrow('keyTap failed');
      expect(kitState.isTyping).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle very long strings', async () => {
      (expectBackspaces as Mock).mockResolvedValue(undefined);
      
      const longString = 'a'.repeat(1000);
      await deleteText(longString);
      
      expect(expectBackspaces).toHaveBeenCalledWith(1000);
      expect(shims['@jitsi/robotjs'].keyTap).toHaveBeenCalledTimes(1000);
    });

    it('should handle strings with newlines and tabs', async () => {
      (expectBackspaces as Mock).mockResolvedValue(undefined);
      
      const multilineString = 'line1\nline2\ttab';
      const charCount = multilineString.split('').length;
      
      await deleteText(multilineString);
      
      expect(expectBackspaces).toHaveBeenCalledWith(charCount);
      expect(shims['@jitsi/robotjs'].keyTap).toHaveBeenCalledTimes(charCount);
    });

    it('should handle rapid consecutive deletions', async () => {
      (expectBackspaces as Mock).mockResolvedValue(undefined);
      
      // Start multiple deletions
      const promise1 = deleteText('first');
      const promise2 = deleteText('second');
      
      await Promise.all([promise1, promise2]);
      
      // Both should complete successfully
      expect(expectBackspaces).toHaveBeenCalledTimes(2);
      expect(expectBackspaces).toHaveBeenCalledWith(5); // 'first'
      expect(expectBackspaces).toHaveBeenCalledWith(6); // 'second'
    });

    it('should log each character deletion in silly mode', async () => {
      (expectBackspaces as Mock).mockResolvedValue(undefined);
      
      await deleteText('ab');
      
      expect(log.silly).toHaveBeenCalledWith('Sent backspace for b');
      expect(log.silly).toHaveBeenCalledWith('Sent backspace for a');
    });
  });
});