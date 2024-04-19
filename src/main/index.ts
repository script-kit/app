import {
  app,
  protocol,
  powerMonitor,
  BrowserWindow,
  crashReporter,
  screen,
  nativeTheme,
} from 'electron';

import './env';

process.on('SIGINT', () => {
  app.quit();
  app.exit();
  console.log('SIGINT');
  process.exit(0);
});

import log from 'electron-log';
global.log = log.create({ logId: 'rendererLog' });
log.initialize();

(global as any).log = log.info;
performance.mark;

// REMOVE-MAC
import nmp from 'node-mac-permissions';
const { getAuthStatus } = nmp;
// END-REMOVE-MAC

import dotenv from 'dotenv';
import unhandled from 'electron-unhandled';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

import path from 'path';
import { fork, SpawnSyncOptions, execFileSync } from 'child_process';
import os from 'os';
import semver from 'semver';
import fsExtra from 'fs-extra';
const { ensureDir, pathExistsSync } = fsExtra;
import { existsSync, readFileSync } from 'fs';
import { readdir, copyFile } from 'fs/promises';

import {
  kenvPath,
  kitPath,
  knodePath,
  KIT_FIRST_PATH,
  tmpClipboardDir,
  tmpDownloadsDir,
  execPath,
  getKenvs,
  getMainScriptPath,
} from '@johnlindquist/kit/core/utils';

import { getPrefsDb } from '@johnlindquist/kit/core/db';
import { subscribeKey } from 'valtio/utils';
import { debounce, throttle } from 'lodash-es';
import { checkTray, setupTray } from './tray';
import { setupWatchers, teardownWatchers } from './watcher';
import {
  getAssetPath,
  getReleaseChannel,
  getPlatformExtension,
} from '../shared/assets';
import { startClipboardAndKeyboardWatchers } from './tick';
import { clearPromptCache, clearPromptTimers, logPromptState } from './prompt';

import { APP_NAME, KIT_PROTOCOL, tildify } from './helpers';
import { getVersion, getStoredVersion, storeVersion } from './version';
import { checkForUpdates, configureAutoUpdate, kitIgnore } from './update';
import { kenvEnv } from '@johnlindquist/kit/types/env';
import {
  cacheKitScripts,
  getThemes,
  initKeymap,
  kitState,
  kitStore,
  subs,
} from '../shared/state';
import { startSK } from './sk';
import {
  destroyAllProcesses,
  ensureIdleProcess,
  handleWidgetEvents,
  setTheme,
} from './process';
import { startIpc } from './ipc';
import { cliFromParams, runPromptProcess } from './kit';
import { scheduleDownloads, sleepSchedule } from './schedule';
import { startSettings as setupSettings } from './settings';
import { registerKillLatestShortcut, updateMainShortcut } from './shortcuts';
import { logMap, mainLog } from './logs';
import { KitEvent, emitter } from '../shared/events';
import { displayError } from './error';
import { TrackEvent, trackEvent } from './track';
import {
  cacheMainScripts,
  cleanKit,
  createLogs,
  downloadKenv,
  downloadKit,
  downloadNode,
  extractKenv,
  extractKitTar,
  extractNode,
  forkOptions,
  installEsbuild,
  installKitInKenv,
  installPlatformDeps,
  matchPackageJsonEngines,
  ohNo,
  optionalSetupScript,
  optionalSpawnSetup,
  sendSplashBody,
  setupDone,
  setupLog,
  showSplash,
} from './install';
import { readKitCss } from './theme';
import { syncClipboardStore } from './clipboard';
import { actualHideDock, clearStateTimers } from './dock';
import { prompts } from './prompts';
import { createIdlePty } from './pty';

// TODO: Read a settings file to get the KENV/KIT paths

log.info(`Setting up process.env`);
// Disables CSP warnings in browser windows.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/* eslint-disable */
(function () {
  if (!process.env.NODE_EXTRA_CA_CERTS) return;
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
  productName: 'YourAppName',
  companyName: 'YourCompany',
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

let prevError = ``;
unhandled({
  showDialog: false,
  logger: throttle(
    (error) => {
      log.warn(error);
      // if error contains "ECONN", then ignore it
      if (error.message.includes('ECONN')) return;
      // if error is the same as prevError, then ignore it
      if (error.message === prevError) return;
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

log.info(`Appending switch: ignore-certificate-errors`);
app.commandLine.appendSwitch('ignore-certificate-errors');

const kenvEnvPath = kenvPath('.env');
const envExists = pathExistsSync(kenvEnvPath);
if (envExists) {
  const envData = dotenv.parse(readFileSync(kenvEnvPath)) as kenvEnv;
  if (envData.KIT_DISABLE_GPU) {
    app.disableHardwareAcceleration();
  }
}

app.setName(APP_NAME);
app.setAsDefaultProtocolClient(KIT_PROTOCOL);

if (app?.dock) {
  app?.dock?.setIcon(getAssetPath('icon.png'));
}
const releaseChannel = getReleaseChannel();
const arch = os.arch();
const platform = os.platform();
const nodeVersion = `v${process.versions.node}`;

app.on('window-all-closed', (e: Event) => {
  mainLog.log(`🪟 window-all-closed`);
  e.preventDefault();
});

app?.on('browser-window-blur', () => {
  log.info(`🪟 browser-window-blur`);
  kitState.emojiActive = false;
});

app?.on('did-resign-active', () => {
  log.info(`🪟 did-resign-active`);
  kitState.emojiActive = false;
});

app?.on('child-process-gone', (event, details) => {
  log.error(`🫣 Child process gone...`);
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
  log.info(`🫣 accessibility-support-changed...`);
  log.info({ event, details });
});

app.on('render-process-gone', (event, details) => {
  log.error(`🫣 Render process gone...`);
  log.error({ event });
});

log.info(`
Release channel: ${releaseChannel}
Arch: ${arch}
Platform: ${platform}
Node version: ${nodeVersion}
Node path: ${execPath}
Electron version: ${process.versions.electron}
Electron Node version: ${process.versions.node}
Electron Chromium version: ${process.versions.chrome}
Electron execPath: ${process.execPath}
`);

process.env.NODE_VERSION = nodeVersion;
process.env.KIT_APP_VERSION = getVersion();

const KIT = kitPath();

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

const newFromProtocol = async (u: string) => {
  const url = new URL(u);
  log.info({ url });
  if (url.protocol === 'kit:') {
    const pathname = url.pathname.replace('//', '');
    if (pathname === 'new') {
      await cliFromParams('new-from-protocol', url.searchParams);
    }
    if (pathname === 'snippet' || url.host === 'snippet') {
      await cliFromParams('snippet', url.searchParams);
    }

    if (pathname === 'kenv') {
      const repo = url.searchParams.get('repo');
      await runPromptProcess(kitPath('cli', 'kenv-clone.js'), [repo || '']);
    }
  }
};

const prepareProtocols = async () => {
  app.on('open-url', async (e, u) => {
    log.info(`URL PROTOCOL`, u);
    if (e) e.preventDefault();
    await newFromProtocol(u);
  });

  protocol.registerFileProtocol(KIT_PROTOCOL, (request, callback) => {
    const url = request.url.substr(KIT_PROTOCOL.length + 2);
    const file = { path: url };

    log.info(`fileProtocol loading:`, file);

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
      log.info(`🖥️ Display added`);
      clearPromptCache();

      assignDisplays();
    }, 1000),
  );

  screen.addListener(
    'display-removed',
    debounce(() => {
      log.info(`🖥️ Display removed`);
      clearPromptCache();
      assignDisplays();
    }, 1000),
  );

  screen.addListener(
    'display-metrics-changed',
    debounce((_, metrics) => {
      log.info(`🖥️ Display metrics changed`);
      log.info(metrics);
      assignDisplays();
    }, 1000),
  );

  powerMonitor.addListener('on-battery', () => {
    log.info(`🔋 on battery`);
  });

  powerMonitor.addListener('on-ac', () => {
    log.info(`🔌  on ac`);
  });

  powerMonitor.addListener('suspend', async () => {
    log.info(`😴 System suspending. Removing watchers.`);
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

        log.info(`🌄 System waking`);
        // await setupWatchers();

        kitState.suspended = false;

        // startClipboardAndKeyboardWatchers();

        if (!kitState.updateDownloaded) {
          await new Promise((resolve) => setTimeout(resolve, 10000));

          try {
            checkForUpdates();
          } catch (error) {
            log.error(`Error checking for updates`, error);
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

  powerMonitor.addListener('lock-screen', async () => {
    kitState.screenLocked = true;

    // TODO: Hide main prompts when sleep?
    // if (!isVisible()) {
    // maybeHide(HideReason.LockScreen);
    // }
  });

  powerMonitor.addListener('unlock-screen', async () => {
    kitState.screenLocked = false;
  });
};

const ready = async () => {
  assignDisplays();
  try {
    // REMOVE-MAC
    const isMac = os.platform() === 'darwin';
    if (isMac) {
      startSK();

      let authorized = getAuthStatus('accessibility') === 'authorized';
      kitStore.set('accessibilityAuthorized', authorized);

      if (!authorized) {
        setInterval(async () => {
          authorized = getAuthStatus('accessibility') === 'authorized';
          if (authorized) {
            kitStore.set('accessibilityAuthorized', authorized);

            log.info(`🌎 Accessibility Mode Enabled. Relaunching...`);
            app.relaunch();
            app.exit();
          }
        }, 1000);
      }
    }
    // END-REMOVE-MAC

    await ensureKitDirs();
    await ensureKenvDirs();
    createLogs();
    await initKeymap();
    await prepareProtocols();
    await setupLog(`Protocols Prepared`);
    await setupSettings();

    await setupTray(true, 'default');

    await setupLog(`Tray created`);

    await setupWatchers();
    await setupLog(`Shortcuts Assigned`);

    await setupLog(``);
    setupDone();
    await cacheKitScripts();

    // ensureIdleProcess();

    handleWidgetEvents();

    scheduleDownloads();

    subscribeKey(kitState, 'previousDownload', async () => {
      scheduleDownloads();
    });

    systemEvents();

    syncClipboardStore();
    startClipboardAndKeyboardWatchers();
    actualHideDock();

    readKitCss();

    checkTray();

    updateMainShortcut(
      kitState.kenvEnv.KIT_MAIN_SHORTCUT || kitState.isMac ? 'cmd ;' : 'ctrl ;',
    );

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
        log.info(`newListener`, event);
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

  await setupLog(`kit${doesKitExist ? `` : ` not`} found at ${kitPath()}`);

  return doesKitExist;
};

const isContributor = async () => {
  // eslint-disable-next-line no-return-await
  return (await kitExists()) && kitIgnore();
};

const kenvExists = async () => {
  const doesKenvExist = existsSync(kenvPath());
  await setupLog(`kenv${doesKenvExist ? `` : ` not`} found at ${kenvPath()}`);

  return doesKenvExist;
};

const kenvConfigured = async () => {
  const isKenvConfigured = existsSync(kenvPath('.env'));
  await setupLog(
    `kenv is${isKenvConfigured ? `` : ` not`} configured at ${kenvPath()}`,
  );

  return isKenvConfigured;
};

const nodeExists = async () => {
  const doesNodeExist = existsSync(execPath);
  await setupLog(`node${doesNodeExist ? `` : ` not`} found at ${execPath}`);

  return doesNodeExist;
};

const nodeModulesExists = async () => {
  const doesNodeModulesExist = existsSync(kitPath('node_modules'));
  await setupLog(
    `node_modules${doesNodeModulesExist ? `` : ` not`} found at ${kitPath()}`,
  );

  return doesNodeModulesExist;
};

const verifyInstall = async () => {
  log.info(`-----------------------------------------------`);
  log.info(process.env);
  log.info(`-----------------------------------------------`);

  if (process.env.MAIN_SKIP_SETUP) {
    log.info(`⏭️ Skipping verifyInstall`);
    return;
  }

  const checkNode = await nodeExists();
  await setupLog(checkNode ? `node found` : `node missing`);

  await setupLog(`Verifying ~/.kit exists:`);
  const checkKit = await kitExists();
  await setupLog(`Verifying ~/.kenv exists:`);
  const checkKenv = await kenvExists();
  await matchPackageJsonEngines();

  const checkNodeModules = await nodeModulesExists();
  await setupLog(
    checkNodeModules ? `node_modules found` : `node_modules missing`,
  );

  const isKenvConfigured = await kenvConfigured();
  await setupLog(isKenvConfigured ? `kenv .env found` : `kenv .env missinag`);

  if (
    checkKit &&
    checkKenv &&
    checkNode &&
    checkNodeModules &&
    isKenvConfigured
  ) {
    await setupLog(`Install verified`);
    return true;
  }

  throw new Error(`Install not verified...`);
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

const checkKit = async () => {
  // log.info(`Waiting 10 seconds...`);
  // await new Promise((resolve, reject) => {
  //   setTimeout(() => {
  //     resolve();
  //   }, 10000);
  // });

  log.info(`🧐 Checking ${KIT}`);

  // prompts.init();
  await setupTray(true, 'busy');
  await setupLog(`Tray created`);

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

  const setupScript = (...args: string[]) => {
    if (process.env.MAIN_SKIP_SETUP) {
      log.info(`⏭️ Skipping setupScript`, args);
      return;
    }
    return new Promise((resolve, reject) => {
      log.info(`🔨 Running Setup Script ${args.join(' ')}`);
      const child = fork(kitPath('run', 'terminal.js'), args, forkOptions);

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
        reject(error);
        ohNo(error);
      });
    });
  };

  if (process.env.NODE_ENV === 'development') {
    try {
      // await installExtensions();
    } catch (error) {
      log.info(`Failed to install extensions`, error);
    }
  }
  log.info(`Starting IPC...`);
  startIpc();
  log.info(`IPC started.`);
  // await createPromptWindow();

  await setupLog(`Prompt window created`);

  await setupLog(`\n\n---------------------------------`);
  await setupLog(`Launching Script Kit  ${getVersion()}`);
  await setupLog(
    `auto updater detected version: ${autoUpdater.currentVersion}`,
  );

  log.info(`PATH:`, KIT_FIRST_PATH);
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

  const isMac = os.platform() === 'darwin';
  if (!(await kitExists()) || storedVersion === '0.0.0') {
    if (!process.env.KIT_SPLASH) {
      log.info(
        `🌑 shouldUseDarkColors: ${
          nativeTheme.shouldUseDarkColors ? 'true' : 'false'
        }`,
      );

      const { scriptKitTheme, scriptKitLightTheme } = getThemes();

      setTheme(
        nativeTheme.shouldUseDarkColors ? scriptKitTheme : scriptKitLightTheme,
      );

      await showSplash();
    }
    kitState.installing = true;
    log.info(`🔥 Starting Kit First Install`);
  }

  let nodeVersionMatch = true;

  if ((await nodeExists()) && !process.env.MAIN_SKIP_SETUP) {
    log.info(`👍 Node Exists`);
    // Compare nodeVersion to execPath
    const execPathVersion = execFileSync(execPath, ['--version']);
    log.info(`existingNode ${nodeVersion}, execPath: ${execPathVersion}`);
    nodeVersionMatch = execPathVersion.toString().trim() === nodeVersion.trim();
  }

  if (!(await nodeExists()) || !nodeVersionMatch) {
    await setupLog(
      `Adding node ${nodeVersion} ${platform} ${arch} ${tildify(knodePath())}`,
    );

    let nodeFilePath = '';
    const bundledNodePath =
      process.env.KIT_BUNDLED_NODE_PATH ||
      getAssetPath(`node.${getPlatformExtension()}`);

    if (existsSync(bundledNodePath)) {
      nodeFilePath = bundledNodePath;
    } else {
      nodeFilePath = await downloadNode();
    }

    log.info(`nodePath: ${nodeFilePath}`);
    await extractNode(nodeFilePath);
  }

  const requiresInstall = (await isNewVersion()) || !(await kitExists());
  log.info(`Requires install: ${requiresInstall}`);
  if (await isContributor()) {
    await setupLog(`Welcome fellow contributor! Thanks for all you do!`);
  } else if (requiresInstall) {
    if (await kitExists()) {
      kitState.updateInstalling = true;
      await setupLog(`Cleaning previous .kit`);
      await cleanKit();
      trackEvent(TrackEvent.ApplyUpdate, {
        previousVersion: storedVersion,
        newVersion: getVersion(),
      });
    }

    await setupLog(`.kit doesn't exist or isn't on a contributor branch`);

    const kitTar = getAssetPath('kit.tar.gz');

    log.info(`kitTar: ${kitTar}`);

    try {
      const fileAssets = await readdir(getAssetPath());
      log.info(`fileAssets: ${fileAssets}`);
    } catch (error) {
      log.error(error);
    }

    let kitTarPath = '';

    const bundledKitPath =
      process.env.KIT_BUNDLED_PATH || getAssetPath(`kit.tar.gz`);

    if (existsSync(bundledKitPath)) {
      log.info(`📦 Kit file exists at ${bundledKitPath}`);
      kitTarPath = bundledKitPath;
    } else {
      log.info(`📦 Kit file doesn't exist at ${bundledKitPath}`);
      kitTarPath = await downloadKit();
    }

    await extractKitTar(kitTarPath);

    await setupLog(`.kit installed`);

    await installEsbuild();

    try {
      await setupScript(kitPath('setup', 'chmod-helpers.js'));
    } catch (error) {
      log.error(error);
    }
    await clearPromptCache();

    // Overwite node_modules/node-notifier/vendor/mac.noindex/terminal-notifier.app/Contents/Resources/Terminal.icns with assets/icon.icns
    try {
      await copyFile(
        getAssetPath('icon.icns'),
        kitPath(
          'node_modules',
          'node-notifier',
          'vendor',
          'mac.noindex',
          'terminal-notifier.app',
          'Contents',
          'Resources',
          'Terminal.icns',
        ),
      );
    } catch (error) {
      log.error(error);
    }
  }

  // await handleSpawnReturns(`docs-pull`, pullDocsResult);

  if (!(await kenvExists())) {
    // Step 4: Use kit wrapper to run setup.js script
    // configWindow?.show();
    await setupLog(`Extracting kenv.zip to ~/.kenv...`);

    let kenvZipPath = '';

    const bundledKenvPath =
      process.env.KIT_BUNDLED_KENV_PATH || getAssetPath('kenv.zip');

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

    optionalSetupScript(kitPath('setup', 'clone-examples.js'));
    optionalSetupScript(kitPath('setup', 'clone-sponsors.js'));
  } else {
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
  }

  if (!(await kenvConfigured())) {
    await setupLog(`Run .kenv setup script...`);

    await setupScript(kitPath('setup', 'setup.js'));
    await kenvConfigured();
  }

  await setupLog(`Update .kenv`);

  // patch now creates an kenvPath(".npmrc") file
  // TODO: Fix
  // await setupScript(kitPath('setup', 'patch.js'));

  await setupLog(`Creating bins`);
  optionalSetupScript(kitPath('cli', 'create-all-bins-no-trash.js'));

  if (!requiresInstall && !process.env.MAIN_SKIP_SETUP) {
    await Promise.all([
      installKitInKenv(),
      installEsbuild(),
      installPlatformDeps(),
    ]);
  }

  if (
    requiresInstall &&
    (await kenvExists()) &&
    semver.gt(storedVersion, '0.0.0') &&
    semver.lt(storedVersion, '1.58.0')
  ) {
    await setupLog(`Trusting old kenvs...`);
    const kenvs = (await getKenvs()).map((kenv: string) => path.basename(kenv));
    for await (const kenv of kenvs) {
      await optionalSetupScript(kitPath('cli', 'kenv-trust.js'), [kenv, kenv]);
    }
  }

  try {
    await verifyInstall();

    await storeVersion(getVersion());

    if (kitState.isMac) {
      optionalSpawnSetup(
        kitPath('main', 'app-launcher.js'),
        '--prep',
        '--trust',
      );
    }

    kitState.starting = false;
    kitState.updateInstalling = false;
    kitState.installing = false;

    // log.info(`kitState`, kitState);

    registerKillLatestShortcut();

    await ready();

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
    const envData = dotenv.parse(readFileSync(envPath));
    // log.info(`envData`, envPath, envData);
    kitState.kenvEnv = envData;
    createIdlePty();

    // focusPrompt();
    setTimeout(async () => {
      log.info(`Parsing scripts...`);
      await cacheMainScripts();
    }, 1000);
  } catch (error) {
    ohNo(error);
  }
};

emitter.on(KitEvent.SetScriptTimestamp, async (stamp) => {
  await cacheMainScripts(stamp);
});

app.whenReady().then(checkKit).catch(ohNo);

subscribeKey(kitState, 'allowQuit', async (allowQuit) => {
  trackEvent(TrackEvent.Quit, {
    allowQuit,
  });
  mainLog.info('allowQuit begin...');
  for (const prompt of prompts) {
    await prompt.prepPromptForQuit();
  }

  // app?.removeAllListeners('window-all-closed');
  if (!allowQuit) return;
  if (kitState.relaunch) {
    mainLog.info(`🚀 Kit.app should relaunch after quit...`);
    app.relaunch();
  }
  mainLog.info(`😬 Tear down all processes before quit`);
  try {
    teardownWatchers();
    sleepSchedule();

    subs.forEach((sub) => {
      try {
        sub();
      } catch (error) {
        mainLog.error(`😬 Error unsubscribing`, { error });
      }
    });
    subs.length = 0;
    clearPromptTimers();
    clearStateTimers();
    // destory event emitter named "emitter"
    if (emitter) emitter.removeAllListeners();

    mainLog.info(`Cleared out everything...`);

    // destroyTray();
  } catch (error) {
    mainLog.error(`😬 Error Teardown and Sleep`, { error });
  }

  try {
    destroyAllProcesses();
  } catch (error) {
    mainLog.error(error);
  }

  app?.removeAllListeners('window-all-closed');
  app?.removeAllListeners();

  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win?.isDestroyed()) {
      win.removeAllListeners();
      win?.destroy();
    }
  });

  try {
    if (kitState?.quitAndInstall) {
      mainLog.info(`🚀 Quit and Install`);
      autoUpdater?.quitAndInstall();
    } else {
      mainLog.info(`🚀 Quit`);
      app?.quit();
    }
  } catch (error) {
    mainLog.error(error);
    app?.quit();
    app?.exit(0);
  }
});
