import type { NotificationConstructorOptions } from 'electron';

export function buildLongRunningNotificationOptions(
    scriptName: string,
    runningTimeSeconds: number,
    contextHint: string,
    isWindows: boolean,
): NotificationConstructorOptions {
    const notificationOptions: NotificationConstructorOptions = {
        title: 'Long-Running Script',
        body: `"${scriptName}" has been running for ${runningTimeSeconds} seconds.${contextHint} Would you like to terminate it or let it continue?`,
        actions: [
            { type: 'button', text: 'Terminate Script' },
            { type: 'button', text: 'Keep Running' },
            { type: 'button', text: "Don't Ask Again" },
        ],
        timeoutType: 'never',
        urgency: 'normal',
    };

    if (isWindows) {
        notificationOptions.toastXml = `
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>Long-Running Script</text>
      <text>"${scriptName}" has been running for ${runningTimeSeconds} seconds.${contextHint} Would you like to terminate it or let it continue?</text>
    </binding>
  </visual>
  <actions>
    <action content="Terminate Script" arguments="action=terminate" />
    <action content="Keep Running" arguments="action=keep" />
    <action content="Don't Ask Again" arguments="action=never" />
  </actions>
</toast>`;
    }

    return notificationOptions;
}

export function buildProcessConnectionLostOptions(
    scriptName: string,
    pid: number,
    isWindows: boolean,
): NotificationConstructorOptions {
    const connectionLostOptions: NotificationConstructorOptions = {
        title: 'Script Process Connection Lost',
        body: `"${scriptName}" (PID: ${pid}) is no longer responding. The prompt window is still open but disconnected from the process.`,
        actions: [
            { type: 'button', text: 'Close Prompt' },
            { type: 'button', text: 'Keep Open' },
            { type: 'button', text: 'Show Debug Info' },
        ],
        timeoutType: 'never',
        urgency: 'normal',
    };

    if (isWindows) {
        connectionLostOptions.toastXml = `
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>Script Process Connection Lost</text>
      <text>"${scriptName}" (PID: ${pid}) is no longer responding. The prompt window is still open but disconnected from the process.</text>
    </binding>
  </visual>
  <actions>
    <action content="Close Prompt" arguments="action=close" />
    <action content="Keep Open" arguments="action=keep" />
    <action content="Show Debug Info" arguments="action=debug" />
  </actions>
</toast>`;
    }

    return connectionLostOptions;
}

export function buildProcessDebugInfo(data: {
    promptId: string;
    windowId: number | undefined;
    pid: number;
    scriptPath: string;
    scriptName: string;
    boundToProcess: boolean;
    processConnectionLost: boolean;
    lastProcessCheckTimeIso: string;
    timeSinceLastCheck: number;
    isVisible: boolean;
    isFocused: boolean;
    isDestroyed: boolean;
}) {
    return {
        promptId: data.promptId,
        windowId: data.windowId,
        pid: data.pid,
        scriptPath: data.scriptPath,
        scriptName: data.scriptName,
        boundToProcess: data.boundToProcess,
        processConnectionLost: data.processConnectionLost,
        lastProcessCheckTime: data.lastProcessCheckTimeIso,
        timeSinceLastCheck: data.timeSinceLastCheck,
        isVisible: data.isVisible,
        isFocused: data.isFocused,
        isDestroyed: data.isDestroyed,
    };
}


