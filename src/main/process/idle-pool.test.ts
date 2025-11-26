import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleProcessPool } from './idle-pool';

// Mock child_process
vi.mock('node:child_process', () => ({
  fork: vi.fn(),
}));

// Mock logs
vi.mock('../logs', () => ({
  processLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  },
}));

// Mock state
vi.mock('../state', () => ({
  kitState: {
    ready: true,
    KIT_NODE_PATH: '/usr/local/bin/node',
    kenvEnv: {
      KIT_STDIO: 'pipe',
      KIT_CWD: '/home/user',
    },
  },
}));

// Mock cjs-exports
vi.mock('../cjs-exports', () => ({
  pathExistsSync: vi.fn().mockReturnValue(true),
}));

// Mock env.utils
vi.mock('../env.utils', () => ({
  createEnv: vi.fn().mockReturnValue({}),
}));

// Mock kit utils
vi.mock('@johnlindquist/kit/core/utils', () => ({
  KIT_APP_PROMPT: '/app/prompt.js',
  kitPath: vi.fn((...args: string[]) => `/kit/${args.join('/')}`),
}));

// Mock disposable registry
vi.mock('./disposable-registry', () => ({
  disposableRegistry: {
    addListener: vi.fn(),
    disposeScope: vi.fn(),
  },
}));

import { Channel } from '@johnlindquist/kit/core/enum';
import { disposableRegistry } from './disposable-registry';

// Create a mock child process factory
function createMockChildProcess(pid: number, options: { connected?: boolean; killed?: boolean } = {}) {
  const emitter = new EventEmitter() as EventEmitter & {
    pid: number;
    connected: boolean;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
  emitter.pid = pid;
  emitter.connected = options.connected ?? true;
  emitter.killed = options.killed ?? false;
  emitter.kill = vi.fn(() => {
    emitter.killed = true;
    emitter.emit('exit', 0);
  });
  emitter.send = vi.fn();
  return emitter;
}

describe('IdleProcessPool', () => {
  let pool: IdleProcessPool;

  beforeEach(() => {
    pool = new IdleProcessPool({ maxSize: 3, minSize: 1, staleTimeout: 60000 });
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = pool.getStats();

      expect(stats.available).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.maxSize).toBe(3);
    });

    it('should reflect added processes', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);

      const stats = pool.getStats();
      expect(stats.total).toBe(1);
      expect(stats.available).toBe(0); // Not ready yet
    });

    it('should count ready processes as available', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);

      // Simulate KIT_READY message
      child.emit('message', { channel: Channel.KIT_READY });

      const stats = pool.getStats();
      expect(stats.available).toBe(1);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      pool.setConfig({ maxSize: 5 });

      const stats = pool.getStats();
      expect(stats.maxSize).toBe(5);
    });

    it('should merge with existing config', () => {
      pool.setConfig({ maxSize: 10 });

      const debug = pool.getDebugInfo();
      expect((debug.config as any).maxSize).toBe(10);
      expect((debug.config as any).minSize).toBe(1); // Unchanged
    });
  });

  describe('add', () => {
    it('should add a process to the pool', () => {
      const child = createMockChildProcess(100);
      const result = pool.add(child as any);

      expect(result).toBe(true);
      expect(pool.getStats().total).toBe(1);
    });

    it('should reject when pool is full', () => {
      const children = [createMockChildProcess(100), createMockChildProcess(101), createMockChildProcess(102)];

      children.forEach((child) => pool.add(child as any));
      expect(pool.getStats().total).toBe(3);

      const overflow = createMockChildProcess(103);
      const result = pool.add(overflow as any);

      expect(result).toBe(false);
      expect(pool.getStats().total).toBe(3);
    });

    it('should mark process as ready after KIT_READY message', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);

      expect(pool.getStats().available).toBe(0);

      child.emit('message', { channel: Channel.KIT_READY });

      expect(pool.getStats().available).toBe(1);
    });

    it('should not mark ready for other messages', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);

      child.emit('message', { channel: 'OTHER_CHANNEL' });

      expect(pool.getStats().available).toBe(0);
    });
  });

  describe('acquire', () => {
    it('should return null when pool is empty', () => {
      const result = pool.acquire();
      expect(result).toBeNull();
    });

    it('should return null when no processes are ready', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);
      // Process not ready yet

      const result = pool.acquire();
      expect(result).toBeNull();
    });

    it('should return a ready process', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);
      child.emit('message', { channel: Channel.KIT_READY });

      const result = pool.acquire();

      expect(result).not.toBeNull();
      expect(result!.pid).toBe(100);
    });

    it('should remove acquired process from pool', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);
      child.emit('message', { channel: Channel.KIT_READY });

      expect(pool.getStats().total).toBe(1);

      pool.acquire();

      expect(pool.getStats().total).toBe(0);
    });

    it('should not return disconnected processes', () => {
      const child = createMockChildProcess(100, { connected: false });
      pool.add(child as any);
      child.emit('message', { channel: Channel.KIT_READY });

      const result = pool.acquire();
      expect(result).toBeNull();
    });

    it('should not return killed processes', () => {
      const child = createMockChildProcess(100, { killed: true });
      pool.add(child as any);
      child.emit('message', { channel: Channel.KIT_READY });

      const result = pool.acquire();
      expect(result).toBeNull();
    });
  });

  describe('cleanupStale', () => {
    it('should remove processes older than staleTimeout', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);
      child.emit('message', { channel: Channel.KIT_READY });

      expect(pool.getStats().total).toBe(1);

      // Advance time past stale timeout
      vi.advanceTimersByTime(70000); // 70 seconds (timeout is 60s)

      const cleaned = pool.cleanupStale();

      expect(cleaned).toBe(1);
      expect(pool.getStats().total).toBe(0);
    });

    it('should remove disconnected processes', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);
      child.connected = false;

      const cleaned = pool.cleanupStale();

      expect(cleaned).toBe(1);
    });

    it('should remove killed processes', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);
      child.killed = true;

      const cleaned = pool.cleanupStale();

      expect(cleaned).toBe(1);
    });

    it('should not remove healthy processes', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);

      const cleaned = pool.cleanupStale();

      expect(cleaned).toBe(0);
      expect(pool.getStats().total).toBe(1);
    });

    it('should kill live processes when cleaning', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);

      // Advance time past stale timeout
      vi.advanceTimersByTime(70000);

      pool.cleanupStale();

      expect(child.kill).toHaveBeenCalled();
    });
  });

  describe('drain', () => {
    it('should remove all processes', async () => {
      const children = [createMockChildProcess(100), createMockChildProcess(101), createMockChildProcess(102)];

      children.forEach((child) => pool.add(child as any));
      expect(pool.getStats().total).toBe(3);

      await pool.drain();

      expect(pool.getStats().total).toBe(0);
    });

    it('should kill all processes', async () => {
      const children = [createMockChildProcess(100), createMockChildProcess(101)];

      children.forEach((child) => pool.add(child as any));

      await pool.drain();

      for (const child of children) {
        expect(child.kill).toHaveBeenCalled();
      }
    });

    it('should not fail on empty pool', async () => {
      await expect(pool.drain()).resolves.toBeUndefined();
    });
  });

  describe('getDebugInfo', () => {
    it('should return configuration', () => {
      const debug = pool.getDebugInfo();

      expect(debug.config).toBeDefined();
      expect((debug.config as any).maxSize).toBe(3);
    });

    it('should return pool size', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);

      const debug = pool.getDebugInfo();

      expect(debug.poolSize).toBe(1);
    });

    it('should return process details', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);
      child.emit('message', { channel: Channel.KIT_READY });

      const debug = pool.getDebugInfo();
      const processes = debug.processes as any[];

      expect(processes).toHaveLength(1);
      expect(processes[0].pid).toBe(100);
      expect(processes[0].ready).toBe(true);
      expect(processes[0].connected).toBe(true);
      expect(processes[0].killed).toBe(false);
      expect(processes[0].age).toBeGreaterThanOrEqual(0);
    });
  });

  describe('process lifecycle', () => {
    it('should remove process from pool when it exits', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);

      expect(pool.getStats().total).toBe(1);

      // The exit handler should be registered via disposableRegistry.addListener
      // Let's verify it was called and simulate the exit
      const exitCall = vi.mocked(disposableRegistry.addListener).mock.calls.find(
        (call: unknown[]) => call[2] === 'exit',
      );
      expect(exitCall).toBeDefined();

      // Call the exit handler
      const exitHandler = exitCall![3] as () => void;
      exitHandler();

      expect(pool.getStats().total).toBe(0);
    });

    it('should remove process from pool on error', () => {
      const child = createMockChildProcess(100);
      pool.add(child as any);

      const errorCall = vi.mocked(disposableRegistry.addListener).mock.calls.find(
        (call: unknown[]) => call[2] === 'error',
      );
      expect(errorCall).toBeDefined();

      // Call the error handler
      const errorHandler = errorCall![3] as (err: Error) => void;
      errorHandler(new Error('Test error'));

      expect(pool.getStats().total).toBe(0);
    });
  });
});
