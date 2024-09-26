import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';
import log from 'electron-log';
const execAsync = promisify(exec);

/**
 * Loads environment variables from the user's shell configuration file and updates process.env
 */
export const loadShellEnv = async (): Promise<void> => {
  try {
    // Determine the default shell
    const shellPath = process.env.SHELL || '/bin/bash';
    const shellName = path.basename(shellPath);

    // Determine the shell configuration file
    let shellConfigFile = '';
    if (shellName === 'bash') {
      shellConfigFile = path.resolve(os.homedir(), '.bashrc');
    } else if (shellName === 'zsh') {
      shellConfigFile = path.resolve(os.homedir(), '.zshrc');
    } else {
      log.warn(`Unsupported shell: ${shellName}. Defaulting to .bashrc.`);
      shellConfigFile = path.resolve(os.homedir(), '.bashrc');
    }

    // Check if the configuration file exists
    try {
      await fs.promises.access(shellConfigFile, fs.constants.R_OK);
    } catch {
      log.warn(`Configuration file ${shellConfigFile} does not exist or is not readable.`);
      return;
    }

    // Command to source the config file and print environment variables
    const command = `${shellName} -c 'source "${shellConfigFile}" && env'`;

    // Execute the command
    const { stdout } = await execAsync(command, {
      env: process.env,
      shell: shellPath,
    });

    // Parse the environment variables
    const newEnv = parseEnv(stdout);

    // Update process.env
    log.info(`PATH BEFORE: ${process.env.PATH}`);
    process.env = { ...process.env, ...newEnv };
    log.info(`PATH AFTER: ${process.env.PATH}`);
  } catch (error) {
    log.error('Error loading shell environment variables:', error);
  }
};

/**
 * Parses environment variables from a string.
 * Assumes each line is in the format KEY=VALUE
 */
const parseEnv = (envString: string): Record<string, string> => {
  const env: Record<string, string> = {};
  const lines = envString.split('\n');
  for (const line of lines) {
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) continue; // Skip lines without '='
    const key = line.substring(0, equalIndex).trim();
    const value = line.substring(equalIndex + 1).trim().replace(/^"(.+)"$/, '$1'); // Remove surrounding quotes
    if (key) {
      env[key] = value;
    }
  }
  return env;
};
