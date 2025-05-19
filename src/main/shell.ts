import path from 'node:path';
import log from 'electron-log';
import { shellEnv } from 'shell-env';

/**
 * Loads environment variables from the user's shell configuration file and updates process.env
 */
export const loadShellEnv = async (): Promise<void> => {
  try {
    const newEnv = await shellEnv();
    log.info('----------------------------------------');
    log.info(`PATH BEFORE loading shellEnv: ${process.env.PATH}`);
    log.info(`newEnv.PATH: ${newEnv?.PATH}`);

    if (newEnv?.PATH?.trim()) {
      const currentPath = process.env.PATH ? process.env.PATH.split(path.delimiter) : [];
      const newPaths = newEnv.PATH.split(path.delimiter).filter(Boolean);

      for (const p of newPaths) {
        const absolutePath = path.resolve(p);
        if (currentPath.includes(absolutePath)) {
          log.info(`Path already exists, skipping: ${absolutePath}`);
        } else {
          currentPath.push(absolutePath);
          log.info(`Appended new path: ${absolutePath}`);
        }
      }

      process.env.PATH = currentPath.join(path.delimiter);
      log.info(`PATH AFTER loading shellEnv: ${process.env.PATH}`);
    } else {
      log.info('No new PATH to append.');
    }

    log.info('----------------------------------------');
  } catch (error) {
    log.error('Error loading shell environment variables:', error);
  }
};
