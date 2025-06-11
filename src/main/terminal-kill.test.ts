import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitEvent } from '../shared/events';

// Mock dependencies
const mockEmitter = new EventEmitter();
const mockProcessLog = {
  info: vi.fn(),
  error: vi.fn(),
};

// Simplified Process Manager for testing
class ProcessManager {
  private processes: Map<number, any> = new Map();
  private pidDebounceMap: Map<number, NodeJS.Timeout> = new Map();

  addProcess(pid: number, info: any) {
    this.processes.set(pid, info);
  }

  removeByPid(pid: number, reason = 'unknown') {
    mockProcessLog.info(`🛑 removeByPid: ${pid} - ${reason}`);

    // Check if this pid is currently being debounced
    // Exception: Terminal kills should always proceed immediately
    const isTerminalKill = reason.includes('TERM_KILL') || reason.includes('terminal');
    if (!isTerminalKill && this.pidDebounceMap.has(pid)) {
      mockProcessLog.info(`🕐 Debounced removeByPid: ${pid} - ${reason}`);
      return;
    }

    // Set new debounce timeout for this pid (shorter for terminal kills)
    const debounceDelay = isTerminalKill ? 100 : 1000;
    this.pidDebounceMap.set(
      pid,
      setTimeout(() => {
        this.pidDebounceMap.delete(pid);
      }, debounceDelay),
    );

    if (this.processes.has(pid)) {
      mockEmitter.emit(KitEvent.ProcessGone, pid);
      mockEmitter.emit(KitEvent.TERM_KILL, pid);
      this.processes.delete(pid);
    }
  }

  clearDebounces() {
    for (const [pid, timeout] of this.pidDebounceMap) {
      clearTimeout(timeout);
    }
    this.pidDebounceMap.clear();
  }
}

// Simplified Prompt for testing
class KitPrompt {
  public pid?: number;
  public boundToProcess = false;
  public hasBeenFocused = false;
  public closed = false;
  public closeCoolingDown = false;
  private processMonitorTimer?: NodeJS.Timer;

  bindToProcess(pid: number) {
    this.pid = pid;
    this.boundToProcess = true;
    this.startProcessMonitoring();

    this.processGoneHandler = (gonePid: number) => {
      if (gonePid === this.pid) {
        this.handleProcessGone();
      }
    };
    mockEmitter.on(KitEvent.ProcessGone, this.processGoneHandler);
  }

  private processGoneHandler?: (pid: number) => void;

  startProcessMonitoring() {
    // Fixed: Start monitoring immediately
    if (this.boundToProcess && this.pid) {
      this.checkProcessAlive();
      this.processMonitorTimer = setInterval(() => {
        this.checkProcessAlive();
      }, 5000);
    }
  }

  checkProcessAlive() {
    // Mock implementation
    mockProcessLog.info(`Checking if process ${this.pid} is alive`);
  }

  handleProcessGone() {
    if (!this.boundToProcess) {
      return;
    }

    this.boundToProcess = false;
    this.stopProcessMonitoring();

    // Fixed: Force close for process exit
    this.close('ProcessGone - force close');
    if (!this.closed) {
      setTimeout(() => {
        if (!this.closed) {
          this.close('ProcessGone - retry force close');
        }
      }, 100);
    }
  }

  stopProcessMonitoring() {
    if (this.processMonitorTimer) {
      clearInterval(this.processMonitorTimer);
      this.processMonitorTimer = undefined;
    }
  }

  close(reason: string) {
    mockProcessLog.info(`Closing prompt: ${reason}`);

    // Fixed: Skip checks for process exit scenarios
    const isProcessExit =
      reason.includes('process-exit') ||
      reason.includes('TERM_KILL') ||
      reason.includes('removeByPid') ||
      reason.includes('ProcessGone');

    if (!isProcessExit) {
      if (this.boundToProcess && !this.hasBeenFocused) {
        mockProcessLog.info('Early return: prompt not focused');
        return;
      }
    }

    // Fixed: Skip cooldown for process exit
    if (this.closeCoolingDown && !isProcessExit) {
      mockProcessLog.info('Early return: cooling down');
      return;
    }

    this.closeCoolingDown = true;
    setTimeout(() => {
      this.closeCoolingDown = false;
    }, 100);

    this.closed = true;
    this.stopProcessMonitoring();

    // Clean up event listeners
    if (this.processGoneHandler) {
      mockEmitter.off(KitEvent.ProcessGone, this.processGoneHandler);
      this.processGoneHandler = undefined;
    }
  }
}

describe('Terminal Kill Bug Fix', () => {
  let processManager: ProcessManager;
  let prompt: KitPrompt;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitter.removeAllListeners();
    processManager = new ProcessManager();
    prompt = new KitPrompt();
  });

  afterEach(() => {
    processManager.clearDebounces();
  });

  describe('Debounce Race Condition', () => {
    it('should allow terminal kills to bypass debounce', async () => {
      const pid = 1234;
      processManager.addProcess(pid, { name: 'test' });

      // First removal attempt
      processManager.removeByPid(pid, 'first attempt');

      // Second attempt with TERM_KILL should bypass debounce
      processManager.removeByPid(pid, 'TERM_KILL from terminal');

      // Both attempts should log removeByPid
      expect(mockProcessLog.info).toHaveBeenCalledWith(`🛑 removeByPid: ${pid} - first attempt`);
      expect(mockProcessLog.info).toHaveBeenCalledWith(`🛑 removeByPid: ${pid} - TERM_KILL from terminal`);
      expect(mockProcessLog.info).not.toHaveBeenCalledWith(expect.stringContaining('Debounced'));
    });

    it('should block non-terminal kills during debounce', async () => {
      const pid = 1234;
      processManager.addProcess(pid, { name: 'test' });

      // First removal attempt
      processManager.removeByPid(pid, 'first attempt');

      // Second attempt without TERM_KILL should be debounced
      processManager.removeByPid(pid, 'second attempt');

      expect(mockProcessLog.info).toHaveBeenCalledWith(`🛑 removeByPid: ${pid} - first attempt`);
      expect(mockProcessLog.info).toHaveBeenCalledWith(`🕐 Debounced removeByPid: ${pid} - second attempt`);
    });
  });

  describe('Prompt Close Early Return', () => {
    it('should close unfocused prompts when process exits', () => {
      prompt.boundToProcess = true;
      prompt.hasBeenFocused = false;

      // Process exit reasons should bypass focus check
      prompt.close('process.removeByPid: terminal kill');

      expect(prompt.closed).toBe(true);
      expect(mockProcessLog.info).toHaveBeenCalledWith('Closing prompt: process.removeByPid: terminal kill');
    });

    it('should prevent closing unfocused prompts for non-process reasons', () => {
      prompt.boundToProcess = true;
      prompt.hasBeenFocused = false;

      // Non-process exit reasons should respect focus check
      prompt.close('user action');

      expect(prompt.closed).toBe(false);
      expect(mockProcessLog.info).toHaveBeenCalledWith('Early return: prompt not focused');
    });
  });

  describe('Process Monitoring', () => {
    it('should start monitoring immediately when binding to process', () => {
      const pid = 1234;
      const checkAliveSpy = vi.spyOn(prompt, 'checkProcessAlive');

      prompt.bindToProcess(pid);

      // Should check immediately
      expect(checkAliveSpy).toHaveBeenCalledTimes(1);
      expect(mockProcessLog.info).toHaveBeenCalledWith(`Checking if process ${pid} is alive`);
    });
  });

  describe('Force Close on Process Gone', () => {
    it('should force close prompt when process is gone', async () => {
      const pid = 1234;
      prompt.bindToProcess(pid);
      prompt.hasBeenFocused = false;
      processManager.addProcess(pid, { name: 'test' });

      // Simulate process exit
      processManager.removeByPid(pid, 'TERM_KILL');

      // Wait for event propagation
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(prompt.closed).toBe(true);
      expect(prompt.boundToProcess).toBe(false);
    });

    it('should retry close if first attempt fails', async () => {
      const pid = 1234;
      prompt.bindToProcess(pid);

      // Mock the close method to fail on first attempt
      let closeAttempts = 0;
      const originalClose = prompt.close.bind(prompt);
      prompt.close = vi.fn((reason: string) => {
        closeAttempts++;
        if (closeAttempts === 1 && reason === 'ProcessGone - force close') {
          // First attempt doesn't set closed to true
          mockProcessLog.info(`Closing prompt: ${reason}`);
          return;
        }
        originalClose(reason);
      });

      processManager.addProcess(pid, { name: 'test' });
      processManager.removeByPid(pid, 'TERM_KILL');

      // Wait for retry
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(prompt.close).toHaveBeenCalledWith('ProcessGone - retry force close');
      expect(closeAttempts).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Cooldown Bypass', () => {
    it('should bypass cooldown for process exit', () => {
      prompt.closeCoolingDown = true;

      prompt.close('ProcessGone');

      expect(prompt.closed).toBe(true);
      expect(mockProcessLog.info).not.toHaveBeenCalledWith('Early return: cooling down');
    });

    it('should respect cooldown for non-process exit', () => {
      prompt.closeCoolingDown = true;

      prompt.close('user action');

      expect(prompt.closed).toBe(false);
      expect(mockProcessLog.info).toHaveBeenCalledWith('Early return: cooling down');
    });
  });

  describe('Full Terminal Kill Flow', () => {
    it('should properly clean up prompt when process is killed from terminal', async () => {
      const pid = 1234;

      // Setup: Prompt bound to process, not focused
      prompt.bindToProcess(pid);
      prompt.hasBeenFocused = false;
      processManager.addProcess(pid, { name: 'test-script' });

      // Simulate terminal kill (Ctrl+C)
      processManager.removeByPid(pid, 'TERM_KILL from PTY');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify cleanup
      expect(prompt.closed).toBe(true);
      expect(prompt.boundToProcess).toBe(false);
      expect(mockEmitter.listenerCount(KitEvent.ProcessGone)).toBe(0); // Listener cleaned up
    });
  });
});
