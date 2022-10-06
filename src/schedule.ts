import schedule, { Job } from 'node-schedule';
import { existsSync } from 'fs';

import log from 'electron-log';
import { Script } from '@johnlindquist/kit/types/core';
import { ProcessType } from '@johnlindquist/kit/cjs/enum';
import { kitPath, kenvPath } from '@johnlindquist/kit/cjs/utils';
import { runPromptProcess, runScript } from './kit';
import { online, scheduleMap } from './state';
import { processes } from './process';
import { Trigger } from './enums';

export const cancelJob = (filePath: string) => {
  let success = false;
  if (scheduleMap.has(filePath)) {
    log.info(`Unscheduling: ${filePath}`);
    const job = scheduleMap.get(filePath) as Job;
    success = schedule.cancelJob(job.name);
    job.cancelNext();
    job.cancel(true);
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
    const cancelled = cancelJob(filePath);
    log.info(
      `😴 Computer sleeping: ${
        job.name
      } won't run again until wake. Cancel Success? ${cancelled ? 'Yes' : 'No'}`
    );
  }

  scheduleMap.clear();
};

export const scheduleDownloads = async () => {
  log.info(`schedule downloads`);
  const isOnline = await online();
  if (!isOnline) return;

  try {
    runScript(kitPath('setup', 'downloads.js'));
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
  if (kenv !== '') return;

  if (scheduleMap.has(filePath)) {
    log.info(
      `Schedule script exists. Reschedule: ${filePath} ${scheduleString}`
    );
    cancelJob(filePath);
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
