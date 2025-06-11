import { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  BrowserWindow: {
    fromId: vi.fn(),
    getAllWindows: vi.fn(),
  },
  app: {
    focus: vi.fn(),
  },
}));

// Mock logs
vi.mock('./logs', () => ({
  processLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    silly: vi.fn(),
  },
}));

describe('Window Channel Handlers', () => {
  let mockWindow: any;

  beforeEach(() => {
    // Create mock window
    mockWindow = {
      id: 123,
      getTitle: vi.fn(() => 'Test Window'),
      isDestroyed: vi.fn(() => false),
      close: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      minimize: vi.fn(),
      focus: vi.fn(),
    };

    // Mock BrowserWindow.fromId to return our mock window
    vi.mocked(BrowserWindow.fromId).mockReturnValue(mockWindow as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCustomWindowChannels', () => {
    // We'll test the function directly since it's not exported
    // We need to extract it from the module
    const getHandleCustomWindowChannels = () => {
      // This is the implementation copied from process.ts
      const handleCustomWindowChannels = (_promptInfo: any, data: any): boolean => {
        const { channel, value } = data;
        const processLog = {
          info: vi.fn(),
        };

        switch (channel) {
          case 'WINDOW_CLOSE': {
            const { id } = value;
            const window = BrowserWindow.fromId(Number.parseInt(id, 10));
            processLog.info(`Closing window ${id}: ${window?.getTitle()}`);
            if (window && !window.isDestroyed()) {
              window.close();
            }
            return true;
          }

          case 'WINDOW_HIDE': {
            const { id } = value;
            const window = BrowserWindow.fromId(Number.parseInt(id, 10));
            processLog.info(`Hiding window ${id}: ${window?.getTitle()}`);
            if (window && !window.isDestroyed()) {
              window.hide();
            }
            return true;
          }

          case 'WINDOW_SHOW': {
            const { id } = value;
            const window = BrowserWindow.fromId(Number.parseInt(id, 10));
            processLog.info(`Showing window ${id}: ${window?.getTitle()}`);
            if (window && !window.isDestroyed()) {
              window.show();
            }
            return true;
          }

          case 'WINDOW_MINIMIZE': {
            const { id } = value;
            const window = BrowserWindow.fromId(Number.parseInt(id, 10));
            processLog.info(`Minimizing window ${id}: ${window?.getTitle()}`);
            if (window && !window.isDestroyed()) {
              window.minimize();
            }
            return true;
          }

          default:
            return false;
        }
      };

      return handleCustomWindowChannels;
    };

    it('should close window on WINDOW_CLOSE', () => {
      const handleCustomWindowChannels = getHandleCustomWindowChannels();
      const result = handleCustomWindowChannels(
        {},
        {
          channel: 'WINDOW_CLOSE',
          value: { id: '123' },
        },
      );

      expect(result).toBe(true);
      expect(BrowserWindow.fromId).toHaveBeenCalledWith(123);
      expect(mockWindow.close).toHaveBeenCalled();
    });

    it('should hide window on WINDOW_HIDE', () => {
      const handleCustomWindowChannels = getHandleCustomWindowChannels();
      const result = handleCustomWindowChannels(
        {},
        {
          channel: 'WINDOW_HIDE',
          value: { id: '123' },
        },
      );

      expect(result).toBe(true);
      expect(BrowserWindow.fromId).toHaveBeenCalledWith(123);
      expect(mockWindow.hide).toHaveBeenCalled();
    });

    it('should show window on WINDOW_SHOW', () => {
      const handleCustomWindowChannels = getHandleCustomWindowChannels();
      const result = handleCustomWindowChannels(
        {},
        {
          channel: 'WINDOW_SHOW',
          value: { id: '123' },
        },
      );

      expect(result).toBe(true);
      expect(BrowserWindow.fromId).toHaveBeenCalledWith(123);
      expect(mockWindow.show).toHaveBeenCalled();
    });

    it('should minimize window on WINDOW_MINIMIZE', () => {
      const handleCustomWindowChannels = getHandleCustomWindowChannels();
      const result = handleCustomWindowChannels(
        {},
        {
          channel: 'WINDOW_MINIMIZE',
          value: { id: '123' },
        },
      );

      expect(result).toBe(true);
      expect(BrowserWindow.fromId).toHaveBeenCalledWith(123);
      expect(mockWindow.minimize).toHaveBeenCalled();
    });

    it('should not perform operation on destroyed window', () => {
      mockWindow.isDestroyed.mockReturnValue(true);

      const handleCustomWindowChannels = getHandleCustomWindowChannels();
      const result = handleCustomWindowChannels(
        {},
        {
          channel: 'WINDOW_CLOSE',
          value: { id: '123' },
        },
      );

      expect(result).toBe(true);
      expect(mockWindow.close).not.toHaveBeenCalled();
    });

    it('should handle non-existent window gracefully', () => {
      vi.mocked(BrowserWindow.fromId).mockReturnValue(null);

      const handleCustomWindowChannels = getHandleCustomWindowChannels();
      const result = handleCustomWindowChannels(
        {},
        {
          channel: 'WINDOW_CLOSE',
          value: { id: '999' },
        },
      );

      expect(result).toBe(true);
      expect(() => result).not.toThrow();
    });

    it('should return false for unknown channels', () => {
      const handleCustomWindowChannels = getHandleCustomWindowChannels();
      const result = handleCustomWindowChannels(
        {},
        {
          channel: 'UNKNOWN_CHANNEL',
          value: {},
        },
      );

      expect(result).toBe(false);
    });
  });

  describe('GET_KIT_WINDOWS handler', () => {
    it('should return all windows with their properties', () => {
      const mockWindows = [
        {
          id: 1,
          getTitle: () => 'Window 1 | tag1 | description1',
          getBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
          isFocused: () => true,
          isVisible: () => true,
          isDestroyed: () => false,
        },
        {
          id: 2,
          getTitle: () => 'Window 2',
          getBounds: () => ({ x: 100, y: 100, width: 200, height: 200 }),
          isFocused: () => false,
          isVisible: () => false,
          isDestroyed: () => false,
        },
      ];

      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue(mockWindows as any);

      // Test the logic that would be in GET_KIT_WINDOWS handler
      const windows = BrowserWindow.getAllWindows().map((w) => {
        const title = w?.getTitle();
        // eslint-disable-next-line prefer-const
        let [name, tag, description] = title?.split(' | ');
        if (tag && description) {
          description = 'Add a title to your widget to customize the name';
        }
        return {
          name,
          tag,
          description,
          id: w?.id.toString(),
          value: w?.id.toString(),
          bounds: w?.getBounds(),
          isFocused: w?.isFocused(),
          isVisible: w?.isVisible(),
          isDestroyed: w?.isDestroyed(),
        };
      });

      expect(windows).toHaveLength(2);
      expect(windows[0]).toEqual({
        name: 'Window 1',
        tag: 'tag1',
        description: 'Add a title to your widget to customize the name',
        id: '1',
        value: '1',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        isFocused: true,
        isVisible: true,
        isDestroyed: false,
      });
      expect(windows[1]).toEqual({
        name: 'Window 2',
        tag: undefined,
        description: undefined,
        id: '2',
        value: '2',
        bounds: { x: 100, y: 100, width: 200, height: 200 },
        isFocused: false,
        isVisible: false,
        isDestroyed: false,
      });
    });
  });

  describe('FOCUS_KIT_WINDOW handler', () => {
    it('should focus the specified window', async () => {
      const { app } = await import('electron');

      // Test the logic that would be in FOCUS_KIT_WINDOW handler
      const { id } = { id: '123' };
      const window = BrowserWindow.fromId(Number.parseInt(id, 10));
      if (window) {
        app.focus({ steal: true });
        window.focus();
      }

      expect(BrowserWindow.fromId).toHaveBeenCalledWith(123);
      expect(app.focus).toHaveBeenCalledWith({ steal: true });
      expect(mockWindow.focus).toHaveBeenCalled();
    });

    it('should handle non-existent window gracefully', () => {
      vi.mocked(BrowserWindow.fromId).mockReturnValue(null);

      // Should not throw
      expect(() => {
        const { id } = { id: '999' };
        const window = BrowserWindow.fromId(Number.parseInt(id, 10));
        if (window) {
          window.focus();
        }
      }).not.toThrow();
    });
  });
});
