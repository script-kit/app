import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { kenvPath } from '@johnlindquist/kit/core/utils';
import type { kenvEnv } from '@johnlindquist/kit/types/env';
import { pathExistsSync } from './cjs-exports';
import { createLogger } from './log-utils';

const log = createLogger('env-utils.ts');

/**
 * Loads environment variables from .env and .env.kit files in the kenv directory.
 * Prioritizes .env.kit variables over .env variables if both exist.
 * @returns An object containing the loaded environment variables.
 */
export const loadKenvEnvironment = (): kenvEnv => {
  let envData: kenvEnv = {};
  const envFiles = ['.env.local', '.env.development', '.env.production', '.env', '.env.kit'];

  for (const file of envFiles) {
    const filePath = kenvPath(file);
    if (pathExistsSync(filePath)) {
      log.info(`🔍 Loading .env data from ${filePath}`);
      const fileData = dotenv.parse(readFileSync(filePath)) as kenvEnv;
      envData = { ...envData, ...fileData };
    }
  }

  // log.info(`Loaded`, envData);

  return envData;
};

import { shellEnv } from 'shell-env';

interface ShellEnvType {
  [key: string]: string | undefined;
}

export async function getAllShellEnvs(): Promise<ShellEnvType> {
  const allEnvs: ShellEnvType = {};
  const shells = ['/bin/bash', '/bin/zsh', '/usr/bin/fish']; // Unix shells.
  // Add Windows if we're on that OS and looking for Git Bash.
  if (process.platform === 'win32') {
    const gitBashPath = path.join(process.env.ProgramFiles || '', 'Git', 'bin', 'bash.exe');
    shells.push(gitBashPath);
  }

  for (const shell of shells) {
    try {
      const env = await shellEnv(shell);
      Object.assign(allEnvs, env);
      log.info(`Successfully loaded environment variables from ${shell}`);
    } catch (error) {
      if (error instanceof Error) {
        log.silly(`Error loading environment variables from ${shell}: ${error.message}`);
      } else {
        log.silly(`An unknown error occurred while loading environment variables from ${shell}`);
      }
    }
  }

  // Merge Node process.env
  Object.assign(allEnvs, process.env);
  return allEnvs;
}
