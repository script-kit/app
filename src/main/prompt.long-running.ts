import { UI } from '@johnlindquist/kit/core/enum';
import { Notification } from 'electron';
import { emitter, KitEvent } from '../shared/events';
import { processes } from './process';
import { buildLongRunningNotificationOptions } from './prompt.notifications';
import type { IPromptContext } from './prompt.types';
import { kitState } from './state';

export function startLongRunningMonitorFlow(prompt: IPromptContext) {
  // Clear any existing timer first to avoid duplicates
  prompt.clearLongRunningMonitor();

  // Check for custom threshold from environment variables is handled in caller config

  // Skip monitoring for main script or if disabled
  if (
    prompt.isMainMenu ||
    (kitState?.kenvEnv as any)?.KIT_DISABLE_LONG_RUNNING_MONITOR === 'true' ||
    prompt.script?.longRunning === true
  ) {
    prompt.logInfo(`Skipping long-running monitor for ${prompt.scriptName}`);
    return;
  }

  if (
    !prompt.scriptPath ||
    prompt.scriptPath === '' ||
    !prompt.scriptName ||
    prompt.scriptName === 'script-not-set'
  ) {
    prompt.logInfo('Skipping long-running monitor for idle prompt (no valid script)');
    return;
  }

  if (!prompt.scriptStartTime) prompt.scriptStartTime = Date.now();
  prompt.hasShownLongRunningNotification = false;

  prompt.longRunningTimer = setTimeout(
    () => {
      if (!(prompt.hasShownLongRunningNotification || prompt.window?.isDestroyed())) {
        showLongRunningNotificationFlow(prompt);
        prompt.hasShownLongRunningNotification = true;
      }
    },
    prompt.longRunningThresholdMs,
  );

  prompt.logInfo(
    `Started long-running monitor for ${prompt.scriptName} (${prompt.longRunningThresholdMs}ms)`,
  );
}

export function clearLongRunningMonitorFlow(prompt: IPromptContext) {
  const timer = prompt.longRunningTimer;
  if (timer) {
    clearTimeout(timer);
    prompt.longRunningTimer = undefined;
    prompt.logInfo(`Cleared long-running monitor for ${prompt.scriptName}`);
  }
}

export function showLongRunningNotificationFlow(prompt: IPromptContext) {
  if (!prompt.scriptStartTime) return;

  if (
    !prompt.scriptName ||
    prompt.scriptName === 'script-not-set' ||
    !prompt.scriptPath ||
    prompt.scriptPath === ''
  ) {
    prompt.logInfo(`Skipping long-running notification for idle prompt (PID: ${prompt.pid})`);
    return;
  }

  const runningTimeMs = Date.now() - prompt.scriptStartTime;
  const runningTimeSeconds = Math.floor(runningTimeMs / 1000);
  const scriptName = prompt.scriptName || 'Unknown Script';

  let contextHint = '';
  if (prompt.ui === UI.term) contextHint = ' It appears to be running a terminal command.';
  else if (prompt.ui === UI.editor) contextHint = ' It appears to be in an editor session.';
  else if (prompt.promptData?.input?.includes('http')) contextHint = ' It might be making network requests.';
  else if (prompt.promptData?.input?.includes('file') || prompt.promptData?.input?.includes('path'))
    contextHint = ' It might be processing files.';
  else if (prompt.ui === UI.arg && (prompt.promptData as any)?.choices?.length === 0)
    contextHint = ' It might be waiting for user input.';

  prompt.logInfo(`Showing long-running notification for ${scriptName} (running for ${runningTimeSeconds}s)`);

  const notificationOptions = buildLongRunningNotificationOptions(
    scriptName,
    runningTimeSeconds,
    contextHint,
    process.platform === 'win32',
  );

  const notification = new Notification(notificationOptions);

  notification.on('action', (_event, index) => {
    if (index === 0) {
      prompt.logInfo(`User chose to terminate long-running script: ${scriptName}`);
      terminateLongRunningScriptFlow(prompt);
    } else if (index === 1) {
      prompt.logInfo(`User chose to keep running script: ${scriptName}`);
      prompt.hasShownLongRunningNotification = true;
    } else if (index === 2) {
      prompt.logInfo(`User chose "don't ask again" for script: ${scriptName}`);
      prompt.hasShownLongRunningNotification = true;
    }
  });

  notification.on('click', () => {
    prompt.logInfo(`Long-running notification clicked for: ${scriptName}`);
    prompt.focusPrompt();
  });

  notification.on('close', () => {
    prompt.logInfo(`Long-running notification closed for: ${scriptName}`);
    prompt.hasShownLongRunningNotification = true;
  });

  notification.show();
}

export function terminateLongRunningScriptFlow(prompt: IPromptContext) {
  prompt.logInfo(
    `Terminating long-running script: ${prompt.scriptName} (PID: ${prompt.pid})`,
  );
  clearLongRunningMonitorFlow(prompt);
  prompt.hideInstant();
  try {
    processes.removeByPid(prompt.pid, 'long-running script terminated by user');
  } catch {}
  emitter.emit(KitEvent.KillProcess, prompt.pid);
  const confirmNotification = new Notification({
    title: 'Script Terminated',
    body: `"${prompt.scriptName}" has been terminated.`,
    timeoutType: 'default',
  });
  confirmNotification.show();
}
