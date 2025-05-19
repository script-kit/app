// Name: Testing npm config updater

import '@johnlindquist/kit';

import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

type NpmConfigKey = 'registry' | 'use-node-version' | 'save-exact' | 'install-links';
export type NpmConfig = {
  [key in NpmConfigKey]?: string | boolean;
};

/**
 * Constructs the path to the .npmrc file based on the provided directory.
 *
 * @param directory - The directory where the .npmrc file is located or should be created.
 * @returns The full path to the .npmrc file.
 */
function getNpmrcPath(directory: string): string {
  return path.join(directory, '.npmrc');
}

/**
 * Reads the .npmrc file and returns its lines. If the file does not exist, returns an empty array.
 *
 * @param npmrcPath - The full path to the .npmrc file.
 * @returns An array of lines from the .npmrc file.
 */
async function readNpmrcFile(npmrcPath: string): Promise<string[]> {
  try {
    const data = await readFile(npmrcPath, 'utf-8');
    return data.split('\n');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // .npmrc doesn't exist
      return [];
    }
    throw err;
  }
}

/**
 * Updates the existing configuration lines with the new configuration.
 *
 * @param configLines - The current lines from the .npmrc file.
 * @param config - An object representing the configuration keys and values to set or update.
 * @returns The updated array of configuration lines.
 */
function updateConfigLines(configLines: string[], config: NpmConfig): string[] {
  const keysToUpdate = new Set(Object.keys(config));
  const updatedLines: string[] = [];

  let registryAlreadySet = false;

  for (const line of configLines) {
    const trimmedLine = line.trim();

    // Ignore comments and empty lines
    if (trimmedLine.startsWith('#') || trimmedLine.startsWith(';') || trimmedLine === '') {
      updatedLines.push(line);
      continue;
    }

    const [currentKey, ...valueParts] = line.split('=');
    const key = currentKey.trim();

    if (key === 'registry') {
      // If registry is already set, keep the existing value
      updatedLines.push(line);
      registryAlreadySet = true;
      keysToUpdate.delete('registry');
    } else if (keysToUpdate.has(key)) {
      // Update existing key with new value
      updatedLines.push(`${key}=${config[key as NpmConfigKey]}`);
      keysToUpdate.delete(key);
    } else {
      updatedLines.push(line);
    }
  }

  // Add any remaining keys that were not found, except for registry if it was already set
  for (const key of keysToUpdate) {
    if (key !== 'registry' || !registryAlreadySet) {
      updatedLines.push(`${key}=${config[key as NpmConfigKey]}`);
    }
  }

  return updatedLines;
}

/**
 * Writes the updated configuration lines to the .npmrc file.
 *
 * @param npmrcPath - The full path to the .npmrc file.
 * @param configLines - The updated array of configuration lines.
 */
async function writeNpmrcFile(npmrcPath: string, configLines: string[]): Promise<void> {
  const newContent = configLines.join('\n');
  await writeFile(npmrcPath, newContent, 'utf-8');
}

/**
 * Sets or updates configuration keys in the .npmrc file.
 * If the .npmrc file does not exist, it creates one.
 *
 * @param directory - The directory where the .npmrc file is located or should be created.
 * @param config - An object representing the configuration keys and values to set or update.
 */
export async function setNpmrcConfig(directory: string, config: NpmConfig): Promise<void> {
  const npmrcPath = getNpmrcPath(directory);
  const existingLines = await readNpmrcFile(npmrcPath);

  let updatedLines: string[];

  if (existingLines.length === 0) {
    // .npmrc doesn't exist, create it with the new key-value pairs
    updatedLines = Object.entries(config).map(([key, value]) => `${key}=${value}`);
  } else {
    updatedLines = updateConfigLines(existingLines, config);
  }

  await writeNpmrcFile(npmrcPath, updatedLines);
}
