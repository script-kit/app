/**
 * DisposableRegistry - Centralized cleanup mechanism
 *
 * Tracks all cleanup-requiring resources (event listeners, timers, intervals)
 * per scope (usually process PID). Single disposeScope() call cleans everything.
 */

import type { EventEmitter } from 'node:events';
import { processLog as log } from '../logs';
import type { Disposable } from './types';

export class DisposableRegistry {
  private disposables = new Map<string, Set<Disposable>>();
  private scopeCleanupCallbacks = new Map<string, Set<() => void>>();

  /**
   * Register a disposable resource for a given scope
   */
  register(scope: string, disposable: Disposable): void {
    if (!this.disposables.has(scope)) {
      this.disposables.set(scope, new Set());
    }
    this.disposables.get(scope)!.add(disposable);
  }

  /**
   * Register a cleanup callback for a scope
   */
  onScopeDispose(scope: string, callback: () => void): void {
    if (!this.scopeCleanupCallbacks.has(scope)) {
      this.scopeCleanupCallbacks.set(scope, new Set());
    }
    this.scopeCleanupCallbacks.get(scope)!.add(callback);
  }

  /**
   * Add an event listener with automatic cleanup tracking
   */
  addListener<T extends EventEmitter>(
    scope: string,
    emitter: T,
    event: string,
    handler: (...args: unknown[]) => void,
  ): void {
    emitter.on(event, handler);
    this.register(scope, {
      dispose: () => {
        emitter.off(event, handler);
      },
    });
  }

  /**
   * Add a 'once' event listener with automatic cleanup tracking
   */
  addOnceListener<T extends EventEmitter>(
    scope: string,
    emitter: T,
    event: string,
    handler: (...args: unknown[]) => void,
  ): void {
    const wrappedHandler = (...args: unknown[]) => {
      handler(...args);
    };
    emitter.once(event, wrappedHandler);
    this.register(scope, {
      dispose: () => {
        emitter.off(event, wrappedHandler);
      },
    });
  }

  /**
   * Add an interval with automatic cleanup tracking
   */
  addInterval(scope: string, fn: () => void, ms: number): NodeJS.Timeout {
    const id = setInterval(fn, ms);
    this.register(scope, {
      dispose: () => clearInterval(id),
    });
    return id;
  }

  /**
   * Add a timeout with automatic cleanup tracking
   */
  addTimeout(scope: string, fn: () => void, ms: number): NodeJS.Timeout {
    const id = setTimeout(fn, ms);
    this.register(scope, {
      dispose: () => clearTimeout(id),
    });
    return id;
  }

  /**
   * Add an AbortController with automatic cleanup tracking
   */
  addAbortController(scope: string): AbortController {
    const controller = new AbortController();
    this.register(scope, {
      dispose: () => {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      },
    });
    return controller;
  }

  /**
   * Check if a scope exists
   */
  hasScope(scope: string): boolean {
    return this.disposables.has(scope);
  }

  /**
   * Get the count of disposables in a scope
   */
  getScopeSize(scope: string): number {
    return this.disposables.get(scope)?.size ?? 0;
  }

  /**
   * Get all active scopes
   */
  getScopes(): string[] {
    return Array.from(this.disposables.keys());
  }

  /**
   * Dispose all resources in a scope
   */
  disposeScope(scope: string): number {
    const set = this.disposables.get(scope);
    const callbacks = this.scopeCleanupCallbacks.get(scope);
    let disposed = 0;

    if (set) {
      for (const d of set) {
        try {
          d.dispose();
          disposed++;
        } catch (error) {
          log.warn(`Error disposing resource in scope ${scope}:`, error);
        }
      }
      this.disposables.delete(scope);
    }

    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback();
        } catch (error) {
          log.warn(`Error in cleanup callback for scope ${scope}:`, error);
        }
      }
      this.scopeCleanupCallbacks.delete(scope);
    }

    if (disposed > 0) {
      log.info(`Disposed ${disposed} resources for scope: ${scope}`);
    }

    return disposed;
  }

  /**
   * Dispose all resources in all scopes
   */
  disposeAll(): number {
    let totalDisposed = 0;
    for (const scope of this.disposables.keys()) {
      totalDisposed += this.disposeScope(scope);
    }
    log.info(`Disposed ${totalDisposed} total resources across all scopes`);
    return totalDisposed;
  }

  /**
   * Get debug info about all scopes
   */
  getDebugInfo(): Record<string, number> {
    const info: Record<string, number> = {};
    for (const [scope, set] of this.disposables) {
      info[scope] = set.size;
    }
    return info;
  }
}

// Export singleton instance for shared use
export const disposableRegistry = new DisposableRegistry();
