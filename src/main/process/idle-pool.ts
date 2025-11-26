/**
 * IdleProcessPool - Manages a pool of pre-warmed idle processes
 *
 * Maintains warm processes ready for instant script execution,
 * eliminating cold-start latency for user-triggered scripts.
 */

import type { ChildProcess } from 'node:child_process';
import { fork } from 'node:child_process';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { Channel } from '@johnlindquist/kit/core/enum';
import { KIT_APP_PROMPT, kitPath } from '@johnlindquist/kit/core/utils';
import { pathExistsSync } from '../cjs-exports';
import { createEnv } from '../env.utils';
import { processLog as log } from '../logs';
import { kitState } from '../state';
import { disposableRegistry } from './disposable-registry';
import type { PoolStats } from './types';

/**
 * Configuration for the idle pool
 */
export interface IdlePoolConfig {
  /** Maximum number of idle processes to maintain */
  maxSize: number;
  /** Minimum number of idle processes to keep warm */
  minSize: number;
  /** Time to wait before considering a process stale (ms) */
  staleTimeout: number;
}

const DEFAULT_CONFIG: IdlePoolConfig = {
  maxSize: 3,
  minSize: 1,
  staleTimeout: 5 * 60 * 1000, // 5 minutes
};

interface PooledProcess {
  child: ChildProcess;
  createdAt: number;
  ready: boolean;
}

export class IdleProcessPool {
  private pool: PooledProcess[] = [];
  private config: IdlePoolConfig;
  private isWarming = false;

  constructor(config: Partial<IdlePoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get current pool statistics
   */
  getStats(): PoolStats {
    return {
      available: this.pool.filter((p) => p.ready).length,
      total: this.pool.length,
      maxSize: this.config.maxSize,
    };
  }

  /**
   * Update pool configuration
   */
  setConfig(config: Partial<IdlePoolConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Acquire an idle process from the pool
   * Returns null if no process available (caller should create one)
   */
  acquire(): ChildProcess | null {
    // Find a ready process
    const index = this.pool.findIndex((p) => p.ready && p.child.connected && !p.child.killed);

    if (index === -1) {
      log.info('IdlePool: No available process in pool');
      return null;
    }

    const pooled = this.pool.splice(index, 1)[0];
    log.info(`IdlePool: Acquired process ${pooled.child.pid} (${this.pool.length} remaining)`);

    // Trigger background warmup if below minimum
    if (this.pool.length < this.config.minSize) {
      this.warmupAsync();
    }

    return pooled.child;
  }

  /**
   * Add a new idle process to the pool
   */
  private createIdleProcess(): ChildProcess | null {
    if (!kitState.ready) {
      log.info('IdlePool: Kit not ready, skipping process creation');
      return null;
    }

    const entry = KIT_APP_PROMPT;
    if (!pathExistsSync(entry)) {
      log.error(`IdlePool: Entry point not found: ${entry}`);
      return null;
    }

    const env = createEnv();
    const loaderFileUrl = pathToFileURL(kitPath('build', 'loader.js')).href;

    const child = fork(entry, [], {
      silent: true,
      stdio: kitState?.kenvEnv?.KIT_STDIO || 'pipe',
      execPath: kitState.KIT_NODE_PATH,
      cwd: kitState?.kenvEnv?.KIT_CWD || os.homedir(),
      execArgv: ['--loader', loaderFileUrl],
      windowsHide: kitState?.kenvEnv?.KIT_WINDOWS_HIDE === 'true',
      detached: true,
      env,
    });

    if (!child || !child.pid) {
      log.error('IdlePool: Failed to create idle process');
      return null;
    }

    log.info(`IdlePool: Created idle process ${child.pid}`);
    return child;
  }

  /**
   * Add a process to the pool
   */
  add(child: ChildProcess): boolean {
    if (this.pool.length >= this.config.maxSize) {
      log.info('IdlePool: Pool at max capacity, rejecting process');
      return false;
    }

    const scope = `idle-pool:${child.pid}`;
    const pooled: PooledProcess = {
      child,
      createdAt: Date.now(),
      ready: false,
    };

    // Listen for KIT_READY to mark as ready
    const readyHandler = (data: { channel?: Channel }) => {
      if (data?.channel === Channel.KIT_READY) {
        pooled.ready = true;
        log.info(`IdlePool: Process ${child.pid} is ready`);
        child.off('message', readyHandler);
      }
    };
    child.on('message', readyHandler);

    // Track for cleanup
    disposableRegistry.addListener(scope, child, 'exit', () => {
      this.removeProcess(child.pid!);
      disposableRegistry.disposeScope(scope);
    });

    disposableRegistry.addListener(scope, child, 'error', (error) => {
      log.error(`IdlePool: Process ${child.pid} error:`, error);
      this.removeProcess(child.pid!);
      disposableRegistry.disposeScope(scope);
    });

    this.pool.push(pooled);
    log.info(`IdlePool: Added process ${child.pid} (${this.pool.length}/${this.config.maxSize})`);
    return true;
  }

  /**
   * Remove a process from the pool by PID
   */
  private removeProcess(pid: number): void {
    const index = this.pool.findIndex((p) => p.child.pid === pid);
    if (index !== -1) {
      this.pool.splice(index, 1);
      log.info(`IdlePool: Removed process ${pid} (${this.pool.length} remaining)`);
    }
  }

  /**
   * Warm up the pool to minimum size
   */
  async warmup(count?: number): Promise<void> {
    const targetCount = count ?? this.config.minSize;
    const needed = targetCount - this.pool.length;

    if (needed <= 0) {
      log.info('IdlePool: Pool already at target size');
      return;
    }

    log.info(`IdlePool: Warming up ${needed} process(es)`);

    for (let i = 0; i < needed; i++) {
      const child = this.createIdleProcess();
      if (child) {
        this.add(child);
      }
    }
  }

  /**
   * Asynchronous warmup (non-blocking)
   */
  private warmupAsync(): void {
    if (this.isWarming) {
      return;
    }

    this.isWarming = true;
    this.warmupPromise = this.warmup()
      .catch((error) => log.error('IdlePool: Warmup error:', error))
      .finally(() => {
        this.isWarming = false;
        this.warmupPromise = null;
      });
  }

  /**
   * Remove stale processes from the pool
   */
  cleanupStale(): number {
    const now = Date.now();
    const staleProcesses = this.pool.filter(
      (p) => now - p.createdAt > this.config.staleTimeout || !p.child.connected || p.child.killed,
    );

    for (const pooled of staleProcesses) {
      const scope = `idle-pool:${pooled.child.pid}`;
      if (!pooled.child.killed) {
        pooled.child.kill();
      }
      disposableRegistry.disposeScope(scope);
      this.removeProcess(pooled.child.pid!);
    }

    if (staleProcesses.length > 0) {
      log.info(`IdlePool: Cleaned up ${staleProcesses.length} stale process(es)`);
    }

    return staleProcesses.length;
  }

  /**
   * Drain all processes from the pool
   */
  async drain(): Promise<void> {
    log.info(`IdlePool: Draining ${this.pool.length} process(es)`);

    for (const pooled of this.pool) {
      const scope = `idle-pool:${pooled.child.pid}`;
      if (!pooled.child.killed) {
        pooled.child.kill();
      }
      disposableRegistry.disposeScope(scope);
    }

    this.pool = [];
  }

  /**
   * Get debug info about the pool
   */
  getDebugInfo(): Record<string, unknown> {
    return {
      config: this.config,
      poolSize: this.pool.length,
      processes: this.pool.map((p) => ({
        pid: p.child.pid,
        ready: p.ready,
        connected: p.child.connected,
        killed: p.child.killed,
        age: Date.now() - p.createdAt,
      })),
    };
  }
}

// Export singleton for shared use
export const idleProcessPool = new IdleProcessPool();
