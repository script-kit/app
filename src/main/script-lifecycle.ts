export interface ScriptRunMeta {
  pid: number;
  runId: string;
  startedAt: number;
}

export const createRunMeta = (pid: number, runId: string): ScriptRunMeta => ({
  pid,
  runId,
  startedAt: Date.now(),
});

/**
 * Guard helper to ensure an incoming message matches the active run.
 */
export const isMatchingRun = (
  active: ScriptRunMeta | undefined,
  pid?: number | null,
  runId?: string | null,
) => {
  if (!active) return false;
  if (!pid || active.pid !== pid) return false;
  if (runId && active.runId !== runId) return false;

  return true;
};
