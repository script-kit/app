import { clipboard, nativeTheme, shell } from 'electron';
import { HttpsProxyAgent } from 'hpagent';

import dotenv from 'dotenv';
import log from 'electron-log';
import download, { DownloadOptions } from 'download';
import { assign, debounce } from 'lodash-es';
import path from 'path';
import * as tar from 'tar';
import { promisify } from 'util';
import StreamZip from 'node-stream-zip';
import {
  SpawnSyncOptions,
  ForkOptions,
  fork,
  spawn,
  SpawnSyncReturns,
  exec,
  ExecOptions,
} from 'child_process';
import os, { homedir } from 'os';
import fsExtra from 'fs-extra';
const { ensureDir, writeFile, readdir, readJson, writeJson } = fsExtra;
import { lstat, readFile, rm } from 'fs/promises';
import { Channel, PROMPT, UI } from '@johnlindquist/kit/core/enum';
import { CACHED_GROUPED_SCRIPTS_WORKER } from '@johnlindquist/kit/workers';
import {
  FlagsOptions,
  PromptData,
  Script,
  Shortcut,
} from '@johnlindquist/kit/types';
import {
  kenvPath,
  kitPath,
  knodePath,
  KIT_FIRST_PATH,
  isDir,
  createPathResolver,
  getMainScriptPath,
} from '@johnlindquist/kit/core/utils';

import { KitPrompt, destroyPromptWindow } from './prompt';

import { INSTALL_ERROR, show } from './show';
import { showError } from './main.dev.templates';
import { mainLogPath } from './logs';
import {
  getThemes,
  kitCache,
  kitState,
  preloadChoicesMap,
  workers,
} from '../shared/state';
import { createScoredChoice } from './helpers';
import { prompts } from './prompts';
import { SPLASH_PATH } from '../shared/defaults';
import { KitEvent, emitter } from '../shared/events';
import { maybeConvertColors, setTheme } from './process';
import { setShortcodes } from './search';
import { sendToAllPrompts } from './channel';
import { AppChannel } from '../shared/enums';
import { Worker } from 'worker_threads';

let isOhNo = false;
export const ohNo = async (error: Error) => {
  if (isOhNo) return;
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
  log.info(`🌊 Showing splash install screen...`);
  splashPrompt = new KitPrompt();
  splashPrompt.ui = UI.splash;
  splashPrompt.scriptPath = SPLASH_PATH;
  splashPrompt.initMain = false;
  splashPrompt.bindToProcess(99999);

  emitter.once(KitEvent.MAIN_SCRIPT_TRIGGERED, () => {
    try {
      splashPrompt?.window?.hide();
      splashPrompt?.window?.close();
      splashPrompt?.window?.destroy();
      splashPrompt = null;
    } catch (error) {
      log.error(error);
    }
  });

  splashPrompt.readyEmitter.once('ready', async () => {
    const { scriptKitTheme, scriptKitLightTheme } = getThemes();
    const value = nativeTheme.shouldUseDarkColors
      ? scriptKitTheme
      : scriptKitLightTheme;
    const newValue = await maybeConvertColors(value);
    assign(kitState.theme, newValue);

    splashPrompt?.sendToPrompt(Channel.SET_THEME, newValue);

    splashPrompt?.setPromptData({
      show: true,
      ui: UI.splash,
      scriptPath: SPLASH_PATH,
      width: PROMPT.WIDTH.BASE,
      height: PROMPT.HEIGHT.BASE,
    } as any);

    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(true);
      }, 200);
    });

    splashPrompt?.window.show();
  });

  sendSplashHeader(`Installing Kit SDK and Kit Environment...`);
};
export const sendSplashBody = (message: string) => {
  if (message.includes('object')) return;
  if (message.toLowerCase().includes('warn')) return;
  message = message.trim();
  if (!message) return;

  log.info(`🌊 body: ${message}`);
  splashPrompt?.sendToPrompt(Channel.SET_SPLASH_BODY, message);
};

export const sendSplashHeader = (message: string) => {
  message = message.trim();
  if (!message) return;

  log.info(`🌊 header: ${message}`);
  splashPrompt?.sendToPrompt(Channel.SET_SPLASH_HEADER, message);
};

export const sendSplashProgress = (progress: number) => {
  log.info(`🌊 progress: ${progress}`);
  splashPrompt?.sendToPrompt(Channel.SET_SPLASH_PROGRESS, progress);
};

export const setupDone = () => {
  sendSplashProgress(100);
  sendSplashHeader(`Kit SDK Install verified ✅`);
};

export const handleLogMessage = async (
  message: string,
  result: SpawnSyncReturns<any>,
  required = true,
) => {
  log.info(`stdout:`, result?.stdout?.toString());
  log.info(`stderr:`, result?.stderr?.toString());
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

  // Set up the options for the spawn command
  const options: SpawnSyncOptions = {
    cwd, // Set the current working directory based on the provided parameter
    encoding: 'utf-8',
    env: {
      KIT,
      KENV,
      PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
    },
    stdio: 'pipe',
  };

  const npmResult = await new Promise((resolve, reject) => {
    // Determine the platform and set the npm path accordingly
    const isWin = os.platform().startsWith('win');
    const npmPath = isWin
      ? knodePath('bin', 'npm.cmd')
      : knodePath('bin', 'npm');
    log.info(`${cwd}: 👷 ${npmPath} ${installCommand}`);

    // Execute the spawn command with the appropriate npm path, install command and options
    const child = spawn(npmPath, installCommand.split(' '), options);

    // Display a loading message with a spinner
    let dots = 1;
    const installMessage = `Installing Kit Packages`;
    const id = setInterval(() => {
      if (dots >= 3) dots = 0;
      dots += 1;
      sendSplashBody(installMessage.padEnd(installMessage.length + dots, '.'));
    }, 250);

    // Function to clear the interval id
    const clearId = () => {
      try {
        if (id) clearInterval(id);
      } catch (error) {
        log.info(`Failed to clear id`);
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

export const installEsbuild = async () => {
  return installPackage(
    `i esbuild@0.19.9 --save-exact --production --prefer-dedupe --loglevel=verbose`,
    kitPath(),
  );
};

export const installPlatformDeps = async () => {
  if (os.platform().startsWith('darwin')) {
    return installPackage(
      `i @johnlindquist/mac-dictionary --save-exact --production --prefer-dedupe --loglevel=verbose`,
      kitPath(),
    );
  }

  return null;
};

const getOptions = () => {
  const options: any = {
    insecure: true,
    rejectUnauthorized: false,
    followRedirect: true,
  };
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (proxy) {
    log.info(`Using proxy ${proxy}`);
    options.agent = new HttpsProxyAgent({
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
  const osTmpPath = createPathResolver(os.tmpdir());

  const fileName = `kenv.zip`;
  const file = osTmpPath(fileName);
  let url = `https://github.com/johnlindquist/kenv/releases/latest/download/${fileName}`;

  // Check if ~/.kitrc exists, if so, read it and use the KENV_ZIP_URL
  const kitrcPath = path.resolve(homedir(), '.kitrc');
  let stat;
  try {
    stat = await lstat(kitrcPath);
  } catch (error) {
    log.info(`No ~/.kitrc found`);
  }

  if (stat && stat.isFile()) {
    const kitRcContents = await readFile(kitrcPath, {
      encoding: 'utf8',
    });

    const kitRc = dotenv.parse(kitRcContents);
    if (kitRc.KENV_ZIP_URL) {
      log.info(`Using KENV_ZIP_URL from ${kitrcPath}`);
      url = kitRc.KENV_ZIP_URL;
    }
  }

  sendSplashBody(`Downloading Kit Environment from ${url}....`);
  try {
    const buffer = await download(url, undefined, getOptions());

    sendSplashBody(`Writing Kit Environment to ${file}`);
    await writeFile(file, buffer);

    return file;
  } catch (error) {
    log.error(error);
    ohNo(error as Error);
    return '';
  }
};

export const cleanKit = async () => {
  log.info(`🧹 Cleaning ${kitPath()}`);
  const pathToClean = kitPath();

  const keep = (file: string) =>
    file === 'db' || file === 'node_modules' || file === 'assets';

  // eslint-disable-next-line no-restricted-syntax
  for await (const file of await readdir(pathToClean)) {
    if (keep(file)) {
      log.info(`👍 Keeping ${file}`);
      // eslint-disable-next-line no-continue
      continue;
    }

    const filePath = path.resolve(pathToClean, file);
    const stat = await lstat(filePath);
    if (stat.isDirectory()) {
      await rm(filePath, { recursive: true, force: true });
      log.info(`🧹 Cleaning dir ${filePath}`);
    } else {
      await rm(filePath);
      log.info(`🧹 Cleaning file ${filePath}`);
    }
  }
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
  const osTmpPath = createPathResolver(os.tmpdir());

  const version = process.env.KIT_APP_VERSION;
  const extension = 'tar.gz';

  /* eslint-disable no-nested-ternary */
  const uppercaseOSName =
    process.platform === 'win32'
      ? 'Windows'
      : process.platform === 'linux'
        ? 'Linux'
        : 'macOS';

  // Download Kit SDK based on the current platform and architecture
  // Examples:
  // Mac arm64: https://github.com/johnlindquist/kitapp/releases/download/v1.40.70/Kit-SDK-macOS-1.40.70-arm64.tar.gz
  // Linux x64: https://github.com/johnlindquist/kitapp/releases/download/v1.40.70/Kit-SDK-Linux-1.40.70-x64.tar.gz
  // Windows x64: https://github.com/johnlindquist/kitapp/releases/download/v1.40.70/Kit-SDK-macOS-1.40.70-x64.tar.gz

  const kitSDK = `Kit-SDK-${uppercaseOSName}-${version}-${process.arch}.${extension}`;
  const file = osTmpPath(kitSDK);
  let url = `https://github.com/johnlindquist/kitapp/releases/download/v${version}/${kitSDK}`;
  if (process.env?.KIT_SDK_URL) {
    url = process.env.KIT_SDK_URL;
  }

  sendSplashBody(`Downloading Kit SDK from ${url}`);

  try {
    const buffer = await download(url, undefined, getOptions());

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

export const downloadNode = async () => {
  // cleanup any existing knode directory
  if (await isDir(knodePath())) {
    await rm(knodePath(), {
      recursive: true,
      force: true,
    });
  }

  const osTmpPath = createPathResolver(os.tmpdir());

  const isWin = process.platform === 'win32';
  const extension = isWin ? 'zip' : 'tar.gz';

  // download node v18.18.2 based on the current platform and architecture
  // Examples:
  // Mac arm64: https://nodejs.org/dist/v18.18.2/node-v18.18.2-darwin-arm64.tar.gz
  // Linux x64: https://nodejs.org/dist/v18.18.2/node-v18.18.2-linux-x64.tar.gz
  // Windows x64: https://nodejs.org/dist/v18.18.2/node-v18.18.2-win-x64.zip

  // Node dist url uses "win", not "win32"
  const nodeVersion = `v${process.versions.node}`;
  const nodePlatform = isWin ? 'win' : process.platform;
  const nodeArch = isWin ? 'x64' : process.arch;
  const node = `node-${nodeVersion}-${nodePlatform}-${nodeArch}.${extension}`;
  const file = osTmpPath(node);
  const url = `https://nodejs.org/dist/${nodeVersion}/${node}`;

  const downloadingMessage = `Downloading node from ${url}`;
  log.info(downloadingMessage);
  sendSplashBody(downloadingMessage);

  try {
    const buffer = await download(url, undefined, getOptions());

    const writingNodeMessage = `Writing node to ${file}`;
    log.info(writingNodeMessage);
    sendSplashBody(writingNodeMessage);
    await writeFile(file, buffer);

    sendSplashBody(`Ensuring ${knodePath()} exists`);
    await ensureDir(knodePath());
    sendSplashBody(`Extracting node to ${knodePath()}`);

    return file;
  } catch (error) {
    log.error(error);
    ohNo(error as Error);

    return '';
  }
};

export const extractNode = async (file: string) => {
  log.info(`extractNode ${file}`);
  if (file.endsWith('.zip')) {
    try {
      // eslint-disable-next-line
      const zip = new StreamZip.async({ file });

      sendSplashBody(`Unzipping ${file} to ${knodePath()}`);
      // node-18.18.2-win-x64
      const fileName = path.parse(file).name;
      log.info(`Extacting ${fileName} to ${knodePath('bin')}`);
      // node-18.18.2-win-x64
      await zip.extract(fileName, knodePath('bin'));
      await zip.close();
    } catch (error) {
      log.error({ error });
      ohNo(error);
    }
  } else {
    sendSplashBody(`Untarring ${file} to ${knodePath()}`);
    try {
      await ensureDir(knodePath());
      await tar.x({
        file,
        C: knodePath(),
        strip: 1,
      });
    } catch (error) {
      log.error({ error });
      ohNo(error);
    }
  }
};

export const createLogs = () => {
  log.transports.file.resolvePathFn = () => kitPath('logs', 'kit.log');
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

export const forkOptions: ForkOptions = {
  cwd: homedir(),
  windowsHide: true,
  env: {
    KIT: kitPath(),
    KENV: kenvPath(),
    KNODE: knodePath(),
    PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
    USER: process?.env?.USER,
    USERNAME: process?.env?.USERNAME,
    HOME: process?.env?.HOME,
  },
  stdio: 'pipe',
};

export const optionalSpawnSetup = (...args: string[]) => {
  if (process.env.MAIN_SKIP_SETUP) {
    log.info(`⏭️ Skipping setup script: ${args.join(' ')}`);
    return Promise.resolve('done');
  }
  return new Promise((resolve, reject) => {
    log.info(`Running optional setup script: ${args.join(' ')}`);
    const child = spawn(
      knodePath('bin', 'node'),
      [kitPath('run', 'terminal.js'), ...args],
      forkOptions,
    );

    const id = setTimeout(() => {
      if (child && !child.killed) {
        child.kill();
        resolve('timeout');
        log.info(`⚠️ Setup script timed out: ${args.join(' ')}`);
      }
    }, 5000);

    if (child?.stdout) {
      child.stdout.on('data', (data) => {
        if (kitState.ready) return;
        log.info(data.toString());
      });
    }

    if (child?.stderr) {
      if (kitState.ready) return;
      child.stderr.on('data', (data) => {
        log.warn(data.toString());
      });
    }

    child.on('message', (data) => {
      const dataString = typeof data === 'string' ? data : data.toString();

      if (!dataString.includes(`[object`)) {
        log.info(args[0], dataString);
        // sendSplashBody(dataString.slice(0, 200));
      }
    });

    child.on('exit', (code) => {
      if (code === 0) {
        if (id) clearTimeout(id);
        log.info(`✅ Setup script completed: ${args.join(' ')}`);
        resolve('done');
      } else {
        log.info(`⚠️ Setup script exited with code ${code}: ${args.join(' ')}`);
        resolve('error');
      }
    });

    child.on('error', (error: Error) => {
      if (id) clearTimeout(id);
      log.error(`⚠️ Errored on setup script: ${args.join(' ')}`, error.message);
      resolve('error');
      // reject(error);
      // throw new Error(error.message);
    });
  });
};

export const optionalSetupScript = (
  scriptPath: string,
  argsParam?: string[],
  callback?: (object: any) => void,
) => {
  if (process.env.MAIN_SKIP_SETUP) {
    log.info(`⏭️ Skipping setup script: ${scriptPath}`);
    return Promise.resolve('done');
  }

  const args = argsParam || [];
  return new Promise((resolve, reject) => {
    log.info(`Running optional setup script: ${scriptPath} with ${args}`);
    const child = fork(
      kitPath('run', 'terminal.js'),
      [scriptPath, ...args],
      forkOptions,
    );

    const id = setTimeout(() => {
      if (child && !child.killed) {
        child.kill();
        resolve('timeout');
        log.info(`⚠️ Setup script timed out: ${scriptPath}`);
      }
    }, 5000);

    if (child?.stdout) {
      child.stdout.on('data', (data) => {
        if (kitState.ready) return;
        setupLog(data.toString());
      });
    }

    if (child?.stderr) {
      if (kitState.ready) return;
      child.stderr.on('data', (data) => {
        setupLog(data.toString());
      });
    }

    child.on('message', (data) => {
      if (callback) {
        log.info(`📞 ${scriptPath}: callback firing...`);
        callback(data);
      }
    });

    child.on('exit', (code) => {
      if (code === 0) {
        if (id) clearTimeout(id);
        log.info(`✅ Setup script completed: ${scriptPath}`);
        resolve('done');
      } else {
        log.info(`⚠️ Setup script exited with code ${code}: ${scriptPath}`);
        resolve('error');
      }
    });

    child.on('error', (error: Error) => {
      if (id) clearTimeout(id);
      log.error(
        `⚠️ Errored on setup script: ${scriptPath.join(' ')}`,
        error.message,
      );
      resolve('error');
      // reject(error);
      // throw new Error(error.message);
    });
  });
};

export const installKitInKenv = async () => {
  return installPackage(`i ${kitPath()}`, kenvPath());
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
    const trigger = (
      choice?.trigger ||
      choice?.name?.match(/(?<=\[)\w+(?=\])/i)?.[0] ||
      ''
    ).toLowerCase();

    if (trigger) {
      kitCache.triggers.set(trigger, choice);
    }

    const postfix =
      typeof choice?.pass === 'string' &&
      choice?.pass !== 'true' &&
      choice?.pass !== 'false'
        ? choice.pass
        : '';

    if (postfix) {
      // log.info(`🔚 Found postfix ${choice.pass}`);
      kitCache.postfixes.set(choice?.pass.trim(), choice);
    }
  }
};

const scoreAndCacheMainChoices = (scripts: Script[]) => {
  // TODO: Reimplement score and cache?
  const results = scripts
    .filter((c) => {
      if (c?.miss || c?.pass || c?.hideWithoutInput || c?.exclude) return false;
      return true;
    })
    .map(createScoredChoice);

  kitCache.scripts = scripts;
  kitCache.choices = results;
  cacheTriggers(results);

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

export const cacheMainScripts = debounce(async (stamp = null) => {
  try {
    const receiveScripts = ({
      scripts,
      preview,
      shortcuts,
      scriptFlags,
    }: {
      scripts: Script[];
      preview: string;
      shortcuts: Shortcut[];
      scriptFlags: FlagsOptions;
    }) => {
      if (Array.isArray(scripts) && scripts.length > 0) {
        log.info(`Caching scripts and preview...`, {
          scripts: scripts?.length,
          preview: preview?.length,
        });
        preloadChoicesMap.set(getMainScriptPath(), scripts);
        log.info(`✉️ Sending scripts to prompt...`);
        if (preview) {
          cacheMainPreview(preview);
        }
        if (scripts) {
          // log.info the scripts with triggers
          // log.info(
          //   scripts
          //     .filter((s) => s.trigger)
          //     .map((s) => ({
          //       trigger: s.trigger,
          //       path: s.filePath,
          //     })),
          // );
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
      }
    };
    // const child = fork(
    //   kitPath('run', 'terminal.js'),
    //   [kitPath('setup', 'cache-grouped-scripts.js')],
    //   forkOptions,
    // );

    if (!workers.cacheScripts) {
      log.info(`Creating worker: ${CACHED_GROUPED_SCRIPTS_WORKER}...`);
      workers.cacheScripts = new Worker(CACHED_GROUPED_SCRIPTS_WORKER);
      workers.cacheScripts.on('exit', (exitCode) => {
        log.error(`Worker exited`, {
          exitCode,
        });
      });
      workers.cacheScripts.on('message', receiveScripts);
      workers.cacheScripts.on('messageerror', (error) => {
        log.error(`MessageError: Failed to cache main scripts`, error);
      });
      // handle errors
      workers.cacheScripts.on('error', (error) => {
        if (error instanceof Error) {
          log.error(`Failed to cache main scripts`, {
            message: error.message,
            stack: error.stack,
            name: error.name,
          });
        } else {
          log.error(`Failed to cache main scripts`, {
            error: error,
          });
        }
      });
    }

    log.info(`Posting`);
    workers.cacheScripts.postMessage(stamp);
  } catch (error) {
    log.warn(`Failed to cache main scripts at startup`, error);
  }
}, 100);

export const matchPackageJsonEngines = async () => {
  const KIT = kitPath();
  const KENV = kenvPath();

  const options: ExecOptions = {
    cwd: kenvPath(), // Set the current working directory based on the provided parameter
    env: {
      KIT,
      KENV,
      PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
    },
  };
  const execP = promisify(exec);

  const getCommandOutput = async (command: string) => {
    // How do I pass the options to execP?
    const { stdout } = await execP(command, options);
    return stdout.trim();
  };
  const isWin = os.platform().startsWith('win');
  const npmPath = isWin ? knodePath('bin', 'npm.cmd') : knodePath('bin', 'npm');
  const nodePath = isWin
    ? knodePath('bin', 'node.exe')
    : knodePath('bin', 'node');

  const pkgJson = await readJson(kenvPath('package.json'));
  try {
    const npmVersion = await getCommandOutput(`${npmPath} --version`);
    const nodeVersion = await getCommandOutput(`${nodePath} --version`);
    log.info({
      npmVersion,
      nodeVersion,
    });

    pkgJson.engines = {
      node: nodeVersion.replace('v', ''),
      npm: npmVersion,
    };
  } catch (error) {
    delete pkgJson.engines;
  }

  await writeJson(kenvPath('package.json'), pkgJson, { spaces: 2 });
};
