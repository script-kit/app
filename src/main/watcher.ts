import { debounce } from 'lodash-es';
import { isEqual, omit } from 'lodash-es';

import { existsSync } from 'node:fs';
import { lstat, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { getUserJson } from '@johnlindquist/kit/core/db';
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
import { snippetScriptChanged, removeSnippet, snippetMap } from './tick';
import { cacheMainScripts, debounceCacheMainScripts } from './install';
import { loadKenvEnvironment } from './env-utils';
import { pathExists, pathExistsSync, writeFile } from './cjs-exports';
import { compareArrays, diffArrays } from '../shared/utils';
import { clearInterval, setInterval } from 'node:timers';
import { kenvChokidarPath, kitChokidarPath, slash } from './path-utils';
import { actualHideDock, showDock } from './dock';
import { reloadApps } from './apps';

import { scriptLog, watcherLog as log } from './logs';
import { createIdlePty } from './pty';
import { parseSnippet } from './snippet-cache';

const unlinkScript = (filePath: string) => {
  cancelSchedule(filePath);
  unlinkEvents(filePath);
  removeWatch(filePath);
  removeBackground(filePath);
  removeSnippet(filePath);
  unlinkShortcuts(filePath);
  unlinkBin(filePath);
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

  if (adds.length > 0) {
    log.info('adds', adds);
  }
  if (changes.length > 0) {
    log.info('changes', changes);
  }
  if (removes.length > 0) {
    log.info('removes', removes);
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
  const { dir } = path.parse(binPath);
  if (existsSync(binPath) && dir.endsWith('bin')) {
    log.info(`Removing ${binPath}`);
    rm(binPath);
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
        log.info(`🤔 Cache for ${relativeScriptPath} at ${cachePath} does not exist...`);
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

  log.info(`🔍 ${allScriptPaths.length} scripts found`);

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
      log.verbose(`Unwatching ${filePath}`);
      depWatcher.unwatch(filePath);
    }
  }

  for (const scriptKey of Object.keys(depGraph)) {
    const deps = depGraph[scriptKey];
    for (const dep of deps) {
      const depKenvPath = kenvChokidarPath(dep);
      log.verbose(`Watching ${depKenvPath}`);
      depWatcher.add(depKenvPath);
    }

    if (deps.length > 0) {
      log.info(`${scriptKey} has ${deps.length} dependencies`, deps);
    }
  }
}, 100);

let themeWatcher: FSWatcher;
function watchTheme() {
  const themePath: string =
    (kitState.isDark ? kitState.kenvEnv?.KIT_THEME_DARK : kitState.kenvEnv?.KIT_THEME_LIGHT) || '';
  if (themeWatcher) {
    log.info(`🎨 Unwatching ${themePath}`);
    themeWatcher.close();
  }
  if (pathExistsSync(themePath)) {
    log.info(`🎨 Watching ${themePath}`);
    themeWatcher = chokidar.watch(slash(themePath), {
      ignoreInitial: true,
    });
    themeWatcher.on('all', (eventName, filePath) => {
      log.info(`🎨 ${filePath} changed`);
      updateTheme();
    });
  }
}

const settleFirstBatch = debounce(() => {
  kitState.firstBatch = false;
  scriptLog.info('First batch settled ✅');
}, 1000);

/**
 * Determines whether we should timestamp the script and notify
 * children about the script change based on the current kit state
 * and whether this script is a result of a rebuild, etc.
 */
function shouldTimestampScript(event: WatchEvent, rebuilt: boolean, skipCacheMainMenu: boolean): boolean {
  // If kitState isn't ready or we are rebuilding or still in first batch,
  // we won't timestamp the script and run the standard "change" flow.
  // The return value indicates if we proceed with timestamping.
  return kitState.ready && !rebuilt && !kitState.firstBatch;
}

/**
 * Handles the script timestamping and notifying children
 * that a script has changed.
 */
function timestampAndNotifyChildren(event: WatchEvent, script: Script) {
  debounceSetScriptTimestamp({
    filePath: script.filePath,
    changeStamp: Date.now(),
    reason: `${event} ${script.filePath}`,
  });

  // Only notify children of a script change if it's actually a change (not an add).
  if (event === 'change') {
    checkFileImports(script);
    sendToAllActiveChildren({
      channel: Channel.SCRIPT_CHANGED,
      state: script.filePath,
    });
  }
}

/**
 * Handles the scenario where we're not ready to timestamp or
 * skip the standard steps. We log a message and possibly bail out
 * early if skipCacheMainMenu is false.
 */
function handleNotReady(script: Script, event: WatchEvent, rebuilt: boolean, skipCacheMainMenu: boolean) {
  log.info(
    `⌚️ ${script.filePath} changed, but main menu hasn't run yet. ` + `Skipping compiling TS and/or timestamping...`,
    {
      ready: kitState.ready,
      rebuilt,
      firstBatch: kitState.firstBatch,
    },
  );

  // If we can't skip the main menu caching, exit early to avoid
  // the usual add/change flow.
  if (!skipCacheMainMenu) {
    return true; // indicates early return
  }

  return false; // indicates we should continue
}

/**
 * Perform the additional script-changed logic that happens after
 * the timestamping step is either applied or skipped.
 */
async function finalizeScriptChange(script: Script) {
  // All these calls are side-effects that happen for both add/change
  // once we've either timestamped or decided not to.
  scheduleScriptChanged(script);
  systemScriptChanged(script);
  watchScriptChanged(script);
  backgroundScriptChanged(script);
  snippetScriptChanged(script);
  await shortcutScriptChanged(script);

  // Once the script is fully "added" or "changed", let all children know.
  sendToAllActiveChildren({
    channel: Channel.SCRIPT_ADDED,
    state: script.filePath,
  });

  // Clear any prompt caches associated with this script.
  clearPromptCacheFor(script.filePath);
}

/**
 * If the event is "unlink," perform all necessary cleanup.
 */
function handleUnlinkEvent(script: Script) {
  unlinkScript(script.filePath);

  sendToAllActiveChildren({
    channel: Channel.SCRIPT_REMOVED,
    state: script.filePath,
  });
}

/**
 * If the event is "add" or "change," we have a specific flow.
 * This function orchestrates whether we timestamp the script,
 * notify children, or skip certain steps.
 */
async function handleAddOrChangeEvent(event: WatchEvent, script: Script, rebuilt: boolean, skipCacheMainMenu: boolean) {
  // Log the queue right away for "add"/"change"
  logQueue(event, script.filePath);

  // Decide if we do normal timestamp or skip
  if (shouldTimestampScript(event, rebuilt, skipCacheMainMenu)) {
    timestampAndNotifyChildren(event, script);
  }

  // Wrap up the rest of the script-changed logic
  await finalizeScriptChange(script);
}

/**
 * Main function to handle script changes. We keep the signature the same
 * so we don't break any existing contracts. Internally, we orchestrate
 * smaller, well-named functions for each part of the flow.
 */
export const onScriptChanged = async (
  event: WatchEvent,
  script: Script,
  rebuilt = false,
  skipCacheMainMenu = false,
) => {
  scriptLog.info('🚨 onScriptChanged', event, script.filePath);

  // If this is the first batch of scripts, settle that first.
  if (kitState.firstBatch) {
    settleFirstBatch();
  }

  // Re-run any dependency checks across scripts
  madgeAllScripts();

  log.info(`👀 ${event} ${script.filePath}`);

  // 1. Handle "unlink" events
  if (event === 'unlink') {
    handleUnlinkEvent(script);
  }

  // 2. Handle "add" or "change" events
  if (event === 'change' || event === 'add') {
    await handleAddOrChangeEvent(event, script, rebuilt, skipCacheMainMenu);
  }

  // 3. Update the main scripts cache if necessary.
  //    If we added or removed a script, but skipping main menu caching is false,
  //    then trigger the debounced cache re-build.
  if ((event === 'add' || event === 'unlink') && !skipCacheMainMenu) {
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

export const refreshScripts = debounce(
  async () => {
    log.info('🌈 Refreshing Scripts...');
    const scripts = kitState.scripts.values();
    for await (const script of scripts) {
      await onScriptChanged('change', script, true);
    }

    const scriptlets = kitState.scriptlets.values();
    for await (const scriptlet of scriptlets) {
      await onScriptChanged('change', scriptlet, true);
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

export async function handleSnippetFileChange(eventName: WatchEvent, snippetPath: string) {
  if (eventName === 'unlink') {
    snippetMap.delete(snippetPath);
    return;
  }

  // if 'add' or 'change', parse once, update map
  try {
    const contents = await readFile(snippetPath, 'utf8');
    const { metadata, snippetKey, postfix } = parseSnippet(contents);

    if (!snippetKey) {
      // No expand snippet found => remove from kitState if it had one
      snippetMap.delete(snippetPath);
      return;
    }

    snippetMap.set(snippetPath, {
      filePath: snippetPath,
      snippetKey,
      postfix, // TODO: fix types
      rawMetadata: metadata,
      contents,
    });
  } catch (error) {
    log.warn(`[handleSnippetFileChange] Error reading snippet: ${snippetPath}`, error);
    // remove from kitState
    snippetMap.delete(snippetPath);
  }
}

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

    checkUserDb('GITHUB_SCRIPTKIT_TOKEN removed');
  }

  if (envData?.KIT_API_KEY) {
    log.info(`Detected KIT_API_KEY in .env. Setting kitState.kenvEnv.KIT_API_KEY`);
    kitState.kenvEnv.KIT_API_KEY = envData?.KIT_API_KEY;
  } else if (kitState.kenvEnv.KIT_API_KEY) {
    log.info(`Removing KIT_API_KEY from kitState.kenvEnv`);
    delete kitState.kenvEnv.KIT_API_KEY;

    checkUserDb('KIT_API_KEY removed');
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
  const { added, removed } = diffArrays(kitState.trustedKenvs, trustedKenvs);
  if (added.length > 0 || removed.length > 0) {
    log.info({
      added,
      removed,
    });
  }

  kitState.trustedKenvs = trustedKenvs;

  if (trustedKenvsChanged) {
    log.info('🍺 Trusted Kenvs changed. Refreshing scripts...');

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
  (reason: string) => {
    log.info(`

    🔄 Restarting watchers because: ${reason} ----------------------------------------------------------------------

`);
    teardownWatchers.cancel();
    setupWatchers.cancel();
    setupWatchers('restartWatchers');
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

  const watcherHandler = debounce((eventName: WatchEvent, filePath: string) => {
    log.info(`🔄 ${eventName} ${filePath} from kenv folder watcher`);
    if (eventName === 'addDir') {
      if (watchers.length === 0) {
        log.warn(`🔄 ${filePath} added. Setting up watchers...`);
        setupWatchers('addDir');
      } else {
        log.info(`🔄 ${filePath} added, but watchers already exist. No need to setup watchers...`);
      }
    }

    if (eventName === 'unlinkDir') {
      log.warn(`🔄 ${filePath} unlinked. Tearing down watchers...`);
      teardownWatchers('unlinkDir');
    }
  }, 500);

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

function logActionReason(context: 'Setup' | 'Teardown', reason: string) {
  log.info(`🔄 ${context} watchers because: ${reason}`);
}

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
    logActionReason('Setup', reason);

    teardownWatchers('setupWatchers');
    startPingInterval();
    watchers = startCoreWatchers();
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

export async function handleFileChangeEvent(eventName: WatchEvent, filePath: string, source: string) {
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
  const isRestartEvent = eventName === 'addDir' || eventName === 'unlinkDir' || eventName === 'changeDir';
  const isRestartDirectory = base === 'scripts' || base === 'scriptlets' || base === 'snippets';
  if (kitState.ready && isRestartEvent && isRestartDirectory) {
    restartWatchers.cancel();
    log.info(`🔄 Changed: ${eventName} ${filePath} from ${source}`);

    restartWatchers(`${filePath}: ${eventName}`);
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

  if (base.startsWith('.env')) {
    log.info(`🌎 .env: ${filePath} -> ${eventName}`);
    parseEnvFile();
    return;
  }

  if (base === 'package.json') {
    log.info('package.json changed');
    return;
  }

  if (base === 'scripts.json') {
    log.info('scripts.json changed. Is this a bug?');

    return;

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
    return handleSnippetFileChange(eventName, filePath);
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

  log.verbose(`🔄 ${eventName} ${filePath}, but not handled... Is this a bug?`);
}
