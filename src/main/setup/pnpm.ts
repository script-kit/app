import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { arch, platform } from 'node:os';
import { join } from 'node:path';
import { chmod, mkdtemp, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import log from 'electron-log';
import { accessSync, constants, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { kitPath, kitPnpmPath } from '@johnlindquist/kit/core/utils';
import os from 'node:os';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createPathResolver } from '@johnlindquist/kit/core/utils';
import { kitState } from '../state';
import { invoke } from '../invoke-pty';
import { installPnpm } from '../install';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

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

    // Detect the current platform (win, macos, linux, or linuxstatic)
    const platform = await detectPlatform();

    // Detect the CPU architecture (x64 or arm64)
    const arch = detectArch();

    // Get the pnpm version to install (from env variable or fetch latest)
    const version = process.env.PNPM_VERSION || (await getLatestVersion());

    log.info(`Platform: ${platform}, Architecture: ${arch}, Version: ${version}`);

    // Construct the URL for downloading pnpm binary
    const archiveUrl = `https://github.com/pnpm/pnpm/releases/download/v${version}/pnpm-${platform}-${arch}`;
    const fileName = platform === 'win' ? 'pnpm.exe' : 'pnpm';

    log.info(`Downloading pnpm from: ${archiveUrl}`);
    // Fetch the pnpm binary
    const response = await fetch(archiveUrl);
    if (!response.ok) {
      throw new Error(`Failed to download pnpm: ${response.statusText}`);
    }

    // Create a temporary directory to store the downloaded pnpm binary
    const tempDir = await mkdtemp(join(tmpdir(), 'pnpm-'));
    tempFile = join(tempDir, fileName);

    log.info(`Saving pnpm to temporary file: ${tempFile}`);
    // Save the downloaded binary to the temporary file
    const fileStream = createWriteStream(tempFile);
    await pipeline(response.body, fileStream);

    // Set execute permissions for non-Windows platforms
    if (platform !== 'win') {
      log.info('Setting execute permissions...');
      await chmod(tempFile, '755');
    }

    log.info('Running pnpm setup...');
    try {
      // Execute pnpm setup command
      const { stdout, stderr } = await execFileAsync(tempFile, ['setup', '--force'], {
        env: {
          ...process.env,
          SHELL: process.env.SHELL || '/bin/bash',
        },
        shell: true,
      });
      log.info('pnpm setup stdout:', stdout);
      if (stderr) log.warn('pnpm setup stderr:', stderr);

      // Parse stdout to find potential pnpm installation paths
      const stdoutStr = stdout.toString();
      const potentialPaths = stdoutStr
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.endsWith('pnpm') || line.endsWith('pnpm.exe') || line.endsWith('pnpm.cmd'))
        .map((line) => {
          const parts = line.split(' ');
          return parts[parts.length - 1];
        });

      // Find the first valid pnpm path
      let pnpmPath = potentialPaths.find((p) => existsSync(p));

      // If no valid path found, use a default path
      if (pnpmPath) {
        log.info(`Found valid pnpm path: ${pnpmPath}`);
      } else {
        pnpmPath = path.resolve(os.homedir(), 'Library', 'pnpm', 'pnpm');
        log.warn(`No valid pnpm path found in stdout. Using default: ${pnpmPath}`);
      }

      // Call the new symlinkPnpm function
      await symlinkPnpm(pnpmPath);

      log.info(`pnpm installed at: ${pnpmPath}`);

      // Clean up temporary files
      log.info('Cleaning up temporary files...');
      await rm(tempDir, { recursive: true, force: true });

      log.info('pnpm setup completed successfully');
    } catch (setupError) {
      // If setup fails, try to run pnpm directly to get more information
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
    // Log detailed error information
    log.error('Error during pnpm setup:', error);
    log.info('Current working directory:', process.cwd());
    if (tempFile) {
      log.info('Temp file path:', tempFile);
    }
    log.info('Environment variables:', JSON.stringify(process.env, null, 2));
    throw error;
  }
}

export async function symlinkPnpm(pnpmPath: string): Promise<void> {
  log.info(`Symlinking pnpm to .kit/pnpm is currently disabled. Relying on PATH pnpm`);

  return;
  log.info('Creating symlink for pnpm...');
  // if the symlink already exists, remove it
  const pnpmBinBase = path.basename(pnpmPath);
  try {
    await unlink(kitPath(pnpmBinBase));
  } catch (error) {
    log.warn('Error unlinking pnpm:', error);
  }
  try {
    await symlink(pnpmPath, kitPath(pnpmBinBase));

    // Verify the pnpm installation by checking its version
    const { stdout: versionOutput } = await execFileAsync(kitPath(pnpmBinBase), ['--version'], { shell: true });
    log.info(`pnpm version check successful: ${versionOutput.trim()}`);
  } catch (error) {
    log.error('Error during pnpm symlinking:', error);
    throw new Error('Failed to create symlink or verify pnpm installation');
  }
}

export const pnpmHome = (...paths: string[]) => {
  const defaultPaths = {
    win32: join(os.homedir(), 'AppData', 'Local', 'pnpm'),
    darwin: join(os.homedir(), 'Library', 'pnpm'),
    linux: join(os.homedir(), '.local', 'share', 'pnpm'),
  };

  const platform = process.platform as keyof typeof defaultPaths;
  const defaultPath = defaultPaths[platform] || defaultPaths.linux;

  return createPathResolver(defaultPath)(...paths);
};
log.info('Starting search for pnpm binary');

export const existsAndIsExecutable = (filePath: string | undefined): boolean => {
  if (!filePath) {
    return false;
  }

  const resolvedPath = path.resolve(filePath);
  if (existsSync(resolvedPath)) {
    // if is executable, return the path
    try {
      accessSync(resolvedPath, constants.X_OK);
      log.info(`Found executable pnpm: ${resolvedPath}`);
      return true;
    } catch (error) {
      // File is not executable
      return false;
    }
  }
  return false;
};

export const findPnpmBin = async (): Promise<string> => {

  if (kitState?.kenvEnv?.KIT_PNPM) {
    log.info(`Checking KIT_PNPM: ${kitState.kenvEnv.KIT_PNPM}`);
    if (existsSync(kitState.kenvEnv.KIT_PNPM)) {
      log.info(`Found pnpm at KIT_PNPM: ${kitState.kenvEnv.KIT_PNPM}`);
      return kitState.kenvEnv.KIT_PNPM;
    }
  }

  const _kitPnpmPathPosix = kitPnpmPath('pnpm');
  const _kitPnpmPathWindows = kitPnpmPath('pnpm.exe');
  const pnpmPath = process.platform === 'win32' ? _kitPnpmPathWindows : _kitPnpmPathPosix;
  if (existsSync(pnpmPath)) {
    log.info(`Found pnpm: ${pnpmPath}`);
    return pnpmPath;
  }

  await installPnpm();
  // attempt to find the pnpm store path
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

  return pnpmPath;

  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'where' : 'which';
  const invokeResult = await invoke(`${command} pnpm`);
  const binName = isWindows ? 'pnpm.cmd' : 'pnpm';
  log.info(`Result of invoke: ${invokeResult}`);
  if (invokeResult) {
    let pnpmPath = invokeResult
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .find((l) => path.basename(l) === binName);

    if (isWindows) {
      // Extract the path starting from the drive letter
      pnpmPath = pnpmPath?.match(/[A-Z]:\\.+/)?.[0] || pnpmPath;
    }

    if (pnpmPath && existsAndIsExecutable(pnpmPath)) {
      log.info(`Found executable pnpm with node-pty: ${pnpmPath}`);
      return pnpmPath;
    }
  }

  // Step 1: Check default paths
  log.info('Checking default pnpm paths');
  const defaultPath = pnpmHome('pnpm');
  if (existsAndIsExecutable(defaultPath)) {
    log.info(`Found executable pnpm with node-pty: ${defaultPath}`);
    return defaultPath;
  }
  log.info('pnpm not found in default path');

  // Step 1.5: Check PNPM_HOME environment variable
  log.info('Checking PNPM_HOME environment variable');
  const PNPM_HOME = typeof process.env?.PNPM_HOME === 'string' ? process.env.PNPM_HOME : undefined;
  if (PNPM_HOME) {
    const pnpmPath = join(PNPM_HOME, 'pnpm');
    if (existsAndIsExecutable(pnpmPath)) {
      log.info(`Found executable pnpm with node-pty: ${pnpmPath}`);
      return pnpmPath;
    }
    log.info(`PNPM_HOME is set, but pnpm not found at ${pnpmPath}`);
  } else {
    log.info('PNPM_HOME environment variable is not set');
  }

  // Step 2: Check common alternative locations
  log.info('Checking common alternative locations');
  const commonLocations = [
    path.join(os.homedir(), '.pnpm', 'pnpm'),
    path.join('/', 'usr', 'local', 'bin', 'pnpm'),
    path.join('C:', 'Program Files', 'pnpm', 'pnpm.cmd'),
    path.join('C:', 'Program Files', 'Volta', 'pnpm.cmd'),
    path.join('C:', 'Program Files (x86)', 'pnpm', 'pnpm.cmd'),
    path.join(os.homedir(), 'AppData', 'Local', 'pnpm', 'pnpm.cmd'),
  ];

  for (const location of commonLocations) {
    if (existsAndIsExecutable(location)) {
      log.info(`Found executable pnpm with node-pty: ${location}`);
      return location;
    }
  }
  log.info('pnpm not found in common locations');

  // Step 3: Check PATH using which/where command
  log.info('Attempting to find pnpm in PATH');
  try {
    const { stdout } = await execFileAsync(isWindows ? 'where' : 'which', ['pnpm']);
    let pathResult = stdout.split('\n')[0].trim();
    if (pathResult.endsWith('.exe')) {
      const parsedPath = path.parse(pathResult);
      parsedPath.ext = '.cmd';
      pathResult = path.format(parsedPath);
    }
    if (pathResult) {
      log.info(`Found pnpm in PATH: ${pathResult}`);
      return pathResult;
    }
  } catch (error) {
    log.warn('Error while searching for pnpm in PATH:', error);
  }

  // Step 4: Check for pnpm installed via npm
  log.info('Checking for pnpm installed via npm');
  const npmGlobalPrefix = await getNpmGlobalPrefix();
  const npmGlobalPnpm = join(npmGlobalPrefix, 'bin', 'pnpm');
  if (existsAndIsExecutable(npmGlobalPnpm)) {
    log.info(`Found executable pnpm with node-pty: ${npmGlobalPnpm}`);
    return npmGlobalPnpm;
  }
  log.info('pnpm not found in npm global installation');

  // If all steps fail, throw an error
  log.warn(`
pnpm binary not found after exhaustive search

- Please open ~/.kenv/.env
- Add KIT_PNPM=/path/to/pnpm
- Restart Kit

`);

  throw new Error('pnpm binary not found');
};

let _pnpmPath: string | undefined;
export async function getPnpmPath(): Promise<string> {
  if (_pnpmPath) {
    return _pnpmPath;
  }
  _pnpmPath = await findPnpmBin();
  log.info(`Found pnpm at: ${_pnpmPath}`);

  // Remove any surrounding quotes
  _pnpmPath = _pnpmPath.replace(/^"|"$/g, '');
  log.info(`pnpm path after removing quotes: ${_pnpmPath}`);

  // If the path contains spaces, wrap it in quotes
  if (_pnpmPath.includes(' ')) {
    _pnpmPath = `"${_pnpmPath}"`;
  }

  log.info(`pnpm path after wrapping in quotes: ${_pnpmPath}`);
  const PNPM_KIT_NODE_PATH = path.join(path.dirname(_pnpmPath), 'nodejs', process.versions.node, 'bin');
  log.info(`pnpm bin path: ${PNPM_KIT_NODE_PATH}`);
  kitState.PNPM_KIT_NODE_PATH = PNPM_KIT_NODE_PATH;
  process.env.PATH = PNPM_KIT_NODE_PATH + path.delimiter + process.env.PATH;
  log.info(`pnpm bin path added to PATH: ${process.env.PATH}`);

  return _pnpmPath;
}

async function getNpmGlobalPrefix(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('npm', ['config', 'get', 'prefix']);
    return stdout.split('\n')[0].trim();
  } catch (error) {
    log.warn('Error getting npm global prefix:', error);
    return process.platform === 'win32' ? 'C:\\Program Files\\nodejs' : '/usr/local';
  }
}
