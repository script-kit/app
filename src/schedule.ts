import schedule, { Job } from 'node-schedule';

import log from 'electron-log';
import { Script } from '@johnlindquist/kit/types/core';
import { ProcessType } from '@johnlindquist/kit/cjs/enum';
import { kitPath } from '@johnlindquist/kit/cjs/utils';
import { runScript } from './kit';
import { scheduleMap } from './state';
import { processes } from './process';

export const sleepSchedule = () => {
  for (const [jobName, job] of Object.entries(schedule.scheduledJobs)) {
    log.info(`😴 Computer sleeping: ${jobName} won't run again until wake.`);
    job.cancel(false);
  }
  schedule.scheduledJobs = {};
  scheduleMap.clear();
};

export const scheduleDownloads = async () => {
  log.info(`schedule downloads`);
  runScript(kitPath('setup', 'downloads.js'));
};

export const cancelJob = (filePath: string) => {
  if (scheduleMap.has(filePath)) {
    log.info(`Unscheduling: ${filePath}`);
    const job = scheduleMap.get(filePath) as Job;
    job.cancel();
    scheduleMap.delete(filePath);
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

  if (scheduleMap.get(filePath)) {
    cancelJob(filePath);
  }

  try {
    if (scheduleString) {
      // log.info(`Schedule string ${scheduleString}:${filePath}`);

      const job = schedule.scheduleJob(filePath, scheduleString, () => {
        processes.add(ProcessType.Schedule, filePath);
      });

      log.info(`Scheduling: ${filePath} for ${scheduleString}`);
      scheduleMap.set(filePath, job);
    }
  } catch (error) {
    log.warn(error.message);
  }
};
