
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
    process.env = { ...process.env, ...newEnv };
    log.info(`PATH AFTER loading shellEnv: ${process.env.PATH}`);
    log.info('----------------------------------------');
  } catch (error) {
    log.error('Error loading shell environment variables:', error);
  }
};
