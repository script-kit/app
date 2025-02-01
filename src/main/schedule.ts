import schedule, { type Job } from 'node-schedule';

import { kitPath } from '@johnlindquist/kit/core/utils';
import type { Script } from '@johnlindquist/kit/types/core';
import log from 'electron-log';
import { Trigger } from '../shared/enums';
import { runPromptProcess, runScript } from './kit';
import { kitState, online, scheduleMap } from './state';

// ADD THIS (new function to log the entire scheduleMap)
function logAllScheduledJobs() {
  const jobNames = Object.keys(schedule.scheduledJobs);
  log.info(`[SCHEDULE_MAP] Currently scheduled jobs: ${jobNames.length > 0 ? jobNames.join(', ') : '(none)'}`);
  for (const jobName of jobNames) {
    const job = schedule.scheduledJobs[jobName];
    if (job) {
      log.info(`- Job: "${jobName}", nextInvocation: ${job.nextInvocation()?.toString() || 'N/A'}`);
    }
  }
}

export const cancelJob = (filePath: string) => {
  if (!filePath) {
    return false;
  }
  let success = false;
  if (scheduleMap.has(filePath)) {
    // ADD THIS
    log.info(`[CANCEL_JOB] Attempting to unschedule job for: "${filePath}"`);

    const job = scheduleMap.get(filePath) as Job;
    if (job?.name) {
      try {
        success = schedule.cancelJob(job.name);
        job.cancelNext();
        job.cancel(true);
        // ADD THIS
        log.info(`[CANCEL_JOB] Success? ${success ? 'Yes' : 'No'} for "${filePath}"`);
      } catch (error) {
        log.error(`[CANCEL_JOB] Error canceling "${filePath}":`, error);
      }
    }
    scheduleMap.delete(filePath);
  }

  // ADD THIS
  logAllScheduledJobs();

  return success;
};

export const sleepSchedule = () => {
  // ADD THIS
  log.info('[SLEEP_SCHEDULE] Computer sleeping. Canceling all scheduled jobs...');

  for (const [filePath, job] of scheduleMap) {
    if (job?.name) {
      try {
        const cancelled = cancelJob(filePath);
        log.info(`[SLEEP_SCHEDULE] Cancelled job: "${job.name}" => ${cancelled ? 'success' : 'failed'}`);
      } catch (error) {
        log.error(`[SLEEP_SCHEDULE] Error canceling "${job.name}":`, error);
      }
    }
  }

  scheduleMap.clear();

  // ADD THIS
  logAllScheduledJobs();
};

let downloadsRunning = false;
export const scheduleDownloads = async () => {
  if (downloadsRunning) {
    log.info('[SCHEDULE_DOWNLOADS] Already running... Skipping downloads.js');
    return;
  }

  const isOnline = await online();
  if (!isOnline) {
    log.info('[SCHEDULE_DOWNLOADS] Not online... Skipping downloads.js');
    return;
  }

  try {
    log.info(`[SCHEDULE_DOWNLOADS] Running downloads script: ${kitPath('setup', 'downloads.js')}`);
    downloadsRunning = true;
    await runScript(kitPath('setup', 'downloads.js'), process.env.NODE_ENV === 'development' ? '--dev' : '');
    downloadsRunning = false;
    log.info('[SCHEDULE_DOWNLOADS] Finished running downloads.js');
  } catch (error) {
    log.error('[SCHEDULE_DOWNLOADS] Error:', error);
  }
};

export const cancelSchedule = (filePath: string) => {
  // ADD THIS
  log.info(`[CANCEL_SCHEDULE] Called for "${filePath}"`);
  cancelJob(filePath);
};

// Add this new function to re-schedule all scripts with schedules
export const rescheduleAllScripts = async () => {
  log.info('[RESCHEDULE_ALL] Re-scheduling all scripts with schedules...');
  const scripts = await getScripts();
  for (const script of scripts) {
    if (script.schedule) {
      log.info(`[RESCHEDULE_ALL] Found scheduled script: "${script.filePath}" with schedule: "${script.schedule}"`);
      scheduleScriptChanged(script);
    }
  }
};

export const scheduleScriptChanged = async ({ filePath, kenv, schedule: scheduleString }: Script) => {
  // If we already have a job for this script, clear it out
  if (scheduleMap.has(filePath)) {
    log.info(`[SCHEDULE_SCRIPT_CHANGED] Script exists. Reschedule: "${filePath}" => "${scheduleString}"`);
    cancelJob(filePath);
  }

  if (scheduleString) {
    log.info(`[SCHEDULE_SCRIPT_CHANGED] 📆 schedule: "${scheduleString}", script: "${filePath}"`);

    const scheduledFunction = () => {
      log.info(`[SCHEDULED_FUNCTION] Running script "${filePath}" at ${new Date().toISOString()}`);
      runPromptProcess(filePath, [], {
        force: false,
        trigger: Trigger.Schedule,
        sponsorCheck: false,
      });
    };

    // Use filePath as the job name for clarity
    const job = schedule.scheduleJob(filePath, scheduleString, scheduledFunction);

    log.info(`[SCHEDULE_SCRIPT_CHANGED] Scheduling job: "${filePath}" for cron: "${scheduleString}"`);
    scheduleMap.set(filePath, job);
  } else {
    log.info(`[SCHEDULE_SCRIPT_CHANGED] No scheduleString found for "${filePath}". Not scheduling.`);
  }

  logAllScheduledJobs();
};

export async function scheduleSelfCheck() {
  try {
    const scripts = await getScripts();
    const shouldBeScheduled = new Set<string>();

    for (const script of scripts) {
      if (script.schedule) {
        // Only schedule if no kenv or if trusted
        if (!script.kenv || script.kenv === '' || kitState.trustedKenvs.includes(script.kenv)) {
          shouldBeScheduled.add(script.filePath);

          if (scheduleMap.has(script.filePath)) {
            log.silly(`[WATCH_SCHEDULES] ${script.filePath} already scheduled, skipping...`);
          } else {
            log.info(`[WATCH_SCHEDULES] Missing schedule for ${script.filePath}. Re-scheduling...`);
            await scheduleScriptChanged(script);
          }
        } else if (scheduleMap.has(script.filePath)) {
          log.info(`[WATCH_SCHEDULES] Untrusting scheduled script ${script.filePath}. Cancelling job...`);
          cancelJob(script.filePath);
        }
      }
    }

    // Cancel any scheduled job that no longer should be scheduled.
    for (const [filePath] of scheduleMap.entries()) {
      if (!shouldBeScheduled.has(filePath)) {
        log.info(`[WATCH_SCHEDULES] ${filePath} no longer requires scheduling. Cancelling job...`);
        cancelJob(filePath);
      }
    }
  } catch (error) {
    log.error('[WATCH_SCHEDULES] Error in scheduleSelfCheck:', error);
  }
}
