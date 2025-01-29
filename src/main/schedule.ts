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
  log.info(`[SCHEDULE_MAP] Currently scheduled jobs: ${jobNames.length ? jobNames.join(', ') : '(none)'}`);
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
  log.info(`[SLEEP_SCHEDULE] Computer sleeping. Canceling all scheduled jobs...`);

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

export const scheduleScriptChanged = ({ filePath, kenv, schedule: scheduleString }: Script) => {
  // If we already have a job for this script, clear it out
  if (scheduleMap.has(filePath)) {
    log.info(`[SCHEDULE_SCRIPT_CHANGED] Script exists. Reschedule: "${filePath}" => "${scheduleString}"`);
    cancelJob(filePath);
  }

  // If script belongs to a Kenv that isn’t trusted, skip scheduling
  if (kenv !== '' && !kitState.trustedKenvs.includes(kenv)) {
    if (scheduleString) {
      log.info(`[SCHEDULE_SCRIPT_CHANGED] Ignoring schedule for "${filePath}" because it's not trusted.`);
      log.info(`Add "${kitState.trustedKenvsKey}=${kenv}" to your .env file to trust it.`);
    }
    return;
  }

  try {
    if (scheduleString) {
      log.info(`[SCHEDULE_SCRIPT_CHANGED] 📆 schedule: "${scheduleString}", script: "${filePath}"`);

      const scheduledFunction = () => {
        // ADD THIS
        log.info(`[SCHEDULED_FUNCTION] Running script "${filePath}" at ${new Date().toISOString()}`);

        runPromptProcess(filePath, [], {
          force: false,
          trigger: Trigger.Schedule,
          sponsorCheck: false,
        });
      };

      // This uses filePath as the job name
      const job = schedule.scheduleJob(filePath, scheduleString, scheduledFunction);

      log.info(`[SCHEDULE_SCRIPT_CHANGED] Scheduling job: "${filePath}" for cron: "${scheduleString}"`);
      scheduleMap.set(filePath, job);
    } else {
      // ADD THIS
      log.info(`[SCHEDULE_SCRIPT_CHANGED] No scheduleString found for "${filePath}". Not scheduling.`);
    }
  } catch (error) {
    log.warn(`[SCHEDULE_SCRIPT_CHANGED] Error scheduling "${filePath}":`, error);
  }

  // ADD THIS
  logAllScheduledJobs();
};
