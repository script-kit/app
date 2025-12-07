import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessScanner } from './process-scanner';

// Mock electron
const mockNotification = vi.fn();
vi.mock('electron', () => {
  class MockNotification {
    show = vi.fn();
    on = vi.fn();
    constructor(options: unknown) {
      mockNotification(options);
    }
  }
  return {
    app: { isPackaged: false },
    Notification: MockNotification,
    shell: { openPath: vi.fn() },
  };
});

// Mock pidtree
vi.mock('pidtree', () => ({
  default: vi.fn(),
}));

// Mock pidusage
vi.mock('pidusage', () => ({
  default: vi.fn(),
}));

// Mock logs
vi.mock('./logs', () => ({
  perf: {
    start: vi.fn(() => () => 0),
    measure: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    measureSync: vi.fn((_name: string, fn: () => unknown) => fn()),
    logMetric: vi.fn(),
    logSummary: vi.fn(),
    isEnabled: vi.fn(() => false),
  },
  processLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  },
  processLogPath: '/tmp/test-process.log',
}));

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
}));

import { appendFile } from 'node:fs/promises';
import pidtree from 'pidtree';
import pidusage from 'pidusage';

describe('ProcessScanner', () => {
  let scanner: ProcessScanner;

  beforeEach(() => {
    scanner = new ProcessScanner();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('register/unregister', () => {
    it('should register a process with metadata', () => {
      scanner.register(123, { scriptPath: '/test/script.ts', startTime: Date.now() });

      const registered = scanner.getRegistered();
      expect(registered).toHaveLength(1);
      expect(registered[0].pid).toBe(123);
      expect(registered[0].scriptPath).toBe('/test/script.ts');
    });

    it('should unregister a process', () => {
      scanner.register(123, { scriptPath: '/test.ts', startTime: Date.now() });
      scanner.unregister(123);

      expect(scanner.getRegistered()).toHaveLength(0);
    });

    it('should handle unregistering non-existent process', () => {
      // Should not throw
      expect(() => scanner.unregister(999)).not.toThrow();
    });

    it('should register multiple processes', () => {
      scanner.register(100, { scriptPath: '/a.ts', startTime: 1 });
      scanner.register(200, { scriptPath: '/b.ts', startTime: 2 });
      scanner.register(300, { scriptPath: '/c.ts', startTime: 3 });

      expect(scanner.getRegistered()).toHaveLength(3);
    });
  });

  describe('isAlive', () => {
    it('should return true for current process', () => {
      // process.pid is always alive
      expect(scanner.isAlive(process.pid)).toBe(true);
    });

    it('should return false for non-existent PID', () => {
      // A very high PID that almost certainly doesn't exist
      expect(scanner.isAlive(2147483647)).toBe(false);
    });
  });

  describe('getChildProcesses', () => {
    it('should return child PIDs from pidtree', async () => {
      vi.mocked(pidtree).mockResolvedValue([101, 102, 103]);

      const children = await scanner.getChildProcesses(process.pid);

      expect(children).toEqual([101, 102, 103]);
      expect(pidtree).toHaveBeenCalledWith(process.pid);
    });

    it('should return empty array when no children', async () => {
      vi.mocked(pidtree).mockRejectedValue(new Error('No matching pid found'));

      const children = await scanner.getChildProcesses(process.pid);

      expect(children).toEqual([]);
    });

    it('should return empty array on unexpected error', async () => {
      vi.mocked(pidtree).mockRejectedValue(new Error('Unexpected error'));

      const children = await scanner.getChildProcesses(process.pid);

      expect(children).toEqual([]);
    });

    it('should use process.pid as default parent', async () => {
      vi.mocked(pidtree).mockResolvedValue([]);

      await scanner.getChildProcesses();

      expect(pidtree).toHaveBeenCalledWith(process.pid);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics for PIDs', async () => {
      vi.mocked(pidusage).mockResolvedValue({
        100: { cpu: 10.5, memory: 1024000, elapsed: 5000 },
        200: { cpu: 5.2, memory: 512000, elapsed: 3000 },
      });

      const metrics = await scanner.getMetrics([100, 200]);

      expect(metrics.size).toBe(2);
      expect(metrics.get(100)).toEqual({ cpu: 10.5, memory: 1024000, elapsed: 5000 });
      expect(metrics.get(200)).toEqual({ cpu: 5.2, memory: 512000, elapsed: 3000 });
    });

    it('should return empty map for empty PID list', async () => {
      const metrics = await scanner.getMetrics([]);

      expect(metrics.size).toBe(0);
      expect(pidusage).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(pidusage).mockRejectedValue(new Error('Process not found'));

      const metrics = await scanner.getMetrics([100]);

      expect(metrics.size).toBe(0);
    });

    it('should skip invalid stats', async () => {
      vi.mocked(pidusage).mockResolvedValue({
        100: { cpu: 10, memory: 1024, elapsed: 5000 },
        200: null, // invalid
        300: { notcpu: 'wrong' }, // missing cpu field
      } as any);

      const metrics = await scanner.getMetrics([100, 200, 300]);

      expect(metrics.size).toBe(1);
      expect(metrics.has(100)).toBe(true);
    });
  });

  describe('findOrphans', () => {
    it('should return children not in registry', async () => {
      scanner.register(101, { scriptPath: '/known.ts', startTime: Date.now() });
      vi.mocked(pidtree).mockResolvedValue([101, 102, 103]);

      const orphans = await scanner.findOrphans();

      expect(orphans).toEqual([102, 103]);
    });

    it('should return empty array when all children are registered', async () => {
      scanner.register(101, { scriptPath: '/a.ts', startTime: Date.now() });
      scanner.register(102, { scriptPath: '/b.ts', startTime: Date.now() });
      vi.mocked(pidtree).mockResolvedValue([101, 102]);

      const orphans = await scanner.findOrphans();

      expect(orphans).toEqual([]);
    });

    it('should return all children as orphans when none registered', async () => {
      vi.mocked(pidtree).mockResolvedValue([101, 102]);

      const orphans = await scanner.findOrphans();

      expect(orphans).toEqual([101, 102]);
    });
  });

  describe('scanProcesses', () => {
    beforeEach(() => {
      // Mock isAlive to return true for registered processes
      vi.spyOn(scanner, 'isAlive').mockReturnValue(true);
      vi.mocked(pidtree).mockResolvedValue([]);
      vi.mocked(pidusage).mockResolvedValue({});
    });

    it('should return registered processes that are alive', async () => {
      scanner.register(100, { scriptPath: '/test.ts', startTime: Date.now() });

      const processes = await scanner.scanProcesses();

      expect(processes).toHaveLength(1);
      expect(processes[0].pid).toBe(100);
      expect(processes[0].command).toBe('/test.ts');
    });

    it('should remove dead processes from registry', async () => {
      scanner.register(100, { scriptPath: '/test.ts', startTime: Date.now() });
      vi.spyOn(scanner, 'isAlive').mockReturnValue(false);

      await scanner.scanProcesses();

      expect(scanner.getRegistered()).toHaveLength(0);
    });

    it('should include orphan processes', async () => {
      vi.mocked(pidtree).mockResolvedValue([999]);

      const processes = await scanner.scanProcesses();

      expect(processes.some((p) => p.pid === 999)).toBe(true);
      expect(processes.find((p) => p.pid === 999)?.command).toBe('unknown (orphan)');
    });

    it('should add metrics to processes', async () => {
      scanner.register(100, { scriptPath: '/test.ts', startTime: Date.now() });
      vi.mocked(pidusage).mockResolvedValue({
        100: { cpu: 15.5, memory: 2048000, elapsed: 10000 },
      });

      const processes = await scanner.scanProcesses();

      expect(processes[0].cpu).toBe(15.5);
      expect(processes[0].memory).toBe(2048000);
      expect(processes[0].elapsed).toBe(10000);
    });

    it('should use cached results within TTL', async () => {
      scanner.register(100, { scriptPath: '/test.ts', startTime: Date.now() });

      const first = await scanner.scanProcesses();
      const second = await scanner.scanProcesses();

      // Same reference means cache hit
      expect(first).toBe(second);
    });

    it('should refresh cache after TTL expires', async () => {
      scanner.register(100, { scriptPath: '/test.ts', startTime: Date.now() });

      const first = await scanner.scanProcesses();
      vi.advanceTimersByTime(3000); // Cache TTL is 2 seconds
      const second = await scanner.scanProcesses();

      // Different reference means fresh scan
      expect(first).not.toBe(second);
    });
  });

  describe('performScan', () => {
    beforeEach(() => {
      vi.spyOn(scanner, 'isAlive').mockReturnValue(true);
      vi.mocked(pidtree).mockResolvedValue([]);
      vi.mocked(pidusage).mockResolvedValue({});
    });

    it('should return scan result with all fields', async () => {
      scanner.register(100, { scriptPath: '/test.ts', startTime: Date.now() });

      const result = await scanner.performScan();

      expect(result.timestamp).toBeDefined();
      expect(result.totalCount).toBe(1);
      expect(result.processes).toHaveLength(1);
      expect(result.threshold).toBeGreaterThan(0);
      expect(result.exceededThreshold).toBe(false);
      expect(result.orphans).toEqual([]);
      expect(result.scanDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should log results and not send notification when under threshold', async () => {
      const result = await scanner.performScan();

      expect(result.totalCount).toBe(0);
      expect(result.exceededThreshold).toBe(false);
      expect(appendFile).toHaveBeenCalled();
      expect(mockNotification).not.toHaveBeenCalled();
    });

    it('should send notification when threshold is exceeded', async () => {
      // Register more processes than threshold (default 20)
      for (let i = 0; i < 25; i++) {
        scanner.register(100 + i, { scriptPath: `/test${i}.ts`, startTime: Date.now() });
      }

      const result = await scanner.performScan();

      expect(result.totalCount).toBe(25);
      expect(result.exceededThreshold).toBe(true);
      expect(mockNotification).toHaveBeenCalled();
    });

    it('should respect notification rate limiting', async () => {
      // Register 25 processes (exceeds threshold)
      for (let i = 0; i < 25; i++) {
        scanner.register(100 + i, { scriptPath: `/test${i}.ts`, startTime: Date.now() });
      }

      // First scan should send notification
      await scanner.performScan();
      expect(mockNotification).toHaveBeenCalledTimes(1);

      // Clear cache and scan again
      scanner.clearCache();
      await scanner.performScan();

      // Should still be 1 due to rate limiting
      expect(mockNotification).toHaveBeenCalledTimes(1);
    });

    it('should include orphan PIDs in result', async () => {
      vi.mocked(pidtree).mockResolvedValue([999, 1000]);

      const result = await scanner.performScan();

      expect(result.orphans).toEqual([999, 1000]);
    });
  });

  describe('clearCache', () => {
    it('should clear the scan cache', async () => {
      vi.spyOn(scanner, 'isAlive').mockReturnValue(true);
      vi.mocked(pidtree).mockResolvedValue([]);
      vi.mocked(pidusage).mockResolvedValue({});

      scanner.register(100, { scriptPath: '/test.ts', startTime: Date.now() });
      const first = await scanner.scanProcesses();

      scanner.clearCache();
      const second = await scanner.scanProcesses();

      // After clearCache, should get fresh results even within TTL
      expect(first).not.toBe(second);
    });
  });

  describe('getDebugInfo', () => {
    it('should return debug information', async () => {
      vi.spyOn(scanner, 'isAlive').mockReturnValue(true);
      vi.mocked(pidtree).mockResolvedValue([]);
      vi.mocked(pidusage).mockResolvedValue({});

      scanner.register(100, { scriptPath: '/test.ts', startTime: Date.now() });
      await scanner.scanProcesses(); // Populate cache

      const debug = scanner.getDebugInfo();

      expect(debug.registeredCount).toBe(1);
      expect(debug.registered).toHaveLength(1);
      expect(debug.threshold).toBeDefined();
      expect(debug.cacheAge).toBeDefined();
      expect(debug.cachedProcessCount).toBe(1);
    });

    it('should return null cache age when no cache', () => {
      const debug = scanner.getDebugInfo();

      expect(debug.cacheAge).toBeNull();
      expect(debug.cachedProcessCount).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent scans with consistent results', async () => {
      vi.spyOn(scanner, 'isAlive').mockReturnValue(true);
      vi.mocked(pidtree).mockResolvedValue([]);
      vi.mocked(pidusage).mockResolvedValue({});
      scanner.register(100, { scriptPath: '/test.ts', startTime: Date.now() });

      // Start multiple scans concurrently
      const [result1, result2, result3] = await Promise.all([
        scanner.scanProcesses(),
        scanner.scanProcesses(),
        scanner.scanProcesses(),
      ]);

      // All should return consistent data (same content)
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
      expect(result1).toHaveLength(1);
      expect(result1[0].pid).toBe(100);
    });

    it('should handle empty state gracefully', async () => {
      vi.mocked(pidtree).mockResolvedValue([]);
      vi.mocked(pidusage).mockResolvedValue({});

      const result = await scanner.performScan();

      expect(result.totalCount).toBe(0);
      expect(result.processes).toEqual([]);
      expect(result.orphans).toEqual([]);
    });
  });
});
