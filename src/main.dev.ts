/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
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
  BrowserWindow,
  powerMonitor,
  session,
  shell,
} from 'electron';

import tar from 'tar';
import clipboardy from 'clipboardy';

if (!app.requestSingleInstanceLock()) {
  app.exit();
}
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import path from 'path';
import {
  spawnSync,
  SpawnSyncOptions,
  SpawnSyncReturns,
  spawn,
} from 'child_process';
import { homedir } from 'os';
import { ensureDir } from 'fs-extra';
import { existsSync, readFileSync } from 'fs';
import { chmod, lstat, readdir, readFile, rm, rmdir } from 'fs/promises';
import { Channel, ProcessType } from '@johnlindquist/kit/cjs/enum';

import {
  kenvPath,
  kitPath,
  KIT_FIRST_PATH,
  tmpClipboardDir,
  tmpDownloadsDir,
} from '@johnlindquist/kit/cjs/utils';
import { getPrefsDb, getShortcutsDb } from '@johnlindquist/kit/cjs/db';
import { createTray } from './tray';
import { cacheMenu, setupWatchers } from './watcher';
import { getAssetPath } from './assets';
import { configureInterval } from './tick';
import { clearPromptCache, createPromptWindow, sendToPrompt } from './prompt';
import { APP_NAME, KIT_PROTOCOL } from './helpers';
import { getVersion, getStoredVersion, storeVersion } from './version';
import { checkForUpdates, configureAutoUpdate, kitIgnore } from './update';
import { INSTALL_ERROR, show } from './show';
import { cacheKitScripts } from './state';
import { startSK } from './sk';
import { processes } from './process';
import { startIpc } from './ipc';
import { runPromptProcess } from './kit';
import { CONFIG_SPLASH, showError } from './main.dev.templates';
import { scheduleScriptChanged } from './schedule';
import { maybeSetLogin } from './settings';

let configWindow: BrowserWindow;

// Disables CSP warnings in browser windows.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

app.setName(APP_NAME);

app.setAsDefaultProtocolClient(KIT_PROTOCOL);
app.dock.hide();
app.dock.setIcon(getAssetPath('icon.png'));

const releaseChannel = readFileSync(
  getAssetPath('release_channel.txt'),
  'utf-8'
).trim();
const arch = readFileSync(getAssetPath('arch.txt'), 'utf-8').trim();
const platform = readFileSync(getAssetPath('platform.txt'), 'utf-8').trim();
const nodeVersion = readFileSync(getAssetPath('node.txt'), 'utf-8').trim();

log.info(`
Release channel: ${releaseChannel}
Arch: ${arch}
Platform: ${platform}
Node version: ${nodeVersion}
`);

const KIT = kitPath();
const options: SpawnSyncOptions = {
  cwd: KIT,
  encoding: 'utf-8',
  env: {
    KIT,
    KENV: kenvPath(),
    PATH: KIT_FIRST_PATH,
  },
};

powerMonitor.on('resume', async () => {
  setTimeout(async () => {
    await checkForUpdates();
  }, 5000);
});

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
  const reactDevToolsDir = path.join(
    homedir(),
    'Library/Application Support/Google/Chrome/Default/Extensions/fmkadmapgofadopljbjfkapdkoienihi/'
  );

  const [version] = await readdir(reactDevToolsDir);

  const reactDevToolsPath = path.resolve(reactDevToolsDir, version);

  await session.defaultSession.loadExtension(reactDevToolsPath, {
    allowFileAccess: true,
  });
};

const cliFromParams = async (cli: string, params: URLSearchParams) => {
  const name = params.get('name');
  const newUrl = params.get('url');
  if (name && newUrl) {
    await runPromptProcess(kitPath(`cli/${cli}.js`), [name, '--url', newUrl]);
    return true;
  }

  const content = params.get('content');

  if (content) {
    await runPromptProcess(kitPath(`cli/${cli}.js`), [
      name || '',
      '--content',
      content,
    ]);
    return true;
  }
  return false;
};

const newFromProtocol = async (u: string) => {
  const url = new URL(u);
  console.log({ url });
  if (url.protocol === 'kit:') {
    const pathname = url.pathname.replace('//', '');
    if (pathname === 'new') {
      await cliFromParams('new', url.searchParams);
    }
    if (pathname === 'snippet' || url.host === 'snippet') {
      await cliFromParams('snippet', url.searchParams);
    }
  }
};

app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', async (event, navigationUrl) => {
    const url = new URL(navigationUrl);
    console.log({ url });
    event.preventDefault();

    if (url.host === 'scriptkit.com' && url.pathname === '/api/new') {
      await cliFromParams('new', url.searchParams);
    } else if (url.protocol === 'kit:') {
      await cliFromParams(url.pathname, url.searchParams);
    } else if (url.protocol === 'submit:') {
      sendToPrompt(Channel.SET_SUBMIT_VALUE, url.pathname);
    } else if (url.protocol.startsWith('http')) {
      shell.openExternal(url.href);
    }
  });
});

const prepareProtocols = async () => {
  app.on('open-url', async (e, u) => {
    log.info(`URL PROTOCOL`, u);
    e.preventDefault();
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

const createLogs = () => {
  log.transports.file.resolvePath = () => kitPath('logs', 'kit.log');
};

const configWindowDone = () => {
  if (configWindow?.isVisible()) {
    configWindow?.webContents.send('UPDATE', {
      header: `Script Kit ${getVersion()}`,
      spinner: false,
      message: `
  <div class="flex flex-col justify-center items-center px-8">
    <div><span class="font-bold"><kbd>cmd</kbd> <kbd>;</kbd></span> to launch main prompt (or click tray icon)</div>
    <div>Right-click tray icon for options</div>
  </div>
  `.trim(),
    });
    configWindow?.on('blur', () => {
      if (!configWindow?.webContents?.isDevToolsOpened()) {
        configWindow?.destroy();
      }
    });
  } else {
    configWindow?.destroy();
  }
};

const updateConfigWindow = (message: string) => {
  if (configWindow?.isVisible()) {
    configWindow?.webContents.send('UPDATE', { message });
  }
};

const setupLog = (message: string) => {
  updateConfigWindow(message);
  log.info(message);
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

const ready = async () => {
  try {
    if (process.env.NODE_ENV === 'development') {
      // await installExtensions();
    }

    await ensureKitDirs();
    await ensureKenvDirs();
    createLogs();
    await prepareProtocols();
    setupLog(`Protocols Prepared`);
    await createTray(true);
    await maybeSetLogin();
    setupLog(`Tray created`);
    await setupWatchers();
    setupLog(`Shortcuts Assigned`);
    await createPromptWindow();
    setupLog(`Prompt window created`);

    await configureInterval();
    setupLog(`Tick started`);

    setupLog(`Kit.app is ready...`);
    configWindowDone();

    startSK();
    await cacheKitScripts();
    await cacheMenu();

    startIpc();
    processes.add(ProcessType.Prompt);
    processes.add(ProcessType.Prompt);
    processes.add(ProcessType.Prompt);

    spawn(`./script`, [`./setup/downloads.js`], options);

    const downloadHot = kitPath('setup', 'downloads.js');
    scheduleScriptChanged({
      name: 'download-hot',
      command: 'download-hot',
      filePath: downloadHot,
      id: downloadHot,
      type: ProcessType.Schedule,
      requiresPrompt: false,
      kenv: '',
      schedule: '0 11 * * *',
    });
  } catch (error) {
    log.warn(error);
  }
};

const handleSpawnReturns = async (
  message: string,
  result: SpawnSyncReturns<any>,
  required = true
) => {
  console.log(`stdout:`, result?.stdout?.toString());
  console.log(`stderr:`, result?.stderr?.toString());
  const { stdout, stderr, error } = result;

  if (stdout?.toString().length) {
    const out = stdout.toString();
    log.info(message, out);
    if (out.length < 200) updateConfigWindow(out);
  }

  if (error && required) {
    throw new Error(error.message);
  }

  if (stderr?.toString().length) {
    updateConfigWindow(stderr.toString());
    console.log({ stderr: stderr.toString() });
    // throw new Error(stderr.toString());
  }

  return result;
};

const kitExists = () => {
  setupLog(kitPath());
  const doesKitExist = existsSync(kitPath());

  setupLog(`kit${doesKitExist ? `` : ` not`} found`);

  return doesKitExist;
};

const kitUserDataExists = () => {
  const userDataExists = existsSync(app.getPath('userData'));
  setupLog(`kit user data ${userDataExists ? `` : ` not`} found`);

  return userDataExists;
};

const isContributor = async () => {
  // eslint-disable-next-line no-return-await
  return kitExists() && kitIgnore();
};

const kenvExists = () => {
  const doesKenvExist = existsSync(kenvPath());
  setupLog(`kenv${doesKenvExist ? `` : ` not`} found`);

  return doesKenvExist;
};

const kenvsExists = () => {
  const doKenvsExists = existsSync(kenvPath('kenvs'));
  setupLog(`kenv/kenvs${doKenvsExists ? `` : ` not`} found`);

  return doKenvsExists;
};

const examplesExists = () => {
  const doExamplesExist = existsSync(kenvPath('kenvs', 'examples'));
  setupLog(`kenv/kenvs/examples${doExamplesExist ? `` : ` not`} found`);

  return doExamplesExist;
};

const kenvConfigured = () => {
  const isKenvConfigured = existsSync(kenvPath('.env'));
  setupLog(`kenv is${isKenvConfigured ? `` : ` not`} configured`);

  return isKenvConfigured;
};

const nodeExists = () => {
  const doesNodeExist = existsSync(kitPath('node', 'bin', 'node'));
  setupLog(`node${doesNodeExist ? `` : ` not`} found`);

  return doesNodeExist;
};

const nodeModulesExists = () => {
  const doesNodeModulesExist = existsSync(kitPath('node_modules'));
  setupLog(`node_modules${doesNodeModulesExist ? `` : ` not`} found`);

  return doesNodeModulesExist;
};

const verifyInstall = async () => {
  setupLog(`Verifying ~/.kit exists:`);
  const checkKit = kitExists();
  setupLog(`Verifying ~/.kenv exists:`);
  const checkKenv = kenvExists();

  const checkNode = nodeExists();
  setupLog(checkNode ? `node found` : `node missing`);

  const checkNodeModules = nodeModulesExists();
  setupLog(checkNodeModules ? `node_modules found` : `node_modules missing`);

  const isKenvConfigured = kenvConfigured();
  setupLog(isKenvConfigured ? `kenv .env found` : `kenv .env missinag`);

  if (
    checkKit &&
    checkKenv &&
    checkNode &&
    checkNodeModules &&
    isKenvConfigured
  ) {
    setupLog(`Install verified`);
    return true;
  }

  throw new Error(`Install not verified...`);
};

const ohNo = async (error: Error) => {
  log.warn(error.message);
  log.warn(error.stack);
  const mainLog = await readFile(
    path.join(homedir(), `Library/Logs/Kit/main.log`),
    {
      encoding: 'utf8',
    }
  );

  await clipboardy.write(
    `
${error.message}
${error.stack}
${mainLog}
  `.trim()
  );
  configWindow?.destroy();

  await show(INSTALL_ERROR, showError(error, mainLog));

  throw new Error(error.message);
};

const extractTar = async (tarFile: string, outDir: string) => {
  setupLog(`Extracting ${tarFile} to ${outDir}`);
  await ensureDir(outDir);

  await tar.x({
    file: tarFile,
    C: outDir,
    strip: 1,
  });
};

const versionMismatch = async () => {
  const currentVersion = getVersion();
  setupLog(`App version: ${currentVersion}`);

  const previousVersion = await getStoredVersion();
  setupLog(`Previous version: ${previousVersion}`);
  return currentVersion !== previousVersion;
};

const cleanKit = async () => {
  const pathToClean = kitPath();

  const keep = (file: string) =>
    file.startsWith('node') || file.startsWith('db');

  // eslint-disable-next-line no-restricted-syntax
  for await (const file of await readdir(pathToClean)) {
    if (keep(file)) continue;

    const filePath = path.join(pathToClean, file);
    const stat = await lstat(filePath);
    if (stat.isDirectory()) {
      await rmdir(filePath, { recursive: true });
    } else {
      await rm(filePath);
    }
  }
};

const cleanUserData = async () => {
  const pathToClean = app.getPath('userData');
  await rmdir(pathToClean, { recursive: true });
};

const KIT_NODE_TAR = process.env.KIT_NODE_TAR || getAssetPath('node.tar.gz');

const checkKit = async () => {
  setupLog(`\n\n---------------------------------`);
  setupLog(`Launching Script Kit  ${getVersion()}`);
  setupLog(`auto updater detected version: ${autoUpdater.currentVersion}`);
  configureAutoUpdate();
  await checkForUpdates();

  if (!kitExists() || (await versionMismatch())) {
    configWindow = await show(
      'splash-setup',
      CONFIG_SPLASH,
      { frame: false },
      false
    );

    if (await isContributor()) {
      setupLog(`Welcome fellow contributor! Thanks for all you do!!!`);
    } else {
      if ((await getStoredVersion()) === '0.0.0') {
        configWindow?.show();
      }

      if (kitExists()) {
        setupLog(`Cleaning previous .kit`);
        await cleanKit();
      }

      setupLog(`.kit doesn't exist or isn't on a contributor branch`);
      const kitTar = getAssetPath('kit.tar.gz');
      await extractTar(kitTar, kitPath());

      if (!nodeExists()) {
        setupLog(
          `Adding node ${nodeVersion} ${platform} ${arch} to ~/.kit/node ...`
        );

        await ensureDir(kitPath('node'));

        if (existsSync(KIT_NODE_TAR)) {
          log.info(`Found ${KIT_NODE_TAR}. Extracting...`);
          await tar.x({
            file: KIT_NODE_TAR,
            C: kitPath('node'),
            strip: 1,
          });
        } else {
          const installScript = `./build/install-node.sh`;
          await chmod(kitPath(installScript), 0o755);
          const nodeInstallResult = spawnSync(
            installScript,
            ` --prefix node --platform darwin`.split(' '),
            options
          );
          await handleSpawnReturns(`install-node.sh`, nodeInstallResult);
        }
      }
      setupLog(`updating ~/.kit packages...`);
      const npmResult = spawnSync(
        `npm`,
        [`i`, `--production`, `--no-progress`, `--quiet`],
        options
      );
      await handleSpawnReturns(`npm`, npmResult);
    }

    await chmod(kitPath('script'), 0o755);
    const chmodResult = spawnSync(
      `./script`,
      [`./setup/chmod-helpers.js`],
      options
    );
    await handleSpawnReturns(`chmod helpers`, chmodResult);

    await clearPromptCache();
  }

  if (kenvsExists() && examplesExists()) {
    setupLog(`Updating examples...`);
    spawn(
      `./script`,
      [`./cli/kenv-pull.js`, kenvPath(`kenvs`, `examples`)],
      options
    );

    // await handleSpawnReturns(`update-examples`, updateExamplesResult);
  }

  // await handleSpawnReturns(`docs-pull`, pullDocsResult);

  if (!kenvExists()) {
    // Step 4: Use kit wrapper to run setup.js script
    configWindow?.show();
    setupLog(`Extract tar to ~/.kenv...`);
    const kenvTar = getAssetPath('kenv.tar.gz');
    await extractTar(kenvTar, kenvPath());
    log.info(await readdir(kenvPath()));

    kenvExists();
    await ensureKenvDirs();

    const cloneExamplesResult = spawnSync(
      `./script`,
      [`./setup/clone-examples.js`],
      options
    );
    await handleSpawnReturns(`clone-examples`, cloneExamplesResult, false);
  }

  await chmod(kitPath('script'), 0o755);

  if (!kenvConfigured()) {
    setupLog(`Run .kenv setup script...`);

    const setupResult = spawnSync(`./script`, [`./setup/setup.js`], options);
    await handleSpawnReturns(`setup`, setupResult);

    kenvConfigured();
  }

  const createAllBins = spawnSync(
    `./script`,
    [`./cli/create-all-bins.js`],
    options
  );
  await handleSpawnReturns(`create-all-bins`, createAllBins);

  setupLog(`Update .kenv`);
  const patchResult = spawnSync(`./script`, [`./setup/patch.js`], options);
  await handleSpawnReturns(`patch`, patchResult);

  await verifyInstall();
  await storeVersion(getVersion());
  await ready();
};

app.whenReady().then(checkKit).catch(ohNo);
