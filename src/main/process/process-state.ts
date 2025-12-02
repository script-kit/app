/**
 * ProcessStateMachine - Explicit lifecycle state management
 *
 * Replaces ad-hoc state checks and the process-window-coordinator
 * with a proper state machine that guards against invalid transitions.
 */

import { processLog as log } from '../logs';

/**
 * Process lifecycle states
 */
export enum ProcessState {
  /** Process not yet spawned */
  Idle = 'idle',
  /** Process is being spawned */
  Spawning = 'spawning',
  /** Process is running normally */
  Running = 'running',
  /** Process has pending window operations */
  WindowOperationPending = 'window_op_pending',
  /** Process is being stopped */
  Stopping = 'stopping',
  /** Process has stopped successfully */
  Stopped = 'stopped',
  /** Process encountered an error */
  Error = 'error',
}

/**
 * Events that can trigger state transitions
 */
export type ProcessEvent =
  | { type: 'SPAWN' }
  | { type: 'READY' }
  | { type: 'WINDOW_OP_START'; windowId: number; operation: string }
  | { type: 'WINDOW_OP_END'; windowId: number }
  | { type: 'STOP'; reason: string }
  | { type: 'FORCE_STOP'; reason: string }
  | { type: 'EXIT'; code: number | null }
  | { type: 'ERROR'; error: Error };

/**
 * State transition result
 */
export interface TransitionResult {
  success: boolean;
  previousState: ProcessState;
  currentState: ProcessState;
  reason?: string;
}

/**
 * Callback for state changes
 */
export type StateChangeCallback = (
  previousState: ProcessState,
  currentState: ProcessState,
  event: ProcessEvent,
) => void;

/**
 * State transition history entry for observability
 */
interface TransitionHistoryEntry {
  timestamp: number;
  from: ProcessState;
  to: ProcessState;
  event: string;
  duration: number; // Time spent in previous state (ms)
  success: boolean;
}

/**
 * State machine for managing process lifecycle
 */
export class ProcessStateMachine {
  private state: ProcessState = ProcessState.Idle;
  private pendingWindowOps = new Map<number, string>();
  private stateChangeCallbacks: StateChangeCallback[] = [];
  private lastError: Error | null = null;
  private exitCode: number | null = null;
  private stopReason: string | null = null;

  // Observability fields
  private readonly createdAt: number;
  private stateEnteredAt: number;
  private transitionHistory: TransitionHistoryEntry[] = [];
  private transitionCounts = new Map<string, number>();
  private static readonly MAX_HISTORY_SIZE = 50;

  constructor(private readonly pid: number) {
    this.createdAt = Date.now();
    this.stateEnteredAt = this.createdAt;
    log.verbose(`[${this.pid}] ProcessStateMachine created`);
  }

  /**
   * Get current state
   */
  getState(): ProcessState {
    return this.state;
  }

  /**
   * Get pending window operations
   */
  getPendingWindowOps(): Map<number, string> {
    return new Map(this.pendingWindowOps);
  }

  /**
   * Get last error if in error state
   */
  getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * Get exit code if stopped
   */
  getExitCode(): number | null {
    return this.exitCode;
  }

  /**
   * Get stop reason if stopped
   */
  getStopReason(): string | null {
    return this.stopReason;
  }

  /**
   * Register a callback for state changes
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index !== -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Attempt a state transition
   */
  transition(event: ProcessEvent): TransitionResult {
    const previousState = this.state;
    let success = true;
    let reason: string | undefined;

    switch (this.state) {
      case ProcessState.Idle:
        if (event.type === 'SPAWN') {
          this.state = ProcessState.Spawning;
        } else {
          success = false;
          reason = `Cannot ${event.type} from Idle state`;
        }
        break;

      case ProcessState.Spawning:
        if (event.type === 'READY') {
          this.state = ProcessState.Running;
        } else if (event.type === 'ERROR') {
          this.lastError = event.error;
          this.state = ProcessState.Error;
        } else if (event.type === 'EXIT') {
          this.exitCode = event.code;
          this.state = ProcessState.Stopped;
        } else if (event.type === 'FORCE_STOP') {
          this.stopReason = event.reason;
          this.state = ProcessState.Stopping;
        } else {
          success = false;
          reason = `Cannot ${event.type} while Spawning`;
        }
        break;

      case ProcessState.Running:
        if (event.type === 'WINDOW_OP_START') {
          this.pendingWindowOps.set(event.windowId, event.operation);
          this.state = ProcessState.WindowOperationPending;
        } else if (event.type === 'STOP' || event.type === 'FORCE_STOP') {
          this.stopReason = event.reason;
          this.state = ProcessState.Stopping;
        } else if (event.type === 'EXIT') {
          this.exitCode = event.code;
          this.state = ProcessState.Stopped;
        } else if (event.type === 'ERROR') {
          this.lastError = event.error;
          this.state = ProcessState.Error;
        } else {
          success = false;
          reason = `Cannot ${event.type} while Running`;
        }
        break;

      case ProcessState.WindowOperationPending:
        if (event.type === 'WINDOW_OP_START') {
          // Can start additional window ops while pending
          this.pendingWindowOps.set(event.windowId, event.operation);
        } else if (event.type === 'WINDOW_OP_END') {
          this.pendingWindowOps.delete(event.windowId);
          if (this.pendingWindowOps.size === 0) {
            this.state = ProcessState.Running;
          }
        } else if (event.type === 'FORCE_STOP') {
          // Force stop bypasses window operation protection
          log.warn(
            `[${this.pid}] Force stopping with ${this.pendingWindowOps.size} pending window ops: ` +
              `[${Array.from(this.pendingWindowOps.entries())
                .map(([id, op]) => `${id}:${op}`)
                .join(', ')}]`,
          );
          this.stopReason = event.reason;
          this.pendingWindowOps.clear();
          this.state = ProcessState.Stopping;
        } else if (event.type === 'STOP') {
          // Regular stop blocked during window operations
          success = false;
          reason = `Cannot stop - ${this.pendingWindowOps.size} window operation(s) pending`;
          log.warn(
            `[${this.pid}] ${reason}: ` +
              `[${Array.from(this.pendingWindowOps.entries())
                .map(([id, op]) => `${id}:${op}`)
                .join(', ')}]`,
          );
        } else if (event.type === 'EXIT') {
          // Process exited unexpectedly during window op
          log.warn(
            `[${this.pid}] Unexpected exit during window operations (code: ${event.code}), ` +
              `clearing ${this.pendingWindowOps.size} pending ops`,
          );
          this.exitCode = event.code;
          this.pendingWindowOps.clear();
          this.state = ProcessState.Stopped;
        } else if (event.type === 'ERROR') {
          this.lastError = event.error;
          this.pendingWindowOps.clear();
          this.state = ProcessState.Error;
        } else {
          success = false;
          reason = `Cannot ${event.type} while WindowOperationPending`;
        }
        break;

      case ProcessState.Stopping:
        if (event.type === 'EXIT') {
          this.exitCode = event.code;
          this.state = ProcessState.Stopped;
        } else if (event.type === 'ERROR') {
          this.lastError = event.error;
          this.state = ProcessState.Error;
        } else {
          // Ignore other events while stopping
          success = false;
          reason = `Ignoring ${event.type} - process is stopping`;
        }
        break;

      case ProcessState.Stopped:
      case ProcessState.Error:
        // Terminal states - no transitions allowed
        success = false;
        reason = `Process ${this.pid} is in terminal state: ${this.state}`;
        break;
    }

    // Track timing
    const now = Date.now();
    const stateDuration = now - this.stateEnteredAt;

    // Record transition in history
    const transitionKey = `${previousState}->${this.state}:${event.type}`;
    const historyEntry: TransitionHistoryEntry = {
      timestamp: now,
      from: previousState,
      to: this.state,
      event: event.type,
      duration: stateDuration,
      success,
    };
    this.transitionHistory.push(historyEntry);

    // Trim history if too large
    if (this.transitionHistory.length > ProcessStateMachine.MAX_HISTORY_SIZE) {
      this.transitionHistory.shift();
    }

    // Update transition counts
    this.transitionCounts.set(transitionKey, (this.transitionCounts.get(transitionKey) || 0) + 1);

    // Notify callbacks on successful state change
    if (success && previousState !== this.state) {
      this.stateEnteredAt = now;
      const totalAge = now - this.createdAt;

      log.info(
        `[${this.pid}] ${previousState} → ${this.state} (${event.type}) ` +
          `[duration: ${stateDuration}ms, total_age: ${totalAge}ms]`,
      );

      // Log additional context for important transitions
      if (this.state === ProcessState.Error && this.lastError) {
        log.error(`[${this.pid}] Error details: ${this.lastError.message}`);
      }
      if (this.state === ProcessState.Stopped && this.exitCode !== 0) {
        log.warn(`[${this.pid}] Non-zero exit code: ${this.exitCode}`);
      }

      for (const callback of this.stateChangeCallbacks) {
        try {
          callback(previousState, this.state, event);
        } catch (error) {
          log.error(`[${this.pid}] Error in state change callback:`, error);
        }
      }
    } else if (!success) {
      log.verbose(`[${this.pid}] Transition rejected: ${event.type} from ${previousState} - ${reason}`);
    }

    return {
      success,
      previousState,
      currentState: this.state,
      reason,
    };
  }

  /**
   * Check if process can be stopped normally
   */
  canStop(): boolean {
    return this.state === ProcessState.Running;
  }

  /**
   * Check if process can be force stopped
   */
  canForceStop(): boolean {
    return ![ProcessState.Stopped, ProcessState.Error, ProcessState.Idle].includes(this.state);
  }

  /**
   * Check if process is in a terminal state
   */
  isTerminal(): boolean {
    return [ProcessState.Stopped, ProcessState.Error].includes(this.state);
  }

  /**
   * Check if process is alive (not terminal)
   */
  isAlive(): boolean {
    return !this.isTerminal() && this.state !== ProcessState.Idle;
  }

  /**
   * Check if process is ready to handle messages
   */
  isReady(): boolean {
    return [ProcessState.Running, ProcessState.WindowOperationPending].includes(this.state);
  }

  /**
   * Check if process has pending window operations
   */
  hasWindowOperationsPending(): boolean {
    return this.pendingWindowOps.size > 0;
  }

  /**
   * Get time spent in current state (ms)
   */
  getTimeInCurrentState(): number {
    return Date.now() - this.stateEnteredAt;
  }

  /**
   * Get total age of state machine (ms)
   */
  getTotalAge(): number {
    return Date.now() - this.createdAt;
  }

  /**
   * Get transition history
   */
  getTransitionHistory(): TransitionHistoryEntry[] {
    return [...this.transitionHistory];
  }

  /**
   * Get transition counts for analytics
   */
  getTransitionCounts(): Map<string, number> {
    return new Map(this.transitionCounts);
  }

  /**
   * Get debug info
   */
  getDebugInfo(): Record<string, unknown> {
    const now = Date.now();
    return {
      pid: this.pid,
      state: this.state,
      pendingWindowOps: Array.from(this.pendingWindowOps.entries()),
      lastError: this.lastError?.message,
      exitCode: this.exitCode,
      stopReason: this.stopReason,
      // Observability metrics
      createdAt: this.createdAt,
      totalAge: now - this.createdAt,
      timeInCurrentState: now - this.stateEnteredAt,
      transitionCount: this.transitionHistory.length,
      transitionCounts: Object.fromEntries(this.transitionCounts),
      recentTransitions: this.transitionHistory.slice(-10).map((t) => ({
        from: t.from,
        to: t.to,
        event: t.event,
        duration: t.duration,
        success: t.success,
        ago: now - t.timestamp,
      })),
    };
  }
}
