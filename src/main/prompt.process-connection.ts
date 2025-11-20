import { Notification } from 'electron';
import { AppChannel } from '../shared/enums';
import { sendToAllPrompts } from './channel';
import { buildProcessConnectionLostOptions, buildProcessDebugInfo } from './prompt.notifications';
import { shouldMonitorProcess, getProcessCheckInterval } from './prompt.process-utils';
import { startProcessMonitoring as monitorStart, stopProcessMonitoring as monitorStop, listenForProcessExit as monitorListen, checkProcessAlive as monitorCheck } from './prompt.process-monitor';
import { kitState } from './state';
import { processes } from './process';

export const notifyProcessConnectionLostImpl = (prompt: any): void => {
    if (!prompt.scriptName || prompt.scriptName === 'unknown' || prompt.scriptName === 'script-not-set') {
        prompt.logWarn(`Process connection lost for unknown script (PID: ${prompt.pid}) - skipping notification`);
        return;
    }
    if (!prompt.scriptPath || prompt.scriptPath === '') {
        prompt.logWarn(`Process connection lost for idle prompt (PID: ${prompt.pid}) - skipping notification`);
        return;
    }
    prompt.logInfo(`Showing process connection lost notification for ${prompt.scriptName} (PID: ${prompt.pid})`);
    const connectionLostOptions = buildProcessConnectionLostOptions(
        prompt.scriptName,
        prompt.pid,
        process.platform === 'win32',
    );
    const notification = new Notification(connectionLostOptions);
    notification.on('action', (_event, index) => {
        if (index === 0) {
            prompt.logInfo(`User chose to close disconnected prompt: ${prompt.scriptName}`);
            prompt.close('user requested close after connection lost');
        } else if (index === 1) {
            prompt.logInfo(`User chose to keep disconnected prompt open: ${prompt.scriptName}`);
        } else if (index === 2) {
            prompt.logInfo(`User requested debug info for disconnected prompt: ${prompt.scriptName}`);
            showProcessDebugInfoImpl(prompt);
        }
    });
    notification.on('click', () => {
        prompt.focusPrompt();
    });
    notification.show();
};

export const showProcessDebugInfoImpl = (prompt: any): void => {
    const debugInfo = buildProcessDebugInfo({
        promptId: prompt.id,
        windowId: prompt.window?.id,
        pid: prompt.pid,
        scriptPath: prompt.scriptPath,
        scriptName: prompt.scriptName,
        boundToProcess: prompt.boundToProcess,
        processConnectionLost: prompt.processConnectionLost,
        lastProcessCheckTimeIso: new Date(prompt.lastProcessCheckTime).toISOString(),
        timeSinceLastCheck: Date.now() - prompt.lastProcessCheckTime,
        isVisible: prompt.isVisible(),
        isFocused: prompt.isFocused(),
        isDestroyed: prompt.isDestroyed(),
    });
    prompt.logInfo('Process Debug Info:', debugInfo);
    sendToAllPrompts(AppChannel.DEBUG_INFO, {
        type: 'process-connection-lost',
        data: debugInfo,
    });
};

export const startProcessMonitoringImpl = (prompt: any): void => {
    if (!prompt.processMonitoringEnabled || prompt.processMonitorTimer) return;
    if (!shouldMonitorProcess({ scriptPath: prompt.scriptPath, scriptName: prompt.scriptName, kenvEnv: kitState?.kenvEnv as any })) {
        prompt.logInfo('Skipping process monitoring (disabled or no valid script)');
        return;
    }
    prompt.processCheckInterval = getProcessCheckInterval(kitState?.kenvEnv as any, prompt.processCheckInterval);
    monitorStart(prompt);
};

export const stopProcessMonitoringImpl = (prompt: any): void => {
    monitorStop(prompt);
};

export const checkProcessAliveImpl = (prompt: any, force = false): void => {
    prompt.lastProcessCheckTime = Date.now();
    monitorCheck(prompt, force);
};

export const listenForProcessExitImpl = (prompt: any): void => {
    monitorListen(prompt);
};

export const handleProcessGoneImpl = (prompt: any): void => {
    if (!prompt.boundToProcess) return;
    prompt.logInfo(`Process ${prompt.pid} is gone. Cleaning up prompt.`);
    stopProcessMonitoringImpl(prompt);
    prompt.clearLongRunningMonitor();

    if (prompt.processConnectionLostTimeout) {
        clearTimeout(prompt.processConnectionLostTimeout);
        prompt.processConnectionLostTimeout = undefined;
    }

    prompt.boundToProcess = false;
    if (!prompt.isDestroyed()) {
        prompt.close('ProcessGone - force close');
        if (!(prompt.closed || prompt.isDestroyed())) {
            prompt.hideInstant();
            setTimeout(() => {
                if (!(prompt.closed || prompt.isDestroyed())) {
                    prompt.close('ProcessGone - retry force close');
                }
            }, 100);
        }
    }
    const processStillTracked = processes.getByPid?.(prompt.pid);
    if (processStillTracked) {
        processes.removeByPid(prompt.pid, 'process gone - prompt cleanup');
    } else {
        prompt.logInfo?.(`Skip removeByPid for ${prompt.pid}: process already cleaned up`);
    }
    prompt.resetState();
};

