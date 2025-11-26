/**
 * HeartbeatManager - Manages heartbeat signals for process health monitoring
 *
 * Sends periodic heartbeats to connected processes to detect
 * hangs and enable responsive UIs.
 */

import type { ChildProcess } from 'node:child_process';
import { Channel } from '@johnlindquist/kit/core/enum';
import { processLog as log } from '../logs';
import { disposableRegistry } from './disposable-registry';

/**
 * Heartbeat configuration
 */
export interface HeartbeatConfig {
  /** Interval between heartbeats (ms) */
  interval: number;
  /** Time to wait for response before considering missed (ms) */
  timeout: number;
  /** Number of missed heartbeats before triggering callback */
  maxMissed: number;
}

const DEFAULT_CONFIG: HeartbeatConfig = {
  interval: 10000, // 10 seconds
  timeout: 5000, // 5 seconds
  maxMissed: 3,
};

interface HeartbeatState {
  child: ChildProcess;
  pid: number;
  lastSent: number;
  lastReceived: number;
  missedCount: number;
  isVisible: () => boolean;
}

export class HeartbeatManager {
  private heartbeats = new Map<number, HeartbeatState>();
  private config: HeartbeatConfig;
  private globalInterval: NodeJS.Timeout | null = null;
  private onMissedCallbacks: ((pid: number, missedCount: number) => void)[] = [];
  private isRunning = false;

  constructor(config: Partial<HeartbeatConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<HeartbeatConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Register a callback for missed heartbeats
   */
  onMissedHeartbeat(callback: (pid: number, missedCount: number) => void): () => void {
    this.onMissedCallbacks.push(callback);
    return () => {
      const index = this.onMissedCallbacks.indexOf(callback);
      if (index !== -1) {
        this.onMissedCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Start monitoring a process
   */
  register(pid: number, child: ChildProcess, isVisible: () => boolean): void {
    if (this.heartbeats.has(pid)) {
      log.warn(`HeartbeatManager: Process ${pid} already registered`);
      return;
    }

    const state: HeartbeatState = {
      child,
      pid,
      lastSent: 0,
      lastReceived: Date.now(),
      missedCount: 0,
      isVisible,
    };

    this.heartbeats.set(pid, state);
    log.info(`HeartbeatManager: Registered process ${pid}`);

    // Start global heartbeat if not running
    if (!this.isRunning) {
      this.start();
    }
  }

  /**
   * Stop monitoring a process
   */
  unregister(pid: number): void {
    if (this.heartbeats.delete(pid)) {
      log.info(`HeartbeatManager: Unregistered process ${pid}`);
    }

    // Stop global heartbeat if no processes left
    if (this.heartbeats.size === 0 && this.isRunning) {
      this.stop();
    }
  }

  /**
   * Record a heartbeat response from a process
   */
  recordResponse(pid: number): void {
    const state = this.heartbeats.get(pid);
    if (state) {
      state.lastReceived = Date.now();
      state.missedCount = 0;
    }
  }

  /**
   * Start the heartbeat loop
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.sendHeartbeats();

    this.globalInterval = setInterval(() => {
      this.sendHeartbeats();
    }, this.config.interval);

    log.info('HeartbeatManager: Started');
  }

  /**
   * Stop the heartbeat loop
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.globalInterval) {
      clearInterval(this.globalInterval);
      this.globalInterval = null;
    }

    this.isRunning = false;
    log.info('HeartbeatManager: Stopped');
  }

  /**
   * Pause heartbeats (e.g., during system sleep)
   */
  pause(): void {
    if (this.globalInterval) {
      clearInterval(this.globalInterval);
      this.globalInterval = null;
    }
    log.info('HeartbeatManager: Paused');
  }

  /**
   * Resume heartbeats (e.g., after system wake)
   */
  resume(): void {
    if (!this.isRunning || this.globalInterval) {
      return;
    }

    // Reset missed counts after resume
    for (const state of this.heartbeats.values()) {
      state.missedCount = 0;
      state.lastReceived = Date.now();
    }

    this.globalInterval = setInterval(() => {
      this.sendHeartbeats();
    }, this.config.interval);

    log.info('HeartbeatManager: Resumed');
  }

  /**
   * Send heartbeats to all registered processes
   */
  private sendHeartbeats(): void {
    const now = Date.now();

    for (const [pid, state] of this.heartbeats) {
      // Only send heartbeats to visible prompts
      if (!state.isVisible()) {
        continue;
      }

      // Check if process is still connected
      if (!state.child.connected || state.child.killed) {
        log.info(`HeartbeatManager: Process ${pid} no longer connected, unregistering`);
        this.unregister(pid);
        continue;
      }

      // Check for missed heartbeats
      const timeSinceLastReceived = now - state.lastReceived;
      if (state.lastSent > 0 && timeSinceLastReceived > this.config.timeout) {
        state.missedCount++;
        log.warn(`HeartbeatManager: Process ${pid} missed heartbeat (${state.missedCount}/${this.config.maxMissed})`);

        if (state.missedCount >= this.config.maxMissed) {
          for (const callback of this.onMissedCallbacks) {
            try {
              callback(pid, state.missedCount);
            } catch (error) {
              log.error('HeartbeatManager: Error in missed callback:', error);
            }
          }
        }
      }

      // Send heartbeat
      try {
        state.child.send({ channel: Channel.HEARTBEAT });
        state.lastSent = now;
      } catch (error) {
        log.error(`HeartbeatManager: Failed to send heartbeat to ${pid}:`, error);
        this.unregister(pid);
      }
    }
  }

  /**
   * Check if running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get registered process count
   */
  getRegisteredCount(): number {
    return this.heartbeats.size;
  }

  /**
   * Get debug info
   */
  getDebugInfo(): Record<string, unknown> {
    const processes: Record<string, unknown>[] = [];

    for (const [pid, state] of this.heartbeats) {
      processes.push({
        pid,
        lastSent: state.lastSent,
        lastReceived: state.lastReceived,
        missedCount: state.missedCount,
        isVisible: state.isVisible(),
        connected: state.child.connected,
        killed: state.child.killed,
      });
    }

    return {
      config: this.config,
      isRunning: this.isRunning,
      registeredCount: this.heartbeats.size,
      processes,
    };
  }
}

// Export singleton for shared use
export const heartbeatManager = new HeartbeatManager();
