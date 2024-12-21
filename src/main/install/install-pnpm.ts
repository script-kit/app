#!/usr/bin/env node --loader ts-node/esm

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import axios from 'axios';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createLogger } from '../../shared/log-utils';

const log = createLogger('install-pnpm');

const execAsync = promisify(exec);

function abort(message: string): never {
  log.error(message);
  process.exit(1);
}

function isGlibcCompatible(): boolean {
  try {
    execAsync('getconf GNU_LIBC_VERSION');
    return true;
  } catch {
    try {
      execAsync('ldd --version');
      return true;
    } catch {
      return false;
    }
  }
}

type VersionData = {
  distTags: Record<string, string>;
  versions: Record<string, string>;
};

async function getVersionData(url: string): Promise<VersionData> {
  const response = await axios.get(url);
  return response.data;
}

function detectPlatform(): string {
  const platform = os.platform();
  switch (platform) {
    case 'linux':
      return isGlibcCompatible() ? 'linux' : 'linuxstatic';
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'win';
    default:
      abort(`Unsupported platform: ${platform}`);
  }
}

function detectArch(): string {
  let arch = os.arch();
  const is64Bit = os.arch() === 'x64' || os.arch() === 'arm64';

  if (os.platform() === 'win32') {
    return is64Bit ? 'x64' : 'i686';
  }

  switch (arch) {
    case 'x64':
    case 'amd64':
      arch = 'x64';
      break;
    case 'arm':
    case 'arm64':
    case 'aarch64':
      arch = is64Bit ? 'arm64' : 'arm';
      break;
  }

  if (arch !== 'x64' && arch !== 'arm64') {
    abort('Sorry! pnpm currently only provides pre-built binaries for x86_64/arm64 architectures.');
  }

  return arch;
}

const PNPM_VERSION = '9.15.1';

export async function downloadAndInstallPnpm(): Promise<void> {
  const platform = detectPlatform();
  const arch = detectArch();

  const versionData = await getVersionData('https://registry.npmjs.org/@pnpm/exe');

  let version: string;
  const preferredVersion = process.env?.PNPM_VERSION || PNPM_VERSION;

  if (versionData['dist-tags'][preferredVersion]) {
    version = versionData['dist-tags'][preferredVersion];
  } else if (versionData.versions[preferredVersion]) {
    version = preferredVersion;
  } else {
    abort(
      `Version '${preferredVersion}' not found. Available versions: ${Object.keys(versionData.versions).join(', ')}`,
    );
  }

  const pnpmName = platform === 'win' ? 'pnpm.exe' : 'pnpm';
  let archiveUrl = `https://github.com/pnpm/pnpm/releases/download/v${version}/pnpm-${platform}-${arch}`;
  if (platform === 'win') {
    archiveUrl += '.exe';
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pnpm-'));
  const tmpFile = path.join(tmpDir, pnpmName);

  try {
    log.info(`Downloading pnpm binaries ${version}`);
    const response = await axios.get(archiveUrl, {
      responseType: 'arraybuffer',
    });
    await fs.writeFile(tmpFile, response.data);

    if (platform !== 'win') {
      await fs.chmod(tmpFile, 0o755);
    }

    const kitPnpmHome =
      process.env.KIT_PNPM_HOME ||
      (platform === 'win' ? path.join(process.env.USERPROFILE || '', '.kit') : path.join(os.homedir(), '.kit'));
    const newExecPath = path.join(kitPnpmHome, pnpmName);

    if (path.resolve(newExecPath) !== path.resolve(tmpFile)) {
      log.info(`Copying pnpm CLI from ${tmpFile} to ${newExecPath}`);
      await fs.mkdir(kitPnpmHome, { recursive: true });
      await fs.copyFile(tmpFile, newExecPath);
    }

    log.info(`Successfully installed pnpm to ${newExecPath}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function setPnpmStoreDir(pnpmPath: string): Promise<void> {
  const storePathCommand = 'pnpm store path';
  log.info(`Running command to check for existing pnpm store: ${storePathCommand}`);
  let stdout = '';
  let stderr = '';
  try {
    const { stdout: _stdout, stderr: _stderr } = await execAsync(storePathCommand);
    stdout = _stdout?.trim() || '';
    stderr = _stderr?.trim() || '';
  } catch (error) {
    log.warn(`Error getting pnpm store path: ${stderr}`);
  }
  log.info(`pnpm store path: ${stdout}`);
  if (stdout.endsWith('v3')) {
    log.info(`Found pnpm store path, setting store-dir to ${stdout}`);
    const command = `"${pnpmPath}" config set store-dir "${stdout}"`;
    log.info(`Running command: ${command}`);
    let storeStdout = '';
    let storeStderr = '';
    try {
      const { stdout: _stdout, stderr: _stderr } = await execAsync(command);
      storeStdout = _stdout?.trim() || '';
      storeStderr = _stderr?.trim() || '';
      log.info(`store-dir set output: ${storeStdout}`);
    } catch (error) {
      log.warn(`Error setting pnpm store-dir: ${storeStderr}`);
    }
  }
}
