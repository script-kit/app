import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { arch, platform } from 'node:os';
import { join } from 'node:path';
import { chmod, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import log from 'electron-log';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { kitPath } from '@johnlindquist/kit/core/utils';
import os from 'node:os';
import { default as pnpm } from '@pnpm/exec';
import { existsSync } from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

async function detectPlatform(): Promise<string> {
  log.info('Detecting platform...');
  const osType = platform();
  if (osType === 'win32') return 'win';
  if (osType === 'darwin') return 'macos';
  if (osType === 'linux') {
    // Check if it's glibc compatible
    try {
      await execFileAsync('getconf', ['GNU_LIBC_VERSION']);
      return 'linux';
    } catch {
      try {
        await execFileAsync('ldd', ['--version']);
        return 'linux';
      } catch {
        return 'linuxstatic';
      }
    }
  }
  throw new Error(`Unsupported platform: ${osType}`);
}

function detectArch(): string {
  log.info('Detecting architecture...');
  const cpuArch = arch();
  switch (cpuArch) {
    case 'x64':
      return 'x64';
    case 'arm64':
      return 'arm64';
    default:
      throw new Error(`Unsupported architecture: ${cpuArch}`);
  }
}

async function getLatestVersion(): Promise<string> {
  log.info('Fetching latest pnpm version...');
  const response = await fetch('https://registry.npmjs.org/@pnpm/exe');
  const data = await response.json();
  return data['dist-tags'].latest;
}

export async function setupPnpm(): Promise<void> {
  let tempFile: string | undefined;
  try {
    log.info('Starting pnpm setup...');
    const platform = await detectPlatform();
    const arch = detectArch();
    const version = process.env.PNPM_VERSION || (await getLatestVersion());

    log.info(`Platform: ${platform}, Architecture: ${arch}, Version: ${version}`);

    const archiveUrl = `https://github.com/pnpm/pnpm/releases/download/v${version}/pnpm-${platform}-${arch}`;
    const fileName = platform === 'win' ? 'pnpm.exe' : 'pnpm';

    log.info(`Downloading pnpm from: ${archiveUrl}`);
    const response = await fetch(archiveUrl);
    if (!response.ok) {
      throw new Error(`Failed to download pnpm: ${response.statusText}`);
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'pnpm-'));
    tempFile = join(tempDir, fileName);

    log.info(`Saving pnpm to temporary file: ${tempFile}`);
    const fileStream = createWriteStream(tempFile);
    await pipeline(response.body, fileStream);

    if (platform !== 'win') {
      log.info('Setting execute permissions...');
      await chmod(tempFile, '755');
    }

    log.info('Running pnpm setup...');
    try {
      const { stdout, stderr } = await execFileAsync(tempFile, ['setup', '--force'], {
        env: {
          ...process.env,
          SHELL: process.env.SHELL || '/bin/bash',
        },
        shell: true,
      });
      log.info('pnpm setup stdout:', stdout);
      if (stderr) log.warn('pnpm setup stderr:', stderr);

      // Parse stdout correctly
      const stdoutStr = stdout.toString();
      const potentialPaths = stdoutStr
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.endsWith('pnpm') || line.endsWith('pnpm.exe') || line.endsWith('pnpm.cmd'))
        .map((line) => {
          const parts = line.split(' ');
          return parts[parts.length - 1];
        });

      // Verify paths and use the first valid one
      let pnpmPath = potentialPaths.find((p) => existsSync(p));

      // Fallback to default path if no valid path found
      if (pnpmPath) {
        log.info(`Found valid pnpm path: ${pnpmPath}`);
      } else {
        pnpmPath = path.resolve(os.homedir(), 'Library', 'pnpm', 'pnpm');
        log.warn(`No valid pnpm path found in stdout. Using default: ${pnpmPath}`);
      }

      // Create a cross-platform symlink
      if (process.platform === 'win32') {
        // On Windows, use mklink command
        await execFileAsync('cmd', ['/c', 'mklink', kitPath('pnpm'), pnpmPath], { shell: true });
      } else {
        // On Unix-like systems, use symlink
        await symlink(pnpmPath, kitPath('pnpm'));
      }

      // Test if the symlink worked by running pnpm --version
      try {
        const { stdout: versionOutput } = await execFileAsync(kitPath('pnpm'), ['--version'], { shell: true });
        log.info(`pnpm version check successful: ${versionOutput.trim()}`);
      } catch (error) {
        log.error('Error checking pnpm version:', error);
        throw new Error('Failed to verify pnpm installation');
      }

      log.info(`pnpm installed at: ${pnpmPath}`);

      log.info('Cleaning up temporary files...');
      await rm(tempDir, { recursive: true, force: true });

      log.info('pnpm setup completed successfully');
    } catch (setupError) {
      log.error('Error during pnpm setup command:', setupError);
      log.info('Attempting to run pnpm directly...');
      try {
        const { stdout, stderr } = await execFileAsync(tempFile, ['--version'], {
          env: {
            ...process.env,
            SHELL: process.env.SHELL || '/bin/bash',
          },
          shell: true,
        });
        log.info('pnpm version:', stdout.trim());
        if (stderr) log.warn('pnpm version stderr:', stderr);
      } catch (versionError) {
        log.error('Error running pnpm directly:', versionError);
      }
      throw setupError;
    }
  } catch (error) {
    log.error('Error during pnpm setup:', error);
    log.info('Current working directory:', process.cwd());
    if (tempFile) {
      log.info('Temp file path:', tempFile);
    }
    log.info('Environment variables:', JSON.stringify(process.env, null, 2));
    throw error;
  }
}
