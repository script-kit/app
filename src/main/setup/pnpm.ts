import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { spawn, type SpawnOptions } from 'node:child_process';
import { kitPath } from '@johnlindquist/kit/core/utils';
import { createLogger } from '../../shared/log-utils';
const log = createLogger('pnpm.ts');

// Function to download a file
async function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.open(dest, 'w');
    https
      .get(url, async (response) => {
        const fileHandle = await file;
        const writeStream = fileHandle.createWriteStream();
        response.pipe(writeStream);
        writeStream.on('finish', async () => {
          await fileHandle.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlink(dest).catch(() => {});
        reject(err);
      });
  });
}

// Function to execute a command
async function exec(command: string, spawnOptions: SpawnOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, ...spawnOptions });
    let stdout = '';
    child.stdout?.on('data', (data) => (stdout += data.toString()));
    child.stderr?.on('data', (data) => console.error(`stderr: ${data}`));
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
  });
}

function detectPlatform(): string {
  const platform = process.platform.toLowerCase();

  switch (platform) {
    case 'linux': {
      if (process.env.LIBC !== undefined) {
        return 'linux';
      }
      return 'linuxstatic';
    }
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'win';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function detectArch(): string {
  const arch = process.arch;

  switch (arch) {
    case 'x64':
      return 'x64';
    case 'arm':
      return 'arm';
    case 'arm64':
      return 'arm64';
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }
}

function abort(...messages: string[]): never {
  console.error(messages.join('\n'));
  process.exit(1);
}

function isGlibcCompatible(): boolean {
  try {
    exec('getconf GNU_LIBC_VERSION')
      .then(() => true)
      .catch(() => false);
    exec('ldd --version')
      .then(() => true)
      .catch(() => false);
    return true;
  } catch (error) {
    return false;
  }
}

async function downloadAndInstall(): Promise<void> {
  log.info('Downloading and installing pnpm...');
  const platform = detectPlatform();
  const arch = detectArch();
  const version = process.env.PNPM_VERSION || (await getLatestVersion());

  const archiveUrl = `https://github.com/pnpm/pnpm/releases/download/v${version}/pnpm-${platform}-${arch}`;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pnpm-install-'));
  const tempFile = path.join(tempDir, platform === 'win' ? 'pnpm.exe' : 'pnpm');

  log.info(`Downloading pnpm binaries ${version}`);

  try {
    await download(archiveUrl, tempFile);

    // Make the file executable (for non-Windows platforms)
    if (platform !== 'win') {
      await fs.chmod(tempFile, 0o755);
    }

    log.info('Running setup...');
    await exec(`${tempFile} setup --force`, {
      env: {
        ...process.env,
        PNPM_HOME: kitPath(),
      },
    });
  } finally {
    // Clean up temporary files
    await fs.rm(tempDir, { recursive: true });
  }
}

async function getLatestVersion(): Promise<string> {
  log.info('Getting latest pnpm version...');
  const response = await fetch('https://registry.npmjs.org/@pnpm/exe');

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response data');
  }

  const distTags = data['dist-tags'];
  if (!distTags || typeof distTags !== 'object') {
    throw new Error('dist-tags property not found or invalid');
  }

  const latestVersion = distTags.latest;
  if (!latestVersion || typeof latestVersion !== 'string') {
    throw new Error('Latest version not found or invalid');
  }

  log.info(`Latest pnpm version: ${latestVersion}`);
  return latestVersion;
}

export async function setupPnpm() {
  try {
    await downloadAndInstall();
    log.info('Installation completed successfully!');
  } catch (error) {
    abort('Installation failed:', error instanceof Error ? error.message : String(error));
  }
}

// export async function setupPnpm() {
//   async function createWindowsWrapper(pnpmPath: string, symlinkPath: string): Promise<void> {
//     const cmdContent = `@echo off\n"${pnpmPath}" %*`;
//     await writeFile(symlinkPath, cmdContent, 'utf8');
//   }

//   try {
//     log.info('Installing pnpm locally...');
//     const pnpmPath = kitPath('node_modules', '.bin', 'pnpm');
//     const symlinkPath = kitPath(isWindows ? 'pnpm.cmd' : 'pnpm');

//     log.info('Creating symlink...');
//     if (isWindows) {
//       await createWindowsWrapper(pnpmPath, symlinkPath);
//     } else {
//       await ensureSymlink(pnpmPath, symlinkPath);
//     }

//     log.info('Configuring pnpm to use local Node.js version...');
//     try {
//       await spawnP(`pnpm config set use-node-version ${process.versions.node} --location project`, {
//         cwd: kenvPath(),
//       });
//       log.info('pnpm configuration updated successfully.');
//     } catch (configError) {
//       log.error('Failed to update pnpm configuration:', configError);
//       log.info('You may need to run this command manually after setup.');
//     }
//   } catch (error) {
//     log.error('An error occurred during setup:', error);
//     process.exit(1);
//   }

//   log.info(`Checking for stray ${kitPath('node')} directory...`);
//   try {
//     const nodeDir = kitPath('node');
//     if (await pathExists(nodeDir)) {
//       await remove(nodeDir);
//     }
//   } catch (error) {
//     log.error('An error occurred while checking/removing the node directory:', error);
//   }
// }
