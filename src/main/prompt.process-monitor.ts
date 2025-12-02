import { emitter, KitEvent } from '../shared/events';
import { processes } from './process';

export function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function checkProcessAlive(prompt: any, force = false) {
  if (!(prompt.pid && prompt.boundToProcess)) return;

  if (!force && prompt.scriptStartTime && Date.now() - prompt.scriptStartTime < 2000) return;

  prompt.lastProcessCheckTime = Date.now();

  try {
    process.kill(prompt.pid, 0);
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
    if (errno && errno !== 'ESRCH') {
      prompt.logWarn?.('checkProcessAlive: non-ESRCH error when probing process', {
        pid: prompt.pid,
        code: errno,
        message: error?.message,
      });
      return;
    }
    if (errno !== 'ESRCH') {
      prompt.logWarn?.('checkProcessAlive: unknown error when probing process', {
        pid: prompt.pid,
        message: error?.message,
      });
      return;
    }

    if (!prompt.processConnectionLost) {
      prompt.logInfo?.(`Process ${prompt.pid} is no longer running. Setting connection lost flag.`);
      prompt.processConnectionLost = true;
      // Notify user about the lost connection
      prompt.notifyProcessConnectionLost?.();
    }

    if (prompt.processConnectionLostTimeout) {
      clearTimeout(prompt.processConnectionLostTimeout);
    }

    prompt.processConnectionLostTimeout = setTimeout(() => {
      if (prompt.processConnectionLost && prompt.boundToProcess) {
        prompt.logInfo?.(`Auto-cleaning up disconnected prompt after timeout: PID ${prompt.pid}`);
        // Inline logic similar to handleProcessGone minimal behavior
        try {
          processes.removeByPid(prompt.pid, 'process gone - prompt cleanup');
        } catch {}
      }
      prompt.processConnectionLostTimeout = undefined;
    }, 30000);
  }
}

export function startProcessMonitoring(prompt: any) {
  if (!prompt.processMonitoringEnabled || prompt.processMonitorTimer) return;

  prompt.logInfo?.(
    `Starting process monitoring for PID ${prompt.pid} (checking every ${prompt.processCheckInterval}ms)`,
  );
  if (prompt.boundToProcess && prompt.pid) {
    checkProcessAlive(prompt, true);
    prompt.processMonitorTimer = setInterval(() => {
      checkProcessAlive(prompt);
    }, prompt.processCheckInterval);
  }
}

export function stopProcessMonitoring(prompt: any) {
  if (prompt.processMonitorTimer) {
    clearInterval(prompt.processMonitorTimer);
    prompt.processMonitorTimer = undefined;
    prompt.logInfo?.(`Stopped process monitoring for PID ${prompt.pid}`);
  }
}

export function listenForProcessExit(prompt: any) {
  const processGoneHandler = (pid: number) => {
    if (pid === prompt.pid) {
      prompt.logInfo?.(`Received ProcessGone event for PID ${prompt.pid}`);
      prompt.handleProcessGone?.();
    }
  };

  emitter.on(KitEvent.ProcessGone, processGoneHandler);
  prompt.window?.once('closed', () => {
    emitter.off(KitEvent.ProcessGone, processGoneHandler);
  });
}
