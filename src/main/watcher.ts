import { debounce } from 'lodash-es';
import { isEqual, omit } from 'lodash-es';

import { existsSync } from 'node:fs';
import { lstat, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { getScripts, getUserJson } from '@johnlindquist/kit/core/db';
import { Channel, Env } from '@johnlindquist/kit/core/enum';
import type { Script, Scriptlet } from '@johnlindquist/kit/types';
import { globby } from 'globby';
import madge, { type MadgeModuleDependencyGraph } from 'madge';
import { snapshot } from 'valtio';
import { subscribeKey } from 'valtio/utils';

import { getKenvFromPath, kenvPath, kitPath, parseScript, resolveToScriptPath } from '@johnlindquist/kit/core/utils';

import chokidar, { type FSWatcher } from 'chokidar';
import { shortcutScriptChanged, unlinkShortcuts } from './shortcuts';

import { backgroundScriptChanged, removeBackground } from './background';
import { cancelSchedule, scheduleScriptChanged } from './schedule';
import { debounceSetScriptTimestamp, kitState, sponsorCheck } from './state';
import { systemScriptChanged, unlinkEvents } from './system-events';
import { removeWatch, watchScriptChanged } from './watch';

import { AppChannel, Trigger } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import { sendToAllPrompts } from './channel';
import { type WatchEvent, startWatching } from './chokidar';
import { isInDirectory } from './helpers';
import { runScript } from './kit';
import { getFileImports } from './npm';
import {
  clearIdleProcesses,
  ensureIdleProcess,
  processes,
  sendToAllActiveChildren,
  spawnShebang,
  updateTheme,
} from './process';
import { clearPromptCache, clearPromptCacheFor, setKitStateAtom } from './prompt';
import { setCSSVariable } from './theme';
import { addSnippet, addTextSnippet, removeSnippet } from './tick';
import { cacheMainScripts } from './install';
import { loadKenvEnvironment } from './env-utils';
import { pathExists, pathExistsSync, writeFile } from './cjs-exports';
import { createLogger } from '../shared/log-utils';
import { compareArrays } from '../shared/utils';
import { clearInterval, setInterval } from 'node:timers';
import { kenvChokidarPath, kitChokidarPath, slash } from './path-utils';
import { actualHideDock, showDock } from './dock';
import { reloadApps } from './apps';

import { scriptLog, watcherLog } from './logs';
import { createIdlePty } from './pty';
const log = createLogger('watcher.ts');

const debounceCacheMainScripts = debounce(cacheMainScripts, 250);

const unlink = (filePath: string) => {
  cancelSchedule(filePath);
  unlinkEvents(filePath);
  removeWatch(filePath);
  removeBackground(filePath);
  removeSnippet(filePath);
  unlinkShortcuts(filePath);

  const binPath = path.resolve(
    path.dirname(path.dirname(filePath)),
    'bin',
    path.basename(filePath).replace(new RegExp(`\\${path.extname(filePath)}$`), ''),
  );

  if (existsSync(binPath)) {
    rm(binPath);
  }
};

const logEvents: { event: WatchEvent; filePath: string }[] = [];

const logAllEvents = () => {
  const adds: string[] = [];
  const changes: string[] = [];
  const removes: string[] = [];

  logEvents.forEach(({ event, filePath }) => {
    if (event === 'add') {
      adds.push(filePath);
    }
    if (event === 'change') {
      changes.push(filePath);
    }
    if (event === 'unlink') {
      removes.push(filePath);
    }
  });

  if (adds.length) {
    watcherLog.info('adds', adds);
  }
  if (changes.length) {
    watcherLog.info('changes', changes);
  }
  if (removes.length) {
    watcherLog.info('removes', removes);
  }

  adds.length = 0;
  changes.length = 0;
  removes.length = 0;

  logEvents.length = 0;
};

const debouncedLogAllEvents = debounce(logAllEvents, 1000);

let prevFilePath = '';
const logQueue = (event: WatchEvent, filePath: string) => {
  if (prevFilePath !== filePath) {
    logEvents.push({ event, filePath });
    debouncedLogAllEvents();
  }
  prevFilePath = filePath;
};

const unlinkBin = (filePath: string) => {
  const binPath = path.resolve(path.dirname(path.dirname(filePath)), 'bin', path.basename(filePath));
  if (existsSync(binPath)) {
    unlink(binPath);
  }
};

const checkFileImports = debounce(async (script: Script) => {
  let imports: string[] = [];
  try {
    imports = await getFileImports(
      script.filePath,
      kenvPath('package.json'),
      script.kenv ? kenvPath('kenvs', script.kenv, 'package.json') : undefined,
    );
  } catch (error) {
    log.error(error);
    imports = [];
  }

  log.info({ imports });

  if (imports?.length && kitState.kenvEnv?.KIT_AUTO_INSTALL !== 'false') {
    log.info(`📦 ${script.filePath} missing imports`, imports);
    emitter.emit(KitEvent.RunPromptProcess, {
      scriptPath: kitPath('cli', 'npm.js'),
      args: imports,
      options: {
        force: true,
        trigger: Trigger.Info,
      },
    });
  }
}, 25);

let depWatcher: FSWatcher;
let depGraph: MadgeModuleDependencyGraph = {};
const getDepWatcher = () => {
  if (depWatcher) {
    return depWatcher;
  }

  depWatcher = chokidar.watch(kenvChokidarPath('package.json'), {
    ignoreInitial: kitState.ignoreInitial,
  });

  depWatcher.on('all', async (eventName, filePath) => {
    log.info(
      `🔍 ${filePath} triggered a ${eventName} event. It's a known dependency of one or more scripts. Doing a reverse lookup...`,
    );

    // globby requires forward slashes
    const relativeFilePath = path.relative(kenvPath(), filePath).replace(/\\/g, '/');
    const affectedScripts = findEntryScripts(depGraph, relativeFilePath);

    log.info(`🔍 ${filePath} is a dependency of these scripts:`, Array.from(affectedScripts));
    log.info('Clearing their respective caches...');

    for await (const relativeScriptPath of affectedScripts) {
      const cachePath = path.join(
        path.dirname(kenvPath(relativeScriptPath)),
        '.cache',
        path.basename(relativeScriptPath) + '.js',
      );
      if (await lstat(cachePath).catch(() => false)) {
        log.info(`🔥 Clearing cache for ${relativeScriptPath} at ${cachePath}`);
        await rm(cachePath);
      } else {
        log.info(`🤔 Cache for ${relativeScriptPath} at ${cachePath} does not exist`);
      }

      const fullPath = kenvPath(relativeScriptPath);
      log.info(`Sending ${fullPath} to all active children`, {
        event: Channel.SCRIPT_CHANGED,
        state: fullPath,
      });
      sendToAllActiveChildren({
        channel: Channel.SCRIPT_CHANGED,
        state: fullPath,
      });

      checkFileImports({
        filePath,
        kenv: getKenvFromPath(filePath),
      } as Script);
    }
  });

  return depWatcher;
};

function findEntryScripts(
  graph: MadgeModuleDependencyGraph,
  relativeDepPath: string,
  checkedScripts: Set<string> = new Set(),
): Set<string> {
  const entries = new Set<string>();
  for (const [script, deps] of Object.entries(graph)) {
    if (deps.includes(relativeDepPath) && !checkedScripts.has(script)) {
      log.info(`🔍 Found ${relativeDepPath} as a dependency of`, script);
      checkedScripts.add(script);
      // Recursively find other scripts that depend on this script
      const more = findEntryScripts(graph, script, checkedScripts);
      if (more.size === 0) {
        entries.add(script);
      } else {
        more.forEach((entry) => entries.add(entry));
      }
    }
  }

  return entries;
}

const madgeAllScripts = debounce(async () => {
  const kenvs = await readdir(kenvPath('kenvs'), {
    withFileTypes: true,
  });

  const allScriptPaths = await globby([
    slash(kenvPath('scripts', '*')),
    ...kenvs.filter((k) => k.isDirectory()).map((kenv) => slash(kenvPath('kenvs', kenv.name, 'scripts', '*'))),
  ]);

  watcherLog.info(`🔍 ${allScriptPaths.length} scripts found`);

  const fileMadge = await madge(allScriptPaths, {
    baseDir: kenvChokidarPath(),
    dependencyFilter: (source) => {
      const isInKenvPath = isInDirectory(source, kenvPath());
      const notInKitSDK = !source.includes('.kit');
      const notAURL = !source.includes('://');
      return isInKenvPath && notInKitSDK && notAURL;
    },
  });
  depGraph = fileMadge.obj();

  const depWatcher = getDepWatcher();
  const watched = depWatcher.getWatched();
  for (const [dir, files] of Object.entries(watched)) {
    for (const file of files) {
      const filePath = path.join(dir, file);
      watcherLog.verbose(`Unwatching ${filePath}`);
      depWatcher.unwatch(filePath);
    }
  }

  for (const scriptKey of Object.keys(depGraph)) {
    const deps = depGraph[scriptKey];
    for (const dep of deps) {
      const depKenvPath = kenvChokidarPath(dep);
      watcherLog.verbose(`Watching ${depKenvPath}`);
      depWatcher.add(depKenvPath);
    }

    if (deps.length > 0) {
      watcherLog.info(`${scriptKey} has ${deps.length} dependencies`, deps);
    }
  }
}, 100);

let themeWatcher: FSWatcher;
function watchTheme() {
  const themePath: string =
    (kitState.isDark ? kitState.kenvEnv?.KIT_THEME_DARK : kitState.kenvEnv?.KIT_THEME_LIGHT) || '';
  if (themeWatcher) {
    watcherLog.info(`🎨 Unwatching ${themePath}`);
    themeWatcher.close();
  }
  if (pathExistsSync(themePath)) {
    watcherLog.info(`🎨 Watching ${themePath}`);
    themeWatcher = chokidar.watch(slash(themePath), {
      ignoreInitial: true,
    });
    themeWatcher.on('all', (eventName, filePath) => {
      watcherLog.info(`🎨 ${filePath} changed`);
      updateTheme();
    });
  }
}

let firstBatch = true;
let firstBatchTimeout: NodeJS.Timeout;
export const reevaluateAllScripts = async () => {
  scriptLog.info('🚨 reevaluateAllScripts');
  for (const script of kitState.scripts.values()) {
    await onScriptChanged('change', script, true);
  }
};

export const onScriptChanged = async (event: WatchEvent, script: Script, rebuilt = false) => {
  scriptLog.info('🚨 onScriptChanged', event, script.filePath);
  if (firstBatch) {
    if (firstBatchTimeout) {
      clearTimeout(firstBatchTimeout);
    }
    firstBatchTimeout = setTimeout(() => {
      firstBatch = false;
      scriptLog.info('Finished parsing scripts ✅');
    }, 1000);
  }

  madgeAllScripts();

  log.info(`👀 ${event} ${script.filePath}`);
  if (event === 'unlink') {
    unlink(script.filePath);
    unlinkBin(script.filePath);
    sendToAllActiveChildren({
      channel: Channel.SCRIPT_REMOVED,
      state: script.filePath,
    });
  }

  if (event === 'change' || event === 'add') {
    logQueue(event, script.filePath);

    if (kitState.ready && !rebuilt && !firstBatch) {
      debounceSetScriptTimestamp({
        filePath: script.filePath,
        changeStamp: Date.now(),
        reason: `${event} ${script.filePath}`,
      });
      if (event === 'change') {
        checkFileImports(script);
        sendToAllActiveChildren({
          channel: Channel.SCRIPT_CHANGED,
          state: script.filePath,
        });
      }
    } else {
      log.info(
        `⌚️ ${script.filePath} changed, but main menu hasn't run yet. Skipping compiling TS and/or timestamping...`,
        {
          ready: kitState.ready,
          rebuilt: rebuilt,
          firstBatch: firstBatch,
        },
      );
      return;
    }

    log.info('Shortcut script changed', script.filePath);
    scheduleScriptChanged(script);
    systemScriptChanged(script);
    watchScriptChanged(script);
    backgroundScriptChanged(script);
    addSnippet(script);
    await shortcutScriptChanged(script);

    sendToAllActiveChildren({
      channel: Channel.SCRIPT_ADDED,
      state: script.filePath,
    });

    clearPromptCacheFor(script.filePath);
  }

  if (event === 'add' || event === 'unlink') {
    debounceCacheMainScripts('Script added or unlinked');
  }
};

export const checkUserDb = debounce(async (eventName: string) => {
  log.info(`checkUserDb ${eventName}`);

  let currentUser;

  try {
    log.info('🔍 Getting user.json');
    currentUser = await getUserJson();
  } catch (error) {
    log.info('🔍 Error getting user.json', error);
    currentUser = {};
  }

  // Check if user data has actually changed
  if (isEqual(currentUser, kitState.user)) {
    log.info('User data unchanged, skipping update');
    return;
  }

  kitState.user = currentUser;

  // Only run set-login if login value changed
  const prevLogin = kitState.user?.login;
  const newLogin = currentUser?.login;
  log.info(`Login status`, {
    prevLogin: prevLogin || 'undefined',
    newLogin: newLogin || 'undefined',
  });
  if (prevLogin !== newLogin) {
    log.info('🔍 Running set-login', newLogin || Env.REMOVE);
    await runScript(kitPath('config', 'set-login'), newLogin || Env.REMOVE);
  }

  const user = snapshot(kitState.user);
  log.info('Send user.json to prompt', {
    login: user?.login,
    name: user?.name,
  });

  sendToAllPrompts(AppChannel.USER_CHANGED, user);

  const isSponsor = await sponsorCheck('Login', false);
  log.info(`🔍 Sponsor check result: ${isSponsor ? '✅' : '❌'}`);
  kitState.isSponsor = isSponsor;
}, 500);

const triggerRunText = debounce(
  async (eventName: WatchEvent) => {
    const runPath = kitPath('run.txt');
    if (eventName === 'add' || eventName === 'change') {
      const runText = await readFile(runPath, 'utf8');
      const [filePath, ...args] = runText.trim().split(' ');
      log.info(`run.txt ${eventName}`, filePath, args);

      try {
        const { shebang } = await parseScript(filePath);

        if (shebang) {
          spawnShebang({
            shebang,
            filePath,
          });
        } else {
          emitter.emit(KitEvent.RunPromptProcess, {
            scriptPath: resolveToScriptPath(filePath, kenvPath()),
            args: args || [],
            options: {
              force: true,
              trigger: Trigger.RunTxt,
            },
          });
        }
      } catch (error) {
        log.error(error);
      }
    } else {
      log.info('run.txt removed');
    }
  },
  1000,
  {
    leading: true,
  },
);

const refreshScripts = debounce(
  async () => {
    log.info('🌈 Refreshing Scripts...');
    const scripts = await getScripts();
    for (const script of scripts) {
      onScriptChanged('change', script, true);
    }
  },
  500,
  { leading: true },
);

const handleScriptletsChanged = debounce(async (eventName: WatchEvent, filePath: string) => {
  scriptLog.info('🚨 dir.endsWith(scriptlets)', eventName, filePath);
  const exists = await pathExists(filePath);
  if (!exists) {
    scriptLog.info(`Scriptlet file ${filePath} has been deleted.`);
    return;
  }
  const beforeScriptlets = structuredClone(kitState.scriptlets);
  scriptLog.info('🎬 Starting cacheMainScripts...');
  try {
    await cacheMainScripts('File change detected');
  } catch (error) {
    log.error(error);
  }
  scriptLog.info('...cacheMainScripts done 🎬');

  const afterScriptlets = kitState.scriptlets;

  const changedScriptlets: Scriptlet[] = [];
  for (const [filePath, scriptlet] of afterScriptlets.entries()) {
    if (beforeScriptlets.has(filePath)) {
      const beforeScriptlet = beforeScriptlets.get(filePath);
      if (!isEqual(omit(beforeScriptlet, 'id'), omit(scriptlet, 'id'))) {
        scriptLog.info(`👛 Scriptlet ${filePath} has changed.`);
        changedScriptlets.push(scriptlet);
      }
    } else {
      scriptLog.info(`➕ Scriptlet ${filePath} has been added.`);
      changedScriptlets.push(scriptlet);
    }
  }

  for await (const scriptlet of changedScriptlets) {
    await onScriptChanged(eventName, scriptlet);
  }

  return;
}, 50);

export const parseEnvFile = debounce(async () => {
  const envData = loadKenvEnvironment();

  if (envData?.KIT_LOGIN) {
    log.info(`Detected KIT_LOGIN in .env. Setting kitState.kenvEnv.KIT_LOGIN`);
    kitState.kenvEnv.KIT_LOGIN = envData?.KIT_LOGIN;
  } else if (kitState.kenvEnv.KIT_LOGIN) {
    log.info(`Removing KIT_LOGIN from kitState.kenvEnv`);
    delete kitState.kenvEnv.KIT_LOGIN;
    kitState.isSponsor = false;
  }

  if (envData?.GITHUB_SCRIPTKIT_TOKEN) {
    log.info(`Detected GITHUB_SCRIPTKIT_TOKEN in .env. Setting kitState.kenvEnv.GITHUB_SCRIPTKIT_TOKEN`);
    kitState.kenvEnv.GITHUB_SCRIPTKIT_TOKEN = envData?.GITHUB_SCRIPTKIT_TOKEN;
  } else if (kitState.kenvEnv.GITHUB_SCRIPTKIT_TOKEN) {
    log.info(`Removing GITHUB_SCRIPTKIT_TOKEN from kitState.kenvEnv`);
    delete kitState.kenvEnv.GITHUB_SCRIPTKIT_TOKEN;
    kitState.isSponsor = false;

    checkUserDb();
  }

  if (envData?.KIT_API_KEY) {
    log.info(`Detected KIT_API_KEY in .env. Setting kitState.kenvEnv.KIT_API_KEY`);
    kitState.kenvEnv.KIT_API_KEY = envData?.KIT_API_KEY;
  } else if (kitState.kenvEnv.KIT_API_KEY) {
    log.info(`Removing KIT_API_KEY from kitState.kenvEnv`);
    delete kitState.kenvEnv.KIT_API_KEY;

    checkUserDb();
  }

  if (envData?.KIT_DOCK) {
    kitState.kenvEnv.KIT_DOCK = envData?.KIT_DOCK;
    if (envData?.KIT_DOCK === 'false') {
      actualHideDock();
    }
    if (envData?.KIT_DOCK === 'true') {
      showDock();
    }
  } else if (kitState.kenvEnv.KIT_DOCK) {
    kitState.kenvEnv.KIT_DOCK = undefined;
    showDock();
  }

  if (envData?.KIT_THEME_LIGHT) {
    log.info('Setting light theme', envData?.KIT_THEME_LIGHT);
    kitState.kenvEnv.KIT_THEME_LIGHT = envData?.KIT_THEME_LIGHT;
  } else if (kitState.kenvEnv.KIT_THEME_LIGHT) {
    kitState.kenvEnv.KIT_THEME_LIGHT = undefined;
    log.info('Removing light theme');
  }

  if (envData?.KIT_THEME_DARK) {
    log.info('Setting dark theme', envData?.KIT_THEME_DARK);
    kitState.kenvEnv.KIT_THEME_DARK = envData?.KIT_THEME_DARK;
  } else if (kitState.kenvEnv.KIT_THEME_DARK) {
    kitState.kenvEnv.KIT_THEME_DARK = undefined;
    log.info('Removing dark theme');
  }

  kitState.tempTheme = '';
  updateTheme();
  watchTheme();

  if (envData?.KIT_TERM_FONT) {
    sendToAllPrompts(AppChannel.SET_TERM_FONT, envData?.KIT_TERM_FONT);
  }

  const defaultKitMono = 'JetBrains Mono';

  if (envData?.KIT_MONO_FONT) {
    setCSSVariable('--mono-font', envData?.KIT_MONO_FONT || defaultKitMono);
  } else if (kitState.kenvEnv.KIT_MONO_FONT) {
    kitState.kenvEnv.KIT_MONO_FONT = undefined;
    setCSSVariable('--mono-font', defaultKitMono);
  }

  const defaultKitSans = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'`;
  if (envData?.KIT_SANS_FONT) {
    setCSSVariable('--sans-font', envData?.KIT_SANS_FONT || defaultKitSans);
  } else if (kitState.kenvEnv.KIT_SANS_FONT) {
    kitState.kenvEnv.KIT_SANS_FONT = undefined;
    setCSSVariable('--sans-font', defaultKitSans);
  }

  const defaultKitSerif = `'ui-serif', 'Georgia', 'Cambria', '"Times New Roman"', 'Times','serif'`;
  if (envData?.KIT_SERIF_FONT) {
    setCSSVariable('--serif-font', envData?.KIT_SERIF_FONT || defaultKitSerif);
  } else if (kitState.kenvEnv.KIT_SERIF_FONT) {
    kitState.kenvEnv.KIT_SERIF_FONT = undefined;
    setCSSVariable('--serif-font', defaultKitSerif);
  }

  if (envData?.KIT_MIC) {
    log.info('Setting mic', envData?.KIT_MIC);
    sendToAllPrompts(AppChannel.SET_MIC_ID, envData?.KIT_MIC);
  }

  if (envData?.KIT_WEBCAM) {
    log.info('Setting webcam', envData?.KIT_WEBCAM);
    sendToAllPrompts(AppChannel.SET_WEBCAM_ID, envData?.KIT_WEBCAM);
  }

  if (envData?.KIT_TYPED_LIMIT) {
    kitState.typedLimit = Number.parseInt(envData?.KIT_TYPED_LIMIT, 10);
  }

  const trustedKenvs = (envData?.[kitState.trustedKenvsKey] || '')
    .split(',')
    .filter(Boolean)
    .map((kenv) => kenv.trim());

  log.info('👩‍⚖️ Trusted Kenvs', trustedKenvs);

  const trustedKenvsChanged = !compareArrays(trustedKenvs, kitState.trustedKenvs);

  kitState.trustedKenvs = trustedKenvs;

  if (trustedKenvsChanged) {
    await refreshScripts();
  }

  if (envData?.KIT_NO_PREVIEW) {
    setKitStateAtom({
      noPreview: envData?.KIT_NO_PREVIEW === 'true',
    });
  } else if (kitState.kenvEnv.KIT_NO_PREVIEW) {
    setKitStateAtom({
      noPreview: false,
    });
  }

  if (envData?.KIT_WIDTH) {
    kitState.kenvEnv.KIT_WIDTH = envData?.KIT_WIDTH;
  } else if (kitState.kenvEnv.KIT_WIDTH) {
    kitState.kenvEnv.KIT_WIDTH = undefined;
  }

  if (envData?.KIT_CACHE_PROMPT) {
    clearPromptCache();
  } else if (kitState.kenvEnv.KIT_CACHE_PROMPT) {
    kitState.kenvEnv.KIT_CACHE_PROMPT = undefined;
    clearPromptCache();
  }

  if (envData?.KIT_SUSPEND_WATCHERS) {
    const suspendWatchers = envData?.KIT_SUSPEND_WATCHERS === 'true';
    kitState.suspendWatchers = suspendWatchers;

    if (suspendWatchers) {
      log.info('⌚️ Suspending Watchers');
      teardownWatchers('suspendWatchers');
    } else {
      log.info('⌚️ Resuming Watchers');
      setupWatchers('subscribeKey: suspendWatchers: false');
    }
  } else if (kitState.suspendWatchers) {
    kitState.suspendWatchers = false;
    log.info('⌚️ Resuming Watchers');
    setupWatchers('subscribeKey: kitState.suspendWatchers: false');
  }

  kitState.kenvEnv = envData;
}, 100);

export const restartWatchers = debounce(
  async (reason: string) => {
    log.info(`

    🔄 Restarting watchers because: ${reason} ----------------------------------------------------------------------

`);
    await teardownWatchers('restartWatchers');
    await setupWatchers('restartWatchers');
  },
  500,
  { leading: false },
);

export function watchKenvDirectory() {
  const kenvFolderWatcher = chokidar.watch(kenvChokidarPath(), {
    ignoreInitial: kitState.ignoreInitial,
    followSymlinks: true,
    depth: 0,
    ignored: (checkPath) => {
      return path.normalize(checkPath) !== path.normalize(kenvChokidarPath());
    },
  });

  const watcherHandler = (eventName: WatchEvent, filePath: string) => {
    log.info(`🔄 ${eventName} ${filePath} from kenv folder watcher`);
    if (eventName === 'addDir') {
      setTimeout(() => {
        if (watchers.length === 0) {
          log.warn(`🔄 ${filePath} added. Setting up watchers...`);
          setupWatchers('addDir');
        } else {
          log.info(`🔄 ${filePath} added, but watchers already exist. No need to setup watchers...`);
        }
      }, 2000);
    }

    if (eventName === 'unlinkDir') {
      log.warn(`🔄 ${filePath} unlinked. Tearing down watchers...`);
      teardownWatchers('unlinkDir');
    }
  };

  const kitFolderWatcher = chokidar.watch(kitChokidarPath(), {
    ignoreInitial: kitState.ignoreInitial,
    followSymlinks: true,
    depth: 0,
    ignored: (checkPath) => {
      return path.normalize(checkPath) !== path.normalize(kitChokidarPath());
    },
  });

  kenvFolderWatcher.on('all', watcherHandler);
  kitFolderWatcher.on('all', watcherHandler);
}

// ---- Extracted Helper Functions ----

function clearAllWatchers(watchers: FSWatcher[]) {
  if (watchers.length === 0) return;

  for (const watcher of watchers) {
    try {
      watcher.removeAllListeners();
      watcher.close();
    } catch (error) {
      log.error('Error closing watcher:', error);
    }
  }

  log.info(`Cleared ${watchers.length} watchers`);
  watchers.length = 0;
}

function stopPingInterval() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

function startPingInterval() {
  stopPingInterval();
  pingInterval = setInterval(async () => {
    if (kitState.waitingForPing) {
      await restartWatchers('No ping response');
      return;
    }

    kitState.waitingForPing = true;
    const pingPath = kitPath('ping.txt');
    const currentDate = new Date().toISOString();
    try {
      await writeFile(pingPath, currentDate);
    } catch (error) {
      log.error(`Error writing to ping.txt: ${error}`);
    }
  }, 60000);
}

function startCoreWatchers(): FSWatcher[] {
  return startWatching(
    async (eventName: WatchEvent, filePath: string, source) => {
      await handleFileChangeEvent(eventName, filePath, source);
    },
    { ignoreInitial: kitState.ignoreInitial },
  );
}

function refreshScriptsIfNeeded() {
  if (kitState.ignoreInitial) {
    refreshScripts();
  }
}

function logActionReason(context: 'Setup' | 'Teardown', reason: string) {
  log.info(`🔄 ${context} watchers because: ${reason}`);
}

let settingUpWatchers = false;
let pingInterval: NodeJS.Timeout | null = null;
let watchers: FSWatcher[] = [];
let suspendingWatchers: boolean;

export const teardownWatchers = debounce(
  (reason: string) => {
    logActionReason('Teardown', reason);
    stopPingInterval();
    clearAllWatchers(watchers);
  },
  250,
  { leading: true },
);

export const setupWatchers = debounce(
  (reason: string) => {
    if (settingUpWatchers) return;
    settingUpWatchers = true;

    logActionReason('Setup', reason);

    teardownWatchers('setupWatchers');
    refreshScriptsIfNeeded();
    startPingInterval();
    watchers = startCoreWatchers();

    settingUpWatchers = false;
  },
  1000,
  { leading: true },
);

subscribeKey(kitState, 'suspendWatchers', (suspendWatchers) => {
  if (suspendingWatchers === suspendWatchers) return;
  suspendingWatchers = suspendWatchers;

  if (suspendWatchers) {
    log.info('⌚️ Suspending Watchers due to state change');
    teardownWatchers('subscribeKey: suspendWatchers');
  } else {
    log.info('⌚️ Resuming Watchers due to state change');
    setupWatchers('subscribeKey: suspendWatchers');
  }
});

emitter.on(KitEvent.TeardownWatchers, teardownWatchers);
emitter.on(KitEvent.RestartWatcher, async () => {
  try {
    await setupWatchers('KitEvent.RestartWatcher');
  } catch (error) {
    log.error(error);
  }
});
emitter.on(KitEvent.Sync, () => {
  checkUserDb('sync');
});

// ---- New handleFileChangeEvent Function ----

async function handleFileChangeEvent(eventName: WatchEvent, filePath: string, source: string) {
  const { base, dir, name } = path.parse(filePath);

  if (base === 'ping.txt') {
    kitState.waitingForPing = false;
    return;
  }

  if (base === 'user.json') {
    await checkUserDb(eventName);
    return;
  }

  // If directories like 'scripts', 'scriptlets', 'snippets' are removed/added,
  // we restart watchers to ensure correct state
  if (kitState.ready && base === name && (name === 'scriptlets' || name === 'scripts' || name === 'snippets')) {
    await restartWatchers(`${filePath}: ${eventName}`);
    return;
  }

  if (base === 'run.txt') {
    log.info(`run.txt ${eventName}`);
    await triggerRunText(eventName);
    return;
  }

  if (base === 'globals.ts') {
    log.info(`globals.ts ${eventName}`);
    clearIdleProcesses();
    ensureIdleProcess();
    createIdlePty();
    return;
  }

  if (base === '.env' || base.startsWith('.env.')) {
    log.info(`🌎 .env: ${filePath} -> ${eventName}`);
    parseEnvFile();
    return;
  }

  if (base === 'package.json') {
    log.info('package.json changed');
    return;
  }

  if (base === 'scripts.json') {
    log.info('scripts.json changed');
    try {
      for (const info of processes) {
        info?.child?.send({ channel: Channel.SCRIPTS_CHANGED });
      }
    } catch (error) {
      log.warn(error);
    }
    return;
  }

  if (dir.endsWith('snippets')) {
    if (eventName === 'add' || eventName === 'change') {
      await cacheMainScripts('Snippet added or changed');
      log.info('Snippet added/changed', filePath);
      addTextSnippet(filePath);
    } else {
      removeSnippet(filePath);
    }
    return;
  }

  if (dir.endsWith('scriptlets')) {
    await handleScriptletsChanged(eventName, filePath);
    return;
  }

  if (dir.endsWith('scripts')) {
    let script: Script;
    try {
      if (eventName !== 'unlink') {
        script = await parseScript(filePath);
      } else {
        script = { filePath, name: path.basename(filePath) };
      }
    } catch (error) {
      log.warn(error);
      script = { filePath, name: path.basename(filePath) };
    }
    await onScriptChanged(eventName, script);
    return;
  }

  if (source === 'app') {
    log.info(`🔄 ${eventName} ${filePath} from app`);
    reloadApps();
    return;
  }

  log.warn(`🔄 ${eventName} ${filePath}, but not handled... Is this a bug?`);
}
