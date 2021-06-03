import schedule, { Job } from 'node-schedule';

import { grep } from 'shelljs';
import log from 'electron-log';
import { createChild } from './run';
import { ProcessType } from './enums';
import { scheduleMap } from './state';
import { createMessageHandler } from './messages';

const scheduleMarker = 'Schedule: ';

export const cancelJob = (filePath: string) => {
  log.info(`Unscheduling: ${filePath}`);
  const job = scheduleMap.get(filePath) as Job;
  job.cancel();
  scheduleMap.delete(filePath);
};

export const cancelSchedule = (filePath: string) => {
  cancelJob(filePath);
};

export const updateSchedule = (filePath: string) => {
  const { stdout } = grep(scheduleMarker, filePath);

  const scheduleString = stdout
    .substring(0, stdout.indexOf('\n'))
    .substring(stdout.indexOf(scheduleMarker) + scheduleMarker.length)
    .trim();

  if (scheduleMap.get(filePath)) {
    cancelJob(filePath);
  }

  try {
    if (scheduleString) {
      // log.info(`Schedule string ${scheduleString}:${filePath}`);

      const job = schedule.scheduleJob(filePath, scheduleString, () => {
        const child = createChild({
          type: ProcessType.Schedule,
          scriptPath: filePath,
          runArgs: [],
        });

        child?.on('message', createMessageHandler(ProcessType.Schedule));
      });

      log.info(`Scheduling: ${filePath} for ${scheduleString}`);
      scheduleMap.set(filePath, job);
    }
  } catch (error) {
    log.warn(error.message);
  }
};
