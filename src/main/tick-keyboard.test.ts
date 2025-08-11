import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiohookKey, UiohookKeyboardEvent, UiohookMouseEvent } from 'uiohook-napi';
import { Observable } from 'rxjs';

// Mock dependencies
vi.mock('electron', () => ({
  powerMonitor: {
    addListener: vi.fn(),
  },
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    on: vi.fn(),
    webContents: {
      send: vi.fn(),
    },
  })),
}));

vi.mock('./state', () => {
  const mockKitState = {
    snippet: '',
    typedText: '',
    typedLimit: 1000,
    isTyping: false,
    isShiftDown: false,
    cancelTyping: false,
    kenvEnv: {},
    supportsNut: true,
    isMac: true,
  };
  
  return {
    kitState: mockKitState,
    kitConfig: {},
    kitClipboard: {},
    kitStore: {
      get: vi.fn(),
    },
    subs: [],
  };
});

vi.mock('./logs', () => ({
  tickLog: {
    info: vi.fn(),
    silly: vi.fn(),
    error: vi.fn(),
  },
  snippetLog: {
    info: vi.fn(),
    silly: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./shims', () => ({
  default: {
    'uiohook-napi': {
      UiohookKey: {
        Escape: 27,
        Backspace: 8,
        Space: 32,
        Quote: 222,
        Shift: 16,
        ShiftRight: 161,
        ArrowLeft: 37,
        ArrowRight: 39,
        ArrowUp: 38,
        ArrowDown: 40,
      },
      uIOhook: {
        on: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      },
    },
  },
}));

// Store the IO event callback
let ioEventCallback: ((event: UiohookKeyboardEvent | UiohookMouseEvent) => void) | null = null;

vi.mock('./io', () => ({
  registerIO: vi.fn((callback) => {
    // Store the callback for testing
    ioEventCallback = callback;
    return Promise.resolve();
  }),
}));

vi.mock('electron-context-menu', () => ({
  default: vi.fn(),
}));

vi.mock('./prompt', () => ({
  prompts: new Map(),
}));

vi.mock('./show', () => ({}));

vi.mock('./process', () => ({
  processes: {
    startHeartbeat: vi.fn(),
    stopHeartbeat: vi.fn(),
  },
}));

vi.mock('./prompts', () => ({
  prompts: {
    prevFocused: false,
  },
}));

vi.mock('valtio/utils', () => ({
  subscribeKey: vi.fn(() => () => {}),
}));

// Import after mocks
import { startKeyboardMonitor } from './tick';
import { kitState } from './state';
import { tickLog as log, snippetLog } from './logs';
import shims from './shims';
import { registerIO } from './io';

describe.skip('Keyboard Event Handling', () => {
  const mockUiohookKey = shims['uiohook-napi'].UiohookKey;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset kitState
    kitState.snippet = '';
    kitState.typedText = '';
    kitState.isTyping = false;
    kitState.isShiftDown = false;
    kitState.cancelTyping = false;
    
    ioEventCallback = null;
  });

  describe('Mouse Events', () => {
    it('should clear snippet on mouse click', async () => {
      await startKeyboardMonitor();
      
      kitState.snippet = 'test';
      
      const mouseEvent: UiohookMouseEvent = {
        button: 1,
        clicks: 1,
        x: 100,
        y: 100,
      } as UiohookMouseEvent;
      
      if (ioEventCallback) ioEventCallback(mouseEvent);
      
      expect(kitState.snippet).toBe('');
      expect(log.silly).toHaveBeenCalledWith('Clicked. Clearing snippet.');
    });
  });

  describe('Escape Key', () => {
    it.skip('should clear typed text on escape', async () => {
      await startKeyboardMonitor();
      
      kitState.typedText = 'some text';
      
      const escapeEvent: UiohookKeyboardEvent = {
        keycode: mockUiohookKey.Escape,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(escapeEvent);
      
      expect(kitState.typedText).toBe('');
    });

    it('should cancel typing when isTyping is true', async () => {
      await startKeyboardMonitor();
      
      kitState.isTyping = true;
      
      const escapeEvent: UiohookKeyboardEvent = {
        keycode: mockUiohookKey.Escape,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(escapeEvent);
      
      expect(kitState.cancelTyping).toBe(true);
      expect(log.info).toHaveBeenCalledWith('✋ Cancel typing');
    });
  });

  describe('Arrow Keys', () => {
    it.each([
      ['ArrowLeft', 'ArrowLeft'],
      ['ArrowRight', 'ArrowRight'],
      ['ArrowUp', 'ArrowUp'],
      ['ArrowDown', 'ArrowDown'],
    ])('should clear snippet on %s key', async (keyName, keyProperty) => {
      await startKeyboardMonitor();
      
      kitState.snippet = 'test';
      kitState.typedText = 'test';
      
      const arrowEvent: UiohookKeyboardEvent = {
        keycode: mockUiohookKey[keyProperty as keyof typeof mockUiohookKey],
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(arrowEvent);
      
      expect(kitState.snippet).toBe('');
      expect(kitState.typedText).toBe('');
      expect(snippetLog.silly).toHaveBeenCalledWith('Ignoring arrow key and clearing snippet');
    });
  });

  describe('Modifier Keys', () => {
    it('should ignore shift key without clearing snippet', async () => {
      await startKeyboardMonitor();
      
      kitState.snippet = 'test';
      
      const shiftEvent: UiohookKeyboardEvent = {
        keycode: mockUiohookKey.Shift,
        shiftKey: true,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(shiftEvent);
      
      expect(kitState.snippet).toBe('test');
      expect(snippetLog.silly).toHaveBeenCalledWith('Ignoring shift key');
    });

    it('should clear snippet on meta/ctrl/alt keys', async () => {
      await startKeyboardMonitor();
      
      const modifierEvents = [
        { metaKey: true, ctrlKey: false, altKey: false },
        { metaKey: false, ctrlKey: true, altKey: false },
        { metaKey: false, ctrlKey: false, altKey: true },
      ];
      
      for (const modifiers of modifierEvents) {
        kitState.snippet = 'test';
        
        const event: UiohookKeyboardEvent = {
          keycode: 65, // 'A' key
          shiftKey: false,
          ...modifiers,
          key: 'a',
        } as UiohookKeyboardEvent;
        
        if (ioEventCallback) ioEventCallback(event);
        
        expect(kitState.snippet).toBe('');
        expect(snippetLog.silly).toHaveBeenCalledWith('Ignoring modifier key and clearing snippet');
      }
    });

    it('should clear typedText on Ctrl/Cmd+Backspace', async () => {
      await startKeyboardMonitor();
      
      kitState.typedText = 'some text';
      
      const event: UiohookKeyboardEvent = {
        keycode: mockUiohookKey.Backspace,
        shiftKey: false,
        metaKey: true,
        ctrlKey: false,
        altKey: false,
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(event);
      
      expect(kitState.typedText).toBe('');
    });
  });

  describe('Backspace Key', () => {
    it('should remove last character from snippet and typedText', async () => {
      await startKeyboardMonitor();
      
      kitState.snippet = 'test';
      kitState.typedText = 'test';
      
      const backspaceEvent: UiohookKeyboardEvent = {
        keycode: mockUiohookKey.Backspace,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(backspaceEvent);
      
      expect(kitState.snippet).toBe('tes');
      expect(kitState.typedText).toBe('tes');
      expect(snippetLog.silly).toHaveBeenCalledWith('Backspace: Removing last character from snippet');
    });
  });

  describe('Space Key', () => {
    it('should add underscore to snippet and space to typedText', async () => {
      await startKeyboardMonitor();
      
      kitState.snippet = 'test';
      kitState.typedText = 'test';
      
      const spaceEvent: UiohookKeyboardEvent = {
        keycode: mockUiohookKey.Space,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(spaceEvent);
      
      expect(kitState.snippet).toBe('test_');
      expect(kitState.typedText).toBe('test ');
    });

    it('should clear snippet if previous key was backspace', async () => {
      await startKeyboardMonitor();
      
      // First, trigger backspace
      const backspaceEvent: UiohookKeyboardEvent = {
        keycode: mockUiohookKey.Backspace,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(backspaceEvent);
      
      // Then space
      const spaceEvent: UiohookKeyboardEvent = {
        keycode: mockUiohookKey.Space,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(spaceEvent);
      
      expect(kitState.snippet).toBe('');
      expect(snippetLog.silly).toHaveBeenCalledWith('Clearing snippet because of backspace or empty snippet');
    });

    it('should clear snippet if snippet is empty', async () => {
      await startKeyboardMonitor();
      
      kitState.snippet = '';
      
      const spaceEvent: UiohookKeyboardEvent = {
        keycode: mockUiohookKey.Space,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(spaceEvent);
      
      expect(kitState.snippet).toBe('');
    });
  });

  describe('Regular Character Keys', () => {
    it('should append character to snippet and typedText', async () => {
      await startKeyboardMonitor();
      
      kitState.snippet = 'tes';
      kitState.typedText = 'tes';
      
      const keyEvent: UiohookKeyboardEvent = {
        keycode: 84, // 'T' key
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: 't',
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(keyEvent);
      
      expect(kitState.snippet).toBe('test');
      expect(kitState.typedText).toBe('test');
    });

    it('should respect typedLimit', async () => {
      await startKeyboardMonitor();
      
      kitState.typedLimit = 5;
      kitState.typedText = '12345';
      
      const keyEvent: UiohookKeyboardEvent = {
        keycode: 54, // '6' key
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: '6',
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(keyEvent);
      
      expect(kitState.typedText).toBe('23456'); // Should slice to maintain limit
    });

    it('should clear snippet on quote key', async () => {
      await startKeyboardMonitor();
      
      kitState.snippet = 'test';
      
      const quoteEvent: UiohookKeyboardEvent = {
        keycode: mockUiohookKey.Quote,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: '"',
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(quoteEvent);
      
      expect(kitState.snippet).toBe('');
      expect(kitState.typedText).toBe('test"');
    });

    it('should clear snippet for multi-character keys', async () => {
      await startKeyboardMonitor();
      
      kitState.snippet = 'test';
      
      const event: UiohookKeyboardEvent = {
        keycode: 13, // Enter key
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: 'Enter',
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(event);
      
      expect(kitState.snippet).toBe('');
    });

    it('should clear snippet for empty key', async () => {
      await startKeyboardMonitor();
      
      kitState.snippet = 'test';
      
      const event: UiohookKeyboardEvent = {
        keycode: 0,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: '',
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(event);
      
      expect(kitState.snippet).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('should handle key access errors gracefully', async () => {
      await startKeyboardMonitor();
      
      const event = {
        keycode: 65,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        // Missing 'key' property
      } as any;
      
      if (ioEventCallback) ioEventCallback(event);
      
      expect(snippetLog.error).toHaveBeenCalled();
      expect(kitState.snippet).toBe('');
    });

    it('should handle general errors in ioEvent', async () => {
      await startKeyboardMonitor();
      
      // Mock an error in the key property access
      const event = {
        keycode: 65,
        get key() {
          throw new Error('Key access error');
        },
      } as any;
      
      if (ioEventCallback) ioEventCallback(event);
      
      expect(log.error).toHaveBeenCalled();
    });
  });

  describe('Shift Key State', () => {
    it('should update isShiftDown state', async () => {
      await startKeyboardMonitor();
      
      const event: UiohookKeyboardEvent = {
        keycode: 65,
        shiftKey: true,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: 'A',
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(event);
      
      expect(kitState.isShiftDown).toBe(true);
      
      // Test with shift released
      event.shiftKey = false;
      event.key = 'a';
      
      if (ioEventCallback) ioEventCallback(event);
      
      expect(kitState.isShiftDown).toBe(false);
    });
  });

  describe('Kit Typing State', () => {
    it('should clear snippet and ignore events when Kit is typing', async () => {
      await startKeyboardMonitor();
      
      kitState.isTyping = true;
      kitState.snippet = 'test';
      
      const event: UiohookKeyboardEvent = {
        keycode: 65,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: 'a',
      } as UiohookKeyboardEvent;
      
      if (ioEventCallback) ioEventCallback(event);
      
      expect(kitState.snippet).toBe('');
      expect(snippetLog.silly).toHaveBeenCalledWith('Ignoring snippet while Kit.app typing');
    });
  });

  describe('Keyboard Monitor Lifecycle', () => {
    it('should start keyboard monitor when enabled', async () => {
      kitState.kenvEnv.KIT_KEYBOARD = 'true';
      
      await startKeyboardMonitor();
      
      expect(log.info).toHaveBeenCalledWith('🟢 Started keyboard and mouse watcher');
    });

    it('should not start keyboard monitor when disabled', async () => {
      kitState.kenvEnv.KIT_KEYBOARD = 'false';
      
      await startKeyboardMonitor();
      
      expect(log.info).toHaveBeenCalledWith('🔇 Keyboard monitor disabled');
    });

    it('should handle errors during monitor startup', async () => {
      vi.mocked(registerIO).mockRejectedValue(new Error('Failed to start'));
      
      await startKeyboardMonitor();
      
      expect(log.error).toHaveBeenCalledWith('🔴 Failed to start keyboard and mouse watcher');
    });
  });
});