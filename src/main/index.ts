import { BrowserWindow, app, crashReporter, nativeTheme, powerMonitor, protocol, screen } from 'electron';
import './env';

process.on('SIGINT', () => {
  app.quit();
  app.exit();
  console.log('SIGINT');
  process.exit(0);
});

import electronLog from 'electron-log';
electronLog.initialize();

import { createLogger } from '../shared/log-utils';
const log = createLogger('index.ts');
(global as any).log = log.info;

import dotenv from 'dotenv';
import unhandled from 'electron-unhandled';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

import { type SpawnSyncOptions, exec, fork } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import semver from 'semver';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, lstat } from 'node:fs/promises';

import {
  KIT_FIRST_PATH,
  getKenvs,
  getMainScriptPath,
  kenvPath,
  kitPath,
  kitPnpmPath,
  tmpClipboardDir,
  tmpDownloadsDir,
} from '@johnlindquist/kit/core/utils';

import {setEnvVar} from "@johnlindquist/kit/api/kit"

import { getPrefsDb } from '@johnlindquist/kit/core/db';
import { debounce, throttle } from 'lodash-es';
import { subscribeKey } from 'valtio/utils';
import { getAssetPath, getReleaseChannel } from '../shared/assets';
import { clearPromptCache, clearPromptTimers, logPromptState } from './prompt';
import { startClipboardAndKeyboardWatchers } from './tick';
import { checkTray, setupTray } from './tray';
import { setupWatchers, teardownWatchers } from './watcher';

import { KitEvent, emitter } from '../shared/events';
import { syncClipboardStore } from './clipboard';
import { actualHideDock, clearStateTimers } from './dock';
import { displayError } from './error';
import { APP_NAME, KENV_PROTOCOL, KIT_PROTOCOL } from './helpers';
import {
  cacheMainScripts,
  cleanKit,
  downloadKenv,
  downloadKit,
  extractKenv,
  extractKitTar,
  installKenvDeps,
  matchPackageJsonEngines,
  ohNo,
  sendSplashBody,
  setupDone,
  setupLog,
  showSplash,
  installKitDeps,
  spawnP,
  installMacDeps,
} from './install';
import { startIpc } from './ipc';
import { cliFromParams, runPromptProcess } from './kit';
import { logMap, mainLog } from './logs';
import { destroyAllProcesses, ensureIdleProcess, handleWidgetEvents, setTheme } from './process';
import { prompts } from './prompts';
import { createIdlePty, destroyPtyPool } from './pty';
import { scheduleDownloads, sleepSchedule } from './schedule';
import { startSettings as setupSettings } from './settings';
import shims, { loadSupportedOptionalLibraries } from './shims';
import { handleKeymapChange, registerKillLatestShortcut, updateMainShortcut } from './shortcuts';
import { startSK } from './sk';
import { cacheKitScripts, getThemes, kitState, kitStore, subs } from './state';
import { TrackEvent, trackEvent } from './track';
import { checkForUpdates, configureAutoUpdate, kitIgnore } from './update';
import { getStoredVersion, getVersion, storeVersion } from './version';
import { prepQuitWindow } from './window/utils';
import { loadKenvEnvironment } from './env-utils';
import { Channel } from '@johnlindquist/kit/core/enum';
import { Trigger } from '../shared/enums';
import { reloadApps } from './apps';
import { optionalSetupScript } from './spawn';
import { createForkOptions } from './fork.options';
import { getPnpmPath } from './setup/pnpm';
import { WindowMonitor } from './debug/window-monitor';
import { rimraf } from 'rimraf';
import { pathExists } from './cjs-exports';
import { type NpmConfig, setNpmrcConfig } from './setup/npm';
import { startServer } from './server';
import { invoke } from './invoke-pty';
import { loadShellEnv } from './shell';

// TODO: Read a settings file to get the KENV/KIT paths

log.info('Setting up process.env');
// Disables CSP warnings in browser windows.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
for (const envVar of ['KIT', 'KENV']) {
  if (process.env?.[envVar]?.includes('app.asar') || process.env?.[envVar]?.includes('node_modules')) {
    log.info(`Deleting process.env.${envVar} because it points to app.asar or node_modules`);
    delete process.env[envVar];
  }
}

/* eslint-disable */
(() => {
  if (!process.env.NODE_EXTRA_CA_CERTS) {
    return;
  }
  let extraca: any = null;
  try {
    extraca = readFileSync(process.env.NODE_EXTRA_CA_CERTS);
  } catch (e) {
    return;
  }

  // @ts-ignore
  const NativeSecureContext = process.binding('crypto').SecureContext;
  const oldaddRootCerts = NativeSecureContext.prototype.addRootCerts;
  NativeSecureContext.prototype.addRootCerts = function () {
    // @ts-ignore
    const ret = oldaddRootCerts.apply(this, ...args);
    if (extraca) {
      this.addCACert(extraca);
      return ret;
    }
  };
})();
/* eslint-enable */

crashReporter.start({
  productName: 'Kit',
  companyName: 'John Lindquist',
  submitURL: '', // Leave this empty to not send reports to a server
  uploadToServer: false, // Ensure this is false to prevent uploading
  extra: {
    someExtraData: 'You can add extra data to your crash report here',
  },
  // Specify the directory where you want to save crash reports
});

log.info(`
Crash reports are saved in: ${app.getPath('crashDumps')}
`);

let prevError = '';
unhandled({
  showDialog: false,
  logger: throttle(
    (error) => {
      log.warn(error);
      // if error contains "ECONN", then ignore it
      if (error.message.includes('ECONN')) {
        return;
      }
      // if error is the same as prevError, then ignore it
      if (error.message === prevError) {
        return;
      }
      prevError = error.message;
      displayError(error);
    },
    2500,
    {
      leading: true,
    },
  ),
});

if (!app.requestSingleInstanceLock()) {
  app.exit();
}

log.info('Appending switch: ignore-certificate-errors');
app.commandLine.appendSwitch('ignore-certificate-errors');

const envData = loadKenvEnvironment();
// Legacy KIT_DISABLE_GPU
if ((envData as any).KIT_DISABLE_GPU || envData.KIT_GPU === 'false') {
  app.disableHardwareAcceleration();
  kitState.gpuEnabled = false;
}

app.setName(APP_NAME);
app.setAsDefaultProtocolClient(KIT_PROTOCOL);
app.setAsDefaultProtocolClient(KENV_PROTOCOL);

if (app?.dock) {
  app?.dock?.setIcon(getAssetPath('icon.png'));
}
const releaseChannel = getReleaseChannel();
const arch = os.arch();
const platform = os.platform();
const nodeVersion = `v${process.versions.node}`;

app.on('window-all-closed', (e: Event) => {
  log.info('🪟 window-all-closed', e);
  if (!kitState.allowQuit) {
    mainLog.log('🪟 window-all-closed');
    e.preventDefault();
  }
});

app?.on('browser-window-blur', () => {
  log.info('🪟 browser-window-blur');
  kitState.emojiActive = false;
});

app?.on('did-resign-active', () => {
  log.info('🪟 did-resign-active');
  kitState.emojiActive = false;
});

app?.on('child-process-gone', (event, details) => {
  log.error('🫣 Child process gone...');
  log.error({ event, details });
});

// gpu-info-update
// app?.on('gpu-info-update', () => {
//   log.info(`🫣 gpu-info-update...`);
//   log.info({
//     gpuInfo: app?.getGPUInfo('complete'),
//   });
// });

// accessibility-support-changed
app?.on('accessibility-support-changed', (event, details) => {
  log.info('🫣 accessibility-support-changed...');
  log.info({ event, details });
});

app.on('render-process-gone', (event, details) => {
  log.error('🫣 Render process gone...');
  log.error({ event });
});

log.info(`
Release channel: ${releaseChannel}
Arch: ${arch}
Platform: ${platform}
Node version: ${nodeVersion}
Node ABI: ${process.versions.modules}
Electron version: ${process.versions.electron}
Electron Node version: ${process.versions.node}
Electron Chromium version: ${process.versions.chrome}
Electron execPath: ${process.execPath}
process.env.KIT: ${process.env.KIT}
process.env.KENV: ${process.env.KENV}
process.env.KIT_PNPM_HOME: ${process.env.KIT_PNPM_HOME}
Kit path: ${kitPath()}
Kenv path: ${kenvPath()}
Pnpm home: ${kitPnpmPath()}
`);

process.env.NODE_VERSION = nodeVersion;

log.info(`😎 KIT_APP_VERSION ${getVersion()}`);

const KIT = kitPath();
process.env.KIT = KIT;

// TODO: Fix source-map-support and electron-debug???
// if (process.env.NODE_ENV === 'production') {
//   const sourceMapSupport = require('source-map-support');
//   sourceMapSupport.install();
// }

// if (
//   process.env.NODE_ENV === 'development' ||
//   process.env.DEBUG_PROD === 'true'
// ) {
//   require('electron-debug')({ showDevTools: false });
// }

const protocolHandler = async (u: string) => {
  const url = new URL(u);
  const pathname = url.pathname.replace('//', '');

  log.info({ url, pathname });

  if (url.protocol === KENV_PROTOCOL + ':') {
    const filePath = u.replace(KENV_PROTOCOL + ':', '');
    const maybeFile = kenvPath(filePath).replace(/\?.*$/, '');
    const strippedHash = maybeFile.replace(/#.*/, '');
    log.info({ pathname, maybeFile });
    if (existsSync(strippedHash)) {
      const args = url.searchParams.getAll('args');
      await runPromptProcess(maybeFile, args, {
        force: true,
        trigger: Trigger.Protocol,
        sponsorCheck: false,
      });
    }
    return;
  }

  if (url.protocol === KIT_PROTOCOL + ':') {
    log.info({ url });
    if (pathname === 'new') {
      await cliFromParams('new-from-protocol', url.searchParams);
      return;
    }
    if (pathname === 'snippet' || url.host === 'snippet') {
      await cliFromParams('snippet', url.searchParams);
      return;
    }

    if (pathname === 'kenv') {
      const repo = url.searchParams.get('repo');
      await runPromptProcess(kitPath('cli', 'kenv-clone.js'), [repo || '']);
      return;
    }
  }
};

const prepareProtocols = async () => {
  app.on('open-url', async (e, u) => {
    log.info('URL PROTOCOL', u);
    if (e) {
      e.preventDefault();
    }
    await protocolHandler(u);
  });

  protocol.registerFileProtocol(KIT_PROTOCOL, (request, callback) => {
    const url = request.url.substr(KIT_PROTOCOL.length + 2);
    const file = { path: url };

    log.info('fileProtocol loading:', file);

    callback(file);
  });

  // session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  //   callback({
  //     responseHeaders: {
  //       'Content-Security-Policy': ["default-src 'self'"],
  //       ...details.responseHeaders,
  //     },
  //   });
  // });
};

const ensureKitDirs = async () => {
  await ensureDir(kitPath('logs'));
  await ensureDir(kitPath('db'));
  await ensureDir(tmpClipboardDir);
  await ensureDir(tmpDownloadsDir);
  await getPrefsDb();
};

const ensureKenvDirs = async () => {
  await ensureDir(kenvPath('kenvs'));
  await ensureDir(kenvPath('assets'));
};

const assignDisplays = () => {
  kitState.displays = screen.getAllDisplays();
};

const systemEvents = () => {
  screen.addListener(
    'display-added',
    debounce(() => {
      log.info('🖥️ Display added');
      clearPromptCache();

      assignDisplays();
    }, 1000),
  );

  screen.addListener(
    'display-removed',
    debounce(() => {
      log.info('🖥️ Display removed');
      clearPromptCache();
      assignDisplays();
    }, 1000),
  );

  screen.addListener(
    'display-metrics-changed',
    debounce((_, metrics) => {
      log.info('🖥️ Display metrics changed');
      log.info(metrics?.id, metrics?.bounds);
      assignDisplays();
    }, 1000),
  );

  powerMonitor.addListener('on-battery', () => {
    log.info('🔋 on battery');
  });

  powerMonitor.addListener('on-ac', () => {
    log.info('🔌  on ac');
  });

  powerMonitor.addListener('suspend', () => {
    log.info('😴 System suspending. Removing watchers.');
    // if (kitState.scriptPath === getMainScriptPath())
    // TODO: Hide main prompts when sleep?
    // maybeHide(HideReason.Suspend);
    // teardownWatchers();
    sleepSchedule();
    try {
      logMap.clear();
    } catch (error) {
      log.error(error);
    }

    kitState.waking = true;
    kitState.suspended = true;
  });

  powerMonitor.addListener(
    'resume',
    debounce(
      async () => {
        // wait 5 seconds for the system to wake up
        await new Promise((resolve) => setTimeout(resolve, 5000));

        log.info('🌄 System waking');
        // await setupWatchers();

        kitState.suspended = false;

        // startClipboardAndKeyboardWatchers();

        if (!kitState.updateDownloaded) {
          await new Promise((resolve) => setTimeout(resolve, 10000));

          try {
            checkForUpdates();
          } catch (error) {
            log.error('Error checking for updates', error);
          }
        }

        setTimeout(() => {
          kitState.waking = false;
        }, 10000);
      },
      5000,
      { leading: true },
    ),
  );

  powerMonitor.addListener('lock-screen', () => {
    kitState.screenLocked = true;

    // TODO: Hide main prompts when sleep?
    // if (!isVisible()) {
    // maybeHide(HideReason.LockScreen);
    // }
  });

  powerMonitor.addListener('unlock-screen', () => {
    kitState.screenLocked = false;
  });
};

const ready = async () => {
  new WindowMonitor();
  assignDisplays();
  try {
    const isWindows = os.platform() === 'win32';
    if (!isWindows) {
      startSK();
    }

    const isMac = os.platform() === 'darwin';
    if (isMac) {
      log.info('isMac');
      let authorized = shims['node-mac-permissions'].getAuthStatus('accessibility') === 'authorized';
      log.info('authorized', authorized);
      kitStore.set('accessibilityAuthorized', authorized);

      if (!authorized) {
        setInterval(() => {
          authorized = shims['node-mac-permissions'].getAuthStatus('accessibility') === 'authorized';
          if (authorized) {
            kitStore.set('accessibilityAuthorized', authorized);

            log.info('🌎 Accessibility Mode Enabled. Relaunching...');
            app.relaunch();
            app.exit();
          }
        }, 1000);
      }
    }

    await ensureKitDirs();
    await ensureKenvDirs();
    // createLogs();
    const kitLogsPath = kitPath('logs');
    const appLogsPath = app.getPath('logs');
    log.info(`appLogsPath: ${appLogsPath}`);

    const isSymlink = async (path: string) => {
      try {
        const stats = await lstat(path);
        return stats.isSymbolicLink();
      } catch (error) {
        return false;
      }
    };

    try {
      if (!(await isSymlink(kitLogsPath)) && (await pathExists(kitLogsPath))) {
        await rimraf(kitLogsPath);
      }

      await symlink(appLogsPath, kitLogsPath);
    } catch (error) {
      log.error(error);
    }

    await prepareProtocols();
    await setupLog('Protocols Prepared');
    await setupSettings();

    await setupTray(true, 'default');

    await setupLog('Tray created');

    await setupWatchers();
    await setupLog('Shortcuts Assigned');

    await setupLog('');
    setupDone();
    await cacheKitScripts();

    // ensureIdleProcess();

    handleWidgetEvents();

    scheduleDownloads();

    subscribeKey(kitState, 'previousDownload', () => {
      scheduleDownloads();
    });

    systemEvents();

    syncClipboardStore();
    startClipboardAndKeyboardWatchers();
    actualHideDock();

    checkTray();

    updateMainShortcut(kitState?.kenvEnv?.KIT_MAIN_SHORTCUT);

    if (process.env.KIT_LOG_PROMPT_STATE) {
      setInterval(() => {
        logPromptState();
      }, 100);
    }

    if (process.env.NODE_ENV === 'development') {
      process.on('warning', (warning) => {
        log.warn(warning);
      });

      process.on('newListener', (event, listener) => {
        log.info('newListener', event);
      });
    }

    // log.info(`NODE_ENV`, process.env.NODE_ENV);
  } catch (error) {
    log.warn(error);
  }
};

const kitExists = async () => {
  setupLog(kitPath());
  const doesKitExist = existsSync(kitPath('package.json'));

  await setupLog(`kit${doesKitExist ? '' : ' not'} found at ${kitPath()}`);

  return doesKitExist;
};

const isContributor = async () => {
  // eslint-disable-next-line no-return-await
  return (await kitExists()) && kitIgnore();
};

const kenvExists = async () => {
  const doesKenvExist = existsSync(kenvPath());
  await setupLog(`kenv${doesKenvExist ? '' : ' not'} found at ${kenvPath()}`);

  return doesKenvExist;
};

const kenvConfigured = async () => {
  const isKenvConfigured = existsSync(kenvPath('.env'));
  await setupLog(`kenv is${isKenvConfigured ? '' : ' not'} configured at ${kenvPath()}`);

  return isKenvConfigured;
};

const nodeModulesExists = async () => {
  const doesNodeModulesExist = existsSync(kitPath('node_modules'));
  await setupLog(`node_modules${doesNodeModulesExist ? '' : ' not'} found at ${kitPath()}`);

  return doesNodeModulesExist;
};



export const useElectronNodeVersion = async (cwd: string, config:NpmConfig) => {
  const pnpmPath = await getPnpmPath();
  log.info(`🚶 Setting pnpm node version to ${process.versions.node} with ${pnpmPath}`);
  await setNpmrcConfig(cwd, config);

  try{
    const nodeVersion = await spawnP(pnpmPath, ['node', '--version'], {
      cwd,
    });
    log.info(`Set node version in: ${nodeVersion} for ${cwd} .npmrc`);
  } catch (error) {
    log.error(error);
    log.info('🍂 Falling back to internal terminal...');
    await invoke(`${pnpmPath} node --version`, cwd);
  }

};

const verifyInstall = async () => {
  log.info('-----------------------------------------------');
  log.info(process.env);
  log.info('-----------------------------------------------');

  if (process.env.MAIN_SKIP_SETUP) {
    log.info('⏭️ Skipping verifyInstall');
    return;
  }

  await setupLog('Verifying ~/.kit exists:');
  const checkKit = await kitExists();
  await setupLog('Verifying ~/.kenv exists:');
  const checkKenv = await kenvExists();
  await matchPackageJsonEngines();

  // await setupPnpm();

  // const checkNodeModules = await nodeModulesExists();
  // await setupLog(checkNodeModules ? 'node_modules found' : 'node_modules missing');

  const isKenvConfigured = await kenvConfigured();
  await setupLog(isKenvConfigured ? 'kenv .env found' : 'kenv .env missinag');

  log.info(`KIT_NODE_PATH: ${process.env.KIT_NODE_PATH}`, `kitState.KIT_NODE_PATH: ${kitState.KIT_NODE_PATH}`);


  if (checkKit && checkKenv && kitState.KIT_NODE_PATH && isKenvConfigured) {
    await setupLog('Install verified');
    return true;
  }

  throw new Error('Install not verified...');
};

const isNewVersion = async () => {
  const currentVersion = getVersion();
  const storedVersion = await getStoredVersion();

  const versionMatch = semver.eq(currentVersion, storedVersion);
  await setupLog(
    `🤔 Stored version: ${storedVersion} -> Current version: ${currentVersion}. Semver match? ${
      versionMatch ? 'true' : 'false'
    }`,
  );

  return !versionMatch;
};

const setupScript = (...args: string[]) => {
  if (process.env.MAIN_SKIP_SETUP) {
    log.info('⏭️ Skipping setupScript', args);
    return;
  }
  return new Promise((resolve, reject) => {
    log.info(`🔨 Running Setup Script ${args.join(' ')}`);
    const child = fork(kitPath('run', 'terminal.js'), args, createForkOptions());

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        const dataString = typeof data === 'string' ? data : data.toString();
        log.info(dataString);
        sendSplashBody(dataString);
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        const dataString = typeof data === 'string' ? data : data.toString();
        log.info(dataString);
        sendSplashBody(dataString);
      });
    }

    child.on('exit', (code) => {
      log.info(`🔨 Setup Script exited with code ${code}`);
      if (code === 0) {
        resolve('success');
      } else {
        reject(new Error('Setup script failed'));
      }
    });

    child.on('error', (error: Error) => {
      log.error(`Error in setupScript`, error);
      reject(error);
      ohNo(error);
    });
  });
};

const ensureEnv = async () => {
  log.info('🧑‍🔧 ensureEnv...');
  if (!(await kenvConfigured())) {
    await setupLog('Run .kenv setup script...');

    await setupScript(kitPath('setup', 'setup.js'));
    await kenvConfigured();
  }
};

const checkKit = async () => {
  log.info('checkKit');
  // log.info(`Waiting 10 seconds...`);
  // await new Promise((resolve, reject) => {
  //   setTimeout(() => {
  //     resolve();
  //   }, 10000);
  // });

  log.info(`🧐 Checking ${KIT}`);

  await setupTray(true, 'busy');
  await setupLog('Tray created');

  const options: SpawnSyncOptions = {
    cwd: KIT,
    encoding: 'utf-8',
    env: {
      KIT,
      KENV: kenvPath(),
      PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
    },
    stdio: 'pipe',
  };

  log.info(`🧐 Checking ${KIT}`, options);

  if (process.env.NODE_ENV === 'development') {
    // try {
    //   // await installExtensions();
    // } catch (error) {
    //   log.info('Failed to install extensions', error);
    // }
  }
  log.info('Starting IPC...');
  startIpc();
  log.info('IPC started.');
  // await createPromptWindow();

  await setupLog('Prompt window created');

  await setupLog('\n\n---------------------------------');
  await setupLog(`Launching Script Kit  ${getVersion()}`);
  await setupLog(`auto updater detected version: ${autoUpdater.currentVersion}`);

  log.info('PATH:', KIT_FIRST_PATH);
  try {
    configureAutoUpdate();
  } catch (error) {
    log.error(error);
  }
  try {
    await checkForUpdates();
  } catch (error) {
    log.error(error);
  }

  if (process.env.KIT_SPLASH) {
    await showSplash();
  }

  const storedVersion = await getStoredVersion();
  log.info(`Stored version: ${storedVersion}`);

  if (!(await kitExists()) || storedVersion === '0.0.0') {
    if (!process.env.KIT_SPLASH) {
      log.info(`🌑 shouldUseDarkColors: ${nativeTheme.shouldUseDarkColors ? 'true' : 'false'}`);

      const { scriptKitTheme, scriptKitLightTheme } = getThemes();

      setTheme(nativeTheme.shouldUseDarkColors ? scriptKitTheme : scriptKitLightTheme, 'install');

      await showSplash();
    }
    kitState.installing = true;
    log.info('🔥 Starting Kit First Install');
  }

  let nodePath = '';
  const findNodePath = async () => {
    if(process.env.KIT_NODE_PATH) {
      return process.env.KIT_NODE_PATH;
    }
    const pnpmPath = await getPnpmPath();
    log.info(`🚶 Using ${pnpmPath} node -e to find node...`);
    try{
      return await spawnP(pnpmPath, ['node', '-e', '"console.log(process.execPath)"'], {
        cwd: kitPath(),
        env: {
          ...process.env,
          PNPM_HOME: kitPnpmPath(),
        },
      });
    } catch (error) {
      log.error(error);
      log.info('🍂 Falling back to internal terminal...');
      return await invoke(`"${pnpmPath}" node -e "console.log(process.execPath)"`, kitPath());
    }
  };


  const attemptAssignNodePath = async ()=> {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        nodePath = await findNodePath();
        break;
      } catch (error) {
        log.error(`Attempt ${attempt} failed:`, error);
        if (attempt < maxRetries) {
          log.info('Retrying after initializing pnpm...');
          await getPnpmPath();
        } else {
          log.error('Max retries reached. Unable to find node path.');
          throw error;
        }
      }
    }

    await setupLog(nodePath ? 'node found' : 'node missing');

    kitState.KIT_NODE_PATH = nodePath;
    log.info(`🚶 Assigned KIT_NODE_PATH: ${kitState.KIT_NODE_PATH}`);
    process.env.KIT_NODE_PATH = kitState.KIT_NODE_PATH;
    setEnvVar('KIT_NODE_PATH', kitState.KIT_NODE_PATH);
    process.env.PATH = path.dirname(kitState.KIT_NODE_PATH) + path.delimiter + process.env.PATH;
    log.info(`🚶 Assigned PATH with prefixed KIT_NODE_PATH: ${process.env.PATH}`);
  }
  const requiresInstall = (await isNewVersion()) || !(await kitExists());
  log.info(`Requires install: ${requiresInstall}`);
  if (await isContributor()) {
    await setupLog('Welcome fellow contributor! Thanks for all you do!');
  } else if (requiresInstall) {
    if (await kitExists()) {
      kitState.updateInstalling = true;
      await setupLog('Cleaning previous .kit');
      const cleanKitStart = performance.now();
      await cleanKit();
      const cleanKitEnd = performance.now();
      log.info(`🧹 Cleaned previous .kit in ${cleanKitEnd - cleanKitStart}ms`);
      trackEvent(TrackEvent.ApplyUpdate, {
        previousVersion: storedVersion,
        newVersion: getVersion(),
      });
    }

    // await setupLog(`.kit doesn't exist or isn't on a contributor branch`);

    const kitTar = getAssetPath('kit.tar.gz');

    log.info(`kitTar: ${kitTar}`);

    try {
      const fileAssets = await readdir(getAssetPath());
      log.info(`fileAssets: ${fileAssets}`);
    } catch (error) {
      log.error(error);
    }

    let kitTarPath = '';

    const bundledKitPath = process.env.KIT_BUNDLED_PATH || getAssetPath('kit.tar.gz');

    if (existsSync(bundledKitPath)) {
      log.info(`📦 Kit file exists at ${bundledKitPath}`);
      kitTarPath = bundledKitPath;
    } else {
      log.info(`📦 Kit file doesn't exist at ${bundledKitPath}`);
      kitTarPath = await downloadKit();
    }

    await extractKitTar(kitTarPath);
    await clearPromptCache();


    await setupLog('Installing pnpm...');
    await getPnpmPath();
    await setupLog('Setting node version in .npmrc...');
    await useElectronNodeVersion(kitPath(), {
      'use-node-version': `${process.versions.node}`,
      registry: 'https://registry.npmjs.org/',
      'save-exact': true,
      'install-links': true,
    });

    log.info(`🚶 Using pnpm to find node. Found ${nodePath}... After...`);
    await attemptAssignNodePath()

    await setupLog('Installing kit deps...');
    await installKitDeps();
  }

  await setupLog('.kit installed');


  // await handleSpawnReturns(`docs-pull`, pullDocsResult);

  log.info('kenvExists');
  const isKenvInstalled = await kenvExists();
  if (isKenvInstalled) {
    // eslint-disable-next-line promise/catch-or-return
    // optionalSetupScript(kitPath('setup', 'build-ts-scripts.js')).then(
    //   (result) => {
    //     log.info(`👍 TS Scripts Built`);
    //     setTimeout(() => {
    //       kitState.waking = false;
    //     }, 10000);
    //     return result;
    //   }
    // );
  } else {
    // Step 4: Use kit wrapper to run setup.js script
    // configWindow?.show();
    await setupLog('Extracting kenv.zip to ~/.kenv...');

    let kenvZipPath = '';

    const bundledKenvPath = process.env.KIT_BUNDLED_KENV_PATH || getAssetPath('kenv.zip');

    if (existsSync(bundledKenvPath)) {
      log.info(`📦 Kenv file exists at ${bundledKenvPath}`);
      kenvZipPath = bundledKenvPath;
    } else {
      log.info(`📦 Kenv file doesn't exist at ${bundledKenvPath}`);
      kenvZipPath = await downloadKenv();
    }

    await extractKenv(kenvZipPath);

    log.info(await readdir(kenvPath()));

    await kenvExists();
    await ensureKenvDirs();
  }

  await useElectronNodeVersion(kenvPath(), {
    'use-node-version': `${process.versions.node}`,
    registry: 'https://registry.npmjs.org/',
    'save-exact': true,
    'install-links': false,
  });

  if (!isKenvInstalled) {
    optionalSetupScript(kitPath('setup', 'clone-examples.js'));
    optionalSetupScript(kitPath('setup', 'clone-sponsors.js'));
  }

  // await installLoaderTools();
  if (process.platform === 'darwin') {
    await installMacDeps();
  }

  try {
    await setupScript(kitPath('setup', 'chmod-helpers.js'));
  } catch (error) {
    log.error(error);
  }

  await ensureEnv();
  await attemptAssignNodePath()
  await setupLog('Update .kenv');

  if (!process.env.MAIN_SKIP_SETUP) {
    await installKenvDeps();
  }

  if (
    requiresInstall &&
    (await kenvExists()) &&
    semver.gt(storedVersion, '0.0.0') &&
    semver.lt(storedVersion, '1.58.0')
  ) {
    await setupLog('Trusting old kenvs...');
    const kenvs = (await getKenvs()).map((kenv: string) => path.basename(kenv));
    for await (const kenv of kenvs) {
      await optionalSetupScript(kitPath('cli', 'kenv-trust.js'), [kenv, kenv]);
    }
  }

  await ensureEnv();

  try {
    log.info('verifyInstall');
    await verifyInstall();

    await setupLog(`👋 Creating bins using ${kitState.KIT_NODE_PATH}`);
    optionalSetupScript(kitPath('cli', 'create-all-bins-no-trash.js'));

    log.info('storeVersion');
    await storeVersion(getVersion());

    reloadApps();

    kitState.starting = false;
    kitState.updateInstalling = false;
    kitState.installing = false;

    // log.info(`kitState`, kitState);

    registerKillLatestShortcut();

    await ready();

    if (kitState.keymap) {
      handleKeymapChange();
    }

    kitState.ready = true;
    kitState.user_id = `${Date.now()}`;
    kitState.app_version = getVersion();

    ensureIdleProcess();

    trackEvent(TrackEvent.Ready, {});

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';

    // TODO: Reimplement SET_READY
    // sendToSpecificPrompt(Channel.SET_READY, true);

    log.info({ mainScriptPath: getMainScriptPath() });
    // startBackgroundTask(kitPath('main', 'app-launcher.js'), [
    //   '--prep',
    //   '--trust',
    // ]);

    const envPath = kenvPath('.env');
    const envData = existsSync(envPath) ? dotenv.parse(readFileSync(envPath)) : {};
    const envKitPath = kenvPath('.env.kit');
    const envKitData = existsSync(envKitPath) ? dotenv.parse(readFileSync(envKitPath)) : {};
    // log.info(`envData`, envPath, envData);
    kitState.kenvEnv = { ...envData, ...envKitData };
    createIdlePty();

    if(kitState.kenvEnv.KIT_AUTOSTART_SERVER === 'true') {
      startServer();
    }

    if (kitState.kenvEnv?.GITHUB_SCRIPTKIT_TOKEN) {
      const userExists = existsSync(kitPath('db', 'user.json'));
      if (!userExists) {
        log.info('🔑 Token found. Authenticating with GitHub...');
        optionalSetupScript(kitPath('cli', 'authenticate.js')).then(() => {
        log.info('🔑 GitHub authenticated');
      }).catch((error) => {
        log.error('🔑 Error authenticating with GitHub', error);
        });
      } else {
        log.info('🔑 ~/.kit/db/user.json already exists');
      }
    }

    // focusPrompt();
    setTimeout(async () => {
      log.info('Parsing scripts...');
      await cacheMainScripts();
    }, 1000);
  } catch (error) {
    log.error(`Error in verifyInstall`, error);
    ohNo(error as Error);
  }
};

emitter.on(KitEvent.SetScriptTimestamp, async (stamp) => {
  await cacheMainScripts({
    channel: Channel.CACHE_MAIN_SCRIPTS,
    value: stamp,
  });
});

app.whenReady()
.then(loadShellEnv)
.then(loadSupportedOptionalLibraries)
.then(checkKit).catch(error => {
  log.error(`Error in app.whenReady`, error);
  ohNo(error as Error);
});

app?.on('will-quit', (e) => {
  log.info('🚪 will-quit');
});

// app?.on('before-quit', (e) => {
//   log.info(`🚪 before-quit`);
//   prepQuitWindow();
//   setTimeout(() => {
//     app.quit();
//     app.exit();
//   });
// });

subscribeKey(kitState, 'allowQuit', async (allowQuit) => {
  trackEvent(TrackEvent.Quit, {
    allowQuit,
  });

  // app?.removeAllListeners('window-all-closed');
  app?.removeAllListeners();
  // emitter?.removeAllListeners();
  // ipcMain?.removeAllListeners();
  mainLog.info('allowQuit begin...');
  prompts.appRunning = false;
  await prepQuitWindow();
  for (const prompt of prompts) {
    await prompt.prepPromptForQuit();
  }

  prompts.idle?.prepPromptForQuit();

  // app?.removeAllListeners('window-all-closed');
  if (!allowQuit) {
    return;
  }
  if (kitState.relaunch) {
    mainLog.info('🚀 Kit.app should relaunch after quit...');
    app.relaunch();
  }
  mainLog.info('😬 Tear down all processes before quit');
  try {
    teardownWatchers();
    sleepSchedule();
    await destroyPtyPool();

    for (const sub of subs) {
      try {
        sub();
      } catch (error) {
        mainLog.error('😬 Error unsubscribing', { error });
      }
    }
    subs.length = 0;
    clearPromptTimers();
    clearStateTimers();
    // destory event emitter named "emitter"
    if (emitter) {
      emitter.removeAllListeners();
    }

    mainLog.info('Cleared out everything...');

    // destroyTray();
  } catch (error) {
    mainLog.error('😬 Error Teardown and Sleep', { error });
  }

  try {
    destroyAllProcesses();
  } catch (error) {
    mainLog.error(error);
  }

  setTimeout(() => {
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      log.info(`🪟 Closing window... ${window.id}`);
      window.close();
      window?.destroy();
    }

    setTimeout(() => {
      const windows = BrowserWindow.getAllWindows();
      for (const window of windows) {
        log.info(`🪟 Final closing window... ${window.id}`);
        window.close();
        window?.destroy();
      }

      destroyPtyPool();
      log.info('🚪 Why is this app still running with all the windows closed?');
      try {
        if (kitState?.quitAndInstall) {
          mainLog.info('🚀 Quit and Install');
          autoUpdater?.quitAndInstall();
        } else {
          mainLog.info('🚀 Quit');
          app?.quit();
          app?.exit(0);
        }
      } catch (error) {
        mainLog.error(error);
        app?.quit();
        app?.exit(0);
      }
    });
  });
});
