import { readFileSync } from 'node:fs';
import { kenvPath } from '@johnlindquist/kit/core/utils';
import type { kenvEnv } from '@johnlindquist/kit/types/env';
import dotenv from 'dotenv';
import { pathExistsSync } from './cjs-exports';
import { createLogger } from './log-utils';
import { has1PasswordBinary, has1PasswordCLI, resolve1PasswordContentSync, resolve1PasswordRefs } from './onepassword-utils';

const log = createLogger('env-utils.ts');

/**
 * Checks if any environment values contain 1Password references (op:// pattern)
 * This is a cheap string scan that doesn't invoke the 1Password CLI
 */
const hasOpReferences = (env: kenvEnv): boolean => {
  for (const value of Object.values(env)) {
    if (value && typeof value === 'string' && value.includes('op://')) {
      return true;
    }
  }
  return false;
};

/**
 * Loads environment variables from .env and .env.kit files in the kenv directory.
 * Prioritizes .env.kit variables over .env variables if both exist.
 * Automatically resolves 1Password references if CLI is available AND op:// refs exist.
 * @returns An object containing the loaded environment variables.
 */
export const loadKenvEnvironment = async (): Promise<kenvEnv> => {
  let envData: kenvEnv = {};
  // Left to right priority
  const envFiles = ['.env.local', '.env.development', '.env.production', '.env', '.env.kit'].reverse();

  // First pass: Load all env files without checking 1Password
  for (const file of envFiles) {
    const filePath = kenvPath(file);
    if (pathExistsSync(filePath)) {
      log.info(`🔍 Loading .env data from ${filePath}`);
      const fileData = dotenv.parse(readFileSync(filePath)) as kenvEnv;
      envData = { ...envData, ...fileData };
    }
  }

  // Only check 1Password if there are op:// references (avoids triggering auth dialog)
  if (hasOpReferences(envData)) {
    log.info('🔐 Found op:// references in environment, checking 1Password...');

    // First check if the binary exists (doesn't trigger auth)
    if (!has1PasswordBinary()) {
      log.warn('1Password CLI not installed, op:// references will not be resolved');
      return envData;
    }

    // Now check if authenticated (this may trigger auth dialog, but only when needed)
    if (has1PasswordCLI()) {
      log.info('🔐 Resolving 1Password references...');
      envData = await resolve1PasswordRefs(envData, {
        useBatch: true,
        fallbackToPrompt: false
      });
    } else {
      log.warn('1Password CLI not authenticated, op:// references will not be resolved');
    }
  }

  return envData;
};

/**
 * Synchronous version that loads environment and resolves 1Password refs if present.
 * Uses lazy checking: only invokes 1Password CLI if op:// references are detected.
 * This prevents the 1Password auth dialog from appearing when no secrets are needed.
 */
export const loadKenvEnvironmentSync = (): kenvEnv => {
  let envData: kenvEnv = {};
  // Left to right priority
  const envFiles = ['.env.local', '.env.development', '.env.production', '.env', '.env.kit'].reverse();

  // First pass: collect all raw file contents
  let combinedContent = '';
  const fileContents: Array<{ file: string; content: string }> = [];

  for (const file of envFiles) {
    const filePath = kenvPath(file);
    if (pathExistsSync(filePath)) {
      log.info(`🔍 Loading .env data from ${filePath}`);
      const content = readFileSync(filePath, 'utf-8');
      fileContents.push({ file, content });
      combinedContent += content + '\n';
    }
  }

  // Check if any content has op:// references (cheap string scan)
  const hasOpRefs = combinedContent.includes('op://');

  if (hasOpRefs) {
    log.info('🔐 Found op:// references in environment, checking 1Password...');

    // Check if op binary exists (doesn't trigger auth dialog)
    if (has1PasswordBinary()) {
      log.info('🔐 Resolving 1Password references...');
      // Resolve all files with op inject (may trigger auth, but only when needed)
      for (const { file, content } of fileContents) {
        const resolvedContent = resolve1PasswordContentSync(content);
        const fileData = dotenv.parse(resolvedContent) as kenvEnv;
        envData = { ...envData, ...fileData };
      }
    } else {
      log.warn('1Password CLI not installed, op:// references will not be resolved');
      // Parse without resolution
      for (const { content } of fileContents) {
        const fileData = dotenv.parse(content) as kenvEnv;
        envData = { ...envData, ...fileData };
      }
    }
  } else {
    // Fast path: no 1Password refs, just parse normally
    for (const { content } of fileContents) {
      const fileData = dotenv.parse(content) as kenvEnv;
      envData = { ...envData, ...fileData };
    }
  }

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
