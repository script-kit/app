/**
 * Screen Measurement Overlay
 * Handles creation and management of transparent measurement overlays
 */

import { BrowserWindow, screen, ipcMain, type Display } from 'electron';
import { getAssetPath } from '../shared/assets';
import { createLogger } from './log-utils';
import { Channel } from '@johnlindquist/kit/core/enum';
import type { MeasureOptions, MeasureResult } from '@johnlindquist/kit';

const log = createLogger('measurement.ts');

interface MeasurementSession {
  window: BrowserWindow;
  options: MeasureOptions;
  resolver: (value: MeasureResult | null) => void;
  startTime: number;
}

class MeasurementManager {
  private sessions: Map<number, MeasurementSession> = new Map();
  private isInitialized = false;

  constructor() {
    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    log.info('[Measurement] Setting up IPC handlers');

    // Handle measurement complete
    ipcMain.on(Channel.MEASURE_COMPLETE, (event, result: MeasureResult) => {
      const windowId = event.sender.id;
      log.info('[Measurement] Received MEASURE_COMPLETE from renderer', {
        windowId,
        result,
        sessionCount: this.sessions.size,
        hasSession: this.sessions.has(windowId)
      });

      const session = this.sessions.get(windowId);

      if (session) {
        log.info('[Measurement] Complete - resolving promise', {
          windowId,
          duration: Date.now() - session.startTime,
          result
        });

        session.resolver(result);
        this.cleanupSession(windowId);
      } else {
        log.warn('[Measurement] No session found for window', {
          windowId,
          availableSessionIds: Array.from(this.sessions.keys())
        });
      }
    });

    // Handle measurement cancelled
    ipcMain.on(Channel.MEASURE_CANCELLED, (event) => {
      const windowId = event.sender.id;
      log.info('[Measurement] Received MEASURE_CANCELLED from renderer', {
        windowId,
        sessionCount: this.sessions.size,
        hasSession: this.sessions.has(windowId)
      });

      const session = this.sessions.get(windowId);

      if (session) {
        log.info('[Measurement] Cancelled - resolving with null', {
          windowId,
          duration: Date.now() - session.startTime
        });

        session.resolver(null);
        this.cleanupSession(windowId);
      } else {
        log.warn('[Measurement] No session found for window', {
          windowId,
          availableSessionIds: Array.from(this.sessions.keys())
        });
      }
    });

    // Handle mouse event toggle requests
    ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options?: { forward: boolean }) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        if (options) {
          window.setIgnoreMouseEvents(ignore, options);
        } else {
          window.setIgnoreMouseEvents(ignore);
        }
      }
    });

    this.isInitialized = true;
  }

  /**
   * Create a measurement overlay window
   */
  private createMeasurementWindow(options: MeasureOptions): BrowserWindow {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();

    // Get current cursor position and its display
    const cursorPoint = screen.getCursorScreenPoint();
    const cursorDisplay = screen.getDisplayNearestPoint(cursorPoint);

    // Use the cursor's display bounds
    // This ensures the overlay covers exactly the display the cursor is on
    const bounds = cursorDisplay.bounds;

    log.info('[Measurement] Creating overlay on cursor display', {
      cursorPoint,
      cursorDisplayId: cursorDisplay.id,
      cursorDisplayBounds: bounds,
      allDisplays: displays.map(d => ({ id: d.id, bounds: d.bounds })),
      options
    });

    const window = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      transparent: true,
      frame: false,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: true,
      fullscreenable: false,
      visibleOnAllWorkspaces: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
        // Ensure we can capture mouse events
        offscreen: false
      },
      // Platform-specific options
      ...(process.platform === 'darwin' ? {
        // macOS specific
        roundedCorners: false,
        vibrancy: undefined, // Vibrancy breaks transparency
      } : {}),
      ...(process.platform === 'win32' ? {
        // Windows specific
        type: 'toolbar', // Helps with always-on-top
      } : {}),
      ...(process.platform === 'linux' ? {
        // Linux specific
        type: 'dock', // May help with transparency on some compositors
      } : {})
    });

    // Start with mouse events ENABLED so user can immediately click to measure
    // The renderer can switch to click-through mode if needed
    window.setIgnoreMouseEvents(false);

    // Load the measurement HTML
    const measurementPath = `file://${getAssetPath('measurement.html')}`;
    window.loadURL(measurementPath);

    // Send initial configuration to renderer once loaded
    window.webContents.once('did-finish-load', () => {
      log.info('[Measurement] Window loaded, sending init config', {
        cursorPoint,
        displayCount: displays.length
      });

      window.webContents.send('measure-init', {
        options,
        cursorPoint, // Pass cursor position to renderer
        cursorDisplay: {
          id: cursorDisplay.id,
          bounds: cursorDisplay.bounds,
          scaleFactor: cursorDisplay.scaleFactor
        },
        displays: displays.map(d => ({
          id: d.id,
          bounds: d.bounds,
          scaleFactor: d.scaleFactor
        })),
        primaryDisplay: {
          id: primaryDisplay.id,
          bounds: primaryDisplay.bounds,
          scaleFactor: primaryDisplay.scaleFactor
        }
      });
    });

    // NOTE: DevTools disabled - opening them steals focus and breaks the measurement flow
    // If you need to debug, uncomment the following:
    // window.webContents.openDevTools({ mode: 'detach' });

    return window;
  }

  /**
   * Calculate combined bounds for all displays
   */
  private calculateCombinedBounds(displays: Display[]) {
    if (displays.length === 0) {
      return { x: 0, y: 0, width: 800, height: 600 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const display of displays) {
      const { x, y, width, height } = display.bounds;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Start a measurement session
   */
  async measure(options: MeasureOptions): Promise<MeasureResult | null> {
    log.info('[Measurement] Starting measurement session', { options });

    return new Promise((resolve) => {
      const window = this.createMeasurementWindow(options);
      const windowId = window.webContents.id;

      log.info('[Measurement] Created window', { windowId });

      // Store session info
      this.sessions.set(windowId, {
        window,
        options,
        resolver: resolve,
        startTime: Date.now()
      });

      log.info('[Measurement] Session stored', {
        windowId,
        totalSessions: this.sessions.size
      });

      // Handle window closed before measurement complete
      window.once('closed', () => {
        log.info('[Measurement] Window closed event', {
          windowId,
          sessionExists: this.sessions.has(windowId)
        });
        const session = this.sessions.get(windowId);
        if (session) {
          log.info('[Measurement] Window closed before complete - resolving null', { windowId });
          session.resolver(null);
          this.sessions.delete(windowId);
        } else {
          log.info('[Measurement] Window closed but session already handled (normal cleanup)', { windowId });
        }
      });

      // Show the window
      log.info('[Measurement] Showing window', { windowId });
      window.show();

      // Focus window to ensure keyboard events work
      // This is critical for receiving keydown events (Enter to confirm, Escape to cancel)
      log.info('[Measurement] Focusing window', { windowId, platform: process.platform });
      window.focus();

      // On macOS, we may need to bring the window to front more aggressively
      if (process.platform === 'darwin') {
        window.setAlwaysOnTop(true, 'floating');
      }

      log.info('[Measurement] Window setup complete, waiting for user interaction', { windowId });
    });
  }

  /**
   * Clean up a measurement session
   */
  private cleanupSession(windowId: number) {
    const session = this.sessions.get(windowId);

    if (session) {
      // Close the window if it's still open
      if (!session.window.isDestroyed()) {
        session.window.close();
      }

      // Remove from sessions
      this.sessions.delete(windowId);
    }
  }

  /**
   * Cancel all active measurement sessions
   */
  cancelAll() {
    for (const [windowId, session] of this.sessions) {
      session.resolver(null);
      if (!session.window.isDestroyed()) {
        session.window.close();
      }
    }
    this.sessions.clear();
  }
}

// Create singleton instance
export const measurementManager = new MeasurementManager();

// Export handler for main process
export function setupMeasurementHandlers() {
  ipcMain.handle(Channel.MEASURE, async (_event, options: MeasureOptions) => {
    try {
      const result = await measurementManager.measure(options);
      return result;
    } catch (error) {
      log.error('[Measurement] Error', error);
      return null;
    }
  });
}