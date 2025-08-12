/* eslint-disable no-restricted-syntax */
/* eslint-disable no-nested-ternary */

import Store, { type Schema } from 'electron-store';

import type { ChildProcess } from 'node:child_process';
import os from 'node:os';
import type { Config, KitStatus } from '@johnlindquist/kit/types/kitapp';
import { type Display, nativeTheme } from 'electron';
import type { LogLevel } from 'electron-log';
import { debounce } from 'lodash-es';
import { subscribeKey } from 'valtio/utils';
import { proxy, snapshot } from 'valtio/vanilla';

import { readdir } from 'node:fs/promises';
import type { Stamp, UserDb } from '@johnlindquist/kit/core/db';
import type {
  Choice,
  FlagsObject,
  PromptData,
  ScoredChoice,
  Script,
  Scriptlet,
  Shortcut,
  Snippet,
} from '@johnlindquist/kit/types/core';
import schedule, { type Job } from 'node-schedule';

import type { Worker } from 'node:worker_threads';
import {
  getTrustedKenvsKey,
  isParentOfDir,
  kenvPath,
  kitPath,
  parseScript,
  tmpClipboardDir,
} from '@johnlindquist/kit/core/utils';
import type { kenvEnv } from '@johnlindquist/kit/types/env';
import axios from 'axios';
import { Trigger } from '../shared/enums';
import { KitEvent, emitter } from '../shared/events';
import internetAvailable from '../shared/internet-available';
import shims from './shims';

import type { IKeyboardMapping } from 'native-keymap';
import { createLogger } from './log-utils';
import { getThemes } from './state/themes';
import { wireKeymapSubscriptions, convertKeyInternal, getEmojiShortcutInternal } from './state/keymap';
import { makeOnline, makeSponsorCheck } from './state/sponsor';
const log = createLogger('state.ts');
const keymapLog = createLogger('keymapLog');

const schema = {
  KENV: {
    type: 'string',
    default: kenvPath(),
  },
  accessibilityAuthorized: {
    type: 'boolean',
    default: true,
  },
  sponsor: {
    type: 'boolean',
    default: false,
  },
  version: {
    type: 'string',
    default: '0.0.0',
  },
  retryCount: {
    type: 'number',
    default: 0,
  },
  uIOhookEnabled: {
    type: 'boolean',
    default: true,
  },
};

export const kitStore = new Store<typeof schema>({
  schema,
  watch: true,
}) as Store<typeof schema> & {
  // Hacking the Store type due to some CJS thing I don't have the time to figure out
  get: <K extends keyof typeof schema>(key: K) => (typeof schema)[K]['default'];
  set: <K extends keyof typeof schema>(key: K, value: (typeof schema)[K]['type']) => void;
  path: string;
};

const storedKenv = process.env?.KENV || kitStore.get('KENV');
log.info(`📀 Stored KENV: ${storedKenv}`);
log.info(`Path to kitStore: ${kitStore.path}`);

process.env.KENV = storedKenv;

const release = os.release();
const isMac = os.platform() === 'darwin';
const isWin = os.platform() === 'win32';
const isWin11 = isWin && (release.startsWith('10.0.22') || release.startsWith('11.'));
const isWin10 = isWin && !isWin11;
const isLinux = os.platform() === 'linux';
const arch = os.arch();

export const serverState = {
  running: false,
  host: '',
  port: 0,
};

export interface Background {
  child: ChildProcess | null;
  start: string;
  status: 'starting' | 'ready';
}
export const backgroundMap = new Map<string, Background>();

export const getBackgroundTasks = () => {
  const tasks = Array.from(backgroundMap.entries()).map(([filePath, { child, start }]: [string, Background]) => {
    return {
      filePath,
      process: {
        spawnargs: child?.spawnargs,
        pid: child?.pid,
        start,
      },
    };
  });

  return tasks;
};

export const scheduleMap = new Map<string, Job>();

export const getSchedule = () => {
  return Array.from(scheduleMap.entries())
    .filter(([filePath, job]) => {
      return schedule.scheduledJobs?.[filePath] === job && !isParentOfDir(kitPath(), filePath);
    })
    .map(([filePath, job]: [string, Job]) => {
      return {
        filePath,
        date: job.nextInvocation(),
      };
    });
};

export const workers = {
  createBin: null as Worker | null,
  cacheScripts: null as Worker | null,
  kit: null as Worker | null,
};

export const debounceSetScriptTimestamp = debounce((stamp: Stamp & { reason?: string }) => {
  log.info(`💮 Stamping - Reason: ${stamp?.reason}: ${stamp?.filePath}`);
  if (!kitState.hasOpenedMainMenu || stamp?.filePath?.includes('.kit')) {
    return;
  }

  emitter.emit(KitEvent.SetScriptTimestamp, stamp);
}, 100);

export const cacheKitScripts = async () => {
  const kitMainPath = kitPath('main');
  const kitMainScripts = await readdir(kitMainPath);

  for await (const main of kitMainScripts) {
    const mainScript = await parseScript(kitPath('main', main));
    kitState.kitScripts.push(mainScript);
  }

  const kitCliPath = kitPath('cli');
  const kitCliDir = await readdir(kitCliPath);
  const kitCliScripts = kitCliDir.filter((f) => f.endsWith('.js'));
  for await (const cli of kitCliScripts) {
    const cliScript = await parseScript(kitPath('cli', cli));
    kitState.kitScripts.push(cliScript);
  }
};

export const getKitScript = async (filePath: string): Promise<Script> => {
  let script = kitState.kitScripts.find((script) => script.filePath === filePath) as Script;
  if (!script) {
    script = await parseScript(filePath);
  }
  return script;
};

export interface SnippetFile {
  filePath: string;
  snippetKey: string; // e.g. 'foo' or '*foo'
  postfix: boolean; // whether snippetKey started with '*'
  rawMetadata: Record<string, string>;
  contents: string; // entire file content, or you can skip storing if not needed
}

export const kitCache = {
  choices: [] as ScoredChoice[],
  scripts: [] as Script[],
  preview: '',
  shortcuts: [] as Shortcut[],
  scriptFlags: {} as FlagsObject,
  triggers: new Map<string, Choice>(),
  postfixes: new Map<string, Choice>(),
  keywords: new Map<string, Choice>(),
  shortcodes: new Map<string, Choice>(),
  keys: ['slicedName', 'tag', 'group', 'command'],
};


export { getThemes };
export const theme = nativeTheme.shouldUseDarkColors ? getThemes().scriptKitTheme : getThemes().scriptKitLightTheme;

const initState = {
  scripts: new Map<string, Script>(),
  scriptlets: new Map<string, Scriptlet>(),
  snippets: new Map<string, Snippet>(),
  snippetFiles: new Map<string, SnippetFile>(),
  gpuEnabled: true,
  displays: [] as Display[],
  debugging: false,
  hiddenByUser: false,
  blurredByKit: false,
  preventClose: false,
  isTyping: false,
  hasOpenedMainMenu: false,
  snippet: '',
  typedText: '',
  typedLimit: 256,
  socketURL: '',
  isShiftDown: false,
  isMac,
  isWin11,
  isWin10,
  isSplashShowing: false,
  isWindows: os.platform() === 'win32',
  isLinux: os.platform() === 'linux',
  // transparencyEnabled: checkTransparencyEnabled(),
  starting: true,
  suspended: false,
  screenLocked: false,
  installing: false,
  processMonitorEnabled: false,
  // checkingForUpdate: false,
  updateInstalling: false,
  // updateDownloading: false,
  updateDownloaded: false,
  allowQuit: false,
  // updateError: false,
  ready: false,
  authorized: false,
  requiresAuthorizedRestart: false,
  fullDiskAccess: false,
  mainShortcut: '',
  isDark: nativeTheme.shouldUseDarkColors,
  // warn: ``,
  // busy: ``,
  // success: ``,
  // paused: ``,
  // error: ``,
  status: {
    status: 'default',
    message: '',
  } as KitStatus,
  scriptErrorPath: '',

  notifications: [] as KitStatus[],
  downloadPercent: 0,
  applyUpdate: false,
  previousDownload: new Date(),
  logLevel: (process?.env?.KIT_LOG_LEVEL as LogLevel) || 'info',
  preventResize: false,
  trayOpen: false,
  trayScripts: [] as string[],
  prevScriptPath: '',
  promptHasPreview: true,
  kitScripts: [] as Script[],
  promptId: '__unset__',
  hasSnippet: false,
  isVisible: false,
  shortcutsPaused: false,
  devToolsCount: 0,
  isActivated: false,
  quitAndInstall: false,
  relaunch: false,
  manualUpdateCheck: false,
  user: {} as UserDb,
  isSponsor: false,
  theme,
  themeName: '',
  tempTheme: '',
  appearance: 'auto' as 'auto' | 'light' | 'dark',
  keymap: {} as IKeyboardMapping,
  keyboardConfig: {
    autoDelayMs: 0,
  } as any,
  cancelTyping: false,
  kenvEnv: {} as kenvEnv,
  escapePressed: false,
  shortcutPressed: '',
  supportsNut: isMac || (isWin && arch === 'x64') || (isLinux && arch === 'x64'),
  // DISABLING: Using the "accept" prompt as confirmation that people trust
  // trustedKenvs: [] as string[],
  suspendWatchers: false,
  resizePaused: false,
  trustedKenvs: [] as string[],
  trustedKenvsKey: getTrustedKenvsKey(),
  tabIndex: 0,
  user_id: '',
  app_version: '',
  platform: `${os.platform()}-${arch}`,
  os_version: os.release(),
  url: 'https://scriptkit.com',
  mainMenuHasRun: false,
  idleProcessReady: false,
  preloaded: false,
  emojiActive: false,
  isThrottling: true,
  ignoreInitial: false,
  cmd: isMac ? 'cmd' : 'ctrl',
  noPreview: false,
  cachePreview: false,
  cachePrompt: false,
  dockShown: false,
  attemptingPreload: false,
  hasCss: false,
  waitingForPing: false,
  KIT_NODE_PATH: '',
  PNPM_KIT_NODE_PATH: '',
  serverRunning: false,
  firstBatch: true,
  sleepClearKeys: null as Set<string> | null,
};

const initConfig: Config = {
  imagePath: tmpClipboardDir,
  deleteSnippet: true,
};

export const kitConfig: Config = proxy(initConfig);
export const kitState: typeof initState = proxy(initState);
export type kitStateType = typeof initState;

export const promptState = proxy({
  screens: {} as any,
});

const subStatus = subscribeKey(kitState, 'status', (status: KitStatus) => {
  log.info(`👀 Status: ${JSON.stringify(status)}`);

  if (status.status !== 'default' && status.message) {
    kitState.notifications.push(status);
  } else if (kitState.notifications.length > 0) {
    kitState.notifications = [];
  }
});

const subReady = subscribeKey(kitState, 'ready', (ready) => {
  if (ready) {
    kitState.status = {
      status: 'default',
      message: '',
    };
  }
});

const scriptletsSub = subscribeKey(kitState, 'scriptlets', (scriptlets) => {
  log.info(
    `👀 Scriptlets: ${scriptlets.length}`,
    scriptlets.map((scriptlet) => scriptlet.filePath),
  );
});

// Widgets not showing up in Dock
// TODO: Dock is showing when main prompt is open. Check mac panel? Maybe setIcon?

const subIgnoreBlur = subscribeKey(kitState, 'ignoreBlur', (ignoreBlur) => {
  log.info(`👀 Ignore blur: ${ignoreBlur ? 'true' : 'false'}`);
  if (ignoreBlur) {
    emitter.emit(KitEvent.ShowDock);
  } else {
    emitter.emit(KitEvent.HideDock);
  }
});

const subPromptCount = subscribeKey(kitState, 'promptCount', (promptCount) => {
  if (promptCount) {
    // showDock();
  } else {
    emitter.emit(KitEvent.HideDock);
  }
});

const subDevToolsCount = subscribeKey(kitState, 'devToolsCount', (count) => {
  if (count === 0) {
    emitter.emit(KitEvent.HideDock);
  } else {
    emitter.emit(KitEvent.ShowDock);
  }
});

export const online = makeOnline({ internetAvailable, log });

// export const getScriptsSnapshot = (): Script[] => {
//   return structuredClone(snapshot(kitState).scripts) as Script[];
// };

export const forceQuit = () => {
  log.info('Begin force quit...');
  kitState.allowQuit = true;
};

emitter.on(KitEvent.ForceQuit, forceQuit);

const subRequiresAuthorizedRestart = subscribeKey(
  kitState,
  'requiresAuthorizedRestart',
  (requiresAuthorizedRestart) => {
    if (requiresAuthorizedRestart) {
      log.info('👋 Restarting...');
      kitState.relaunch = true;
      forceQuit();
    }
  },
);

const subScriptErrorPath = subscribeKey(kitState, 'scriptErrorPath', (scriptErrorPath) => {
  kitState.status = {
    status: scriptErrorPath ? 'warn' : 'default',
    message: '',
  };
});

// TODO: I don't need to return booleans AND set kitState.isSponsor. Pick one.
export const sponsorCheck = makeSponsorCheck({ 
  axios, 
  kitState, 
  kitStore, 
  log, 
  emitter, 
  events: { KitEvent }, 
  kitPath, 
  Trigger, 
  online 
});

// Wire reverse keymap subscriptions + initial build
const subKeymap = wireKeymapSubscriptions(kitState);

// subs is an array of functions
export const subs: (() => void)[] = [];
subs.push(
  subRequiresAuthorizedRestart,
  subScriptErrorPath,
  subPromptCount,
  subDevToolsCount,
  subStatus,
  subReady,
  subIgnoreBlur,
  scriptletsSub,
  subKeymap,
);

export const convertKey = (sourceKey: string) => convertKeyInternal(kitState, sourceKey);
export const getEmojiShortcut = () => getEmojiShortcutInternal(kitState);

export const preloadChoicesMap = new Map<string, Choice[]>();
export const preloadPreviewMap = new Map<string, string>();
export const preloadPromptDataMap = new Map<string, PromptData>();

export const kitClipboard = {
  store: null as any,
};

export const getAccessibilityAuthorized = async () => {
  if (isMac) {
    const authorized = shims['node-mac-permissions'].getAuthStatus('accessibility') === 'authorized';
    kitStore.set('accessibilityAuthorized', authorized);
    return authorized;
  }

  return true;
};
