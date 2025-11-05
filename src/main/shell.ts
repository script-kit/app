import path from 'node:path';
import log from 'electron-log';
import { shellEnv } from 'shell-env';

/**
 * Represents a clean shell environment captured from the user's shell
 */
export interface ShellEnvironment {
  /** Full environment variables from the shell */
  env: Record<string, string>;
  /** Original PATH from shell before Kit modifications */
  cleanPath: string;
}

/**
 * Cached shell environment loaded at app startup
 */
let cachedShellEnv: ShellEnvironment | null = null;

/**
 * Loads and caches the user's shell environment for use by external applications
 * @returns Promise resolving to the cached shell environment
 */
export const loadAndCacheShellEnv = async (): Promise<ShellEnvironment> => {
  try {
    log.info('Loading shell environment for external applications...');
    const shellEnvironment = await shellEnv();

    cachedShellEnv = {
      env: shellEnvironment,
      cleanPath: shellEnvironment.PATH || process.env.PATH || '',
    };

    log.info(`Shell environment cached. Clean PATH: ${cachedShellEnv.cleanPath}`);
    return cachedShellEnv;
  } catch (error) {
    log.error('Error loading shell environment:', error);

    // Fallback to minimal clean environment
    cachedShellEnv = {
      env: {
        HOME: process.env.HOME || '',
        USER: process.env.USER || '',
        SHELL: process.env.SHELL || '',
        PATH: process.env.PATH || '',
      },
      cleanPath: process.env.PATH || '',
    };

    return cachedShellEnv;
  }
};

/**
 * Gets the cached clean shell environment
 * @returns The cached shell environment or null if not loaded
 */
export const getCleanShellEnv = (): ShellEnvironment | null => cachedShellEnv;

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
