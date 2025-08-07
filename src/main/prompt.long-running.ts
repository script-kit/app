import type { KitPrompt } from './prompt';
import { UI } from '@johnlindquist/kit/core/enum';
import { Notification } from 'electron';
import { buildLongRunningNotificationOptions } from './prompt.notifications';
import { processes } from './process';
import { KitEvent, emitter } from '../shared/events';
import { kitState } from './state';

export function startLongRunningMonitorFlow(prompt: KitPrompt) {
    // Clear any existing timer first to avoid duplicates
    (prompt as any).clearLongRunningMonitor();

    // Check for custom threshold from environment variables is handled in caller config

    // Skip monitoring for main script or if disabled
    if (
        (prompt as any).isMainMenu ||
        (kitState?.kenvEnv as any)?.KIT_DISABLE_LONG_RUNNING_MONITOR === 'true' ||
        (prompt as any).script?.longRunning === true
    ) {
        (prompt as any).logInfo?.(`Skipping long-running monitor for ${(prompt as any).scriptName}`);
        return;
    }

    if (!(prompt as any).scriptPath || (prompt as any).scriptPath === '' || !(prompt as any).scriptName || (prompt as any).scriptName === 'script-not-set') {
        (prompt as any).logInfo?.('Skipping long-running monitor for idle prompt (no valid script)');
        return;
    }

    if (!(prompt as any).scriptStartTime) (prompt as any).scriptStartTime = Date.now();
    (prompt as any).hasShownLongRunningNotification = false;

    (prompt as any).longRunningTimer = setTimeout(() => {
        if (!((prompt as any).hasShownLongRunningNotification || prompt.window?.isDestroyed())) {
            showLongRunningNotificationFlow(prompt);
            (prompt as any).hasShownLongRunningNotification = true;
        }
    }, (prompt as any).longRunningThresholdMs);

    (prompt as any).logInfo?.(`Started long-running monitor for ${(prompt as any).scriptName} (${(prompt as any).longRunningThresholdMs}ms)`);
}

export function clearLongRunningMonitorFlow(prompt: KitPrompt) {
    const timer = (prompt as any).longRunningTimer as NodeJS.Timeout | undefined;
    if (timer) {
        clearTimeout(timer);
        (prompt as any).longRunningTimer = undefined;
        (prompt as any).logInfo?.(`Cleared long-running monitor for ${(prompt as any).scriptName}`);
    }
}

export function showLongRunningNotificationFlow(prompt: KitPrompt) {
    if (!(prompt as any).scriptStartTime) return;

    if (!(prompt as any).scriptName || (prompt as any).scriptName === 'script-not-set' || !(prompt as any).scriptPath || (prompt as any).scriptPath === '') {
        (prompt as any).logInfo?.(`Skipping long-running notification for idle prompt (PID: ${(prompt as any).pid})`);
        return;
    }

    const runningTimeMs = Date.now() - (prompt as any).scriptStartTime;
    const runningTimeSeconds = Math.floor(runningTimeMs / 1000);
    const scriptName = (prompt as any).scriptName || 'Unknown Script';

    let contextHint = '';
    if ((prompt as any).ui === UI.term) contextHint = ' It appears to be running a terminal command.';
    else if ((prompt as any).ui === UI.editor) contextHint = ' It appears to be in an editor session.';
    else if ((prompt as any).promptData?.input?.includes('http')) contextHint = ' It might be making network requests.';
    else if ((prompt as any).promptData?.input?.includes('file') || (prompt as any).promptData?.input?.includes('path')) contextHint = ' It might be processing files.';
    else if ((prompt as any).ui === UI.arg && ((prompt as any).promptData as any)?.choices?.length === 0) contextHint = ' It might be waiting for user input.';

    (prompt as any).logInfo?.(`Showing long-running notification for ${scriptName} (running for ${runningTimeSeconds}s)`);

    const notificationOptions = buildLongRunningNotificationOptions(
        scriptName,
        runningTimeSeconds,
        contextHint,
        process.platform === 'win32',
    );

    const notification = new Notification(notificationOptions);

    notification.on('action', (_event, index) => {
        if (index === 0) {
            (prompt as any).logInfo?.(`User chose to terminate long-running script: ${scriptName}`);
            terminateLongRunningScriptFlow(prompt);
        } else if (index === 1) {
            (prompt as any).logInfo?.(`User chose to keep running script: ${scriptName}`);
            (prompt as any).hasShownLongRunningNotification = true;
        } else if (index === 2) {
            (prompt as any).logInfo?.(`User chose "don't ask again" for script: ${scriptName}`);
            (prompt as any).hasShownLongRunningNotification = true;
        }
    });

    notification.on('click', () => {
        (prompt as any).logInfo?.(`Long-running notification clicked for: ${scriptName}`);
        prompt.focusPrompt();
    });

    notification.on('close', () => {
        (prompt as any).logInfo?.(`Long-running notification closed for: ${scriptName}`);
        (prompt as any).hasShownLongRunningNotification = true;
    });

    notification.show();
}

export function terminateLongRunningScriptFlow(prompt: KitPrompt) {
    (prompt as any).logInfo?.(`Terminating long-running script: ${(prompt as any).scriptName} (PID: ${(prompt as any).pid})`);
    clearLongRunningMonitorFlow(prompt);
    (prompt as any).hideInstant();
    try { processes.removeByPid((prompt as any).pid, 'long-running script terminated by user'); } catch { }
    emitter.emit(KitEvent.KillProcess, (prompt as any).pid);
    const confirmNotification = new Notification({ title: 'Script Terminated', body: `"${(prompt as any).scriptName}" has been terminated.`, timeoutType: 'default' });
    confirmNotification.show();
}


