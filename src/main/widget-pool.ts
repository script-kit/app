/**
 * Widget Pool - Pre-warming BrowserWindows for instant widget creation
 *
 * This module maintains a pool of pre-created, hidden BrowserWindows
 * that can be instantly claimed when widget() is called, reducing
 * the 300-800ms cold start to near-zero (<50ms).
 */

import { BrowserWindow, type BrowserWindowConstructorOptions, app, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { createLogger } from './log-utils';
import { getAssetPath } from '../shared/assets';
import { kitState } from './state';

const log = createLogger('widget-pool.ts');

interface PooledWindow {
  window: BrowserWindow;
  createdAt: number;
  claimed: boolean;
}

interface PoolStats {
  total: number;
  available: number;
  claimed: number;
  createdCount: number;
  claimedCount: number;
  recycledCount: number;
}

/**
 * Widget Pool class that manages pre-warmed BrowserWindows
 */
class WidgetPool {
  private pool: PooledWindow[] = [];
  private readonly maxPoolSize: number;
  private readonly warmupDelay: number;
  private isWarming = false;
  private isInitialized = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Stats
  private createdCount = 0;
  private claimedCount = 0;
  private recycledCount = 0;

  constructor(maxPoolSize = 2, warmupDelay = 2000) {
    this.maxPoolSize = maxPoolSize;
    this.warmupDelay = warmupDelay;
  }

  /**
   * Initialize the pool after app is ready
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      log.info('[WidgetPool] Already initialized');
      return;
    }

    log.info('[WidgetPool] Initializing pool', {
      maxPoolSize: this.maxPoolSize,
      warmupDelay: this.warmupDelay,
    });

    // Wait for app to be fully ready and initial load to settle
    await new Promise((resolve) => setTimeout(resolve, this.warmupDelay));

    this.isInitialized = true;
    await this.warmPool();

    // Start periodic cleanup of destroyed windows (every 30 seconds)
    this.cleanupInterval = setInterval(() => {
      this.cleanupDestroyedWindows();
    }, 30000);

    log.info('[WidgetPool] Initialization complete', this.getStats());
  }

  /**
   * Clean up destroyed windows from the pool
   */
  private cleanupDestroyedWindows(): void {
    const before = this.pool.length;
    this.pool = this.pool.filter((p) => !p.window.isDestroyed());
    const after = this.pool.length;

    if (before !== after) {
      log.info(`[WidgetPool] Cleaned up ${before - after} destroyed windows`);
      // Replenish the pool after cleanup
      this.warmPool();
    }
  }

  /**
   * Pre-create windows to fill the pool
   */
  private async warmPool(): Promise<void> {
    if (this.isWarming) {
      log.info('[WidgetPool] Already warming, skipping');
      return;
    }

    this.isWarming = true;
    const availableCount = this.pool.filter((p) => !p.claimed && !p.window.isDestroyed()).length;
    const needed = Math.max(0, this.maxPoolSize - availableCount);

    log.info('[WidgetPool] Warming pool', {
      needed,
      currentAvailable: availableCount,
      maxPoolSize: this.maxPoolSize,
    });

    for (let i = 0; i < needed; i++) {
      try {
        const window = await this.createWarmWindow();
        this.pool.push({
          window,
          createdAt: Date.now(),
          claimed: false,
        });
        this.createdCount++;
        log.info(`[WidgetPool] Warmed window ${i + 1}/${needed}`, {
          windowId: window.id,
        });

        // Small delay between creations to not block the event loop
        if (i < needed - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        log.error('[WidgetPool] Failed to warm window:', error);
      }
    }

    this.isWarming = false;
    log.info('[WidgetPool] Pool warming complete', this.getStats());
  }

  /**
   * Create a hidden pre-warmed window
   */
  private async createWarmWindow(): Promise<BrowserWindow> {
    const bwOptions: BrowserWindowConstructorOptions = {
      show: false,
      frame: false,
      transparent: kitState.isMac,
      titleBarStyle: 'customButtonsOnHover',
      width: 400,
      height: 300,
      // Position off-screen initially
      x: -10000,
      y: -10000,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        experimentalFeatures: true,
        preload: fileURLToPath(new URL('../preload/index.mjs', import.meta.url)),
        webSecurity: false,
        devTools: true,
        backgroundThrottling: false, // Keep active for instant response
      },
      minHeight: 0,
      minWidth: 0,
      movable: true,
    };

    let window: BrowserWindow;

    if (kitState.isMac) {
      window = new BrowserWindow({
        ...bwOptions,
        type: 'panel',
        vibrancy: 'popover',
        visualEffectState: 'active',
        hasShadow: true,
      });
    } else {
      window = new BrowserWindow(bwOptions);
    }

    // Pre-load the widget HTML template
    const widgetPath = getAssetPath('widget.html');

    return new Promise((resolve, reject) => {
      // Store event handlers for cleanup
      const removeListenersIfAlive = () => {
        // Avoid "Object has been destroyed" when the BrowserWindow closes before we clean up
        if (window.isDestroyed() || window.webContents.isDestroyed()) return;
        window.webContents.removeListener('did-finish-load', loadHandler);
        window.webContents.removeListener('did-fail-load', failHandler);
      };

      const loadHandler = () => {
        log.info('[WidgetPool] Warm window loaded', { windowId: window.id });
        // Clean up the error handler
        removeListenersIfAlive();
        resolve(window);
      };

      const failHandler = (_event: any, errorCode: number, errorDescription: string) => {
        log.error('[WidgetPool] Warm window failed to load', {
          windowId: window.id,
          errorCode,
          errorDescription,
        });
        // Clean up the success handler
        removeListenersIfAlive();
        // Destroy the window to prevent leak
        if (!window.isDestroyed()) {
          window.destroy();
        }
        reject(new Error(`Failed to load widget: ${errorDescription}`));
      };

      window.webContents.once('did-finish-load', loadHandler);
      window.webContents.once('did-fail-load', failHandler);

      // Add window closed handler to prevent orphaned windows
      window.once('closed', () => {
        // Clean up any remaining listeners (guarded against destroyed contents)
        removeListenersIfAlive();
      });

      window.loadURL(`file://${widgetPath}`);
    });
  }

  /**
   * Claim a pre-warmed window from the pool
   * Returns null if no windows are available (fall back to cold creation)
   */
  claim(): BrowserWindow | null {
    // Clean up destroyed windows
    this.pool = this.pool.filter((p) => !p.window.isDestroyed());

    // Find an available window
    const available = this.pool.find((p) => !p.claimed);

    if (available) {
      available.claimed = true;
      this.claimedCount++;

      log.info('[WidgetPool] Claimed warm window (instant)', {
        windowId: available.window.id,
        age: Date.now() - available.createdAt,
        stats: this.getStats(),
      });

      // Trigger background replenishment
      this.warmPool();

      return available.window;
    }

    log.info('[WidgetPool] No warm windows available, falling back to cold start');
    return null;
  }

  /**
   * Release a window back to the pool for recycling
   * Properly resets window state to prevent "dirty" state leaks
   */
  release(window: BrowserWindow): void {
    // Guard against destroyed windows at the start
    if (window.isDestroyed()) {
      this.remove(window.id);
      return;
    }

    const pooled = this.pool.find((p) => p.window.id === window.id);

    if (pooled && !window.isDestroyed()) {
      pooled.claimed = false;
      this.recycledCount++;

      // Reset window state for reuse
      window.hide();
      window.setPosition(-10000, -10000);

      // Reset standard properties to prevent state leaks
      window.setAlwaysOnTop(false);
      window.setFullScreen(false);
      window.setSkipTaskbar(false);
      window.setOpacity(1.0);
      try {
        // setIgnoreMouseEvents might fail if window is hidden/minimized on some platforms
        window.setIgnoreMouseEvents(false);
      } catch (error) {
        // Ignore error - window state is still valid
      }

      // CRITICAL: Remove all listeners to prevent duplicate handlers on reuse
      window.removeAllListeners();

      // Re-add the close listener to maintain pool integrity
      window.once('closed', () => {
        this.remove(window.id);
      });

      log.info('[WidgetPool] Window released back to pool', {
        windowId: window.id,
        stats: this.getStats(),
      });
    }
  }

  /**
   * Remove a window from the pool (when it's destroyed)
   */
  remove(windowId: number): void {
    const index = this.pool.findIndex((p) => p.window.id === windowId);
    if (index !== -1) {
      this.pool.splice(index, 1);
      log.info('[WidgetPool] Window removed from pool', {
        windowId,
        stats: this.getStats(),
      });

      // Replenish the pool
      this.warmPool();
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    // Clean up destroyed windows
    this.pool = this.pool.filter((p) => !p.window.isDestroyed());

    return {
      total: this.pool.length,
      available: this.pool.filter((p) => !p.claimed).length,
      claimed: this.pool.filter((p) => p.claimed).length,
      createdCount: this.createdCount,
      claimedCount: this.claimedCount,
      recycledCount: this.recycledCount,
    };
  }

  /**
   * Check if a window is from the pool
   */
  isPooledWindow(windowId: number): boolean {
    return this.pool.some((p) => p.window.id === windowId);
  }

  /**
   * Destroy all pooled windows and reset the pool
   */
  destroy(): void {
    log.info('[WidgetPool] Destroying pool', this.getStats());

    // Clear the cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const pooled of this.pool) {
      if (!pooled.window.isDestroyed()) {
        pooled.window.destroy();
      }
    }

    this.pool = [];
    this.isInitialized = false;
    log.info('[WidgetPool] Pool destroyed');
  }

  /**
   * Check if pool is enabled (for feature flag)
   */
  isEnabled(): boolean {
    return this.maxPoolSize > 0;
  }
}

// Export singleton instance
export const widgetPool = new WidgetPool(2, 3000);

// Initialize when app is ready
app.whenReady().then(() => {
  // Delay initialization to not interfere with app startup
  setTimeout(() => {
    widgetPool.initialize().catch((error) => {
      log.error('[WidgetPool] Failed to initialize:', error);
    });
  }, 1000);
});
