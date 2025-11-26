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
 * State machine for managing process lifecycle
 */
export class ProcessStateMachine {
  private state: ProcessState = ProcessState.Idle;
  private pendingWindowOps = new Map<number, string>();
  private stateChangeCallbacks: StateChangeCallback[] = [];
  private lastError: Error | null = null;
  private exitCode: number | null = null;
  private stopReason: string | null = null;

  constructor(private readonly pid: number) {}

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
          log.warn(`${this.pid}: Force stopping with ${this.pendingWindowOps.size} pending window ops`);
          this.stopReason = event.reason;
          this.pendingWindowOps.clear();
          this.state = ProcessState.Stopping;
        } else if (event.type === 'STOP') {
          // Regular stop blocked during window operations
          success = false;
          reason = `Cannot stop process ${this.pid} - ${this.pendingWindowOps.size} window operation(s) pending`;
          log.warn(reason);
        } else if (event.type === 'EXIT') {
          // Process exited unexpectedly during window op
          log.warn(`${this.pid}: Process exited during window operations`);
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

    // Notify callbacks on successful state change
    if (success && previousState !== this.state) {
      log.info(`${this.pid}: State transition: ${previousState} -> ${this.state} (${event.type})`);
      for (const callback of this.stateChangeCallbacks) {
        try {
          callback(previousState, this.state, event);
        } catch (error) {
          log.error(`Error in state change callback:`, error);
        }
      }
    } else if (!success) {
      log.verbose(`${this.pid}: Transition rejected: ${reason}`);
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
   * Get debug info
   */
  getDebugInfo(): Record<string, unknown> {
    return {
      pid: this.pid,
      state: this.state,
      pendingWindowOps: Array.from(this.pendingWindowOps.entries()),
      lastError: this.lastError?.message,
      exitCode: this.exitCode,
      stopReason: this.stopReason,
    };
  }
}
