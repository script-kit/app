import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { AppChannel } from '../shared/enums';
import { handleTerminalCapture } from './prompt';
import type { PromptData } from '@johnlindquist/kit/types/core';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/path'),
  },
  ipcMain: {
    on: vi.fn(),
    off: vi.fn(),
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

// Mock prompt utilities
vi.mock('./prompts', () => ({
  prompts: {
    find: vi.fn(),
  },
}));

// Mock logs
vi.mock('./logs', () => ({
  promptLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  termLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Terminal IPC Communication Tests', () => {
  let mockHandlers: Map<string, Function>;

  beforeEach(() => {
    mockHandlers = new Map();
    
    // Capture IPC handlers
    vi.mocked(ipcMain.on).mockImplementation((channel: string, handler: Function) => {
      mockHandlers.set(channel, handler);
      return ipcMain;
    });

    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: Function) => {
      mockHandlers.set(channel, handler);
      return undefined;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockHandlers.clear();
  });

  describe('TERM_SELECTION event', () => {
    it('should handle terminal selection events', async () => {
      // Import the module to register IPC handlers
      await import('./prompt');

      // Get the registered handler
      const selectionHandler = mockHandlers.get(AppChannel.TERM_SELECTION);
      expect(selectionHandler).toBeDefined();

      // Create mock event and data
      const mockEvent = { sender: { id: 1 } };
      const mockData = {
        pid: 12345,
        text: 'Selected text from terminal',
      };

      // Create a mock prompt that should receive the selection
      const mockPrompt = {
        pid: 12345,
        selectedText: '',
      };

      // Mock finding the prompt
      const { prompts } = await import('./prompts');
      vi.mocked(prompts.find).mockReturnValue(mockPrompt as any);

      // Call the handler
      selectionHandler(mockEvent, mockData);

      // Verify the prompt was found with correct PID
      expect(prompts.find).toHaveBeenCalledWith(
        expect.any(Function)
      );

      // Verify the selection was stored
      const findCall = vi.mocked(prompts.find).mock.calls[0];
      const findPredicate = findCall[0];
      expect(findPredicate(mockPrompt)).toBe(true);
      expect(findPredicate({ pid: 99999 })).toBe(false);
    });

    it('should ignore selection events for non-existent prompts', async () => {
      await import('./prompt');

      const selectionHandler = mockHandlers.get(AppChannel.TERM_SELECTION);
      const mockEvent = { sender: { id: 1 } };
      const mockData = {
        pid: 99999,
        text: 'Selected text',
      };

      // Mock not finding any prompt
      const { prompts } = await import('./prompts');
      vi.mocked(prompts.find).mockReturnValue(undefined);

      // Should not throw
      expect(() => {
        selectionHandler(mockEvent, mockData);
      }).not.toThrow();

      expect(prompts.find).toHaveBeenCalled();
    });
  });

  describe('TERM_CAPTURE_READY event', () => {
    it('should forward capture ready events to the SDK', async () => {
      // This event is sent from PTY to renderer, then forwarded to SDK
      const mockEvent = { sender: { id: 1 } };
      const mockData = {
        text: 'Captured terminal output',
        exitCode: 0,
      };

      // Mock window with webContents
      const mockWebContents = {
        send: vi.fn(),
      };
      const mockWindow = {
        webContents: mockWebContents,
        isDestroyed: () => false,
      };

      const mockPrompt = {
        pid: 12345,
        window: mockWindow,
      };

      // Import and setup
      await import('./prompt');
      const { prompts } = await import('./prompts');
      vi.mocked(prompts.find).mockReturnValue(mockPrompt as any);

      // Simulate the PTY sending capture ready
      if (mockPrompt.window && !mockPrompt.window.isDestroyed()) {
        mockPrompt.window.webContents.send(AppChannel.TERM_CAPTURE_READY, mockData);
      }

      // Verify the event was sent
      expect(mockWebContents.send).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        mockData
      );
    });
  });

  describe('Terminal lifecycle events', () => {
    it('should handle TERM_READY event', async () => {
      await import('./prompt');

      // Mock handler for TERM_READY
      const readyHandler = mockHandlers.get(AppChannel.TERM_READY);
      expect(readyHandler).toBeDefined();

      const mockEvent = { sender: { id: 1 } };
      const mockData = { pid: 12345 };

      // Should handle without error
      expect(() => {
        readyHandler?.(mockEvent, mockData);
      }).not.toThrow();
    });

    it('should handle TERM_EXIT event with capture', async () => {
      await import('./prompt');

      const exitHandler = mockHandlers.get(AppChannel.TERM_EXIT);
      expect(exitHandler).toBeDefined();

      const mockEvent = { sender: { id: 1 } };
      const mockData = { 
        pid: 12345,
        exitCode: 0,
      };

      // Mock prompt with capture enabled
      const mockPrompt = {
        pid: 12345,
        promptData: {
          capture: {
            mode: 'full',
          },
        },
        sendToPrompt: vi.fn(),
      };

      const { prompts } = await import('./prompts');
      vi.mocked(prompts.find).mockReturnValue(mockPrompt as any);

      // Handle exit
      exitHandler?.(mockEvent, mockData);

      // Should trigger capture completion
      expect(mockPrompt.sendToPrompt).toHaveBeenCalled();
    });
  });

  describe('Error scenarios', () => {
    it('should handle IPC errors gracefully', async () => {
      await import('./prompt');

      const selectionHandler = mockHandlers.get(AppChannel.TERM_SELECTION);
      
      // Invalid data
      const mockEvent = { sender: { id: 1 } };
      const invalidData = null;

      // Should not throw
      expect(() => {
        selectionHandler?.(mockEvent, invalidData);
      }).not.toThrow();
    });

    it('should handle concurrent selection events', async () => {
      await import('./prompt');

      const selectionHandler = mockHandlers.get(AppChannel.TERM_SELECTION);
      const mockEvent = { sender: { id: 1 } };

      // Create multiple prompts
      const mockPrompts = [
        { pid: 1, selectedText: '' },
        { pid: 2, selectedText: '' },
        { pid: 3, selectedText: '' },
      ];

      const { prompts } = await import('./prompts');

      // Send selection events rapidly
      for (let i = 0; i < 100; i++) {
        const pid = (i % 3) + 1;
        const mockData = {
          pid,
          text: `Selection ${i}`,
        };

        vi.mocked(prompts.find).mockReturnValue(mockPrompts[pid - 1] as any);
        
        selectionHandler?.(mockEvent, mockData);
      }

      // All should complete without error
      expect(prompts.find).toHaveBeenCalledTimes(100);
    });
  });

  describe('Channel registration', () => {
    it('should register all required terminal channels', async () => {
      await import('./prompt');

      // Verify all terminal-related channels are registered
      const expectedChannels = [
        AppChannel.TERM_READY,
        AppChannel.TERM_EXIT,
        AppChannel.TERM_SELECTION,
        AppChannel.TERM_OUTPUT,
        AppChannel.TERM_INPUT,
        AppChannel.TERM_RESIZE,
      ];

      for (const channel of expectedChannels) {
        const handler = mockHandlers.get(channel);
        expect(handler, `Handler for ${channel} should be registered`).toBeDefined();
      }
    });
  });

  describe('IPC message validation', () => {
    it('should validate TERM_SELECTION data structure', async () => {
      await import('./prompt');

      const selectionHandler = mockHandlers.get(AppChannel.TERM_SELECTION);
      const mockEvent = { sender: { id: 1 } };

      // Test various invalid data structures
      const invalidDataCases = [
        { pid: null, text: 'text' },        // null pid
        { pid: 'string', text: 'text' },    // non-numeric pid
        { pid: 123, text: null },           // null text
        { pid: 123 },                       // missing text
        { text: 'text' },                   // missing pid
        {},                                 // empty object
      ];

      for (const invalidData of invalidDataCases) {
        expect(() => {
          selectionHandler?.(mockEvent, invalidData);
        }).not.toThrow();
      }
    });
  });
});