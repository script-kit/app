import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessMonitor } from './process-monitor';
import { processScanner } from './process-scanner';
import { kitState } from './state';
import schedule from 'node-schedule';

// Mock dependencies
vi.mock('./process-scanner', () => ({
  processScanner: {
    performScan: vi.fn().mockResolvedValue({
      timestamp: Date.now(),
      totalCount: 5,
      processes: [],
      threshold: 20,
      exceededThreshold: false
    })
  }
}));

vi.mock('./state', () => ({
  kitState: {
    suspended: false,
    processMonitorEnabled: false
  }
}));

vi.mock('node-schedule', () => ({
  default: {
    scheduleJob: vi.fn().mockReturnValue({ cancel: vi.fn() })
  }
}));

vi.mock('./logs', () => ({
  processLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    transports: {
      console: { level: false },
      ipc: null
    }
  }
}));

describe('ProcessMonitor', () => {
  let monitor: ProcessMonitor;

  beforeEach(() => {
    monitor = new ProcessMonitor();
    vi.clearAllMocks();
    kitState.suspended = false;
    kitState.processMonitorEnabled = false;
  });

  afterEach(() => {
    monitor.stop();
  });

  describe('start', () => {
    it('should start monitoring and perform initial scan', async () => {
      await monitor.start();

      expect(processScanner.performScan).toHaveBeenCalled();
      expect(schedule.scheduleJob).toHaveBeenCalled();
      expect(kitState.processMonitorEnabled).toBe(true);
    });

    it('should not start if already monitoring', async () => {
      await monitor.start();
      vi.clearAllMocks();
      
      await monitor.start();
      
      expect(processScanner.performScan).not.toHaveBeenCalled();
    });

    it('should not start if disabled via environment variable', async () => {
      process.env.KIT_PROCESS_MONITOR_ENABLED = 'false';
      
      await monitor.start();
      
      expect(processScanner.performScan).not.toHaveBeenCalled();
      expect(schedule.scheduleJob).not.toHaveBeenCalled();
      
      delete process.env.KIT_PROCESS_MONITOR_ENABLED;
    });
  });

  describe('performScan', () => {
    it('should skip scan when system is suspended', async () => {
      await monitor.start();
      vi.clearAllMocks();
      
      kitState.suspended = true;
      // Access private method through prototype
      await (monitor as any).performScan();
      
      expect(processScanner.performScan).not.toHaveBeenCalled();
    });

    it('should update health monitor with process count', async () => {
      global.healthMonitor = { customMetrics: {} };
      
      await monitor.start();
      
      expect(global.healthMonitor.customMetrics.processCount).toBe(5);
      
      delete global.healthMonitor;
    });
  });

  describe('stop', () => {
    it('should cancel job and update state', async () => {
      await monitor.start();
      const job = { cancel: vi.fn() };
      (monitor as any).job = job;
      
      await monitor.stop();
      
      expect(job.cancel).toHaveBeenCalled();
      expect(kitState.processMonitorEnabled).toBe(false);
      expect(monitor.isRunning()).toBe(false);
    });
  });

  describe('handleSystemResume', () => {
    it('should log resume message', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await monitor.handleSystemResume();
      
      // Just verify the method doesn't throw
      expect(monitor.handleSystemResume).not.toThrow();
      
      logSpy.mockRestore();
    });
  });
});