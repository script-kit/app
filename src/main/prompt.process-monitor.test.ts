import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkProcessAlive,
  getMonitoringStatus,
  isEventDrivenMonitoring,
  listenForProcessExit,
  processExists,
  startProcessMonitoring,
  stopProcessMonitoring,
} from './prompt.process-monitor';

// Mock dependencies
vi.mock('../shared/events', () => ({
  emitter: new EventEmitter(),
  KitEvent: {
    ProcessGone: 'ProcessGone',
  },
}));

vi.mock('./process', () => ({
  processes: {
    getChildByPid: vi.fn(),
    removeByPid: vi.fn(),
  },
}));

// Get the mocked modules
import { emitter, KitEvent } from '../shared/events';
import { processes } from './process';

describe('prompt.process-monitor', () => {
  // Use a counter to create unique window IDs for each test
  let windowIdCounter = 1;

  // Create a mock prompt object
  const createMockPrompt = (overrides = {}) => ({
    pid: 12345,
    window: { id: windowIdCounter++, once: vi.fn() },
    boundToProcess: true,
    processMonitoringEnabled: true,
    processCheckInterval: 5000,
    processConnectionLost: false,
    processConnectionLostTimeout: undefined,
    processMonitorTimer: undefined,
    scriptStartTime: Date.now() - 3000, // Started 3 seconds ago
    lastProcessCheckTime: 0,
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    handleProcessGone: vi.fn(),
    notifyProcessConnectionLost: vi.fn(),
    ...overrides,
  });

  // Create a mock ChildProcess
  const createMockChild = () => {
    const child = new EventEmitter() as any;
    child.killed = false;
    child.pid = 12345;
    return child;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('processExists', () => {
    it('should return true when process exists', () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
      expect(processExists(12345)).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(12345, 0);
      killSpy.mockRestore();
    });

    it('should return false when process does not exist', () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        const error = new Error('ESRCH') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      });
      expect(processExists(12345)).toBe(false);
      killSpy.mockRestore();
    });
  });

  describe('startProcessMonitoring - event-driven', () => {
    it('should register event listeners when ChildProcess is available', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      startProcessMonitoring(prompt);

      expect(prompt.logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Starting event-driven process monitoring'),
      );
      expect(prompt.logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Registered event listeners'),
      );
      expect(isEventDrivenMonitoring(prompt)).toBe(true);
    });

    it('should trigger handleProcessGone on exit event', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      startProcessMonitoring(prompt);

      // Simulate process exit
      child.emit('exit', 0, null);

      expect(prompt.processConnectionLost).toBe(true);
      expect(prompt.handleProcessGone).toHaveBeenCalled();
    });

    it('should trigger handleProcessGone on close event', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      startProcessMonitoring(prompt);

      // Simulate process close
      child.emit('close', 0, null);

      expect(prompt.processConnectionLost).toBe(true);
      expect(prompt.handleProcessGone).toHaveBeenCalled();
    });

    it('should handle error events (non-EPIPE)', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      startProcessMonitoring(prompt);

      // Simulate process error
      child.emit('error', new Error('Some error'));

      expect(prompt.processConnectionLost).toBe(true);
      expect(prompt.handleProcessGone).toHaveBeenCalled();
    });

    it('should ignore EPIPE errors', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      startProcessMonitoring(prompt);

      // Simulate EPIPE error
      child.emit('error', new Error('EPIPE'));

      expect(prompt.processConnectionLost).toBe(false);
      expect(prompt.handleProcessGone).not.toHaveBeenCalled();
    });

    it('should handle disconnect events', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      startProcessMonitoring(prompt);

      // Simulate disconnect
      child.emit('disconnect');

      expect(prompt.processConnectionLost).toBe(true);
      // Note: disconnect doesn't immediately call handleProcessGone
      expect(prompt.handleProcessGone).not.toHaveBeenCalled();
    });
  });

  describe('startProcessMonitoring - polling fallback', () => {
    it('should use polling when no ChildProcess is available', () => {
      const prompt = createMockPrompt();
      vi.mocked(processes.getChildByPid).mockReturnValue(undefined);

      startProcessMonitoring(prompt);

      expect(prompt.logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Starting polling fallback'),
      );
      expect(isEventDrivenMonitoring(prompt)).toBe(false);
    });

    it('should use polling when ChildProcess is already killed', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      child.killed = true;
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      startProcessMonitoring(prompt);

      expect(prompt.logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Starting polling fallback'),
      );
    });
  });

  describe('stopProcessMonitoring', () => {
    it('should remove event listeners and clean up', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      startProcessMonitoring(prompt);
      stopProcessMonitoring(prompt);

      // Event listeners should be removed
      expect(child.listenerCount('exit')).toBe(0);
      expect(child.listenerCount('close')).toBe(0);
      expect(child.listenerCount('error')).toBe(0);
      expect(child.listenerCount('disconnect')).toBe(0);

      expect(prompt.logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Stopped process monitoring'),
      );
    });

    it('should clear polling timer if using fallback', () => {
      const prompt = createMockPrompt();
      vi.mocked(processes.getChildByPid).mockReturnValue(undefined);

      startProcessMonitoring(prompt);
      expect(prompt.processMonitorTimer).toBeDefined();

      stopProcessMonitoring(prompt);
      expect(prompt.processMonitorTimer).toBeUndefined();
    });
  });

  describe('checkProcessAlive', () => {
    it('should detect when process is no longer running', () => {
      const prompt = createMockPrompt();
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        const error = new Error('ESRCH') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      });

      checkProcessAlive(prompt, true);

      expect(prompt.processConnectionLost).toBe(true);
      expect(prompt.notifyProcessConnectionLost).toHaveBeenCalled();

      killSpy.mockRestore();
    });

    it('should not check if process started recently', () => {
      const prompt = createMockPrompt({
        scriptStartTime: Date.now() - 1000, // Started 1 second ago (< 2s threshold)
      });
      const killSpy = vi.spyOn(process, 'kill');

      checkProcessAlive(prompt, false);

      expect(killSpy).not.toHaveBeenCalled();
      killSpy.mockRestore();
    });

    it('should force check when force=true', () => {
      const prompt = createMockPrompt({
        scriptStartTime: Date.now() - 1000, // Started 1 second ago
      });
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      checkProcessAlive(prompt, true);

      expect(killSpy).toHaveBeenCalled();
      killSpy.mockRestore();
    });
  });

  describe('getMonitoringStatus', () => {
    it('should return correct status for event-driven monitoring', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      startProcessMonitoring(prompt);

      const status = getMonitoringStatus(prompt);
      expect(status.isMonitoring).toBe(true);
      expect(status.isEventDriven).toBe(true);
      expect(status.hasPollingTimer).toBe(false);
      expect(status.pid).toBe(12345);
    });

    it('should return correct status for polling fallback', () => {
      const prompt = createMockPrompt();
      vi.mocked(processes.getChildByPid).mockReturnValue(undefined);

      startProcessMonitoring(prompt);

      const status = getMonitoringStatus(prompt);
      expect(status.isMonitoring).toBe(true);
      expect(status.isEventDriven).toBe(false);
      expect(status.hasPollingTimer).toBe(true);
    });

    it('should return correct status when not monitoring', () => {
      const prompt = createMockPrompt();

      const status = getMonitoringStatus(prompt);
      expect(status.isMonitoring).toBe(false);
      expect(status.isEventDriven).toBe(false);
      expect(status.hasPollingTimer).toBe(false);
    });
  });

  describe('listenForProcessExit', () => {
    it('should register ProcessGone event handler', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      // First start monitoring to create the cleanup entry
      startProcessMonitoring(prompt);
      listenForProcessExit(prompt);

      // Emit ProcessGone event
      (emitter as EventEmitter).emit(KitEvent.ProcessGone, 12345);

      expect(prompt.handleProcessGone).toHaveBeenCalled();
    });

    it('should not trigger for different PID', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      startProcessMonitoring(prompt);
      listenForProcessExit(prompt);

      // Emit ProcessGone event for different PID
      (emitter as EventEmitter).emit(KitEvent.ProcessGone, 99999);

      expect(prompt.handleProcessGone).not.toHaveBeenCalled();
    });
  });

  describe('prevents double registration', () => {
    it('should not register twice for same window', () => {
      const prompt = createMockPrompt();
      const child = createMockChild();
      vi.mocked(processes.getChildByPid).mockReturnValue(child);

      startProcessMonitoring(prompt);
      startProcessMonitoring(prompt);

      expect(prompt.logInfo).toHaveBeenCalledWith(
        expect.stringContaining('already active'),
      );

      // Should only have one set of listeners
      expect(child.listenerCount('exit')).toBe(1);
    });
  });
});
