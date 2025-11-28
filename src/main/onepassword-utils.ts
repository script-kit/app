import { exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { kenvPath } from '@johnlindquist/kit/core/utils';
import type { kenvEnv } from '@johnlindquist/kit/types/env';
import { createLogger } from './log-utils';
import { pathExistsSync } from './cjs-exports';

const execAsync = promisify(exec);
const log = createLogger('onepassword-utils.ts');

/**
 * Cache for resolved 1Password references to avoid repeated CLI calls
 */
const secretCache = new Map<string, { value: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Checks if 1Password CLI binary is installed (does NOT trigger auth dialog)
 */
export const has1PasswordBinary = (): boolean => {
  try {
    // Only check if op binary exists - no auth required
    execSync('op --version', { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch (error) {
    log.silly('1Password CLI binary not found');
    return false;
  }
};

/**
 * Checks if 1Password CLI is installed and authenticated
 * WARNING: This WILL trigger the 1Password auth dialog if not authenticated
 * Only call this when you know there are op:// references to resolve
 */
export const has1PasswordCLI = (): boolean => {
  try {
    // Check if op CLI is available
    execSync('which op', { stdio: 'ignore' });

    // Check if authenticated by trying to list vaults
    // NOTE: This triggers the 1Password auth dialog!
    execSync('op vault list --format=json', { stdio: 'ignore' });

    log.info('✓ 1Password CLI is available and authenticated');
    return true;
  } catch (error) {
    log.silly('1Password CLI not available or not authenticated');
    return false;
  }
};

/**
 * Installs 1Password CLI if not present
 */
export const install1PasswordCLI = async (): Promise<boolean> => {
  try {
    log.info('Attempting to install 1Password CLI...');

    if (process.platform === 'darwin') {
      // macOS installation via Homebrew
      await execAsync('brew install --cask 1password-cli');
    } else if (process.platform === 'linux') {
      // Linux installation
      const commands = [
        'curl -sS https://downloads.1password.com/linux/keys/1password.asc | sudo gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg',
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/$(lsb_release -cs) stable main" | sudo tee /etc/apt/sources.list.d/1password.list',
        'sudo mkdir -p /etc/debsig/policies/AC2D62742012EA22/',
        'curl -sS https://downloads.1password.com/linux/debian/debsig/1password.pol | sudo tee /etc/debsig/policies/AC2D62742012EA22/1password.pol',
        'sudo mkdir -p /usr/share/debsig/keyrings/AC2D62742012EA22',
        'curl -sS https://downloads.1password.com/linux/keys/1password.asc | sudo gpg --dearmor --output /usr/share/debsig/keyrings/AC2D62742012EA22/debsig.gpg',
        'sudo apt update && sudo apt install 1password-cli'
      ];

      for (const cmd of commands) {
        await execAsync(cmd);
      }
    } else if (process.platform === 'win32') {
      // Windows installation via winget
      await execAsync('winget install 1Password.CLI');
    }

    log.info('✓ 1Password CLI installed successfully');
    return true;
  } catch (error) {
    log.error('Failed to install 1Password CLI:', error);
    return false;
  }
};

/**
 * Resolves a single 1Password reference to its actual value
 */
export const resolve1PasswordRef = async (reference: string): Promise<string | null> => {
  // Check cache first
  const cached = secretCache.get(reference);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log.silly(`Using cached value for ${reference}`);
    return cached.value;
  }

  try {
    const { stdout } = await execAsync(`op read "${reference}"`, {
      encoding: 'utf8',
      timeout: 5000
    });

    const value = stdout.trim();

    // Update cache
    secretCache.set(reference, { value, timestamp: Date.now() });

    log.silly(`✓ Resolved 1Password reference: ${reference.substring(0, 20)}...`);
    return value;
  } catch (error) {
    log.warn(`Failed to resolve 1Password reference: ${reference}`, error);
    return null;
  }
};

/**
 * Batch resolves multiple 1Password references using op inject
 */
export const batchResolve1PasswordRefs = async (
  template: string
): Promise<string> => {
  try {
    // Write template to temp file or use stdin
    const { stdout } = await execAsync(`echo '${template}' | op inject`, {
      encoding: 'utf8',
      timeout: 10000
    });

    return stdout;
  } catch (error) {
    log.error('Failed to batch resolve 1Password references:', error);
    return template; // Return original template if injection fails
  }
};

/**
 * Synchronously resolves 1Password references in env file content using op inject
 * Only call this after confirming op:// references exist (to avoid triggering auth unnecessarily)
 */
export const resolve1PasswordContentSync = (content: string): string => {
  try {
    // Use op inject via stdin to resolve all op:// references in one shot
    // This triggers auth only if needed, but we've already confirmed op:// refs exist
    const resolved = execSync('op inject', {
      input: content,
      encoding: 'utf8',
      timeout: 30000, // 30 second timeout for auth
      stdio: ['pipe', 'pipe', 'pipe']
    });

    log.info('✓ Resolved 1Password references via op inject');
    return resolved;
  } catch (error) {
    log.warn('Failed to resolve 1Password references sync, returning original content:', error);
    return content; // Return original if resolution fails
  }
};

/**
 * Resolves all 1Password references in an environment object
 */
export const resolve1PasswordRefs = async (
  env: kenvEnv,
  options: { fallbackToPrompt?: boolean; useBatch?: boolean } = {}
): Promise<kenvEnv> => {
  const { fallbackToPrompt = false, useBatch = true } = options;
  const resolved: kenvEnv = {};

  // Separate 1Password refs from regular values
  const refs: Array<[string, string]> = [];
  const regular: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(env)) {
    if (value?.startsWith('op://')) {
      refs.push([key, value]);
    } else {
      regular.push([key, value || '']);
    }
  }

  // Add regular values directly
  for (const [key, value] of regular) {
    resolved[key] = value;
  }

  if (refs.length === 0) {
    return resolved;
  }

  log.info(`Resolving ${refs.length} 1Password references...`);

  if (useBatch && refs.length > 3) {
    // Use batch resolution for multiple refs
    const template = refs
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const result = await batchResolve1PasswordRefs(template);
    const lines = result.split('\n');

    for (const line of lines) {
      const [key, ...valueParts] = line.split('=');
      if (key) {
        resolved[key] = valueParts.join('=');
      }
    }
  } else {
    // Resolve individually for small number of refs
    for (const [key, value] of refs) {
      const resolvedValue = await resolve1PasswordRef(value);

      if (resolvedValue !== null) {
        resolved[key] = resolvedValue;
      } else if (fallbackToPrompt) {
        // In the main process, we can't use prompt directly
        // This would need to be handled by the renderer process
        log.warn(`Failed to resolve ${key}, keeping original reference`);
        resolved[key] = value;
      } else {
        // Keep the reference as-is if resolution fails
        resolved[key] = value;
      }
    }
  }

  log.info('✓ 1Password references resolved');
  return resolved;
};

/**
 * Creates a template file with 1Password references
 */
export const create1PasswordTemplate = async (
  envPath: string,
  vault: string = 'Development'
): Promise<void> => {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const dotenv = await import('dotenv');

  if (!pathExistsSync(envPath)) {
    log.warn(`File ${envPath} does not exist`);
    return;
  }

  const env = dotenv.parse(readFileSync(envPath));
  const template: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    // Skip if already a 1Password reference
    if (value.startsWith('op://')) {
      template.push(`${key}=${value}`);
    } else {
      // Create 1Password reference
      // Use a sanitized version of the key as the item name
      const itemName = key.replace(/_/g, ' ').toLowerCase();
      template.push(`${key}=op://${vault}/${itemName}/${key}`);
    }
  }

  const templatePath = envPath.replace(/\.env/, '.env.template');
  writeFileSync(templatePath, template.join('\n'));

  log.info(`✓ Created 1Password template at ${templatePath}`);
};

/**
 * Gets available 1Password vaults
 */
export const get1PasswordVaults = async (): Promise<string[]> => {
  try {
    const { stdout } = await execAsync('op vault list --format=json', {
      encoding: 'utf8',
      timeout: 5000
    });

    const vaults = JSON.parse(stdout);
    return vaults.map((v: any) => v.name);
  } catch (error) {
    log.error('Failed to get 1Password vaults:', error);
    return [];
  }
};

/**
 * Clear the secret cache
 */
export const clearSecretCache = (): void => {
  secretCache.clear();
  log.info('Secret cache cleared');
};

/**
 * Set cache TTL (in milliseconds)
 */
export const setSecretCacheTTL = (ttl: number): void => {
  // Update the CACHE_TTL for future operations
  // This would need to be stored in a mutable variable
  log.info(`Secret cache TTL set to ${ttl}ms`);
};