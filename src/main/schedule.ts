import schedule, { Job } from 'node-schedule';

import log from 'electron-log';
import { Script } from '@johnlindquist/kit/types/core';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { runPromptProcess, runScript } from './kit';
import { kitState, online, scheduleMap } from '../shared/state';
import { Trigger } from '../shared/enums';

export const cancelJob = (filePath: string) => {
  if (!filePath) return false;
  let success = false;
  if (scheduleMap.has(filePath)) {
    log.info(`Unscheduling: ${filePath}`);
    const job = scheduleMap.get(filePath) as Job;
    if (job && job?.name) {
      try {
        success = schedule.cancelJob(job.name);
        job.cancelNext();
        job.cancel(true);
      } catch (error) {
        log.error(error);
      }
    }
    scheduleMap.delete(filePath);
  }

  return success;
};

export const sleepSchedule = () => {
  // for (const [jobName, job] of Object.entries(schedule.scheduledJobs)) {
  //   job.cancelNext();
  //   job.cancel(true);
  //   const cancelled = schedule.cancelJob(jobName);

  //   scheduleMap.delete(jobName);
  // }

  for (const [filePath, job] of scheduleMap) {
    if (job && job.name) {
      try {
        const cancelled = cancelJob(filePath);
        log.info(
          `😴 Computer sleeping: ${
            job.name
          } won't run again until wake. Cancel Success? ${
            cancelled ? 'Yes' : 'No'
          }`
        );
      } catch (error) {
        log.error(error);
      }
    }
  }

  scheduleMap.clear();
};

export const scheduleDownloads = async () => {
  log.info(`schedule downloads`);
  const isOnline = await online();
  if (!isOnline) return;

  try {
    log.info(`Running downloads script: ${kitPath('setup', 'downloads.js')}`);
    runScript(
      kitPath('setup', 'downloads.js'),
      process.env.NODE_ENV === 'development' ? '--dev' : ''
    );
  } catch (error) {
    log.error(error);
  }
};

export const cancelSchedule = (filePath: string) => {
  cancelJob(filePath);
};

export const scheduleScriptChanged = ({
  filePath,
  kenv,
  schedule: scheduleString,
}: Script) => {
  if (scheduleMap.has(filePath)) {
    log.info(
      `Schedule script exists. Reschedule: ${filePath} ${scheduleString}`
    );
    cancelJob(filePath);
  }

  if (kenv !== '' && !kitState.trustedKenvs.includes(kenv)) {
    if (scheduleString) {
      log.info(
        `Ignoring ${filePath} // Schedule metadata because it's not trusted.`
      );
      log.info(
        `Add "${kitState.trustedKenvsKey}=${kenv}" to your .env file to trust it.`
      );
    }

    return;
  }

  try {
    if (scheduleString) {
      // log.info(`Schedule script changed: ${filePath} ${scheduleString}`);
      // for (const [key, value] of scheduleMap.entries()) {
      //   log.info({
      //     key,
      //     value: value.name,
      //     pending: (value?.pendingInvocations as any).map(
      //       (i: any) => i.fireDate
      //     ),
      //   });
      // }

      log.info(`📆 Schedule string ${scheduleString}:${filePath}`);

      const scheduledFunction = () => {
        // log.info(`Running: ${filePath}`, Object.entries(scheduleMap));
        // processes.add(ProcessType.Schedule, filePath);
        runPromptProcess(filePath, [], {
          force: false,
          trigger: Trigger.Schedule,
        });
      };

      const job = schedule.scheduleJob(
        filePath,
        scheduleString,
        scheduledFunction
      );

      log.info(`Scheduling: ${filePath} for ${scheduleString}`);
      scheduleMap.set(filePath, job);
    }
  } catch (error) {
    log.warn((error as any)?.message);
  }
};
