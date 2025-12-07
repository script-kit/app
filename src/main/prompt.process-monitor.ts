import type { ChildProcess } from 'node:child_process';
import { emitter, KitEvent } from '../shared/events';
import { processes } from './process';

/**
 * Check if a process exists by sending signal 0.
 * Used as a fallback for external processes where we don't have a ChildProcess reference.
 */
export function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Store for cleanup handlers associated with each prompt's process monitoring.
 * Key is the prompt window id, value contains cleanup functions for event listeners.
 */
const processMonitorCleanupMap = new Map<
  number,
  {
    removeExitListener?: () => void;
    removeCloseListener?: () => void;
    removeErrorListener?: () => void;
    removeDisconnectListener?: () => void;
    pollingTimer?: NodeJS.Timeout;
    processGoneHandler?: (pid: number) => void;
  }
>();

/**
 * Handle process exit event - called when ChildProcess emits 'exit' or 'close'.
 * This is the event-driven approach (preferred over polling).
 */
function handleProcessExit(prompt: any, code: number | null, signal: NodeJS.Signals | null, eventType: string) {
  if (!prompt.boundToProcess) return;

  prompt.logInfo?.(
    `Process ${prompt.pid} ${eventType} event received (code: ${code}, signal: ${signal}). Triggering cleanup.`,
  );

  // Mark connection as lost
  prompt.processConnectionLost = true;

  // Stop any polling timer
  stopPollingFallback(prompt);

  // Trigger process gone handler
  prompt.handleProcessGone?.();
}

/**
 * Handle process error event.
 */
function handleProcessError(prompt: any, error: Error) {
  // Ignore EPIPE errors (process already gone)
  if (error?.message?.includes('EPIPE')) {
    prompt.logInfo?.(`Process ${prompt.pid} EPIPE error (ignored)`);
    return;
  }

  prompt.logWarn?.(`Process ${prompt.pid} error event:`, { message: error?.message });

  // Mark connection as lost on error
  prompt.processConnectionLost = true;

  // Stop any polling timer
  stopPollingFallback(prompt);

  // Trigger cleanup
  prompt.handleProcessGone?.();
}

/**
 * Handle process disconnect event (IPC channel closed).
 */
function handleProcessDisconnect(prompt: any) {
  if (!prompt.boundToProcess) return;

  prompt.logInfo?.(`Process ${prompt.pid} disconnected (IPC channel closed)`);

  // Mark connection as lost
  prompt.processConnectionLost = true;

  // Stop any polling timer
  stopPollingFallback(prompt);

  // Note: Don't immediately call handleProcessGone here.
  // The process may still be running, just IPC disconnected.
  // Let the exit event or polling fallback handle final cleanup.
}

/**
 * Check if process is alive using kill(pid, 0).
 * This is the FALLBACK method for external processes only.
 */
export function checkProcessAlive(prompt: any, force = false) {
  if (!(prompt.pid && prompt.boundToProcess)) return;

  // Skip early checks to allow process time to start
  if (!force && prompt.scriptStartTime && Date.now() - prompt.scriptStartTime < 2000) return;

  prompt.lastProcessCheckTime = Date.now();

  try {
    process.kill(prompt.pid, 0);
    // Process is alive
    if (prompt.processConnectionLost) {
      prompt.logInfo?.(`Process ${prompt.pid} reconnected or was temporarily unavailable`);
      prompt.processConnectionLost = false;
      if (prompt.processConnectionLostTimeout) {
        clearTimeout(prompt.processConnectionLostTimeout);
        prompt.processConnectionLostTimeout = undefined;
      }
    }
  } catch (error: any) {
    const errno = (error as NodeJS.ErrnoException)?.code;

    // Only handle ESRCH (no such process) - other errors don't indicate process death
    if (errno !== 'ESRCH') {
      if (errno) {
        prompt.logWarn?.('checkProcessAlive: non-ESRCH error when probing process', {
          pid: prompt.pid,
          code: errno,
          message: error?.message,
        });
      }
      return;
    }

    // Process is no longer running
    if (!prompt.processConnectionLost) {
      prompt.logInfo?.(`Process ${prompt.pid} is no longer running (polling fallback detected). Setting connection lost flag.`);
      prompt.processConnectionLost = true;
      // Notify user about the lost connection
      prompt.notifyProcessConnectionLost?.();
    }

    // Set up auto-cleanup timeout
    if (prompt.processConnectionLostTimeout) {
      clearTimeout(prompt.processConnectionLostTimeout);
    }

    prompt.processConnectionLostTimeout = setTimeout(() => {
      if (prompt.processConnectionLost && prompt.boundToProcess) {
        prompt.logInfo?.(`Auto-cleaning up disconnected prompt after timeout: PID ${prompt.pid}`);
        try {
          processes.removeByPid(prompt.pid, 'process gone - polling fallback cleanup');
        } catch {}
      }
      prompt.processConnectionLostTimeout = undefined;
    }, 30000);
  }
}

/**
 * Stop the polling fallback timer if it's running.
 */
function stopPollingFallback(prompt: any) {
  const windowId = prompt.window?.id;
  if (!windowId) return;

  const cleanup = processMonitorCleanupMap.get(windowId);
  if (cleanup?.pollingTimer) {
    clearInterval(cleanup.pollingTimer);
    cleanup.pollingTimer = undefined;
    prompt.logInfo?.(`Stopped polling fallback for PID ${prompt.pid}`);
  }

  // Also clear the legacy timer if it exists
  if (prompt.processMonitorTimer) {
    clearInterval(prompt.processMonitorTimer);
    prompt.processMonitorTimer = undefined;
  }
}

/**
 * Start event-based process monitoring.
 * Registers listeners on the ChildProcess for exit/close/error/disconnect events.
 * Falls back to polling only if no ChildProcess reference is available.
 */
export function startProcessMonitoring(prompt: any) {
  if (!prompt.processMonitoringEnabled) return;

  const windowId = prompt.window?.id;
  if (!windowId) {
    prompt.logWarn?.('Cannot start process monitoring: no window id');
    return;
  }

  // Prevent double-registration
  if (processMonitorCleanupMap.has(windowId)) {
    prompt.logInfo?.(`Process monitoring already active for window ${windowId}`);
    return;
  }

  if (!prompt.boundToProcess || !prompt.pid) {
    prompt.logInfo?.('Skipping process monitoring: not bound to process');
    return;
  }

  const pid = prompt.pid;
  const cleanup: (typeof processMonitorCleanupMap extends Map<any, infer V> ? V : never) = {};
  processMonitorCleanupMap.set(windowId, cleanup);

  // Try to get the ChildProcess reference from the processes singleton
  const child: ChildProcess | undefined = processes.getChildByPid(pid);

  if (child && !child.killed) {
    // EVENT-DRIVEN MONITORING (preferred)
    prompt.logInfo?.(
      `Starting event-driven process monitoring for PID ${pid} (window ${windowId})`,
    );

    // Register exit listener
    const exitHandler = (code: number | null, signal: NodeJS.Signals | null) => {
      handleProcessExit(prompt, code, signal, 'exit');
    };
    child.once('exit', exitHandler);
    cleanup.removeExitListener = () => child.off('exit', exitHandler);

    // Register close listener (all stdio streams closed)
    const closeHandler = (code: number | null, signal: NodeJS.Signals | null) => {
      handleProcessExit(prompt, code, signal, 'close');
    };
    child.once('close', closeHandler);
    cleanup.removeCloseListener = () => child.off('close', closeHandler);

    // Register error listener
    const errorHandler = (error: Error) => {
      handleProcessError(prompt, error);
    };
    child.on('error', errorHandler);
    cleanup.removeErrorListener = () => child.off('error', errorHandler);

    // Register disconnect listener
    const disconnectHandler = () => {
      handleProcessDisconnect(prompt);
    };
    child.once('disconnect', disconnectHandler);
    cleanup.removeDisconnectListener = () => child.off('disconnect', disconnectHandler);

    prompt.logInfo?.(`Registered event listeners on ChildProcess for PID ${pid}`);
  } else {
    // POLLING FALLBACK (for external processes or if child already exited)
    prompt.logInfo?.(
      `Starting polling fallback for PID ${pid} (no ChildProcess reference available, checking every ${prompt.processCheckInterval}ms)`,
    );

    // Initial check
    checkProcessAlive(prompt, true);

    // Start polling interval
    cleanup.pollingTimer = setInterval(() => {
      checkProcessAlive(prompt);
    }, prompt.processCheckInterval);

    // Store reference in prompt for backward compatibility
    prompt.processMonitorTimer = cleanup.pollingTimer;
  }
}

/**
 * Stop all process monitoring for a prompt.
 * Removes event listeners and clears polling timer.
 */
export function stopProcessMonitoring(prompt: any) {
  const windowId = prompt.window?.id;

  // Clean up event listeners and timers
  if (windowId) {
    const cleanup = processMonitorCleanupMap.get(windowId);
    if (cleanup) {
      cleanup.removeExitListener?.();
      cleanup.removeCloseListener?.();
      cleanup.removeErrorListener?.();
      cleanup.removeDisconnectListener?.();

      if (cleanup.pollingTimer) {
        clearInterval(cleanup.pollingTimer);
      }

      // Remove ProcessGone event listener
      if (cleanup.processGoneHandler) {
        emitter.off(KitEvent.ProcessGone, cleanup.processGoneHandler);
      }

      processMonitorCleanupMap.delete(windowId);
      prompt.logInfo?.(`Stopped process monitoring for PID ${prompt.pid} (event-driven)`);
    }
  }

  // Also clean up legacy timer if it exists
  if (prompt.processMonitorTimer) {
    clearInterval(prompt.processMonitorTimer);
    prompt.processMonitorTimer = undefined;
    prompt.logInfo?.(`Stopped process monitoring for PID ${prompt.pid} (polling)`);
  }
}

/**
 * Listen for ProcessGone events from the emitter.
 * This provides an additional notification path when processes are removed.
 */
export function listenForProcessExit(prompt: any) {
  const windowId = prompt.window?.id;
  if (!windowId) return;

  const processGoneHandler = (pid: number) => {
    if (pid === prompt.pid) {
      prompt.logInfo?.(`Received ProcessGone event for PID ${prompt.pid}`);
      prompt.handleProcessGone?.();
    }
  };

  // Store handler in cleanup map for removal
  const cleanup = processMonitorCleanupMap.get(windowId);
  if (cleanup) {
    cleanup.processGoneHandler = processGoneHandler;
  }

  emitter.on(KitEvent.ProcessGone, processGoneHandler);

  // Clean up when window closes
  prompt.window?.once('closed', () => {
    emitter.off(KitEvent.ProcessGone, processGoneHandler);
    // Clean up the entire cleanup entry
    processMonitorCleanupMap.delete(windowId);
  });
}

/**
 * Check if a prompt's process monitoring is using event-driven approach.
 * Returns true if ChildProcess event listeners are registered, false if using polling.
 */
export function isEventDrivenMonitoring(prompt: any): boolean {
  const windowId = prompt.window?.id;
  if (!windowId) return false;

  const cleanup = processMonitorCleanupMap.get(windowId);
  if (!cleanup) return false;

  // If we have exit listener, we're using event-driven monitoring
  return cleanup.removeExitListener !== undefined;
}

/**
 * Get monitoring status for debugging.
 */
export function getMonitoringStatus(prompt: any): {
  isMonitoring: boolean;
  isEventDriven: boolean;
  hasPollingTimer: boolean;
  windowId: number | undefined;
  pid: number;
} {
  const windowId = prompt.window?.id;
  const cleanup = windowId ? processMonitorCleanupMap.get(windowId) : undefined;

  return {
    isMonitoring: cleanup !== undefined || prompt.processMonitorTimer !== undefined,
    isEventDriven: cleanup?.removeExitListener !== undefined,
    hasPollingTimer: cleanup?.pollingTimer !== undefined || prompt.processMonitorTimer !== undefined,
    windowId,
    pid: prompt.pid,
  };
}
