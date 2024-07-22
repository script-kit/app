import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { kenvPath } from '@johnlindquist/kit/core/utils';
import type { kenvEnv } from '@johnlindquist/kit/types/env';
import { pathExistsSync } from './cjs-exports';
import { createLogger } from '../shared/log-utils';

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
