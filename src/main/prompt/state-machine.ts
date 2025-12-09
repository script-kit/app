/**
 * Prompt State Machine
 *
 * Manages the lifecycle of a KitPrompt through well-defined states and transitions.
 * Replaces ad-hoc boolean flags with a formal FSM to prevent race conditions and
 * invalid state combinations.
 */

import { promptLog as log } from '../logs';

/**
 * All possible states a prompt can be in during its lifecycle.
 */
export enum PromptState {
  /** Initial state when prompt is first created */
  INITIALIZING = 'INITIALIZING',

  /** DOM is loading, waiting for renderer to be ready */
  LOADING = 'LOADING',

  /** Renderer is ready, prompt is hidden but available for use */
  READY = 'READY',

  /** Prompt is calculating layout/bounds before becoming visible */
  CALCULATING_LAYOUT = 'CALCULATING_LAYOUT',

  /** Prompt is visible and interactive */
  VISIBLE = 'VISIBLE',

  /** Prompt is being resized */
  RESIZING = 'RESIZING',

  /** Prompt is hidden but still alive */
  HIDDEN = 'HIDDEN',

  /** Prompt is in the process of being destroyed */
  DISPOSING = 'DISPOSING',

  /** Prompt has been destroyed and is no longer usable */
  DESTROYED = 'DESTROYED',
}

/**
 * Events that can trigger state transitions.
 */
export enum PromptEvent {
  /** DOM and renderer have finished loading */
  RENDERER_READY = 'RENDERER_READY',

  /** Request to show the prompt */
  SHOW = 'SHOW',

  /** Request to hide the prompt */
  HIDE = 'HIDE',

  /** Prompt window gained focus */
  FOCUS = 'FOCUS',

  /** Prompt window lost focus */
  BLUR = 'BLUR',

  /** Request to resize the prompt */
  RESIZE_START = 'RESIZE_START',

  /** Resize operation completed */
  RESIZE_END = 'RESIZE_END',

  /** Request to close/destroy the prompt */
  CLOSE = 'CLOSE',

  /** Prompt has been fully destroyed */
  DESTROY = 'DESTROY',

  /** Request to calculate/apply bounds */
  CALCULATE_BOUNDS = 'CALCULATE_BOUNDS',

  /** Bounds calculation completed */
  BOUNDS_CALCULATED = 'BOUNDS_CALCULATED',

  /** Reset the prompt to idle state */
  RESET = 'RESET',

  /** Process bound to prompt */
  BIND_PROCESS = 'BIND_PROCESS',

  /** Process unbound from prompt */
  UNBIND_PROCESS = 'UNBIND_PROCESS',
}

/**
 * Defines valid state transitions.
 * Key is the current state, value is a map of events to next states.
 */
const STATE_TRANSITIONS: Record<PromptState, Partial<Record<PromptEvent, PromptState>>> = {
  [PromptState.INITIALIZING]: {
    [PromptEvent.RENDERER_READY]: PromptState.READY,
    [PromptEvent.CLOSE]: PromptState.DISPOSING,
    [PromptEvent.DESTROY]: PromptState.DESTROYED,
  },

  [PromptState.LOADING]: {
    [PromptEvent.RENDERER_READY]: PromptState.READY,
    [PromptEvent.CLOSE]: PromptState.DISPOSING,
    [PromptEvent.DESTROY]: PromptState.DESTROYED,
  },

  [PromptState.READY]: {
    [PromptEvent.SHOW]: PromptState.VISIBLE,
    [PromptEvent.CALCULATE_BOUNDS]: PromptState.CALCULATING_LAYOUT,
    [PromptEvent.CLOSE]: PromptState.DISPOSING,
    [PromptEvent.DESTROY]: PromptState.DESTROYED,
    [PromptEvent.BIND_PROCESS]: PromptState.READY,
    [PromptEvent.UNBIND_PROCESS]: PromptState.READY,
    [PromptEvent.RESET]: PromptState.READY,
  },

  [PromptState.CALCULATING_LAYOUT]: {
    [PromptEvent.BOUNDS_CALCULATED]: PromptState.READY,
    [PromptEvent.SHOW]: PromptState.VISIBLE,
    [PromptEvent.CLOSE]: PromptState.DISPOSING,
    [PromptEvent.DESTROY]: PromptState.DESTROYED,
  },

  [PromptState.VISIBLE]: {
    [PromptEvent.HIDE]: PromptState.HIDDEN,
    [PromptEvent.RESIZE_START]: PromptState.RESIZING,
    [PromptEvent.FOCUS]: PromptState.VISIBLE,
    [PromptEvent.BLUR]: PromptState.VISIBLE, // Stays visible, blur is informational
    [PromptEvent.CLOSE]: PromptState.DISPOSING,
    [PromptEvent.DESTROY]: PromptState.DESTROYED,
    [PromptEvent.CALCULATE_BOUNDS]: PromptState.VISIBLE, // Can recalculate while visible
  },

  [PromptState.RESIZING]: {
    [PromptEvent.RESIZE_END]: PromptState.VISIBLE,
    [PromptEvent.HIDE]: PromptState.HIDDEN,
    [PromptEvent.CLOSE]: PromptState.DISPOSING,
    [PromptEvent.DESTROY]: PromptState.DESTROYED,
  },

  [PromptState.HIDDEN]: {
    [PromptEvent.SHOW]: PromptState.VISIBLE,
    [PromptEvent.CALCULATE_BOUNDS]: PromptState.CALCULATING_LAYOUT,
    [PromptEvent.CLOSE]: PromptState.DISPOSING,
    [PromptEvent.DESTROY]: PromptState.DESTROYED,
    [PromptEvent.RESET]: PromptState.READY,
    [PromptEvent.BIND_PROCESS]: PromptState.HIDDEN,
    [PromptEvent.UNBIND_PROCESS]: PromptState.HIDDEN,
  },

  [PromptState.DISPOSING]: {
    [PromptEvent.DESTROY]: PromptState.DESTROYED,
    // No other transitions allowed during disposal
  },

  [PromptState.DESTROYED]: {
    // Terminal state - no transitions allowed
  },
};

/**
 * Context data associated with the state machine.
 */
export interface PromptStateContext {
  /** Whether the prompt is bound to a process */
  boundToProcess: boolean;

  /** PID of the bound process */
  pid: number;

  /** Whether this is the first prompt shown */
  firstPrompt: boolean;

  /** Whether the prompt has been focused at least once */
  hasBeenFocused: boolean;

  /** Whether the prompt has been hidden at least once */
  hasBeenHidden: boolean;

  /** Whether the window has been modified by the user (e.g., manually resized) */
  modifiedByUser: boolean;

  /** Whether bounds should be locked during resize */
  boundsLockedForResize: boolean;

  /** Whether to skip initBounds during resize */
  skipInitBoundsForResize: boolean;

  /** Whether to show after next resize completes */
  showAfterNextResize: boolean;

  /** Whether DevTools are being opened (to ignore blur) */
  devToolsOpening: boolean;

  /** Whether actions menu is open */
  actionsOpen: boolean;

  /** Whether actions were just open (for escape handling) */
  wasActionsJustOpen: boolean;

  /** Whether the process connection has been lost */
  processConnectionLost: boolean;
}

/**
 * Creates a default context for a new prompt.
 */
export function createDefaultContext(): PromptStateContext {
  return {
    boundToProcess: false,
    pid: 0,
    firstPrompt: true,
    hasBeenFocused: false,
    hasBeenHidden: false,
    modifiedByUser: false,
    boundsLockedForResize: false,
    skipInitBoundsForResize: false,
    showAfterNextResize: false,
    devToolsOpening: false,
    actionsOpen: false,
    wasActionsJustOpen: false,
    processConnectionLost: false,
  };
}

/**
 * Listener function type for state transitions.
 */
export type StateTransitionListener = (
  fromState: PromptState,
  toState: PromptState,
  event: PromptEvent,
  context: PromptStateContext,
) => void;

/**
 * Options for the state machine.
 */
export interface PromptStateMachineOptions {
  /** Unique identifier for this prompt (for logging) */
  id?: string;

  /** Initial state (defaults to INITIALIZING) */
  initialState?: PromptState;

  /** Initial context values */
  initialContext?: Partial<PromptStateContext>;

  /** Whether to enable verbose logging */
  verbose?: boolean;
}

/**
 * Finite State Machine for managing prompt lifecycle.
 *
 * Provides strict transition validation, guards against invalid operations,
 * and emits events for state changes.
 */
export class PromptStateMachine {
  private _state: PromptState;
  private _context: PromptStateContext;
  private _listeners: Set<StateTransitionListener> = new Set();
  private _id: string;
  private _verbose: boolean;

  constructor(options: PromptStateMachineOptions = {}) {
    this._state = options.initialState ?? PromptState.INITIALIZING;
    this._context = {
      ...createDefaultContext(),
      ...options.initialContext,
    };
    this._id = options.id ?? 'unknown';
    this._verbose = options.verbose ?? false;
  }

  /**
   * Gets the current state.
   */
  get state(): PromptState {
    return this._state;
  }

  /**
   * Gets the current context.
   */
  get context(): Readonly<PromptStateContext> {
    return this._context;
  }

  /**
   * Checks if a transition is valid from the current state.
   */
  canTransition(event: PromptEvent): boolean {
    const transitions = STATE_TRANSITIONS[this._state];
    return transitions !== undefined && event in transitions;
  }

  /**
   * Gets the next state for a given event (without transitioning).
   */
  getNextState(event: PromptEvent): PromptState | null {
    const transitions = STATE_TRANSITIONS[this._state];
    if (!transitions || !(event in transitions)) {
      return null;
    }
    return transitions[event] ?? null;
  }

  /**
   * Attempts to transition to a new state based on an event.
   * Returns true if the transition was successful, false if it was invalid.
   */
  transition(event: PromptEvent): boolean {
    const nextState = this.getNextState(event);

    if (nextState === null) {
      if (this._verbose) {
        log.warn(`[FSM:${this._id}] Invalid transition: ${event} from state ${this._state}`);
      }
      return false;
    }

    const fromState = this._state;
    this._state = nextState;

    if (this._verbose) {
      log.info(`[FSM:${this._id}] Transition: ${fromState} --[${event}]--> ${nextState}`);
    }

    // Notify listeners
    for (const listener of this._listeners) {
      try {
        listener(fromState, nextState, event, this._context);
      } catch (error) {
        log.error(`[FSM:${this._id}] Error in state transition listener:`, error);
      }
    }

    return true;
  }

  /**
   * Updates context values.
   */
  updateContext(updates: Partial<PromptStateContext>): void {
    this._context = {
      ...this._context,
      ...updates,
    };
  }

  /**
   * Adds a listener for state transitions.
   */
  addListener(listener: StateTransitionListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Removes a listener.
   */
  removeListener(listener: StateTransitionListener): void {
    this._listeners.delete(listener);
  }

  // --- State Query Methods ---

  /**
   * Returns true if the prompt is in a state where it can be shown.
   */
  canShow(): boolean {
    return this.canTransition(PromptEvent.SHOW);
  }

  /**
   * Returns true if the prompt is in a state where it can be hidden.
   */
  canHide(): boolean {
    return this.canTransition(PromptEvent.HIDE);
  }

  /**
   * Returns true if the prompt is in a state where it can be resized.
   */
  canResize(): boolean {
    return this.canTransition(PromptEvent.RESIZE_START);
  }

  /**
   * Returns true if the prompt is currently visible.
   */
  isVisible(): boolean {
    return this._state === PromptState.VISIBLE || this._state === PromptState.RESIZING;
  }

  /**
   * Returns true if the prompt is ready for interaction.
   */
  isReady(): boolean {
    return (
      this._state === PromptState.READY ||
      this._state === PromptState.VISIBLE ||
      this._state === PromptState.HIDDEN ||
      this._state === PromptState.RESIZING
    );
  }

  /**
   * Returns true if the prompt is being disposed or has been destroyed.
   */
  isDisposedOrDestroyed(): boolean {
    return this._state === PromptState.DISPOSING || this._state === PromptState.DESTROYED;
  }

  /**
   * Returns true if the prompt is currently resizing.
   */
  isResizing(): boolean {
    return this._state === PromptState.RESIZING;
  }

  /**
   * Returns true if the prompt is hidden.
   */
  isHidden(): boolean {
    return this._state === PromptState.HIDDEN;
  }

  /**
   * Returns true if the prompt is in the initializing or loading phase.
   */
  isInitializing(): boolean {
    return this._state === PromptState.INITIALIZING || this._state === PromptState.LOADING;
  }

  // --- Guard Methods ---

  /**
   * Guard: Prevents resize operations when in DISPOSING state.
   */
  guardResize(reason: string): boolean {
    if (this.isDisposedOrDestroyed()) {
      if (this._verbose) {
        log.warn(`[FSM:${this._id}] Resize blocked (${reason}): prompt is disposing/destroyed`);
      }
      return false;
    }
    return true;
  }

  /**
   * Guard: Prevents show operations when already visible or disposing.
   */
  guardShow(reason: string): boolean {
    if (this.isDisposedOrDestroyed()) {
      if (this._verbose) {
        log.warn(`[FSM:${this._id}] Show blocked (${reason}): prompt is disposing/destroyed`);
      }
      return false;
    }
    if (this._state === PromptState.VISIBLE || this._state === PromptState.RESIZING) {
      if (this._verbose) {
        log.info(`[FSM:${this._id}] Show skipped (${reason}): already visible`);
      }
      return false;
    }
    return true;
  }

  /**
   * Guard: Prevents hide operations when already hidden or disposing.
   */
  guardHide(reason: string): boolean {
    if (this.isDisposedOrDestroyed()) {
      if (this._verbose) {
        log.warn(`[FSM:${this._id}] Hide blocked (${reason}): prompt is disposing/destroyed`);
      }
      return false;
    }
    if (this._state === PromptState.HIDDEN || this._state === PromptState.READY) {
      if (this._verbose) {
        log.info(`[FSM:${this._id}] Hide skipped (${reason}): already hidden`);
      }
      return false;
    }
    return true;
  }

  /**
   * Guard: Prevents bounds operations when bounds are locked.
   */
  guardBounds(reason: string): boolean {
    if (this.isDisposedOrDestroyed()) {
      if (this._verbose) {
        log.warn(`[FSM:${this._id}] Bounds operation blocked (${reason}): prompt is disposing/destroyed`);
      }
      return false;
    }
    if (this._context.boundsLockedForResize) {
      if (this._verbose) {
        log.info(`[FSM:${this._id}] Bounds operation blocked (${reason}): bounds locked for resize`);
      }
      return false;
    }
    return true;
  }

  /**
   * Guard: Prevents focus operations when DevTools are opening.
   */
  guardFocus(reason: string): boolean {
    if (this.isDisposedOrDestroyed()) {
      if (this._verbose) {
        log.warn(`[FSM:${this._id}] Focus blocked (${reason}): prompt is disposing/destroyed`);
      }
      return false;
    }
    if (this._context.devToolsOpening) {
      if (this._verbose) {
        log.info(`[FSM:${this._id}] Focus skipped (${reason}): DevTools opening`);
      }
      return false;
    }
    return true;
  }

  // --- Convenience Methods for Common Transitions ---

  /**
   * Marks the renderer as ready.
   */
  markReady(): boolean {
    return this.transition(PromptEvent.RENDERER_READY);
  }

  /**
   * Shows the prompt.
   */
  show(): boolean {
    return this.transition(PromptEvent.SHOW);
  }

  /**
   * Hides the prompt.
   */
  hide(): boolean {
    return this.transition(PromptEvent.HIDE);
  }

  /**
   * Starts a resize operation.
   */
  startResize(): boolean {
    return this.transition(PromptEvent.RESIZE_START);
  }

  /**
   * Ends a resize operation.
   */
  endResize(): boolean {
    return this.transition(PromptEvent.RESIZE_END);
  }

  /**
   * Closes the prompt (begins disposal).
   */
  close(): boolean {
    return this.transition(PromptEvent.CLOSE);
  }

  /**
   * Destroys the prompt (terminal state).
   */
  destroy(): boolean {
    return this.transition(PromptEvent.DESTROY);
  }

  /**
   * Resets the prompt to ready state.
   */
  reset(): boolean {
    if (this.transition(PromptEvent.RESET)) {
      // Reset context on successful reset
      this._context = {
        ...createDefaultContext(),
        // Preserve certain values that shouldn't be reset
        hasBeenFocused: false,
        hasBeenHidden: false,
      };
      return true;
    }
    return false;
  }

  /**
   * Binds the prompt to a process.
   */
  bindProcess(pid: number): boolean {
    if (this.transition(PromptEvent.BIND_PROCESS)) {
      this.updateContext({
        boundToProcess: true,
        pid,
        processConnectionLost: false,
      });
      return true;
    }
    return false;
  }

  /**
   * Unbinds the prompt from a process.
   */
  unbindProcess(): boolean {
    if (this.transition(PromptEvent.UNBIND_PROCESS)) {
      this.updateContext({
        boundToProcess: false,
        pid: 0,
      });
      return true;
    }
    return false;
  }

  /**
   * Returns a string representation for debugging.
   */
  toString(): string {
    return `PromptStateMachine(${this._id})[state=${this._state}, bound=${this._context.boundToProcess}, pid=${this._context.pid}]`;
  }

  /**
   * Returns a snapshot of the current state and context for logging.
   */
  snapshot(): { state: PromptState; context: PromptStateContext } {
    return {
      state: this._state,
      context: { ...this._context },
    };
  }
}

/**
 * Creates a new PromptStateMachine with default configuration.
 */
export function createPromptStateMachine(options?: PromptStateMachineOptions): PromptStateMachine {
  return new PromptStateMachine(options);
}
