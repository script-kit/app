import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as https from 'https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Hard-coded pnpm version
const PNPM_VERSION = '9.9.0';

function getPlatform(): string {
  const platform = os.platform();
  switch (platform) {
    case 'win32':
      return 'win';
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function getArchitecture(): string {
  const arch = os.arch();
  switch (arch) {
    case 'x64':
      return 'x64';
    case 'arm64':
      return 'arm64';
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }
}

async function downloadPnpm(version: string, platform: string, arch: string): Promise<string> {
  const fileName = platform === 'win' ? 'pnpm.exe' : 'pnpm';
  const url = `https://github.com/pnpm/pnpm/releases/download/v${version}/pnpm-${platform}-${arch}`;
  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'pnpm-'));
  const filePath = path.join(tempDir, fileName);

  return new Promise((resolve, reject) => {
    const request = https.get(url, (res) => {
      if (res.statusCode === 302) {
        https
          .get(res.headers.location!, (redirectRes) => {
            const fileStream = fs.createWriteStream(filePath);
            redirectRes.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close(() => resolve(filePath));
            });
          })
          .on('error', reject);
      } else {
        const fileStream = fs.createWriteStream(filePath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => resolve(filePath));
        });
      }
    });
    request.on('error', reject);
    request.end();
  });
}

async function setExecutablePermissions(filePath: string): Promise<void> {
  if (os.platform() !== 'win32') {
    await fsPromises.chmod(filePath, 0o755);
  }
}

async function runPnpmSetup(pnpmPath: string): Promise<void> {
  try {
    console.log(`Running pnpm setup with path: ${pnpmPath}`);
    const { stdout, stderr } = await execFileAsync(pnpmPath, ['setup']);
    console.log('pnpm setup stdout:', stdout);
    if (stderr) console.error('pnpm setup stderr:', stderr);
  } catch (error) {
    console.error('Error details:', error);
    throw new Error(`Failed to run pnpm setup: ${error}`);
  }
}

async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fsPromises.unlink(filePath);
    await fsPromises.rmdir(path.dirname(filePath));
  } catch (error) {
    console.warn(`Failed to cleanup temporary file: ${error}`);
  }
}

async function installPnpm(): Promise<void> {
  try {
    const platform = getPlatform();
    const arch = getArchitecture();

    console.log(`Installing pnpm version ${PNPM_VERSION} for ${platform}-${arch}`);

    const pnpmPath = await downloadPnpm(PNPM_VERSION, platform, arch);
    console.log(`pnpm downloaded to: ${pnpmPath}`);

    await setExecutablePermissions(pnpmPath);
    console.log('Executable permissions set');

    await runPnpmSetup(pnpmPath);
    await cleanupTempFile(pnpmPath);

    console.log('pnpm has been successfully installed!');
  } catch (error) {
    console.error('Failed to install pnpm:', error);
    process.exit(1);
  }
}

installPnpm()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
