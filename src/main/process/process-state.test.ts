import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessStateMachine, ProcessState } from './process-state';

describe('ProcessStateMachine', () => {
  let stateMachine: ProcessStateMachine;
  const testPid = 12345;

  beforeEach(() => {
    stateMachine = new ProcessStateMachine(testPid);
  });

  describe('initial state', () => {
    it('should start in Idle state', () => {
      expect(stateMachine.getState()).toBe(ProcessState.Idle);
    });

    it('should have no pending window operations', () => {
      expect(stateMachine.getPendingWindowOps().size).toBe(0);
    });

    it('should not be terminal', () => {
      expect(stateMachine.isTerminal()).toBe(false);
    });

    it('should not be alive (not spawned yet)', () => {
      expect(stateMachine.isAlive()).toBe(false);
    });
  });

  describe('valid transitions', () => {
    it('Idle → Spawning on SPAWN', () => {
      const result = stateMachine.transition({ type: 'SPAWN' });

      expect(result.success).toBe(true);
      expect(result.previousState).toBe(ProcessState.Idle);
      expect(result.currentState).toBe(ProcessState.Spawning);
      expect(stateMachine.getState()).toBe(ProcessState.Spawning);
    });

    it('Spawning → Running on READY', () => {
      stateMachine.transition({ type: 'SPAWN' });
      const result = stateMachine.transition({ type: 'READY' });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ProcessState.Running);
    });

    it('Running → WindowOperationPending on WINDOW_OP_START', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      const result = stateMachine.transition({
        type: 'WINDOW_OP_START',
        windowId: 100,
        operation: 'focus',
      });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ProcessState.WindowOperationPending);
      expect(stateMachine.getPendingWindowOps().size).toBe(1);
    });

    it('WindowOperationPending → Running on WINDOW_OP_END (last op)', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      stateMachine.transition({ type: 'WINDOW_OP_START', windowId: 100, operation: 'focus' });
      const result = stateMachine.transition({ type: 'WINDOW_OP_END', windowId: 100 });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ProcessState.Running);
      expect(stateMachine.getPendingWindowOps().size).toBe(0);
    });

    it('Running → Stopping on STOP', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      const result = stateMachine.transition({ type: 'STOP', reason: 'user requested' });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ProcessState.Stopping);
      expect(stateMachine.getStopReason()).toBe('user requested');
    });

    it('Stopping → Stopped on EXIT', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      stateMachine.transition({ type: 'STOP', reason: 'test' });
      const result = stateMachine.transition({ type: 'EXIT', code: 0 });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ProcessState.Stopped);
      expect(stateMachine.getExitCode()).toBe(0);
    });

    it('Running → Stopped on EXIT (unexpected exit)', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      const result = stateMachine.transition({ type: 'EXIT', code: 1 });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ProcessState.Stopped);
      expect(stateMachine.getExitCode()).toBe(1);
    });

    it('Running → Error on ERROR', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      const error = new Error('Something went wrong');
      const result = stateMachine.transition({ type: 'ERROR', error });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ProcessState.Error);
      expect(stateMachine.getLastError()).toBe(error);
    });

    it('Spawning → Error on ERROR', () => {
      stateMachine.transition({ type: 'SPAWN' });
      const error = new Error('Failed to spawn');
      const result = stateMachine.transition({ type: 'ERROR', error });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ProcessState.Error);
    });
  });

  describe('invalid transitions', () => {
    it('rejects READY from Idle', () => {
      const result = stateMachine.transition({ type: 'READY' });

      expect(result.success).toBe(false);
      expect(result.currentState).toBe(ProcessState.Idle);
      expect(result.reason).toBeDefined();
    });

    it('rejects SPAWN from Running', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      const result = stateMachine.transition({ type: 'SPAWN' });

      expect(result.success).toBe(false);
      expect(result.currentState).toBe(ProcessState.Running);
    });

    it('rejects STOP from Idle', () => {
      const result = stateMachine.transition({ type: 'STOP', reason: 'test' });

      expect(result.success).toBe(false);
      expect(result.currentState).toBe(ProcessState.Idle);
    });

    it('rejects any transition from Stopped (terminal)', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      stateMachine.transition({ type: 'EXIT', code: 0 });

      const result = stateMachine.transition({ type: 'SPAWN' });

      expect(result.success).toBe(false);
      expect(result.currentState).toBe(ProcessState.Stopped);
    });

    it('rejects any transition from Error (terminal)', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'ERROR', error: new Error('test') });

      const result = stateMachine.transition({ type: 'SPAWN' });

      expect(result.success).toBe(false);
      expect(result.currentState).toBe(ProcessState.Error);
    });
  });

  describe('window operation protection', () => {
    it('rejects STOP when window operations are pending', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      stateMachine.transition({ type: 'WINDOW_OP_START', windowId: 100, operation: 'focus' });

      const result = stateMachine.transition({ type: 'STOP', reason: 'test' });

      expect(result.success).toBe(false);
      expect(result.currentState).toBe(ProcessState.WindowOperationPending);
    });

    it('allows FORCE_STOP when window operations are pending', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      stateMachine.transition({ type: 'WINDOW_OP_START', windowId: 100, operation: 'focus' });

      const result = stateMachine.transition({ type: 'FORCE_STOP', reason: 'timeout' });

      expect(result.success).toBe(true);
      expect(result.currentState).toBe(ProcessState.Stopping);
      expect(stateMachine.getPendingWindowOps().size).toBe(0);
    });

    it('tracks multiple window operations', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      stateMachine.transition({ type: 'WINDOW_OP_START', windowId: 100, operation: 'focus' });
      stateMachine.transition({ type: 'WINDOW_OP_START', windowId: 101, operation: 'show' });

      expect(stateMachine.getPendingWindowOps().size).toBe(2);
      expect(stateMachine.hasWindowOperationsPending()).toBe(true);

      // Complete one
      stateMachine.transition({ type: 'WINDOW_OP_END', windowId: 100 });
      expect(stateMachine.getPendingWindowOps().size).toBe(1);
      expect(stateMachine.getState()).toBe(ProcessState.WindowOperationPending);

      // Complete the other
      stateMachine.transition({ type: 'WINDOW_OP_END', windowId: 101 });
      expect(stateMachine.getPendingWindowOps().size).toBe(0);
      expect(stateMachine.getState()).toBe(ProcessState.Running);
    });
  });

  describe('state queries', () => {
    it('canStop() returns true only when Running', () => {
      expect(stateMachine.canStop()).toBe(false); // Idle

      stateMachine.transition({ type: 'SPAWN' });
      expect(stateMachine.canStop()).toBe(false); // Spawning

      stateMachine.transition({ type: 'READY' });
      expect(stateMachine.canStop()).toBe(true); // Running

      stateMachine.transition({ type: 'WINDOW_OP_START', windowId: 100, operation: 'focus' });
      expect(stateMachine.canStop()).toBe(false); // WindowOperationPending
    });

    it('canForceStop() returns true for non-terminal states', () => {
      expect(stateMachine.canForceStop()).toBe(false); // Idle

      stateMachine.transition({ type: 'SPAWN' });
      expect(stateMachine.canForceStop()).toBe(true); // Spawning

      stateMachine.transition({ type: 'READY' });
      expect(stateMachine.canForceStop()).toBe(true); // Running

      stateMachine.transition({ type: 'EXIT', code: 0 });
      expect(stateMachine.canForceStop()).toBe(false); // Stopped
    });

    it('isReady() returns true when process can handle messages', () => {
      expect(stateMachine.isReady()).toBe(false); // Idle

      stateMachine.transition({ type: 'SPAWN' });
      expect(stateMachine.isReady()).toBe(false); // Spawning

      stateMachine.transition({ type: 'READY' });
      expect(stateMachine.isReady()).toBe(true); // Running

      stateMachine.transition({ type: 'WINDOW_OP_START', windowId: 100, operation: 'focus' });
      expect(stateMachine.isReady()).toBe(true); // WindowOperationPending (can still handle messages)
    });

    it('isAlive() returns true for non-idle, non-terminal states', () => {
      expect(stateMachine.isAlive()).toBe(false); // Idle

      stateMachine.transition({ type: 'SPAWN' });
      expect(stateMachine.isAlive()).toBe(true); // Spawning

      stateMachine.transition({ type: 'READY' });
      expect(stateMachine.isAlive()).toBe(true); // Running

      stateMachine.transition({ type: 'EXIT', code: 0 });
      expect(stateMachine.isAlive()).toBe(false); // Stopped
    });
  });

  describe('state change callbacks', () => {
    it('calls registered callbacks on state change', () => {
      const callback = vi.fn();
      stateMachine.onStateChange(callback);

      stateMachine.transition({ type: 'SPAWN' });

      expect(callback).toHaveBeenCalledWith(
        ProcessState.Idle,
        ProcessState.Spawning,
        { type: 'SPAWN' },
      );
    });

    it('does not call callback on failed transitions', () => {
      const callback = vi.fn();
      stateMachine.onStateChange(callback);

      stateMachine.transition({ type: 'READY' }); // Invalid from Idle

      expect(callback).not.toHaveBeenCalled();
    });

    it('allows unsubscribing from callbacks', () => {
      const callback = vi.fn();
      const unsubscribe = stateMachine.onStateChange(callback);

      unsubscribe();
      stateMachine.transition({ type: 'SPAWN' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('handles multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      stateMachine.onStateChange(callback1);
      stateMachine.onStateChange(callback2);

      stateMachine.transition({ type: 'SPAWN' });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('getDebugInfo', () => {
    it('returns complete state information', () => {
      stateMachine.transition({ type: 'SPAWN' });
      stateMachine.transition({ type: 'READY' });
      stateMachine.transition({ type: 'WINDOW_OP_START', windowId: 100, operation: 'focus' });

      const debug = stateMachine.getDebugInfo();

      expect(debug.pid).toBe(testPid);
      expect(debug.state).toBe(ProcessState.WindowOperationPending);
      expect(debug.pendingWindowOps).toHaveLength(1);
    });
  });
});
