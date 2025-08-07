export function shouldMonitorProcess(args: {
  scriptPath: string | undefined;
  scriptName: string | undefined;
  kenvEnv: Record<string, string | undefined> | undefined;
}): boolean {
  const { scriptPath, scriptName, kenvEnv } = args;
  if ((kenvEnv as any)?.KIT_DISABLE_PROCESS_MONITOR === 'true') return false;
  if (!scriptPath || scriptPath === '' || !scriptName || scriptName === 'script-not-set') return false;
  return true;
}

export function getProcessCheckInterval(
  kenvEnv: Record<string, string | undefined> | undefined,
  defaultMs: number,
): number {
  const customInterval = (kenvEnv as any)?.KIT_PROCESS_MONITOR_INTERVAL;
  if (customInterval) {
    const intervalMs = Number.parseInt(customInterval as string, 10) * 1000;
    if (!Number.isNaN(intervalMs) && intervalMs > 0) return intervalMs;
  }
  return defaultMs;
}

export function getLongRunningThresholdMs(
  kenvEnv: Record<string, string | undefined> | undefined,
  defaultMs: number,
): number {
  const customThreshold = (kenvEnv as any)?.KIT_LONG_RUNNING_THRESHOLD;
  if (customThreshold) {
    const thresholdMs = Number.parseInt(customThreshold as string, 10) * 1000;
    if (!Number.isNaN(thresholdMs) && thresholdMs > 0) return thresholdMs;
  }
  return defaultMs;
}


