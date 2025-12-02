import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeartbeatManager } from './heartbeat-manager';

// Mock logs
vi.mock('../logs', () => ({
  processLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  },
}));

// Mock disposable registry
vi.mock('./disposable-registry', () => ({
  disposableRegistry: {
    addListener: vi.fn(),
    disposeScope: vi.fn(),
  },
}));

// Create a mock child process factory
function createMockChildProcess(pid: number, options: { connected?: boolean; killed?: boolean } = {}) {
  const emitter = new EventEmitter() as EventEmitter & {
    pid: number;
    connected: boolean;
    killed: boolean;
    send: ReturnType<typeof vi.fn>;
  };
  emitter.pid = pid;
  emitter.connected = options.connected ?? true;
  emitter.killed = options.killed ?? false;
  emitter.send = vi.fn();
  return emitter;
}

describe('HeartbeatManager', () => {
  let manager: HeartbeatManager;

  beforeEach(() => {
    manager = new HeartbeatManager({ interval: 1000, timeout: 500, maxMissed: 3 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      manager.setConfig({ interval: 5000 });

      const debug = manager.getDebugInfo();
      expect((debug.config as any).interval).toBe(5000);
      expect((debug.config as any).timeout).toBe(500); // Unchanged
    });
  });

  describe('register/unregister', () => {
    it('should register a process', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);

      expect(manager.getRegisteredCount()).toBe(1);
    });

    it('should auto-start when registering first process', () => {
      const child = createMockChildProcess(100);

      expect(manager.isActive()).toBe(false);

      manager.register(100, child as any, () => true);

      expect(manager.isActive()).toBe(true);
    });

    it('should not register same PID twice', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);
      manager.register(100, child as any, () => true);

      expect(manager.getRegisteredCount()).toBe(1);
    });

    it('should unregister a process', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);
      manager.unregister(100);

      expect(manager.getRegisteredCount()).toBe(0);
    });

    it('should auto-stop when unregistering last process', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);

      expect(manager.isActive()).toBe(true);

      manager.unregister(100);

      expect(manager.isActive()).toBe(false);
    });

    it('should handle unregistering non-existent process', () => {
      expect(() => manager.unregister(999)).not.toThrow();
    });
  });

  describe('recordResponse', () => {
    it('should reset missed count on response', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);

      // Advance time and send heartbeats to accumulate missed
      vi.advanceTimersByTime(2000);

      // Record a response
      manager.recordResponse(100);

      const debug = manager.getDebugInfo();
      const process = (debug.processes as any[])[0];
      expect(process.missedCount).toBe(0);
    });

    it('should update lastReceived timestamp', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);

      const beforeTime = Date.now();
      vi.advanceTimersByTime(1000);

      manager.recordResponse(100);

      const debug = manager.getDebugInfo();
      const process = (debug.processes as any[])[0];
      expect(process.lastReceived).toBeGreaterThan(beforeTime);
    });

    it('should handle recording for non-existent process', () => {
      expect(() => manager.recordResponse(999)).not.toThrow();
    });
  });

  describe('start/stop', () => {
    it('should start heartbeat loop', () => {
      manager.start();

      expect(manager.isActive()).toBe(true);
    });

    it('should stop heartbeat loop', () => {
      manager.start();
      manager.stop();

      expect(manager.isActive()).toBe(false);
    });

    it('should not start twice', () => {
      manager.start();
      manager.start();

      expect(manager.isActive()).toBe(true);
    });

    it('should not stop if not started', () => {
      manager.stop();

      expect(manager.isActive()).toBe(false);
    });
  });

  describe('pause/resume', () => {
    it('should pause heartbeats', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);

      manager.pause();
      const callsBefore = (child.send as any).mock.calls.length;

      vi.advanceTimersByTime(5000);

      expect((child.send as any).mock.calls.length).toBe(callsBefore);
    });

    it('should resume heartbeats', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);

      manager.pause();
      manager.resume();

      vi.advanceTimersByTime(1000);

      expect(child.send).toHaveBeenCalled();
    });

    it('should reset missed counts on resume', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);

      // Accumulate missed heartbeats
      vi.advanceTimersByTime(3000);

      manager.pause();
      manager.resume();

      const debug = manager.getDebugInfo();
      const process = (debug.processes as any[])[0];
      expect(process.missedCount).toBe(0);
    });

    it('should not resume if not running', () => {
      manager.stop();
      manager.resume();

      expect(manager.isActive()).toBe(false);
    });
  });

  describe('heartbeat sending', () => {
    it('should send heartbeats to visible processes', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);

      vi.advanceTimersByTime(1000);

      expect(child.send).toHaveBeenCalled();
    });

    it('should not send heartbeats to invisible processes', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => false);

      vi.advanceTimersByTime(1000);

      // First call is from register auto-starting, but no actual heartbeat
      // The heartbeat should not be sent since visibility is false
      const heartbeatCalls = (child.send as any).mock.calls.filter((call: any[]) => call[0]?.channel === 'HEARTBEAT');
      expect(heartbeatCalls.length).toBe(0);
    });

    it('should unregister disconnected processes', () => {
      const child = createMockChildProcess(100, { connected: false });
      manager.register(100, child as any, () => true);

      vi.advanceTimersByTime(1000);

      expect(manager.getRegisteredCount()).toBe(0);
    });

    it('should unregister killed processes', () => {
      const child = createMockChildProcess(100, { killed: true });
      manager.register(100, child as any, () => true);

      vi.advanceTimersByTime(1000);

      expect(manager.getRegisteredCount()).toBe(0);
    });

    it('should unregister on send error', () => {
      const child = createMockChildProcess(100);
      (child.send as any).mockImplementation(() => {
        throw new Error('Send failed');
      });
      manager.register(100, child as any, () => true);

      vi.advanceTimersByTime(1000);

      expect(manager.getRegisteredCount()).toBe(0);
    });
  });

  describe('missed heartbeat detection', () => {
    it('should increment missed count when no response', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);

      // First heartbeat - set lastSent
      vi.advanceTimersByTime(1000);

      // Second heartbeat - should detect missed
      vi.advanceTimersByTime(1000);

      const debug = manager.getDebugInfo();
      const process = (debug.processes as any[])[0];
      expect(process.missedCount).toBeGreaterThan(0);
    });

    it('should trigger callback when max missed reached', () => {
      const child = createMockChildProcess(100);
      const callback = vi.fn();
      manager.onMissedHeartbeat(callback);
      manager.register(100, child as any, () => true);

      // Advance time to miss maxMissed heartbeats
      vi.advanceTimersByTime(4000); // 4 intervals should trigger callback

      expect(callback).toHaveBeenCalledWith(100, expect.any(Number));
    });

    it('should allow unsubscribing from callback', () => {
      const child = createMockChildProcess(100);
      const callback = vi.fn();
      const unsubscribe = manager.onMissedHeartbeat(callback);
      manager.register(100, child as any, () => true);

      unsubscribe();

      vi.advanceTimersByTime(5000);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getDebugInfo', () => {
    it('should return configuration', () => {
      const debug = manager.getDebugInfo();

      expect(debug.config).toBeDefined();
      expect((debug.config as any).interval).toBe(1000);
    });

    it('should return running state', () => {
      const debug1 = manager.getDebugInfo();
      expect(debug1.isRunning).toBe(false);

      manager.start();
      const debug2 = manager.getDebugInfo();
      expect(debug2.isRunning).toBe(true);
    });

    it('should return registered count', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);

      const debug = manager.getDebugInfo();
      expect(debug.registeredCount).toBe(1);
    });

    it('should return process details', () => {
      const child = createMockChildProcess(100);
      manager.register(100, child as any, () => true);

      const debug = manager.getDebugInfo();
      const processes = debug.processes as any[];

      expect(processes).toHaveLength(1);
      expect(processes[0].pid).toBe(100);
      expect(processes[0].missedCount).toBeDefined();
      expect(processes[0].connected).toBe(true);
    });
  });

  describe('isActive', () => {
    it('should return false initially', () => {
      expect(manager.isActive()).toBe(false);
    });

    it('should return true when started', () => {
      manager.start();
      expect(manager.isActive()).toBe(true);
    });

    it('should return false when stopped', () => {
      manager.start();
      manager.stop();
      expect(manager.isActive()).toBe(false);
    });
  });
});
