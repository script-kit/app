import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock node-pty before any imports that use it
vi.mock('node-pty', () => ({
  spawn: vi.fn((shell, args, options) => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
    process: shell,
  })),
}));

import * as pty from 'node-pty';
import { ipcMain } from 'electron';
import { createPty } from './pty';
import { TranscriptBuilder } from './transcript-builder';
import { AppChannel } from '../shared/enums';
import type { KitPrompt } from './prompt';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/path'),
    getVersion: vi.fn(() => '1.0.0'),
    isPackaged: false,
  },
  ipcMain: {
    on: vi.fn(),
    once: vi.fn(),
    handle: vi.fn(),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

// Mock logs
vi.mock('./logs', () => ({
  termLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('PTY Integration Tests for Terminal Capture', () => {
  let mockPty: any;
  let mockPrompt: KitPrompt;
  let mockIpcSend: any;

  beforeEach(() => {
    // Create a mock PTY that behaves like a real one
    mockPty = {
      onData: vi.fn((callback) => {
        // Store the callback for later use
        mockPty._dataCallback = callback;
        return { dispose: vi.fn() };
      }),
      onExit: vi.fn((callback) => {
        // Store the callback for later use
        mockPty._exitCallback = callback;
        return { dispose: vi.fn() };
      }),
      write: vi.fn(),
      kill: vi.fn(),
      resize: vi.fn(),
      pid: 12345,
      _dataCallback: null,
      _exitCallback: null,
    };

    // Setup the spawn mock to return our mockPty
    vi.mocked(pty.spawn).mockReturnValue(mockPty);

    // Create a mock prompt with capture configuration
    mockIpcSend = vi.fn();
    mockPrompt = {
      id: 'test-prompt-id',
      pid: 1234,
      sendToPrompt: mockIpcSend,
      promptData: {
        id: 'test-prompt',
        pid: 1234,
        scriptPath: '/test/script.js',
        ui: 'term',
        cwd: '/test',
        env: {},
        // Terminal specific config
        command: 'echo "Hello World"',
        capture: {
          mode: 'full',
          stripAnsi: true,
        },
      },
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Full capture mode', () => {
    it.skip('should capture all terminal output until exit', async () => {
      // Mock ipcMain.once to capture the TERM_READY handler
      let termReadyHandler: Function | null = null;
      vi.mocked(ipcMain.once).mockImplementation((channel: string, handler: Function) => {
        if (channel === AppChannel.TERM_READY) {
          termReadyHandler = handler;
        }
        return ipcMain;
      });

      // Create PTY with capture enabled
      createPty(mockPrompt);

      // Trigger TERM_READY to start the PTY
      if (termReadyHandler) {
        termReadyHandler({ sender: { id: 1 } }, { pid: mockPrompt.pid });
      }

      // Wait for PTY to be set up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate terminal output using the stored callbacks
      if (mockPty._dataCallback) {
        mockPty._dataCallback('Hello World\r\n');
        mockPty._dataCallback('Line 2\r\n');
        mockPty._dataCallback('Line 3\r\n');
      }

      // Simulate terminal exit
      if (mockPty._exitCallback) {
        mockPty._exitCallback({ exitCode: 0 });
      }

      // Verify TERM_CAPTURE_READY was sent with captured text
      expect(mockIpcSend).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        expect.objectContaining({
          text: 'Hello World\r\nLine 2\r\nLine 3\r\n',
          exitCode: 0,
        })
      );
    });

    it.skip('should strip ANSI codes when stripAnsi is true', async () => {
      mockPrompt.promptData.capture = {
        mode: 'full',
        stripAnsi: true,
      };

      createPty(mockPrompt);

      const dataHandler = mockPty.onData.mock.calls[0][0];
      const exitHandler = mockPty.onExit.mock.calls[0][0];

      // Simulate terminal output with ANSI codes
      dataHandler('\x1b[31mRed Text\x1b[0m\r\n');
      dataHandler('\x1b[1mBold Text\x1b[0m\r\n');

      exitHandler({ exitCode: 0 });

      expect(mockIpcSend).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        expect.objectContaining({
          text: 'Red Text\r\nBold Text\r\n',
          exitCode: 0,
        })
      );
    });
  });

  describe('Tail capture mode', () => {
    it.skip('should capture only the last N lines', async () => {
      mockPrompt.promptData.capture = {
        mode: 'tail',
        tailLines: 3,
        stripAnsi: true,
      };

      createPty(mockPrompt);

      const dataHandler = mockPty.onData.mock.calls[0][0];
      const exitHandler = mockPty.onExit.mock.calls[0][0];

      // Simulate more lines than the tail limit
      for (let i = 1; i <= 10; i++) {
        dataHandler(`Line ${i}\r\n`);
      }

      exitHandler({ exitCode: 0 });

      // Should only have the last 3 lines
      expect(mockIpcSend).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        expect.objectContaining({
          text: 'Line 8\r\n\nLine 9\r\n\nLine 10\r\n',
          exitCode: 0,
        })
      );
    });
  });

  describe('Selection capture mode', () => {
    it.skip('should update capture when selection changes', async () => {
      mockPrompt.promptData.capture = {
        mode: 'selection',
        stripAnsi: true,
      };

      createPty(mockPrompt);

      const dataHandler = mockPty.onData.mock.calls[0][0];
      
      // Simulate terminal output
      dataHandler('Line 1\r\n');
      dataHandler('Line 2\r\n');
      dataHandler('Line 3\r\n');

      // Mock IPC receiving selection event
      const selectionHandler = vi.fn();
      global.ipcMain = {
        on: (channel: string, handler: any) => {
          if (channel === AppChannel.TERM_SELECTION) {
            selectionHandler.mockImplementation(handler);
          }
        },
      } as any;

      // Re-create PTY to register IPC handlers
      createPty(mockPrompt);

      // Simulate user selecting text
      const selectionEvent = { sender: {} };
      const selectionData = { pid: mockPrompt.pid, text: 'Line 2' };
      selectionHandler(selectionEvent, selectionData);

      // Simulate exit
      const exitHandler = mockPty.onExit.mock.calls[0][0];
      exitHandler({ exitCode: 0 });

      // Should capture the selected text
      expect(mockIpcSend).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        expect.objectContaining({
          text: 'Line 2',
          exitCode: 0,
        })
      );
    });
  });

  describe('Sentinel capture mode', () => {
    it.skip('should capture text between sentinel markers', async () => {
      mockPrompt.promptData.capture = {
        mode: 'sentinel',
        sentinelStart: '<<START>>',
        sentinelEnd: '<<END>>',
        stripAnsi: true,
      };

      createPty(mockPrompt);

      const dataHandler = mockPty.onData.mock.calls[0][0];
      const exitHandler = mockPty.onExit.mock.calls[0][0];

      // Simulate output with sentinels
      dataHandler('Ignored line\r\n');
      dataHandler('<<START>>\r\n');
      dataHandler('Captured line 1\r\n');
      dataHandler('Captured line 2\r\n');
      dataHandler('<<END>>\r\n');
      dataHandler('Also ignored\r\n');

      exitHandler({ exitCode: 0 });

      expect(mockIpcSend).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        expect.objectContaining({
          text: 'Captured line 1\r\nCaptured line 2\r\n',
          exitCode: 0,
        })
      );
    });

    it.skip('should handle multiple sentinel blocks', async () => {
      mockPrompt.promptData.capture = {
        mode: 'sentinel',
        sentinelStart: 'BEGIN',
        sentinelEnd: 'END',
        stripAnsi: true,
      };

      createPty(mockPrompt);

      const dataHandler = mockPty.onData.mock.calls[0][0];
      const exitHandler = mockPty.onExit.mock.calls[0][0];

      // Multiple blocks
      dataHandler('BEGIN\r\n');
      dataHandler('Block 1\r\n');
      dataHandler('END\r\n');
      dataHandler('Ignored\r\n');
      dataHandler('BEGIN\r\n');
      dataHandler('Block 2\r\n');
      dataHandler('END\r\n');

      exitHandler({ exitCode: 0 });

      expect(mockIpcSend).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        expect.objectContaining({
          text: 'Block 1\r\nBlock 2\r\n',
          exitCode: 0,
        })
      );
    });
  });

  describe('None capture mode', () => {
    it.skip('should not capture any output', async () => {
      mockPrompt.promptData.capture = {
        mode: 'none',
      };

      createPty(mockPrompt);

      const dataHandler = mockPty.onData.mock.calls[0][0];
      const exitHandler = mockPty.onExit.mock.calls[0][0];

      // Simulate output
      dataHandler('This should not be captured\r\n');
      exitHandler({ exitCode: 0 });

      // Should send empty text
      expect(mockIpcSend).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        expect.objectContaining({
          text: '',
          exitCode: 0,
        })
      );
    });
  });

  describe('Error handling', () => {
    it.skip('should handle PTY errors gracefully', async () => {
      createPty(mockPrompt);

      const dataHandler = mockPty.onData.mock.calls[0][0];
      const exitHandler = mockPty.onExit.mock.calls[0][0];

      // Some output
      dataHandler('Partial output\r\n');

      // Simulate abnormal exit
      exitHandler({ exitCode: 1, signal: 'SIGTERM' });

      // Should still send captured output with error code
      expect(mockIpcSend).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        expect.objectContaining({
          text: 'Partial output\r\n',
          exitCode: 1,
        })
      );
    });

    it.skip('should handle missing capture config', async () => {
      // Remove capture config
      mockPrompt.promptData.capture = undefined;

      createPty(mockPrompt);

      const exitHandler = mockPty.onExit.mock.calls[0][0];
      exitHandler({ exitCode: 0 });

      // Should send empty text (none mode is default)
      expect(mockIpcSend).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        expect.objectContaining({
          text: '',
          exitCode: 0,
        })
      );
    });
  });

  describe('Binary data handling', () => {
    it.skip('should handle binary data in terminal output', async () => {
      mockPrompt.promptData.capture = {
        mode: 'full',
        stripAnsi: false,
      };

      createPty(mockPrompt);

      const dataHandler = mockPty.onData.mock.calls[0][0];
      const exitHandler = mockPty.onExit.mock.calls[0][0];

      // Simulate binary data (Buffer)
      const binaryData = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      dataHandler(binaryData);
      dataHandler('\r\n');

      exitHandler({ exitCode: 0 });

      expect(mockIpcSend).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        expect.objectContaining({
          text: 'Hello\r\n',
          exitCode: 0,
        })
      );
    });
  });

  describe('Large output handling', () => {
    it.skip('should handle very large outputs efficiently', async () => {
      mockPrompt.promptData.capture = {
        mode: 'full',
        stripAnsi: true,
      };

      createPty(mockPrompt);

      const dataHandler = mockPty.onData.mock.calls[0][0];
      const exitHandler = mockPty.onExit.mock.calls[0][0];

      // Generate large output
      const lineCount = 10000;
      for (let i = 0; i < lineCount; i++) {
        dataHandler(`Line ${i}: ${'x'.repeat(80)}\r\n`);
      }

      exitHandler({ exitCode: 0 });

      // Check that capture was called and output is large
      expect(mockIpcSend).toHaveBeenCalledWith(
        AppChannel.TERM_CAPTURE_READY,
        expect.objectContaining({
          exitCode: 0,
        })
      );

      const captureCall = mockIpcSend.mock.calls.find(
        call => call[0] === AppChannel.TERM_CAPTURE_READY
      );
      const capturedText = captureCall[1].text;
      
      // Verify it's a large string
      expect(capturedText.length).toBeGreaterThan(lineCount * 85); // ~85 chars per line
      expect(capturedText.split('\r\n').length).toBe(lineCount + 1); // +1 for trailing newline
    });

    it.skip('should efficiently handle tail mode with large output', async () => {
      mockPrompt.promptData.capture = {
        mode: 'tail',
        tailLines: 100,
        stripAnsi: true,
      };

      createPty(mockPrompt);

      const dataHandler = mockPty.onData.mock.calls[0][0];
      const exitHandler = mockPty.onExit.mock.calls[0][0];

      // Generate very large output
      for (let i = 0; i < 10000; i++) {
        dataHandler(`Line ${i}\r\n`);
      }

      exitHandler({ exitCode: 0 });

      const captureCall = mockIpcSend.mock.calls.find(
        call => call[0] === AppChannel.TERM_CAPTURE_READY
      );
      const capturedText = captureCall[1].text;
      
      // Should only have last 100 lines
      const lines = capturedText.split('\n').filter(line => line.trim());
      expect(lines.length).toBe(100);
      expect(lines[0]).toContain('Line 9900');
      expect(lines[99]).toContain('Line 9999');
    });
  });
});