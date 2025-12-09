import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultContext,
  createPromptStateMachine,
  PromptEvent,
  PromptState,
  PromptStateMachine,
} from './state-machine';

describe('PromptStateMachine', () => {
  describe('initialization', () => {
    it('should start in INITIALIZING state by default', () => {
      const fsm = createPromptStateMachine();
      expect(fsm.state).toBe(PromptState.INITIALIZING);
    });

    it('should accept custom initial state', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.READY });
      expect(fsm.state).toBe(PromptState.READY);
    });

    it('should create default context', () => {
      const fsm = createPromptStateMachine();
      expect(fsm.context.boundToProcess).toBe(false);
      expect(fsm.context.pid).toBe(0);
      expect(fsm.context.firstPrompt).toBe(true);
    });

    it('should accept custom initial context', () => {
      const fsm = createPromptStateMachine({
        initialContext: { pid: 1234, boundToProcess: true },
      });
      expect(fsm.context.pid).toBe(1234);
      expect(fsm.context.boundToProcess).toBe(true);
    });
  });

  describe('state transitions', () => {
    it('should transition from INITIALIZING to READY on RENDERER_READY', () => {
      const fsm = createPromptStateMachine();
      expect(fsm.transition(PromptEvent.RENDERER_READY)).toBe(true);
      expect(fsm.state).toBe(PromptState.READY);
    });

    it('should transition from READY to VISIBLE on SHOW', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.READY });
      expect(fsm.transition(PromptEvent.SHOW)).toBe(true);
      expect(fsm.state).toBe(PromptState.VISIBLE);
    });

    it('should transition from VISIBLE to HIDDEN on HIDE', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.VISIBLE });
      expect(fsm.transition(PromptEvent.HIDE)).toBe(true);
      expect(fsm.state).toBe(PromptState.HIDDEN);
    });

    it('should transition from VISIBLE to RESIZING on RESIZE_START', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.VISIBLE });
      expect(fsm.transition(PromptEvent.RESIZE_START)).toBe(true);
      expect(fsm.state).toBe(PromptState.RESIZING);
    });

    it('should transition from RESIZING to VISIBLE on RESIZE_END', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.RESIZING });
      expect(fsm.transition(PromptEvent.RESIZE_END)).toBe(true);
      expect(fsm.state).toBe(PromptState.VISIBLE);
    });

    it('should transition to DISPOSING on CLOSE from any active state', () => {
      const states = [
        PromptState.INITIALIZING,
        PromptState.READY,
        PromptState.VISIBLE,
        PromptState.HIDDEN,
        PromptState.RESIZING,
      ];

      for (const state of states) {
        const fsm = createPromptStateMachine({ initialState: state });
        expect(fsm.transition(PromptEvent.CLOSE)).toBe(true);
        expect(fsm.state).toBe(PromptState.DISPOSING);
      }
    });

    it('should transition from DISPOSING to DESTROYED on DESTROY', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.DISPOSING });
      expect(fsm.transition(PromptEvent.DESTROY)).toBe(true);
      expect(fsm.state).toBe(PromptState.DESTROYED);
    });
  });

  describe('invalid transitions', () => {
    it('should reject invalid transitions', () => {
      const fsm = createPromptStateMachine(); // INITIALIZING
      expect(fsm.transition(PromptEvent.SHOW)).toBe(false);
      expect(fsm.state).toBe(PromptState.INITIALIZING);
    });

    it('should not allow any transitions from DESTROYED state', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.DESTROYED });
      expect(fsm.transition(PromptEvent.SHOW)).toBe(false);
      expect(fsm.transition(PromptEvent.RENDERER_READY)).toBe(false);
      expect(fsm.transition(PromptEvent.CLOSE)).toBe(false);
      expect(fsm.state).toBe(PromptState.DESTROYED);
    });

    it('should not allow transitions other than DESTROY from DISPOSING', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.DISPOSING });
      expect(fsm.transition(PromptEvent.SHOW)).toBe(false);
      expect(fsm.transition(PromptEvent.HIDE)).toBe(false);
      expect(fsm.transition(PromptEvent.RESIZE_START)).toBe(false);
      expect(fsm.state).toBe(PromptState.DISPOSING);
    });
  });

  describe('canTransition', () => {
    it('should correctly report whether a transition is valid', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.READY });
      expect(fsm.canTransition(PromptEvent.SHOW)).toBe(true);
      expect(fsm.canTransition(PromptEvent.HIDE)).toBe(false);
    });
  });

  describe('getNextState', () => {
    it('should return the next state for a valid event', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.READY });
      expect(fsm.getNextState(PromptEvent.SHOW)).toBe(PromptState.VISIBLE);
    });

    it('should return null for an invalid event', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.READY });
      expect(fsm.getNextState(PromptEvent.RESIZE_END)).toBe(null);
    });
  });

  describe('state query methods', () => {
    it('isVisible should return true for VISIBLE and RESIZING states', () => {
      const fsmVisible = createPromptStateMachine({ initialState: PromptState.VISIBLE });
      const fsmResizing = createPromptStateMachine({ initialState: PromptState.RESIZING });
      const fsmReady = createPromptStateMachine({ initialState: PromptState.READY });

      expect(fsmVisible.isVisible()).toBe(true);
      expect(fsmResizing.isVisible()).toBe(true);
      expect(fsmReady.isVisible()).toBe(false);
    });

    it('isReady should return true for active states', () => {
      const fsmReady = createPromptStateMachine({ initialState: PromptState.READY });
      const fsmVisible = createPromptStateMachine({ initialState: PromptState.VISIBLE });
      const fsmInit = createPromptStateMachine({ initialState: PromptState.INITIALIZING });

      expect(fsmReady.isReady()).toBe(true);
      expect(fsmVisible.isReady()).toBe(true);
      expect(fsmInit.isReady()).toBe(false);
    });

    it('isDisposedOrDestroyed should return true for terminal states', () => {
      const fsmDisposing = createPromptStateMachine({ initialState: PromptState.DISPOSING });
      const fsmDestroyed = createPromptStateMachine({ initialState: PromptState.DESTROYED });
      const fsmReady = createPromptStateMachine({ initialState: PromptState.READY });

      expect(fsmDisposing.isDisposedOrDestroyed()).toBe(true);
      expect(fsmDestroyed.isDisposedOrDestroyed()).toBe(true);
      expect(fsmReady.isDisposedOrDestroyed()).toBe(false);
    });
  });

  describe('guards', () => {
    it('guardResize should block when disposed', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.DISPOSING });
      expect(fsm.guardResize('test')).toBe(false);
    });

    it('guardResize should allow when ready', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.VISIBLE });
      expect(fsm.guardResize('test')).toBe(true);
    });

    it('guardShow should block when already visible', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.VISIBLE });
      expect(fsm.guardShow('test')).toBe(false);
    });

    it('guardShow should allow when hidden', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.HIDDEN });
      expect(fsm.guardShow('test')).toBe(true);
    });

    it('guardHide should block when already hidden', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.HIDDEN });
      expect(fsm.guardHide('test')).toBe(false);
    });

    it('guardBounds should block when boundsLockedForResize is true', () => {
      const fsm = createPromptStateMachine({
        initialState: PromptState.VISIBLE,
        initialContext: { boundsLockedForResize: true },
      });
      expect(fsm.guardBounds('test')).toBe(false);
    });

    it('guardFocus should block when devToolsOpening is true', () => {
      const fsm = createPromptStateMachine({
        initialState: PromptState.VISIBLE,
        initialContext: { devToolsOpening: true },
      });
      expect(fsm.guardFocus('test')).toBe(false);
    });
  });

  describe('context management', () => {
    it('should update context', () => {
      const fsm = createPromptStateMachine();
      fsm.updateContext({ pid: 5678, boundToProcess: true });
      expect(fsm.context.pid).toBe(5678);
      expect(fsm.context.boundToProcess).toBe(true);
    });

    it('bindProcess should update context', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.READY });
      expect(fsm.bindProcess(9999)).toBe(true);
      expect(fsm.context.boundToProcess).toBe(true);
      expect(fsm.context.pid).toBe(9999);
    });

    it('unbindProcess should reset process context', () => {
      const fsm = createPromptStateMachine({
        initialState: PromptState.READY,
        initialContext: { boundToProcess: true, pid: 1234 },
      });
      expect(fsm.unbindProcess()).toBe(true);
      expect(fsm.context.boundToProcess).toBe(false);
      expect(fsm.context.pid).toBe(0);
    });
  });

  describe('listeners', () => {
    it('should notify listeners on state transition', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.READY });
      const listener = vi.fn();
      fsm.addListener(listener);

      fsm.transition(PromptEvent.SHOW);

      expect(listener).toHaveBeenCalledWith(
        PromptState.READY,
        PromptState.VISIBLE,
        PromptEvent.SHOW,
        expect.any(Object),
      );
    });

    it('should allow removing listeners', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.READY });
      const listener = vi.fn();
      const unsubscribe = fsm.addListener(listener);

      unsubscribe();
      fsm.transition(PromptEvent.SHOW);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle errors in listeners gracefully', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.READY });
      const errorListener = vi.fn(() => {
        throw new Error('Test error');
      });
      const normalListener = vi.fn();

      fsm.addListener(errorListener);
      fsm.addListener(normalListener);

      // Should not throw
      fsm.transition(PromptEvent.SHOW);

      // Both listeners should have been called
      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('convenience methods', () => {
    it('markReady should transition from INITIALIZING to READY', () => {
      const fsm = createPromptStateMachine();
      expect(fsm.markReady()).toBe(true);
      expect(fsm.state).toBe(PromptState.READY);
    });

    it('show should transition to VISIBLE', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.READY });
      expect(fsm.show()).toBe(true);
      expect(fsm.state).toBe(PromptState.VISIBLE);
    });

    it('hide should transition to HIDDEN', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.VISIBLE });
      expect(fsm.hide()).toBe(true);
      expect(fsm.state).toBe(PromptState.HIDDEN);
    });

    it('startResize and endResize should manage resize state', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.VISIBLE });
      expect(fsm.startResize()).toBe(true);
      expect(fsm.state).toBe(PromptState.RESIZING);
      expect(fsm.endResize()).toBe(true);
      expect(fsm.state).toBe(PromptState.VISIBLE);
    });

    it('close and destroy should transition to terminal states', () => {
      const fsm = createPromptStateMachine({ initialState: PromptState.VISIBLE });
      expect(fsm.close()).toBe(true);
      expect(fsm.state).toBe(PromptState.DISPOSING);
      expect(fsm.destroy()).toBe(true);
      expect(fsm.state).toBe(PromptState.DESTROYED);
    });

    it('reset should transition to READY and reset context', () => {
      const fsm = createPromptStateMachine({
        initialState: PromptState.HIDDEN,
        initialContext: { boundToProcess: true, pid: 1234 },
      });
      expect(fsm.reset()).toBe(true);
      expect(fsm.state).toBe(PromptState.READY);
      expect(fsm.context.boundToProcess).toBe(false);
      expect(fsm.context.pid).toBe(0);
    });
  });

  describe('snapshot', () => {
    it('should return current state and context', () => {
      const fsm = createPromptStateMachine({
        initialState: PromptState.VISIBLE,
        initialContext: { pid: 1234 },
      });
      const snap = fsm.snapshot();
      expect(snap.state).toBe(PromptState.VISIBLE);
      expect(snap.context.pid).toBe(1234);
    });
  });

  describe('createDefaultContext', () => {
    it('should create a context with all default values', () => {
      const ctx = createDefaultContext();
      expect(ctx.boundToProcess).toBe(false);
      expect(ctx.pid).toBe(0);
      expect(ctx.firstPrompt).toBe(true);
      expect(ctx.hasBeenFocused).toBe(false);
      expect(ctx.hasBeenHidden).toBe(false);
      expect(ctx.modifiedByUser).toBe(false);
      expect(ctx.boundsLockedForResize).toBe(false);
      expect(ctx.skipInitBoundsForResize).toBe(false);
      expect(ctx.showAfterNextResize).toBe(false);
      expect(ctx.devToolsOpening).toBe(false);
      expect(ctx.actionsOpen).toBe(false);
      expect(ctx.wasActionsJustOpen).toBe(false);
      expect(ctx.processConnectionLost).toBe(false);
    });
  });
});

describe('Race condition scenarios', () => {
  it('should prevent resize during DISPOSING state', () => {
    const fsm = createPromptStateMachine({ initialState: PromptState.VISIBLE });
    fsm.close();
    expect(fsm.state).toBe(PromptState.DISPOSING);

    // Should not be able to resize
    expect(fsm.guardResize('window.resize event')).toBe(false);
    expect(fsm.canResize()).toBe(false);
    expect(fsm.startResize()).toBe(false);
  });

  it('should prevent show during DISPOSING state', () => {
    const fsm = createPromptStateMachine({ initialState: PromptState.HIDDEN });
    fsm.close();
    expect(fsm.state).toBe(PromptState.DISPOSING);

    expect(fsm.guardShow('showPromptFlow')).toBe(false);
    expect(fsm.canShow()).toBe(false);
    expect(fsm.show()).toBe(false);
  });

  it('should handle rapid show/hide cycles correctly', () => {
    const fsm = createPromptStateMachine({ initialState: PromptState.READY });

    // Rapid show/hide cycle
    fsm.show();
    expect(fsm.state).toBe(PromptState.VISIBLE);
    fsm.hide();
    expect(fsm.state).toBe(PromptState.HIDDEN);
    fsm.show();
    expect(fsm.state).toBe(PromptState.VISIBLE);
    fsm.hide();
    expect(fsm.state).toBe(PromptState.HIDDEN);

    // State should be consistent
    expect(fsm.isHidden()).toBe(true);
    expect(fsm.isVisible()).toBe(false);
  });

  it('should prevent bounds changes while boundsLockedForResize', () => {
    const fsm = createPromptStateMachine({ initialState: PromptState.VISIBLE });
    fsm.updateContext({ boundsLockedForResize: true });

    expect(fsm.guardBounds('initBounds')).toBe(false);
  });

  it('should allow closing from any active state', () => {
    // This ensures we can always clean up regardless of what state we're in
    const activeStates = [
      PromptState.INITIALIZING,
      PromptState.LOADING,
      PromptState.READY,
      PromptState.CALCULATING_LAYOUT,
      PromptState.VISIBLE,
      PromptState.RESIZING,
      PromptState.HIDDEN,
    ];

    for (const state of activeStates) {
      const fsm = createPromptStateMachine({ initialState: state });
      expect(fsm.close()).toBe(true);
      expect(fsm.state).toBe(PromptState.DISPOSING);
    }
  });
});
