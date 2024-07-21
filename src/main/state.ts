/* eslint-disable no-restricted-syntax */
/* eslint-disable no-nested-ternary */

import Store, { type Schema } from 'electron-store';

import type { Config, KitStatus } from '@johnlindquist/kit/types/kitapp';
import { proxy } from 'valtio/vanilla';
import type { ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import electron, { type Display } from 'electron';
import log, { type FileTransport, type LevelOption, type LogLevel } from 'electron-log';
import { debounce } from 'lodash-es';
import * as nativeKeymap from 'native-keymap';
import { subscribeKey } from 'valtio/utils';
const { app, nativeTheme } = electron;

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
import { writeJson, pathExists } from './cjs-exports';

import { createLogger } from '../shared/log-utils';
const { info, err, warn, verbose, silly } = createLogger('state.ts');

const schema: Schema<{
  KENV: string;
  accessibilityAuthorized: boolean;
  sponsor: boolean;
  version: string;
}> = {
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
};
export const kitStore = new Store({
  schema,
  watch: true,
});

const storedKenv = process.env?.KENV || kitStore.get('KENV');
info(`📀 Stored KENV: ${storedKenv}`);
info(`Path to kitStore: ${kitStore.path}`);
// process.exit();

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
  child: ChildProcess;
  start: string;
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
};

export const debounceSetScriptTimestamp = debounce((stamp: Stamp & { reason?: string }) => {
  info(`💮 Stamping ${stamp?.filePath} - ${stamp?.reason}`);
  if (!kitState.hasOpenedMainMenu) {
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

export const getThemes = () => ({
  scriptKitTheme: {
    foreground: '255, 255, 255',
    background: '22, 22, 22',
    accent: '251, 191, 36',
    opacity: os.platform() === 'darwin' ? '0.5' : '1',
    ui: '255, 255, 255',
    'ui-bg-opacity': '0.05',
    'ui-border-opacity': '0.15',
    vibrancy: 'popover',
    appearance: 'dark',
  },
  scriptKitLightTheme: {
    foreground: '2C2C2C',
    accent: '2F86D3',
    background: 'white',
    opacity: os.platform() === 'darwin' ? '0.5' : '1',
    ui: '204, 204, 204',
    'ui-bg-opacity': '0.5',
    'ui-border-opacity': '0.5',
    vibrancy: 'popover',
    appearance: 'light',
  },
});

export const theme = nativeTheme.shouldUseDarkColors ? getThemes().scriptKitTheme : getThemes().scriptKitLightTheme;

const initState = {
  scripts: new Map<string, Script>(),
  scriptlets: new Map<string, Scriptlet>(),
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
  logLevel: 'info' as LogLevel,
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
  appearance: 'auto' as 'auto' | 'light' | 'dark',
  keymap: null as any,
  keyboardConfig: {
    autoDelayMs: 0,
  } as any,
  cancelTyping: false,
  kenvEnv: {} as kenvEnv,
  escapePressed: false,
  shortcutPressed: '',
  supportsNut: isMac || (isWin && arch === 'x64') || (isLinux && arch === 'x64'),
  promptHidden: true,
  // DISABLING: Using the "accept" prompt as confirmation that people trust
  // trustedKenvs: [] as string[],
  suspendWatchers: false,
  resizePaused: false,
  trustedKenvs: [] as string[],
  trustedKenvsKey: getTrustedKenvsKey(),
  tabIndex: 0,
  tabChanged: false,
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
  waking: true,
  cmd: isMac ? 'cmd' : 'ctrl',
  noPreview: false,
  cachePreview: false,
  cachePrompt: false,
  dockShown: false,
  attemptingPreload: false,
  hasCss: false,
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
  info(`👀 Status: ${JSON.stringify(status)}`);

  if (status.status !== 'default' && status.message) {
    kitState.notifications.push(status);
  } else if (kitState.notifications.length > 0) {
    kitState.notifications = [];
  }
});

const subWaking = subscribeKey(kitState, 'waking', (waking) => {
  info(`👀 Waking: ${waking}`);
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
  info(
    `👀 Scriptlets: ${scriptlets.length}`,
    scriptlets.map((scriptlet) => scriptlet.filePath),
  );
});

// Widgets not showing up in Dock
// TODO: Dock is showing when main prompt is open. Check mac panel? Maybe setIcon?

const subIgnoreBlur = subscribeKey(kitState, 'ignoreBlur', (ignoreBlur) => {
  info(`👀 Ignore blur: ${ignoreBlur ? 'true' : 'false'}`);
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

export const online = async () => {
  info('Checking online status...');
  try {
    const result = await internetAvailable();

    info(`🗼 Status: ${result ? 'Online' : 'Offline'}`);

    return result;
  } catch (error) {
    return false;
  }
};

// export const getScriptsSnapshot = (): Script[] => {
//   return structuredClone(snapshot(kitState).scripts) as Script[];
// };

export const forceQuit = () => {
  info('Begin force quit...');
  kitState.allowQuit = true;
};

emitter.on(KitEvent.ForceQuit, forceQuit);

const subRequiresAuthorizedRestart = subscribeKey(
  kitState,
  'requiresAuthorizedRestart',
  (requiresAuthorizedRestart) => {
    if (requiresAuthorizedRestart) {
      info('👋 Restarting...');
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
export const sponsorCheck = async (feature: string, block = true) => {
  info(`Checking sponsor status... login: ${kitState?.user?.login} ${kitState.isSponsor ? '✅' : '❌'}`);
  const isOnline = await online();
  if (!isOnline || (process.env.KIT_SPONSOR === 'development' && os.userInfo().username === 'johnlindquist')) {
    kitState.isSponsor = true;
    return true;
  }

  if (!kitState.isSponsor) {
    let response = null;
    try {
      response = await axios.post(`${kitState.url}/api/check-sponsor`, {
        ...kitState.user,
        feature,
      });
    } catch (error) {
      errr('Error checking sponsor status', error);
      kitState.isSponsor = true;
      return true;
    }

    // check for axios post error
    if (!response) {
      errr('Error checking sponsor status', response);
      kitState.isSponsor = true;
      return true;
    }

    info(`Response status: ${response.status}`);

    // check for axios post error
    if (response.status !== 200) {
      errr('Error checking sponsor status', response);
    }

    info('🕵️‍♀️ Sponsor check response', JSON.stringify(response.data));

    if (response.data && kitState.user.node_id && response.data.id === kitState.user.node_id) {
      info('User is sponsor');
      kitState.isSponsor = true;
      return true;
    }

    if (response.status !== 200) {
      errr('Sponsor check service is down. Granting temp sponsor status');
      kitState.isSponsor = true;
      return true;
    }

    if (block) {
      info('User is not sponsor');
      kitState.isSponsor = false;

      emitter.emit(KitEvent.RunPromptProcess, {
        scriptPath: kitPath('pro', 'sponsor.js'),
        args: [feature],
        options: {
          force: true,
          trigger: Trigger.App,
          sponsorCheck: false,
        },
      });

      return false;
    }

    return false;
  }
  return true;
};

// subs is an array of functions
export const subs: (() => void)[] = [];
subs.push(
  subRequiresAuthorizedRestart,
  subScriptErrorPath,
  subPromptCount,
  subDevToolsCount,
  subStatus,
  subReady,
  subWaking,
  subIgnoreBlur,
  scriptletsSub,
);

const defaultKeyMap: {
  [key: string]: string;
} = {
  KeyA: 'a',
  KeyB: 'b',
  KeyC: 'c',
  KeyD: 'd',
  KeyE: 'e',
  KeyF: 'f',
  KeyG: 'g',
  KeyH: 'h',
  KeyI: 'i',
  KeyJ: 'j',
  KeyK: 'k',
  KeyL: 'l',
  KeyM: 'm',
  KeyN: 'n',
  KeyO: 'o',
  KeyP: 'p',
  KeyQ: 'q',
  KeyR: 'r',
  KeyS: 's',
  KeyT: 't',
  KeyU: 'u',
  KeyV: 'v',
  KeyW: 'w',
  KeyX: 'x',
  KeyY: 'y',
  KeyZ: 'z',
  Digit0: '0',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
  Numpad0: '0',
  Numpad1: '1',
  Numpad2: '2',
  Numpad3: '3',
  Numpad4: '4',
  Numpad5: '5',
  Numpad6: '6',
  Numpad7: '7',
  Numpad8: '8',
  Numpad9: '9',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
  Space: ' ',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
};

const keymapLogPath = path.resolve(app.getPath('logs'), 'keymap.log');
const keymapLog = log.create({ logId: 'keymapLog' });
(keymapLog.transports.file as FileTransport).resolvePathFn = () => keymapLogPath;

keymapLog.transports.console.level = (process.env.VITE_LOG_LEVEL || 'info') as LevelOption;

export const convertKey = (sourceKey: string) => {
  if (kitState.kenvEnv?.KIT_CONVERT_KEY === 'false') {
    keymapLog.info(`🔑 Skipping key conversion: ${sourceKey}`);
    return sourceKey;
  }
  if (kitState.keymap) {
    const result = Object.entries(kitState.keymap).find(
      ([, { value }]: [string, any]) => value.toLowerCase() === sourceKey.toLowerCase(),
    ) || [''];

    const targetKey = result[0];

    if (targetKey) {
      const target = defaultKeyMap?.[targetKey]?.toUpperCase() || '';
      try {
        if (targetKey.at(-1) !== target.at(-1)) {
          keymapLog.silly(`🔑 Converted key: ${targetKey} -> ${target}`);
        }
      } catch (error) {
        keymapLog.silly(`🔑 Converted key error: ${targetKey} -> ${target}`);
      }

      return target || sourceKey;
    }
  }

  return sourceKey;
};

let prevKeyMap = {};
export const initKeymap = async () => {
  keymapLog.info('🔑 Initializing keymap...');
  if (!kitState.keymap) {
    try {
      let keymap = nativeKeymap.getKeyMap();
      // keymapLog.verbose('🔑 Detected Keymap:', { keymap });
      writeJson(kitPath('db', 'keymap.json'), keymap);
      let value = keymap?.KeyA?.value;

      const alpha = /[A-Za-z]/;

      keymapLog.verbose('🔑 Keymap', { a: value });

      if (value?.match(alpha)) {
        kitState.keymap = keymap;
      } else {
        keymapLog.verbose(`Ignore keymap, found: ${value} in the KeyA value, expected: [A-Za-z]`);
      }

      nativeKeymap.onDidChangeKeyboardLayout(
        debounce(() => {
          keymap = nativeKeymap.getKeyMap();
          keymapLog.verbose('🔑 Keymap changed:', { keymap });
          value = keymap?.KeyA.value;

          if (value?.match(alpha)) {
            // Check if keymap changed
            if (JSON.stringify(keymap) !== JSON.stringify(prevKeyMap)) {
              kitState.keymap = keymap;
              prevKeyMap = keymap;
            } else {
              verbose('Keymap not changed');
            }
          } else {
            keymapLog.verbose(`Ignore keymap, found: ${value} in the KeyA value, expected: [A-Za-z]`);
          }
        }, 500),
      );

      if (kitState.keymap) {
        keymapLog.verbose(
          `🔑 Keymap: ${JSON.stringify(
            Object.entries(kitState.keymap).map(([k, v]: any) => {
              if (v?.value) {
                return `${k} -> ${v.value}`;
              }
              return `${k} -> null`;
            }),
          )}`,
        );
      }
    } catch (e) {
      keymapLog.error('🔑 Keymap error... 🤔');
      keymapLog.error(e);
    }
  }
};

export const getEmojiShortcut = () => {
  return kitState?.kenvEnv?.KIT_EMOJI_SHORTCUT || kitState.isMac ? 'Command+Control+Space' : 'Super+.';
};

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
