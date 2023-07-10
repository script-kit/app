/* eslint-disable no-nested-ternary */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
/* eslint-disable no-nested-ternary */
/* eslint-disable import/first */
/* eslint-disable jest/no-identical-title */
/* eslint-disable jest/expect-expect */
/* eslint global-require: off, no-console: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `yarn build` or `yarn build-main`, this file is compiled to
 * `./src/main.prod.js` using webpack. This gives us some performance wins.
 */

import {
  app,
  protocol,
  powerMonitor,
  shell,
  BrowserWindow,
  crashReporter,
  screen,
  nativeTheme,
} from 'electron';

import installExtension, {
  REACT_DEVELOPER_TOOLS,
} from 'electron-devtools-installer';

import unhandled from 'electron-unhandled';
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

import path from 'path';
import { fork, SpawnSyncOptions, execFileSync } from 'child_process';
import os from 'os';
import semver from 'semver';
import { ensureDir, pathExistsSync } from 'fs-extra';
import { existsSync } from 'fs';
import { readdir, copyFile } from 'fs/promises';

import { Channel, ProcessType, UI, PROMPT } from '@johnlindquist/kit/cjs/enum';
import { PromptData } from '@johnlindquist/kit/types/core';

import {
  kenvPath,
  kitPath,
  knodePath,
  KIT_FIRST_PATH,
  tmpClipboardDir,
  tmpDownloadsDir,
  execPath,
  appDbPath,
  getKenvs,
  mainScriptPath,
} from '@johnlindquist/kit/cjs/utils';

import {
  getPrefsDb,
  getShortcutsDb,
  getAppDb,
  getScripts,
} from '@johnlindquist/kit/cjs/db';
import { subscribeKey } from 'valtio/utils';
import { assign, debounce, throttle } from 'lodash';
import { snapshot } from 'valtio';
import { setupTray } from './tray';
import { setupWatchers, teardownWatchers } from './watcher';
import {
  getAssetPath,
  getReleaseChannel,
  getPlatformExtension,
} from './assets';
import {
  clearTickTimers,
  configureInterval,
  destroyInterval,
  toggleTickOn,
} from './tick';
import {
  clearPromptCache,
  createPromptWindow,
  sendToPrompt,
  setPromptData,
  setScript,
  focusPrompt,
  clearPromptTimers,
  maybeHide,
  reload,
  isVisible,
  preloadChoices,
} from './prompt';
import { APP_NAME, KIT_PROTOCOL, tildify } from './helpers';
import { getVersion, getStoredVersion, storeVersion } from './version';
import { checkForUpdates, configureAutoUpdate, kitIgnore } from './update';
import {
  appDb,
  cacheKitScripts,
  checkAccessibility,
  clearStateTimers,
  getThemes,
  initKeymap,
  kitState,
  subs,
} from './state';
import { startSK } from './sk';
import {
  cacheChoices,
  destroyAllProcesses,
  ensureIdleProcess,
  handleWidgetEvents,
  setTheme,
} from './process';
import { startIpc } from './ipc';
import { runPromptProcess } from './kit';
import { scheduleDownloads, sleepSchedule } from './schedule';
import { startSettings as setupSettings } from './settings';
import { SPLASH_PATH } from './defaults';
import { registerKillLatestShortcut } from './shortcuts';
import { mainLog } from './logs';
import { emitter } from './events';
import { readyPty } from './pty';
import { displayError } from './error';
import { HideReason, Trigger } from './enums';
import { TrackEvent, trackEvent } from './track';
import {
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
  ohNo,
  optionalSetupScript,
  sendSplashBody,
  sendSplashHeader,
  setupDone,
  setupLog,
} from './install';

// Disables CSP warnings in browser windows.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/* eslint-disable */
(function () {
  if (!process.env.NODE_EXTRA_CA_CERTS) return;
  let extraca: any = null;
  try {
    extraca = require('fs').readFileSync(process.env.NODE_EXTRA_CA_CERTS);
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

crashReporter.start({ submitURL: '', uploadToServer: false });

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
    }
  ),
});

if (!app.requestSingleInstanceLock()) {
  app.exit();
}

app.commandLine.appendSwitch('ignore-certificate-errors');

if (pathExistsSync(appDbPath) && appDb) {
  log.info(`Prefs:`, { appDb: snapshot(appDb) });
  if (appDb.disableGpu) {
    app.disableHardwareAcceleration();
  }
}

app.setName(APP_NAME);
if (app?.dock) {
  app?.dock?.setIcon(getAssetPath('icon.png'));
}

app.setAsDefaultProtocolClient(KIT_PROTOCOL);
if (app?.dock) {
  // app?.dock?.hide();
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

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

if (
  process.env.NODE_ENV === 'development' ||
  process.env.DEBUG_PROD === 'true'
) {
  require('electron-debug')({ showDevTools: false });
}

// fmkadmapgofadopljbjfkapdkoienihi
const installExtensions = async () => {
  const result = await installExtension(REACT_DEVELOPER_TOOLS, {
    loadExtensionOptions: { allowFileAccess: true },
  }).catch((error) => {
    log.info(`😬 DEVTOOLS INSTALL FAILED`, { error });
  });
  if (result) log.info(`😬 DEVTOOLS INSTALLED`, { result });
};

const cliFromParams = async (cli: string, params: URLSearchParams) => {
  const name = params.get('name');
  const newUrl = params.get('url');
  if (name && newUrl) {
    await runPromptProcess(kitPath(`cli/${cli}.js`), [name, '--url', newUrl], {
      force: true,
      trigger: Trigger.Protocol,
    });
    return true;
  }

  const content = params.get('content');

  if (content) {
    await runPromptProcess(
      kitPath(`cli/${cli}.js`),
      [name || '', '--content', content],
      {
        force: true,
        trigger: Trigger.Protocol,
      }
    );
    return true;
  }
  return false;
};

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

app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', async (event, navigationUrl) => {
    try {
      const url = new URL(navigationUrl);
      log.info(`👉 Prevent navigating to ${navigationUrl}`);
      event.preventDefault();

      const pathname = url.pathname.replace('//', '');

      if (url.host === 'scriptkit.com' && url.pathname === '/api/new') {
        await cliFromParams('new-from-protocol', url.searchParams);
      } else if (url.host === 'scriptkit.com' && pathname === 'kenv') {
        const repo = url.searchParams.get('repo');
        await runPromptProcess(kitPath('cli', 'kenv-clone.js'), [repo || '']);
      } else if (url.protocol === 'kit:') {
        log.info(`Attempting to run kit protocol:`, JSON.stringify(url));
        // await cliFromParams(url.pathname, url.searchParams);
      } else if (url.protocol === 'submit:') {
        sendToPrompt(Channel.SET_SUBMIT_VALUE, url.pathname);
      } else if (url.protocol.startsWith('http')) {
        shell.openExternal(url.href);
      }
    } catch (e) {
      log.warn(e);
    }
  });
});

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
  await getShortcutsDb();
};

const ensureKenvDirs = async () => {
  await ensureDir(kenvPath('kenvs'));
  await ensureDir(kenvPath('assets'));
};

const systemEvents = () => {
  screen.addListener(
    'display-added',
    debounce(() => {
      log.info(`🖥️ Display added`);
      clearPromptCache();
    }, 1000)
  );

  screen.addListener(
    'display-removed',
    debounce(() => {
      log.info(`🖥️ Display removed`);
      clearPromptCache();
    }, 1000)
  );

  // screen.addListener(
  //   'display-metrics-changed',
  //   debounce((_, metrics) => {
  //     log.info(`🖥️ Display metrics changed`);
  //     log.info(metrics);
  //   }, 1000)
  // );

  powerMonitor.addListener('on-battery', () => {
    log.info(`🔋 on battery`);
  });

  powerMonitor.addListener('on-ac', () => {
    log.info(`🔌  on ac`);
  });

  powerMonitor.addListener('suspend', async () => {
    log.info(`😴 System suspending. Removing watchers.`);
    if (kitState.isMainScript()) maybeHide('SUSPEND');
    teardownWatchers();
    sleepSchedule();

    kitState.waking = true;
    kitState.suspended = true;
  });

  powerMonitor.addListener('resume', async () => {
    // wait 5 seconds for the system to wake up
    await new Promise((resolve) => setTimeout(resolve, 5000));
    log.info(`🌄 System waking. Starting watchers.`);
    await setupWatchers();

    kitState.suspended = false;

    toggleTickOn();

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
  });

  powerMonitor.addListener('lock-screen', async () => {
    kitState.screenLocked = true;

    if (!isVisible()) {
      reload();
      maybeHide(HideReason.LockScreen);
    }
  });

  powerMonitor.addListener('unlock-screen', async () => {
    kitState.screenLocked = false;
  });
};

export const cacheMainScripts = async () => {
  const scripts = await getScripts(false);
  cacheChoices(mainScriptPath, scripts);
  preloadChoices(scripts);
};

const ready = async () => {
  try {
    await ensureKitDirs();
    await ensureKenvDirs();
    createLogs();
    await initKeymap();
    await prepareProtocols();
    await setupLog(`Protocols Prepared`);
    await setupSettings();

    await setupTray(true, 'default');
    assign(appDb, (await getAppDb()).data);

    await setupLog(`Tray created`);

    await setupWatchers();
    await setupLog(`Shortcuts Assigned`);

    await checkAccessibility();

    const isMac = os.platform() === 'darwin';

    await setupLog(``);
    setupDone();

    if (isMac) startSK();
    await cacheKitScripts();

    // ensureIdleProcess();

    handleWidgetEvents();

    scheduleDownloads();

    subscribeKey(kitState, 'previousDownload', async () => {
      scheduleDownloads();
    });

    systemEvents();
    readyPty();

    configureInterval();

    log.info(`NODE_ENV`, process.env.NODE_ENV);
  } catch (error) {
    log.warn(error);
  }
};

const kitExists = async () => {
  setupLog(kitPath());
  const doesKitExist = existsSync(kitPath());

  await setupLog(`kit${doesKitExist ? `` : ` not`} found`);

  return doesKitExist;
};

const isContributor = async () => {
  // eslint-disable-next-line no-return-await
  return (await kitExists()) && kitIgnore();
};

const kenvExists = async () => {
  const doesKenvExist = existsSync(kenvPath());
  await setupLog(`kenv${doesKenvExist ? `` : ` not`} found`);

  return doesKenvExist;
};

const kenvConfigured = async () => {
  const isKenvConfigured = existsSync(kenvPath('.env'));
  await setupLog(`kenv is${isKenvConfigured ? `` : ` not`} configured`);

  return isKenvConfigured;
};

const nodeExists = async () => {
  const doesNodeExist = existsSync(execPath);
  await setupLog(`node${doesNodeExist ? `` : ` not`} found`);

  return doesNodeExist;
};

const nodeModulesExists = async () => {
  const doesNodeModulesExist = existsSync(kitPath('node_modules'));
  await setupLog(`node_modules${doesNodeModulesExist ? `` : ` not`} found`);

  return doesNodeModulesExist;
};

const verifyInstall = async () => {
  const checkNode = await nodeExists();
  await setupLog(checkNode ? `node found` : `node missing`);

  await setupLog(`Verifying ~/.kit exists:`);
  const checkKit = await kitExists();
  await setupLog(`Verifying ~/.kenv exists:`);
  const checkKenv = await kenvExists();

  const checkNodeModules = await nodeModulesExists();
  await setupLog(
    checkNodeModules ? `node_modules found` : `node_modules missing`
  );

  await setupLog(`Parsing scripts...`);
  await cacheMainScripts();

  await ensureIdleProcess();

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

const currentVersionIsGreater = async () => {
  const currentVersion = getVersion();
  const storedVersion = await getStoredVersion();

  await setupLog(
    `Stored version: ${storedVersion} -> Current version: ${currentVersion}`
  );

  return semver.gt(currentVersion, storedVersion);
};

const checkKit = async () => {
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

  const showSplash = async () => {
    kitState.ui = UI.splash;
    await setScript(
      {
        name: 'Kit Setup',
        command: 'splash-screen',
        filePath: SPLASH_PATH,
        kenv: '',
        id: 'spash-screen',
        type: ProcessType.Prompt,
        hasPreview: true,
      },
      kitState.pid,
      true
    );

    sendSplashHeader(`Installing Kit SDK and Kit Environment...`);

    log.info(`🌊 Showing Splash Install Screen`);
    await setPromptData({
      ignoreBlur: true,
      ui: UI.splash,
      scriptPath: SPLASH_PATH,
      width: PROMPT.WIDTH.BASE,
      height: PROMPT.HEIGHT.BASE,
    } as PromptData);
    sendSplashBody(`Starting up...`);

    setTimeout(() => {
      focusPrompt();
    }, 500);
  };

  if (process.env.NODE_ENV === 'development') {
    try {
      await installExtensions();
    } catch (error) {
      log.info(`Failed to install extensions`, error);
    }
  }
  startIpc();
  await createPromptWindow();

  await setupLog(`Prompt window created`);

  await setupLog(`\n\n---------------------------------`);
  await setupLog(`Launching Script Kit  ${getVersion()}`);
  await setupLog(
    `auto updater detected version: ${autoUpdater.currentVersion}`
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
        }`
      );

      const { scriptKitTheme, scriptKitLightTheme } = getThemes();

      setTheme(
        nativeTheme.shouldUseDarkColors ? scriptKitTheme : scriptKitLightTheme
      );

      await showSplash();
    }
    kitState.installing = true;
    log.info(`🔥 Starting Kit First Install`);
  }

  let nodeVersionMatch = true;

  if (await nodeExists()) {
    log.info(`👍 Node Exists`);
    // Compare nodeVersion to execPath
    const execPathVersion = execFileSync(execPath, ['--version']);
    log.info(`existingNode ${nodeVersion}, execPath: ${execPathVersion}`);
    nodeVersionMatch = execPathVersion.toString().trim() === nodeVersion.trim();
  }

  if (!(await nodeExists()) || !nodeVersionMatch) {
    await setupLog(
      `Adding node ${nodeVersion} ${platform} ${arch} ${tildify(knodePath())}`
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

  const requiresInstall =
    (await currentVersionIsGreater()) || !(await kitExists());
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
          'Terminal.icns'
        )
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
    optionalSetupScript(kitPath('setup', 'build-ts-scripts.js')).then(
      (result) => {
        log.info(`👍 TS Scripts Built`);
        setTimeout(() => {
          kitState.waking = false;
        }, 10000);
        return result;
      }
    );
  }

  if (!(await kenvConfigured())) {
    await setupLog(`Run .kenv setup script...`);

    await setupScript(kitPath('setup', 'setup.js'));
    await kenvConfigured();
  }

  await setupLog(`Update .kenv`);

  // patch now creates an kenvPath(".npmrc") file
  await setupScript(kitPath('setup', 'patch.js'));

  await setupLog(`Creating bins`);
  optionalSetupScript(kitPath('cli', 'create-all-bins-no-trash.js'));

  if (!requiresInstall) {
    await installKitInKenv();
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
      await optionalSetupScript(kitPath('cli', 'kenv-trust.js'), kenv, kenv);
    }
  }

  try {
    await verifyInstall();

    await storeVersion(getVersion());

    // if (kitState.isMac) {
    //   optionalSpawnSetup(
    //     kitPath('main', 'app-launcher.js'),
    //     '--prep',
    //     '--trust'
    //   );
    // }

    kitState.starting = false;
    kitState.updateInstalling = false;
    kitState.installing = false;

    // log.info(`kitState`, kitState);

    registerKillLatestShortcut();

    await ready();
    kitState.ready = true;
    kitState.user_id = `${Date.now()}`;
    kitState.app_version = getVersion();

    trackEvent(TrackEvent.Ready, {});

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';

    sendToPrompt(Channel.SET_READY, true);

    // startBackgroundTask(kitPath('main', 'app-launcher.js'), [
    //   '--prep',
    //   '--trust',
    // ]);

    focusPrompt();
  } catch (error) {
    ohNo(error);
  }
};

app.whenReady().then(checkKit).catch(ohNo);

subscribeKey(kitState, 'allowQuit', async (allowQuit) => {
  trackEvent(TrackEvent.Quit, {
    allowQuit,
  });
  mainLog.info('allowQuit begin...');

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
    destroyInterval();
    subs.forEach((sub) => {
      try {
        sub();
      } catch (error) {
        mainLog.error(`😬 Error unsubscribing`, { error });
      }
    });
    subs.length = 0;
    clearPromptTimers();
    clearTickTimers();
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
