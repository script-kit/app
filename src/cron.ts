import { parseExpression } from 'cron-parser';
import { isEqual } from 'date-fns';
import { grep } from 'shelljs';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { CronJob } from 'cron';
import log from 'electron-log';
import { appScript } from './kit';

const cronMarker = 'Cron: ';

export const cronMap = new Map();

export const stopCron = (filePath: string) => {
  log.info(`Unscheduling cron: ${filePath}`);
  const job = cronMap.get(filePath);
  job.stop();

  cronMap.delete(filePath);
};

export const unlinkCron = (filePath: string) => {
  stopCron(filePath);
};

export const updateCron = (filePath: string) => {
  const { stdout } = grep(cronMarker, filePath);

  const cronSchedule = stdout
    .substring(0, stdout.indexOf('\n'))
    .substring(stdout.indexOf(cronMarker) + cronMarker.length)
    .trim();

  if (cronMap.get(filePath)) {
    stopCron(filePath);
  }

  try {
    if (cronSchedule) {
      const job = new CronJob(cronSchedule, () => {
        appScript(filePath, []);
      });

      log.info(`Scheduling cron: ${filePath} for ${cronSchedule}`);
      cronMap.set(filePath, job);
      job.start();
    }
  } catch (error) {
    log.warn(error.message);
  }
};

export const listCron = () => {};
