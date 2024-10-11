import { clipboard, nativeTheme, shell, app } from 'electron';
import crypto from 'node:crypto';
import { HttpsProxyAgent } from 'hpagent';
import * as rimraf from 'rimraf';
import { type SpawnOptions, type SpawnSyncReturns, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { debounce, isEqual } from 'lodash-es';
import StreamZip from 'node-stream-zip';

import * as tar from 'tar';
import { lstat, readFile, rm, unlink, rename } from 'node:fs/promises';
import { Channel, PROMPT, UI } from '@johnlindquist/kit/core/enum';
import download, { type DownloadOptions } from './download';
import {
  KIT_FIRST_PATH,
  getMainScriptPath,
  isDir,
  isFile,
  kenvPath,
  kitPath,
  kitPnpmPath,
  processPlatformSpecificTheme,
} from '@johnlindquist/kit/core/utils';
import type { Choice, FlagsObject, Script, Scriptlet, Shortcut } from '@johnlindquist/kit/types';
import { CACHED_GROUPED_SCRIPTS_WORKER, CREATE_BIN_WORKER } from '@johnlindquist/kit/workers';

import { KitPrompt, destroyPromptWindow, makeSplashWindow } from './prompt';

import { Worker } from 'node:worker_threads';
import type { Stamp } from '@johnlindquist/kit/core/db';
import { SPLASH_PATH } from '../shared/defaults';
import { AppChannel } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import { sendToAllPrompts } from './channel';
import { createScoredChoice, isInDirectory } from './helpers';
import { mainLogPath, scriptLog, workerLog } from './logs';
import { showError } from './main.dev.templates';
import { prompts } from './prompts';
import { INSTALL_ERROR, show } from './show';
import { getThemes, kitCache, kitState, preloadChoicesMap, workers } from './state';
import { ensureDir, writeFile, readJson, writeJson, pathExists, readdir } from './cjs-exports';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import electronLog from 'electron-log';
import { createLogger } from '../shared/log-utils';
import { createForkOptions } from './fork.options';
import { osTmpPath } from './tmp';
import { getAssetPath } from '../shared/assets';
import { getVersion } from './version';
import { getPnpmPath } from './setup/pnpm';
import { shortcutMap } from './shortcuts';
import { showInfo } from './info';
import { compareCollections, logDifferences } from './compare';

import installPnpm from './install/pnpm.sh?raw';

const log = createLogger('install.ts');

let isOhNo = false;
export const ohNo = async (error: Error) => {
  if (isOhNo) {
    return;
  }
  isOhNo = true;
  log.warn(error.message);
  log.warn(error.stack);
  const mainLogContents = await readFile(mainLogPath, {
    encoding: 'utf8',
  });

  try {
    clipboard.writeText(
      `
  ${error.message}
  ${error.stack}
  ${mainLogContents}
    `.trim(),
    );
    destroyPromptWindow();
    await show(INSTALL_ERROR, showError(error, mainLogContents));
  } catch (copyError) {
    shell.openExternal(mainLogPath);
  }

  throw new Error(error.message);
};

let splashPrompt: KitPrompt | null = null;
export const showSplash = async () => {
  kitState.isSplashShowing = true;
  log.info('🌊 Showing splash install screen...');
  splashPrompt = new KitPrompt();
  splashPrompt.ui = UI.splash;
  splashPrompt.scriptPath = SPLASH_PATH;
  splashPrompt.initMain = false;
  splashPrompt.bindToProcess(99999);

  emitter.once(KitEvent.CloseSplash, () => {
    log.info('Closing splash screen');
    try {
      kitState.isSplashShowing = false;
      makeSplashWindow(splashPrompt?.window);
      splashPrompt?.window?.hide();
      splashPrompt?.window?.close();
      splashPrompt?.window?.destroy();
      splashPrompt = null;
    } catch (error) {
      log.error(error);
    }
  });

  splashPrompt.readyEmitter.once('ready', async () => {
    log.info('Splash screen ready');
    const { scriptKitTheme, scriptKitLightTheme } = getThemes();
    const value = nativeTheme.shouldUseDarkColors ? scriptKitTheme : scriptKitLightTheme;
    const platformSpecificTheme = processPlatformSpecificTheme(value);
    kitState.theme = platformSpecificTheme;
    kitState.themeName = platformSpecificTheme.match(/--name:\s*"([^"]+)"/)?.[1] || '';

    splashPrompt?.sendToPrompt(Channel.SET_THEME, platformSpecificTheme);

    splashPrompt?.window?.webContents?.ipc?.addListener(Channel.SET_PROMPT_DATA, (event, data) => {
      log.info('Showing splash screen');
      splashPrompt?.window.show();
    });

    splashPrompt?.setPromptData({
      show: true,
      ui: UI.splash,
      scriptPath: SPLASH_PATH,
      width: PROMPT.WIDTH.BASE,
      height: PROMPT.HEIGHT.BASE,
    } as any);

    const platform = os.platform();
    const appConfig = {
      delimiter: path.delimiter,
      sep: path.sep,
      os: platform,
      isMac: platform === 'darwin',
      isLinux: platform === 'linux',
      isWin: platform === 'win32',
      assetPath: getAssetPath(),
      version: getVersion(),
      isDark: kitState.isDark,
      searchDebounce: Boolean(kitState.kenvEnv?.KIT_SEARCH_DEBOUNCE === 'false'),
      termFont: kitState.kenvEnv?.KIT_TERM_FONT || 'monospace',
      url: kitState.url,
    };
    log.info('Sending app config to splash screen', appConfig);
    splashPrompt?.sendToPrompt(Channel.APP_CONFIG, appConfig);
  });

  sendSplashHeader('Installing Kit SDK and Kit Environment...');
};
export const sendSplashBody = (message: string) => {
  if (message.includes('object')) {
    return;
  }
  if (message.toLowerCase().includes('warn')) {
    return;
  }
  message = message.trim();
  if (!message) {
    return;
  }

  log.info(`🌊 body: ${message}`);
  if (splashPrompt && !splashPrompt.window?.isDestroyed()) {
    splashPrompt.sendToPrompt(Channel.SET_SPLASH_BODY, message);
  }
};

export const sendSplashHeader = (message: string) => {
  message = message.trim();
  if (!message) {
    return;
  }

  log.info(`🌊 header: ${message}`);
  splashPrompt?.sendToPrompt(Channel.SET_SPLASH_HEADER, message);
};

export const sendSplashProgress = (progress: number) => {
  log.info(`🌊 progress: ${progress}`);
  splashPrompt?.sendToPrompt(Channel.SET_SPLASH_PROGRESS, progress);
};

export const setupDone = () => {
  if (splashPrompt?.window) {
    splashPrompt?.window.setAlwaysOnTop(true);
    splashPrompt?.window?.focus();
    splashPrompt?.window?.webContents?.focus();
  }
  sendSplashProgress(100);
  sendSplashHeader('Kit SDK Install verified ✅');
};

export const handleLogMessage = (message: string, result: SpawnSyncReturns<any>, required = true) => {
  log.info('stdout:', result?.stdout?.toString());
  log.info('stderr:', result?.stderr?.toString());
  const { stdout, stderr, error } = result;

  if (stdout?.toString().length) {
    const out = stdout.toString();
    log.info(message, out);
    sendSplashBody(out.slice(0, 200));
  }

  if (error && required) {
    throw new Error(error.message);
  }

  if (stderr?.toString().length) {
    sendSplashBody(stderr.toString());
    log.info({ stderr: stderr.toString() });
    // throw new Error(stderr.toString());
  }

  return result;
};

/**
 * This function installs a package using npm. The installCommand parameter specifies
 * the command to execute for the package installation and the cwd parameter sets
 * the current working directory for the process.
 *
 * @param installCommand The command to execute for the package installation.
 * @param cwd The current working directory for the process.
 * @returns A promise that resolves with a success message or rejects with an error message.
 */
export const installPackage = async (installCommand: string, cwd: string) => {
  // Determine the kit and kenv paths
  const KIT = kitPath();
  const KENV = kenvPath();

  const PATH = KIT_FIRST_PATH + path.delimiter + process?.env?.PATH;
  log.info(`Installing ${installCommand} in ${cwd} with PATH: ${PATH}`);
  // Set up the options for the spawn command
  const options: SpawnOptions = {
    cwd,
    env: {
      KIT,
      KENV,
      PATH,
    },
    stdio: 'pipe',
    shell: true, // Use shell on all platforms for consistency
  };

  const pnpmPath = await getPnpmPath();
  return new Promise<string>((resolve, reject) => {
    log.info(`${cwd}: 👷 pnpm ${installCommand}`);
    const child = spawn(pnpmPath, [installCommand], options);

    // Display a loading message with a spinner
    let dots = 1;
    const installMessage = 'Installing Kit Packages';
    const id = setInterval(() => {
      if (dots >= 3) {
        dots = 0;
      }
      dots += 1;
      sendSplashBody(installMessage.padEnd(installMessage.length + dots, '.'));
    }, 250);

    // Function to clear the interval id
    const clearId = () => {
      try {
        if (id) {
          clearInterval(id);
        }
      } catch (error) {
        log.info('Failed to clear id');
      }
    };

    // Handling the different events for the child process
    if (child.stdout) {
      child.stdout.on('data', (data) => {});
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        sendSplashBody(data.toString());
      });
      clearId();
    }

    child.on('message', (data) => {
      sendSplashBody(data.toString());
    });

    child.on('exit', () => {
      resolve('npm install success');
      clearId();
    });

    child.on('error', (error) => {
      log.warn(`Error: ${error?.message}`);
      resolve(`Deps install error ${error}`);
      clearId();
    });
  });
};

const installDependencies = async (dependencyNames: string[], installCommand: string, cwd: string) => {
  const normalizedCwd = path.normalize(cwd);
  const isKenvPath = normalizedCwd === path.normalize(kenvPath());
  const isKitPath = normalizedCwd === path.normalize(kitPath());

  log.info(`Installing ${dependencyNames.join(', ')} in ${cwd}...`);

  if (!(isKenvPath || isKitPath)) {
    log.info(`Did not recognize cwd as valid target: ${cwd}`);
    return null;
  }

  if (isKenvPath && !(await kenvPackageJsonExists())) {
    log.info(`No package.json found in ${cwd}. Skipping installation of ${dependencyNames.join(', ')}`);
    return null;
  }

  const missingDependencies: string[] = [];
  for (const dependencyName of dependencyNames) {
    if (isKenvPath && !(await isDependencyInstalled(dependencyName, cwd))) {
      log.info(`${dependencyName} not installed in ${cwd}.`);
      missingDependencies.push(dependencyName);
    }
  }

  if (isKenvPath && missingDependencies.length === 0) {
    log.info(`All dependencies already installed in ${cwd}`);
    return null;
  }

  try {
    const result = await installPackage(installCommand, cwd);
    for (const dependencyName of missingDependencies) {
      await verifyInstallation(dependencyName, cwd);
    }
    return result;
  } catch (error) {
    log.error(error);
    return null;
  }
};

const isDependencyInstalled = async (dependencyName: string, cwd: string) => {
  try {
    const nodeModulesPath = path.join(cwd, 'node_modules', dependencyName);
    log.info(`Checking if ${nodeModulesPath} exists`);
    const exists = await pathExists(nodeModulesPath);
    log.info(`${nodeModulesPath} exists: ${exists}`);
    return exists;
  } catch (error) {
    return false;
  }
};

const verifyInstallation = async (dependencyName: string, cwd: string) => {
  try {
    return await pathExists(path.join(cwd, 'node_modules', dependencyName));
  } catch (error) {
    log.error(`${dependencyName} not installed in ${cwd}`);
    // We can't log the contents of node_modules here as we're not reading the directory
    // If you still want to log something, you could log the error message
    log.info(`Error accessing ${dependencyName}: ${(error as Error).message}`);
    return false;
  }
};

export const installMacDeps = async () => {
  async function readPackageJson() {
    const packageJsonPath = kitPath('package.json');
    try {
      const data = await readFile(packageJsonPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      log.error(`Error reading package.json: ${error}`);
      return null;
    }
  }

  const packageJson = await readPackageJson();
  if (packageJson) {
    // const pnpmResult = await installDependencies(['mac-windows'], 'i mac-windows@1.0.0', kitPath());
    // return pnpmResult;
  }

  return null;
};

export const installLoaderTools = async () => {
  async function readPackageJson() {
    const packageJsonPath = kitPath('package.json');
    try {
      const data = await readFile(packageJsonPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      log.error(`Error reading package.json: ${error}`);
      return null;
    }
  }

  const packageJson = await readPackageJson();
  if (packageJson) {
    const esbuildVersion = packageJson.devDependencies?.esbuild || '0.21.4';
    const tsxVersion = packageJson.devDependencies?.tsx || '4.15.7';
    log.info(`Using esbuild version: ${esbuildVersion}`);
    log.info(`Using tsx version: ${tsxVersion}`);

    const pnpmResult = await installDependencies(
      ['esbuild', 'tsx'],
      `i -D esbuild@${esbuildVersion} tsx@${tsxVersion}`,
      kitPath(),
    );
    return pnpmResult;
  }

  return null;
};

let kenvDepsInstalled = false;
export const installKenvDeps = async () => {
  if (kenvDepsInstalled) {
    log.info('Kenv dependencies already installed, skipping...');
    return;
  }

  const result = await installDependencies(
    ['@johnlindquist/kit', '@typescript/lib-dom'],
    `i -D ${kitPath()} @typescript/lib-dom@npm:@johnlindquist/no-dom`,
    kenvPath(),
  );
  if (result) {
    kenvDepsInstalled = true;
    log.info('Installed @johnlindquist/kit');
  } else {
    log.info('Failed to install @johnlindquist/kit');
  }
};

const getOptions = () => {
  const options: DownloadOptions = {
    rejectUnauthorized: false,
    followRedirect: true,
  };
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxy) {
    log.info(`Using proxy ${proxy}`);
    (options as any).agent = new HttpsProxyAgent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 256,
      maxFreeSockets: 256,
      scheduling: 'lifo',
      proxy,
    });
  }

  return options;
};

export const extractKenv = async (file: string) => {
  // eslint-disable-next-line
  const zip = new StreamZip.async({ file });

  const fileName = path.parse(file).base;

  sendSplashBody(`Extacting ${fileName} to ${kenvPath()}`);

  await ensureDir(kenvPath());
  await zip.extract('kenv', kenvPath());
  await zip.close();
};

export const downloadKenv = async () => {
  if (await isDir(kenvPath())) {
    sendSplashBody(`${kenvPath()} already exists. Skipping download.`);
    return '';
  }

  const fileName = 'kenv.zip';
  const file = osTmpPath(fileName);
  let url = `https://github.com/johnlindquist/kenv/releases/latest/download/${fileName}`;

  // Check if ~/.kitrc exists, if so, read it and use the KENV_ZIP_URL
  const kitrcPath = path.resolve(os.homedir(), '.kitrc');
  let stat;
  try {
    stat = await lstat(kitrcPath);
  } catch (error) {
    log.info('No ~/.kitrc found');
  }

  if (stat?.isFile()) {
    const kitRcContents = await readFile(kitrcPath, {
      encoding: 'utf8',
    });

    const kitRc = dotenv.parse(kitRcContents);
    if (kitRc.KENV_ZIP_URL) {
      log.info(`Using KENV_ZIP_URL from ${kitrcPath}`);
      url = kitRc.KENV_ZIP_URL;
    }
  }

  sendSplashBody(`Downloading Kit Environment (.kenv) from ${url}....`);
  const beforeDownload = performance.now();
  try {
    const buffer = await download(url, getOptions());
    log.info(`Downloaded ${buffer.length} bytes`);

    sendSplashBody(`Writing Kit Environment to ${file}`);
    await writeFile(file, buffer);

    const afterDownload = performance.now();
    log.info(`Downloaded .kenv in ${afterDownload - beforeDownload}ms`);
    return file;
  } catch (error) {
    log.error();
    ohNo(error as Error);
    return '';
  }
};

export const cleanKit = async () => {
  log.info(`🧹 Cleaning ${kitPath()}`);

  try {
    log.info(`Cleaning Kit SDK at ${kitPath()}`);

    const tempKitPath = kitPath() + `-old-${Date.now()}`;
    log.info(`🚛 Moving old ${kitPath()} to ${tempKitPath}`);
    await rename(kitPath(), tempKitPath);
    log.info(`Cleaning up old Kit SDK at ${tempKitPath} in the background...`);
    rimraf.rimraf(tempKitPath);
    log.info(`Continuing with new Kit SDK at ${kitPath()}`);
  } catch (error) {
    log.error(`Error cleaning the Kit SDK at: ${kitPath()}`, error);
    throw new Error(`Error cleaning ${kitPath()}`);
  }
};

const execFileAsync = promisify(execFile);

export const installPnpm = async () => {
  log.info('Starting pnpm installation...');
  if (process.platform === 'win32') {
    // Windows
    log.info('Installing pnpm on Windows...');
    const command = 'powershell.exe';
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'iwr https://raw.githubusercontent.com/johnlindquist/kit/refs/heads/main/scripts/pnpm.ps1 -useb | iex',
    ];

    try {
      const { stdout, stderr } = await execFileAsync(
        command,
        args,
        {
          env: {
            ...process.env,
            KIT_PNPM_HOME: kitPnpmPath(),
          },
        },
      );

      log.info('PNPM installation output:', stdout);
      if (stderr) log.warn('PNPM installation stderr:', stderr);
    } catch (error) {
      log.error('Failed to install PNPM:', error);
      throw error;
    }
  } else {
    // macOS or Linux
    log.info('Installing pnpm on POSIX system...');
    const spawnCommand = 'sh';
    const spawnArgs = [
      '-c',
      `
      curl -fsSL https://raw.githubusercontent.com/johnlindquist/kit/refs/heads/main/scripts/pnpm.sh | sh -
    `,
    ];



    // const pnpmScript = await readFile(getAssetPath('pnpm.sh'), 'utf8');
    log.info(`Running command: ${spawnCommand} ${spawnArgs.join(' ')}`);
    await requiredSpawnSetup(spawnCommand, spawnArgs, {
      shell: false,
    });
  }
  log.info('pnpm installation completed.');
};

export const installKitDeps = async () => {
  const pnpmPath = await getPnpmPath();
  await requiredSpawnSetup(pnpmPath, ['i', '--prod'], {
    cwd: kitPath(),
    env: {
      ...process.env,
      CI: 'true',
    },
  });
};

export const extractKitTar = async (file: string) => {
  sendSplashBody(`Extracting Kit SDK from ${file} to ${kitPath()}...`);
  await ensureDir(kitPath());
  await tar.x({
    file,
    C: kitPath(),
    strip: 1,
  });
};

export const downloadKit = async () => {
  const version = getVersion();
  const extension = 'tar.gz';

  /* eslint-disable no-nested-ternary */
  const uppercaseOSName = process.platform === 'win32' ? 'Windows' : process.platform === 'linux' ? 'Linux' : 'macOS';

  // Download Kit SDK based on the current platform and architecture
  // Examples:
  // Mac arm64: https://github.com/script-kit/app/releases/download/v1.40.70/Kit-SDK-macOS-1.40.70-arm64.tar.gz
  // Linux x64: https://github.com/script-kit/app/releases/download/v1.40.70/Kit-SDK-Linux-1.40.70-x64.tar.gz
  // Windows x64: https://github.com/script-kit/app/releases/download/v1.40.70/Kit-SDK-macOS-1.40.70-x64.tar.gz

  const kitSDK = `Kit-SDK-${uppercaseOSName}-${version}-${process.arch}.${extension}`;
  const file = osTmpPath(kitSDK);
  let fallbackUrl = `https://github.com/script-kit/app/releases/download/v${version}/${kitSDK}`;
  if (process.env?.KIT_SDK_URL) {
    fallbackUrl = process.env.KIT_SDK_URL;
  }

  let url: string;
  try {
    let sdkVersion = '';
    try {
      sdkVersion = await readFile(getAssetPath('sdk-version.txt'), 'utf8');
    } catch (e) {
      const response = await fetch('https://registry.npmjs.org/@johnlindquist/kit');
      const data = (await response.json()) as { distTags: { next: string } };
      sdkVersion = data['dist-tags'][process.env?.KIT_SDK_TAG || 'next'];
    }
    url = `https://registry.npmjs.org/@johnlindquist/kit/-/kit-${sdkVersion}.tgz`;
  } catch (e) {
    log.warn('No SDK version file found, using fallback URL');
    url = fallbackUrl;
  }

  sendSplashBody(`Downloading Kit SDK from ${fallbackUrl}`);

  const beforeDownload = performance.now();
  try {
    let buffer;
    try {
      log.green(`Attempting to download SDK from NPM: ${url}`);
      buffer = await download(url, getOptions());
    } catch (e) {
      log.red(`Failed to download SDK from NPM`, e);
      log.green(`Downloading SDK from GitHub Releases: ${fallbackUrl}`);
      buffer = await download(fallbackUrl, getOptions());
    }
    const afterDownload = performance.now();
    log.info(`Downloaded Kit in ${afterDownload - beforeDownload}ms`);
    sendSplashBody(`Writing Kit SDK to ${file}`);
    await writeFile(file, buffer);

    sendSplashBody(`Ensuring ${kitPath()} exists`);
    await ensureDir(kitPath());

    sendSplashBody(`Removing ${file}`);

    return file;
  } catch (error) {
    log.error(error);
    ohNo(error as Error);
    return '';
  }
};

export const createLogs = () => {
  electronLog.transports.file.resolvePathFn = () => kitPath('logs', 'kit.log');
};

export const setupLog = async (message: string) => {
  sendSplashBody(message);
  log.info(message);
  if (process.env.KIT_SPLASH) {
    await new Promise((resolve, reject) =>
      setTimeout(() => {
        resolve(true);
      }, 500),
    );
  }
};

export const requiredSpawnSetup = (command: string, args: string[], options: SpawnOptions): Promise<string> => {
  const KIT_PNPM_HOME = kitPnpmPath();
  return new Promise((resolve, reject) => {
    log.info(`Running required setup script: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      ...createForkOptions(),
      ...options,
      env: {
        ...process.env,
        KIT_PNPM_HOME,
      },
    });
    let output = 'not match...';

    if (child?.stdout) {
      child.stdout.on('data', (data) => {
        const dataString = data.toString();
        output += dataString;
        log.info(dataString);
        sendSplashBody(dataString.slice(0, 200));
      });
    }

    if (child?.stderr) {
      child.stderr.on('data', (data) => {
        log.warn(data.toString());
      });
    }

    child.on('message', (data) => {
      const dataString = typeof data === 'string' ? data : data.toString();

      if (!dataString.includes('[object')) {
        log.info(args[0], dataString);
        sendSplashBody(dataString.slice(0, 200));
      }
    });

    child.on('exit', (code) => {
      if (code === 0) {
        log.info(`✅ Setup script completed: ${args.join(' ')}`);
        resolve(output);
      } else {
        log.info(`⚠️ Setup script exited with code ${code}: ${args.join(' ')}`);
        reject('error');
      }
    });

    child.on('close', (code) => {
      log.info(`⚠️ Setup script closed with code ${code}: ${args.join(' ')}`);
      resolve(output);
    });

    child.on('disconnect', () => {
      log.info(`⚠️ Setup script disconnected: ${args.join(' ')}`);
      resolve(output);
    });

    child.on('error', (error: Error) => {
      log.error(`⚠️ Errored on setup script: ${args.join(' ')}`, error.message);
      // reject(error);
      // throw new Error(error.message);
    });
  });
};

export const optionalSpawnSetup = (...args: string[]) => {
  if (process.env.MAIN_SKIP_SETUP) {
    log.info(`⏭️ Skipping setup script: ${args.join(' ')}`);
    return Promise.resolve('done');
  }
  return new Promise((resolve, reject) => {
    log.info(`Running optional setup script: ${args.join(' ')}`);
    if (!kitState.KIT_NODE_PATH) {
      log.error('No exec path found, skipping setup script');
      resolve('done');
      return;
    }
    const child = spawn(kitState.KIT_NODE_PATH, [kitPath('run', 'terminal.js'), ...args], createForkOptions());

    const id = setTimeout(() => {
      if (child && !child.killed) {
        child.kill();
        resolve('timeout');
        log.info(`⚠️ Setup script timed out: ${args.join(' ')}`);
      }
    }, 25000);

    if (child?.stdout) {
      child.stdout.on('data', (data) => {
        if (kitState.ready) {
          return;
        }
        log.info(data.toString());
      });
    }

    if (child?.stderr) {
      if (kitState.ready) {
        return;
      }
      child.stderr.on('data', (data) => {
        log.warn(data.toString());
      });
    }

    child.on('message', (data) => {
      const dataString = typeof data === 'string' ? data : data.toString();

      if (!dataString.includes('[object')) {
        log.info(args[0], dataString);
        // sendSplashBody(dataString.slice(0, 200));
      }
    });

    child.on('exit', (code) => {
      if (code === 0) {
        if (id) {
          clearTimeout(id);
        }
        log.info(`✅ Setup script completed: ${args.join(' ')}`);
        resolve('done');
      } else {
        log.info(`⚠️ Setup script exited with code ${code}: ${args.join(' ')}`);
        resolve('error');
      }
    });

    child.on('close', (code) => {
      log.info(`⚠️ Setup script closed with code ${code}: ${args.join(' ')}`);
      resolve('done');
    });

    child.on('disconnect', () => {
      log.info(`⚠️ Setup script disconnected: ${args.join(' ')}`);
      resolve('done');
    });

    child.on('error', (error: Error) => {
      if (id) {
        clearTimeout(id);
      }
      log.error(`⚠️ Errored on setup script: ${args.join(' ')}`, error.message);
      resolve('error');
      // reject(error);
      // throw new Error(error.message);
    });
  });
};

export const kenvPackageJsonExists = async () => {
  return await isFile(kenvPath('package.json'));
};

const cacheTriggers = (choices: Choice[]) => {
  for (const choice of choices) {
    const code = (choice?.shortcode || '').toLowerCase();

    if (code) {
      kitCache.shortcodes.set(code, choice);
    }

    if (choice?.keyword) {
      // log.info(`🗝 Found keyword ${choice.keyword}`);
      kitCache.keywords.set(choice.keyword.toLowerCase(), choice);
    }

    // TODO: Parse choice.trigger earlier during choice formatting?
    const trigger = (choice?.trigger || choice?.name?.match(/(?<=\[)\w+(?=\])/i)?.[0] || '').toLowerCase();

    if (trigger) {
      kitCache.triggers.set(trigger, choice);
    }

    if (typeof choice?.pass === 'string') {
      kitCache.postfixes.set(choice.pass.trim(), choice);
    }
  }
};

const scoreAndCacheMainChoices = (scripts: Script[]) => {
  // TODO: Reimplement score and cache?
  const filteredScripts = scripts.filter((c) => {
    if (c?.miss || c?.pass || c?.hideWithoutInput || c?.exclude) {
      return false;
    }
    return true;
  });

  const results = filteredScripts.map(createScoredChoice);

  kitCache.scripts = scripts;
  kitCache.choices = results;
  cacheTriggers(filteredScripts);

  for (const prompt of prompts) {
    log.info(`${prompt.pid}: initMainChoices`);
    // if (!prompt.isVisible()) {
    prompt.initMainChoices();
    if (!prompt.isVisible()) {
      // log.info(`${prompt.pid}: setShortcodes`, {
      //   triggers: scripts.filter((s) => s.trigger).map((s) => s.trigger),
      // });
    }
    // }
  }
};

const cacheMainPreview = (preview: string) => {
  kitCache.preview = preview;

  for (const prompt of prompts) {
    if (prompt.pid === 0) {
      prompt.initMainPreview();
    }
  }
};

const getBinWorker = () => {
  if (!workers.createBin) {
    workers.createBin = new Worker(CREATE_BIN_WORKER);
    const logQueue: { type: 'info' | 'error'; message: string }[] = [];
    let logTimeout: NodeJS.Timeout | null = null;

    const flushLogs = () => {
      if (logQueue.length > 0) {
        const infos = logQueue.filter((l) => l.type === 'info').map((l) => l.message);
        const errors = logQueue.filter((l) => l.type === 'error').map((l) => l.message);

        if (errors.length > 0) {
          log.error('🔗 Bin worker errors:', errors.join(', '));
        }

        logQueue.length = 0;
      }
    };

    const queueLog = (type: 'info' | 'error', message: string) => {
      logQueue.push({ type, message });
      if (logTimeout) {
        clearTimeout(logTimeout);
      }
      logTimeout = setTimeout(flushLogs, 1000);
    };

    workers.createBin.on('exit', (exitCode) => {
      queueLog('info', `Bin worker exited (${exitCode})`);
    });
    workers.createBin.on('error', (error) => {
      queueLog('error', error.toString());
    });
    workers.createBin.on('message', (message: { command: string; filePath: string }) => {
      queueLog('info', `Created bin for ${path.basename(message?.filePath)} to ${message?.command}`);
    });
  }
  return workers.createBin;
};

export const syncBins = async () => {
  setTimeout(async () => {
    log.info('🔗 Syncing bins...');
    try {
      const binDirPath = kenvPath('bin');
      const binFiles = await readdir(binDirPath);
      const worker = getBinWorker();
      const deletePromises: Promise<void>[] = [];
      for (const bin of binFiles) {
        const script = Array.from(kitState.scripts.values()).find((s) => s.command === bin);
        if (!script) {
          log.info(`🔗 Deleting bin ${bin}`);
          deletePromises.push(unlink(path.resolve(binDirPath, bin)));
        }
      }

      await Promise.all(deletePromises);

      for (const script of kitState.scripts.values()) {
        if (binFiles.includes(script.command) && !(script as Scriptlet).scriptlet) {
          continue;
        }

        log.info(`🔗 Creating bin for ${script.filePath} -> ${script.command}`);
        worker.postMessage({
          command: script.command,
          filePath: script.filePath,
          execPath: kitState.KIT_NODE_PATH,
        });
      }
    } catch (error) {
      log.error(error);
    }
  }, 750);
};

export function isBinnableScript(script: Script) {
  return script?.group !== 'Kit' && script?.kenv !== '.kit' && !script?.skip && script?.command && script.filePath;
}

export const cacheMainMenu = ({
  scripts,
  preview,
  shortcuts,
  scriptFlags,
}: {
  scripts: Script[];
  preview?: string;
  shortcuts?: Shortcut[];
  scriptFlags?: FlagsObject;
}) => {
  log.info('Received scripts', {
    scripts: scripts?.length,
    preview: preview?.length,
  });
  if (Array.isArray(scripts) && scripts.length > 0) {
    log.info('Caching scripts and preview...', {
      scripts: scripts?.length,
      preview: preview?.length,
    });
    preloadChoicesMap.set(getMainScriptPath(), scripts);

    if (preview) {
      cacheMainPreview(preview);
    }
    if (scripts) {
      scoreAndCacheMainChoices(scripts);
    }
    if (shortcuts) {
      kitCache.shortcuts = shortcuts;
    }
    if (scriptFlags) {
      kitCache.scriptFlags = scriptFlags;
    }
    sendToAllPrompts(AppChannel.SET_CACHED_MAIN_PREVIEW, kitCache.preview);
    sendToAllPrompts(AppChannel.INIT_PROMPT, {});

    log.info('🧹 Clearing scriptlets and scripts...');
    const previousScriptlets = Array.from(kitState.scriptlets.entries());
    const previousScripts = Array.from(kitState.scripts.entries());
    kitState.scriptlets.clear();
    kitState.scripts.clear();

    const logQueue: string[] = [];
    let logTimeout: NodeJS.Timeout;

    const flushLogQueue = () => {
      if (logQueue.length > 0) {
        scriptLog.info(`📦 Added ${logQueue.length} items:`);
        log.info(logQueue);
        logQueue.length = 0;
      }
    };

    const queueLog = (message: string) => {
      logQueue.push(message);
      clearTimeout(logTimeout);
      logTimeout = setTimeout(flushLogQueue, 1000);
    };

    for (const script of scripts) {
      if ((script as Scriptlet).scriptlet) {
        queueLog(`Scriptlet ${script.filePath}`);
        kitState.scriptlets.set(script.filePath, script as Scriptlet);
      }

      if (isBinnableScript(script)) {
        queueLog(`Binnable ${script.filePath}`);
        kitState.scripts.set(script.filePath, script);
      }
    }

    const newScriptlets = new Map(Array.from(kitState.scriptlets.entries()));
    const newScripts = new Map(Array.from(kitState.scripts.entries()));

    // ... [Other code]

    // Create maps for quick lookup of previous scriptlets and scripts by filePath
    const previousScriptletsMap = new Map(previousScriptlets);
    const previousScriptsMap = new Map(previousScripts);

    // Compare scriptlets
    const scriptletsDifferences = compareCollections(previousScriptletsMap, newScriptlets, ['id']);

    // Log scriptlets differences
    logDifferences(scriptLog, 'scriptlets', scriptletsDifferences);

    // Compare scripts
    const scriptsDifferences = compareCollections(previousScriptsMap, newScripts, ['id']);

    // Log scripts differences
    logDifferences(scriptLog, 'scripts', scriptsDifferences);

    // Ensure any remaining logs are flushed
    flushLogQueue();

    syncBins();

    log.info(`Shortcut check: ${shortcutMap.size} shortcuts cached`);
    if (shortcutMap.size === 0) {
      log.info(`Found no shortcuts, checking scripts`);
      // Check if any scripts have shortcuts
      for (const script of kitState.scripts.values()) {
        if (script.shortcut) {
          log.info(`Found script with shortcut: ${script.filePath}, adding to cache`);
        }
      }
    }
  }
};

// Initialize static properties for cacheMainScripts
interface CacheMainScripts {
  (params?: { channel: Channel; value: any }): Promise<boolean>;
  pendingResolvers?: Array<{
    resolve: (value: boolean) => void;
    reject: (reason?: any) => void;
  }>;
  postMessage?: (message: any) => void;
}
export const cacheMainScripts: CacheMainScripts = (
  {
    channel,
    value,
  }: {
    channel: Channel;
    value: any;
  } = {
    channel: Channel.CACHE_MAIN_SCRIPTS,
    value: null,
  },
): Promise<boolean> => {
  return new Promise<boolean>((resolve, reject) => {
    // Initialize a shared array to hold all pending resolvers and rejectors
    if (!cacheMainScripts.pendingResolvers) {
      cacheMainScripts.pendingResolvers = [];
    }

    // Add the current resolve and reject to the pending list
    cacheMainScripts.pendingResolvers.push({ resolve, reject });

    const uuid = crypto.randomUUID();
    log.info(`🏆 ${uuid} Caching main scripts...`);
    let stamp: Stamp | null = null;

    if (channel === Channel.CACHE_MAIN_SCRIPTS) {
      stamp = value;
    }

    // Helper functions to handle collective resolve and reject
    const handleResolve = () => {
      for (const { resolve } of cacheMainScripts.pendingResolvers!) {
        log.info(`Resolving ${uuid}`);
        resolve(true);
      }
      cacheMainScripts.pendingResolvers = [];
    };

    const handleReject = (error: any) => {
      for (const { reject } of cacheMainScripts.pendingResolvers!) {
        log.info(`Rejecting ${uuid}`);
        reject(error);
      }
      cacheMainScripts.pendingResolvers = [];
    };

    // Event Handlers
    const messageHandler = (message: any) => {
      try {
        scriptLog.log('Worker message:', message.channel);
        if (message.channel === 'LOG_TO_PARENT') {
          workerLog.info(message.value);
          return;
        }
        if (message.channel === Channel.CACHE_MAIN_SCRIPTS) {
          scriptLog.info('Caching main scripts...');
          if (message?.error) {
            scriptLog.error('Error caching main scripts', message.error);
            showInfo(
              message.error?.message || 'Check logs...',
              'Error...',
              message.error?.stack || 'Check logs'
            );
            handleReject(message.error);
          } else {
            cacheMainMenu(message);
            handleResolve();
          }
        }
      } catch (err) {
        log.error(`🏆 ${uuid}: Exception in messageHandler - ${err}`);
        handleReject(err);
      }
    };

    const errorHandler = (error: any) => {
      try {
        log.info('Received error for stamp', stamp);
        scriptLog.error('Error: Failed to cache main scripts', error);
        handleReject(error);
      } catch (err) {
        log.error(`🏆 ${uuid}: Exception in errorHandler - ${err}`);
        handleReject(err);
      }
    };

    const messageErrorHandler = (error: any) => {
      try {
        log.info('Received message error for stamp', stamp);
        scriptLog.error('MessageError: Failed to cache main scripts', error);
        handleReject(error);
      } catch (err) {
        log.error(`🏆 ${uuid}: Exception in messageErrorHandler - ${err}`);
        handleReject(err);
      }
    };

    try {
      if (!workers.cacheScripts) {
        log.info(`Creating worker: ${CACHED_GROUPED_SCRIPTS_WORKER}...`);
        workers.cacheScripts = new Worker(CACHED_GROUPED_SCRIPTS_WORKER);
        workers.cacheScripts.on('exit', (exitCode) => {
          log.error('Worker exited', { exitCode });
          handleReject(new Error(`Worker exited with code ${exitCode}`));
        });

        // Attach event handlers
        workers.cacheScripts.on('message', messageHandler);
        workers.cacheScripts.on('error', errorHandler);
        workers.cacheScripts.on('messageerror', messageErrorHandler);
      }

      if (stamp?.filePath && isInDirectory(stamp.filePath, kitPath())) {
        log.info(`Ignore stamping .kit script: ${stamp.filePath}`);
        // Optionally resolve immediately if ignoring
        handleResolve();
      } else {
        log.info(`Stamping ${stamp?.filePath || 'cache only'} 💟`);
        if (!cacheMainScripts.postMessage) {
          cacheMainScripts.postMessage = debounce(
            (message) => {
              const body = message ? { ...message, id: uuid } : { id: uuid };
              log.info(`🏆 ${uuid}: Posting message to worker`);
              if (workers.cacheScripts) {
                workers.cacheScripts.postMessage(body);
              } else {
                log.warn(`🏆 ${uuid}: Worker is not available to post messages.`);
                handleReject(new Error('Worker not available'));
              }
            },
            250,
            {
              leading: true,
            }
          );
        }

        log.info('Sending stamp to worker', stamp);
        cacheMainScripts.postMessage({ channel, value, id: uuid });
      }
    } catch (error) {
      log.warn('Failed to cache main scripts at startup', error);
      handleReject(error);
    }
  });
};

// pnpm might trigger a node download, so we need to wait until the final line prints out the version
export const spawnP = async (
  command: string,
  args: string[] = [],
  spawnOptions: SpawnOptions = {},
): Promise<string> => {
  const KIT = kitPath();
  const KENV = kenvPath();

  const options: SpawnOptions = {
    cwd: kenvPath(), // Set the current working directory based on the provided parameter
    env: {
      KIT,
      KENV,
      PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
    },
    stdio: 'pipe',
    shell: true,
    ...spawnOptions,
  };

  return new Promise((resolve, reject) => {
    const quotedArgs = args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg));

    const child = spawn(command, quotedArgs, {
      ...options,
      shell: true,
    });

    let output = '';
    if (child.stdout) {
      log.info('stdout exists');
      child.stdout.on('data', (data) => {
        const dataString = data.toString();
        log.info(`stdout data: ${dataString}`);
        sendSplashBody(dataString.slice(0, 200));
        output += dataString;
      });
    }

    if (child.stderr) {
      log.info('stderr exists');
      child.stderr.on('data', (data) => {
        log.error(`stderr: ${data}`);
        reject(new Error(`stderr: ${data}`));
      });
    }

    child.on('close', (code) => {
      if (code === 0) {
        const lines = output.trim().split('\n');
        const lastLine = lines[lines.length - 1].trim();
        log.info(`Last line: ${lastLine}`);
        resolve(lastLine);
      } else {
        reject(new Error(`${command} ${quotedArgs.join(' ')} exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
};

export const matchPackageJsonEngines = async () => {
  const getCommandOutput = async (command: string, args: string[] = []) => {
    // How do I pass the options to execP?
    const stdout = await spawnP(command, args);
    return stdout.trim();
  };

  const pkgJson = await readJson(kenvPath('package.json')).catch(() => ({
    engines: undefined,
    type: undefined,
  }));
  try {
    const nodeVersion = process.versions.node;

    pkgJson.type = 'module';
    pkgJson.engines = {
      node: nodeVersion.replace('v', ''),
    };
  } catch (error) {
    pkgJson.engines = undefined;
  }

  await writeJson(kenvPath('package.json'), pkgJson, { spaces: 2 });
};
