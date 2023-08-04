/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-nested-ternary */

import { Config, KitStatus } from '@johnlindquist/kit/types/kitapp';
import { proxy } from 'valtio/vanilla';
import { readJson, writeJson } from 'fs-extra';
import * as nativeKeymap from 'native-keymap';
import { subscribeKey } from 'valtio/utils';
import log, { LogLevel } from 'electron-log';
import { assign, debounce } from 'lodash';
import path from 'path';
import os from 'os';
import { ChildProcess } from 'child_process';
import { app, BrowserWindow, Menu, nativeTheme } from 'electron';
import schedule, { Job } from 'node-schedule';
import { readdir } from 'fs/promises';
import {
  Script,
  ProcessInfo,
  Choice,
  PromptData,
} from '@johnlindquist/kit/types/core';
import {
  setScriptTimestamp,
  UserDb,
  AppDb,
  getAppDb,
  appDefaults,
} from '@johnlindquist/kit/cjs/db';

import {
  parseScript,
  kitPath,
  isParentOfDir,
  mainScriptPath,
  tmpClipboardDir,
  getTrustedKenvsKey,
} from '@johnlindquist/kit/cjs/utils';
import { UI } from '@johnlindquist/kit/cjs/enum';
import axios from 'axios';
import { QuickScore } from 'quick-score';
import internetAvailable from './internet-available';
import { noScript } from './defaults';
import { getAssetPath } from './assets';
import { emitter, KitEvent } from './events';
import { Trigger } from './enums';

const release = os.release();
const isMac = os.platform() === 'darwin';
const isWin = os.platform() === 'win32';
const isWin11 =
  isWin && (release.startsWith('10.0.22') || release.startsWith('11.'));
const isWin10 = isWin && !isWin11;
const isLinux = os.platform() === 'linux';
const arch = os.arch();

// const css = readFileSync(path.resolve(__dirname, './App.global.css'), 'utf8');
const css = `
:root {
  --color-text: 255, 255, 255;
  --color-primary: 251, 191, 36;
  --color-secondary: 255, 255, 255;
  --color-background: 22, 22, 22;
  --opacity: 0.45;
  --ui-bg-opacity: 0.05;
  --ui-border-opacity: 0.15;
}
`;

// read the :root css variables from the css file and create a theme object
export const theme =
  css
    .match(/:root\s*{([^}]*)}/)?.[1]
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s)
    .reduce((acc, s) => {
      const [key, value] = s.split(':');
      return { ...acc, [key.trim()]: value.trim() };
    }, {}) || {};

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
  const tasks = Array.from(backgroundMap.entries()).map(
    ([filePath, { child, start }]: [string, Background]) => {
      return {
        filePath,
        process: {
          spawnargs: child?.spawnargs,
          pid: child?.pid,
          start,
        },
      };
    }
  );

  return tasks;
};

export const scheduleMap = new Map<string, Job>();

export const getSchedule = () => {
  return Array.from(scheduleMap.entries())
    .filter(([filePath, job]) => {
      return (
        schedule.scheduledJobs?.[filePath] === job &&
        !isParentOfDir(kitPath(), filePath)
      );
    })
    .map(([filePath, job]: [string, Job]) => {
      return {
        filePath,
        date: job.nextInvocation(),
      };
    });
};

export const scriptChanged = debounce(
  async (filePath: string) => {
    if (!kitState.mainMenuHasRun) return;
    await setScriptTimestamp({ filePath, compileMessage: '' });
  },
  250,
  {
    leading: true,
    trailing: true,
  }
);

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

export const getKitScript = (filePath: string): Script => {
  return kitState.kitScripts.find(
    (script) => script.filePath === filePath
  ) as Script;
};

const addP = (pi: Partial<ProcessInfo>) => {
  kitState.ps.push(pi);
};

const removeP = (pid: number) => {
  const index = kitState.ps.findIndex((p) => p.pid === pid);
  if (index > -1) {
    kitState.ps.splice(index, 1);
  }
};

// const checkTransparencyEnabled = () => {
//   const version = parseInt(os.release().split('.')[0], 10);
//   const bigSur = ``;
//   if (os.platform() === 'darwin' && version < bigSur) {
//     return false;
//   }

//   try {
//     const enabled = !parseInt(
//       Buffer.from(
//         execSync('defaults read com.apple.universalaccess reduceTransparency', {
//           encoding: 'utf8',
//           maxBuffer: 50 * 1024 * 1024,
//         })
//       )
//         .toString()
//         .trim(),
//       10
//     );
//     log.info(`transparency enabled: ${enabled}`);
//     return enabled;
//   } catch (error) {
//     return false;
//   }
// };
export type WidgetOptions = {
  id: string;
  wid: number;
  pid: number;
  moved: boolean;
  ignoreMouse: boolean;
  ignoreMeasure: boolean;
};

export type WindowsOptions = {
  id: string;
  wid: number;
};

export const checkAccessibility = () =>
  new Promise((resolve, reject) => {
    log.verbose(`🔑 Checking accessibility permissions...`);
    if (kitState.isMac) {
      // REMOVE-MAC
      log.verbose(`💻 Mac detected.`);
      import('node-mac-permissions')
        .then(({ getAuthStatus }) => {
          kitState.authorized = getAuthStatus('accessibility') === 'authorized';
          log.verbose(
            `🔑 Accessibility permissions: ${kitState.authorized ? '✅' : '❌'}`
          );
          resolve(kitState.authorized);
          return true;
        })
        .catch((error) => {
          log.error(`🔑 Error checking accessibility permissions: ${error}`);
          reject(error);
          return false;
        });
      // END-REMOVE-MAC
    } else {
      log.info(`💻 Not Mac. Skipping accessibility check.`);
      kitState.authorized = true;
      resolve(kitState.authorized);
    }
  });

const initState = {
  debugging: false,
  isPanel: false,
  hiddenByUser: false,
  ps: [] as Partial<ProcessInfo>[],
  addP,
  removeP,
  pid: -1,
  script: noScript,
  ui: UI.arg,
  blurredByKit: false,
  modifiedByUser: false,
  ignoreBlur: false,
  preventClose: false,
  isScripts: false,
  isMainScript: () => kitState.script.filePath === mainScriptPath,
  promptCount: 0,
  isTyping: false,
  snippet: ``,
  typedText: ``,
  typedLimit: 256,
  socketURL: '',
  isShiftDown: false,
  isMac,
  isWin11,
  isWin10,
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
  notifyAuthFail: false,
  mainShortcut: ``,
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
  prevScriptPath: ``,
  promptUI: UI.arg,
  promptHasPreview: true,
  resize: false,
  scriptPath: ``,
  resizedByChoices: false,
  kitScripts: [] as Script[],
  promptId: '__unset__',
  promptBounds: {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  },
  isResizing: false,
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
  clipboardWatcherEnabled: !isMac,
  keyboardWatcherEnabled: !isMac,
  wakeWatcher: new Date().getTime(),
  allowBlur: true,
  keymap: null as any,
  keyboardConfig: {
    autoDelayMs: 0,
  } as any,
  cancelTyping: false,
  kenvEnv: {} as Record<string, string>,
  escapePressed: false,
  shortcutPressed: '',
  supportsNut:
    isMac || (isWin && arch === 'x64') || (isLinux && arch === 'x64'),
  isPromptReady: false,
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
  url: `https://scriptkit.com`,
  alwaysOnTop: false,
  mainMenuHasRun: false,
  idleProcessReady: false,
  cacheChoices: false,
  cachePrompt: false,
  cachePreview: false,
  scriptPathChanged: false,
  promptScriptPath: '',
  preloaded: false,
  emojiActive: false,
  isThrottling: true,
  ignoreInitial: false,
  waking: true,
  cmd: isMac ? `cmd` : `ctrl`,
  hideOnEscape: true,
  justFocused: false,
  promptProcess: null as ChildProcess | null,
};

const initConfig: Config = {
  imagePath: tmpClipboardDir,
  deleteSnippet: true,
};

const initWidgets = {
  widgets: [] as WidgetOptions[],
};

const initWindows = {
  windows: [] as WindowOptions[],
};

export const appDb: AppDb = proxy(appDefaults);
export const kitConfig: Config = proxy(initConfig);
export const kitState: typeof initState = proxy(initState);
export type kitStateType = typeof initState;

export const widgetState: typeof initWidgets = proxy(initWidgets);
export const windowsState: typeof initWindows = proxy(initWindows);
export const promptState = proxy({
  screens: {} as any,
});
export const findWidget = (id: string, reason = '') => {
  const options = widgetState.widgets.find((opts) => opts.id === id);
  if (!options) {
    log.warn(`${reason}: widget not found: ${id}`);
    return null;
  }

  return BrowserWindow.fromId(options.wid);
};

export function isSameScript(promptScriptPath: string) {
  const same =
    path.resolve(kitState.script.filePath || '') ===
      path.resolve(promptScriptPath) && kitState.promptCount === 1;

  return same;
}

const subStatus = subscribeKey(kitState, 'status', (status: KitStatus) => {
  log.info(`👀 Status: ${JSON.stringify(status)}`);

  if (status.status !== 'default' && status.message) {
    kitState.notifications.push(status);
  } else if (kitState.notifications.length > 0) {
    kitState.notifications = [];
  }
});

const subWaking = subscribeKey(kitState, 'waking', (waking) => {
  log.info(`👀 Waking: ${waking}`);
});

const subReady = subscribeKey(kitState, 'ready', (ready) => {
  if (ready) {
    kitState.status = {
      status: 'default',
      message: '',
    };
  }
});

const subNotifyAuthFail = subscribeKey(
  kitState,
  'notifyAuthFail',
  (notifyAuthFail) => {
    if (notifyAuthFail) {
      kitState.status = {
        status: 'warn',
        message: '',
      };
    }
  }
);

let hideIntervalId: NodeJS.Timeout | null = null;

export const hideDock = debounce(() => {
  if (!kitState.isMac) return;
  if (kitState.devToolsCount > 0) return;
  if (kitState.promptCount > 0) return;
  if (widgetState.widgets.length) return;
  if (windowsState.windows.length) return;

  app?.dock?.setIcon(getAssetPath('icon.png'));
  app?.dock?.hide();
  if (hideIntervalId) clearInterval(hideIntervalId);
}, 200);

export const showDock = () => {
  if (!kitState.ignoreBlur) return;
  if (!kitState.isMac) return;
  if (
    kitState.devToolsCount === 0 &&
    kitState.promptCount === 0 &&
    widgetState.widgets.length === 0
  )
    return;

  if (!app?.dock.isVisible()) {
    hideDock.cancel();
    app?.dock?.setIcon(getAssetPath('icon.png'));
    app?.dock?.show();
    app?.dock?.setMenu(
      Menu.buildFromTemplate([
        {
          label: 'Quit',
          click: () => {
            forceQuit();
          },
        },
      ])
    );
    app?.dock?.setIcon(getAssetPath('icon.png'));

    if (hideIntervalId) clearInterval(hideIntervalId);

    hideIntervalId = setInterval(() => {
      hideDock();
    }, 1000);
  }
};

const subWidgets = subscribeKey(widgetState, 'widgets', (widgets) => {
  log.info(`👀 Widgets: ${JSON.stringify(widgets)}`);
  if (widgets.length !== 0) {
    showDock();
  } else {
    hideDock();
  }
});
const subWindows = subscribeKey(windowsState, 'windows', (windows) => {
  log.info(`👀 Windows: ${JSON.stringify(windows)}`);
  if (windows.length !== 0) {
    showDock();
  } else {
    hideDock();
  }
});

const subPromptCount = subscribeKey(kitState, 'promptCount', (promptCount) => {
  if (promptCount) {
    showDock();
  } else {
    hideDock();
  }
});

const subDevToolsCount = subscribeKey(kitState, 'devToolsCount', (count) => {
  if (count === 0) {
    hideDock();
  } else {
    showDock();
  }
});

// subscribeKey(widgetState, 'widgets', () => {
//   log.info(`👀 Widgets: ${widgetState.widgets.length}`);
// });

export const online = async () => {
  log.info(`Checking online status...`);
  try {
    const result = await internetAvailable();

    log.info(`🗼 Status: ${result ? 'Online' : 'Offline'}`);

    return result;
  } catch (error) {
    return false;
  }
};

// export const getScriptsSnapshot = (): Script[] => {
//   return structuredClone(snapshot(kitState).scripts) as Script[];
// };

export const forceQuit = () => {
  log.info(`Begin force quit...`);
  kitState.allowQuit = true;
};

const subRequiresAuthorizedRestart = subscribeKey(
  kitState,
  'requiresAuthorizedRestart',
  (requiresAuthorizedRestart) => {
    if (requiresAuthorizedRestart) {
      log.info(`👋 Restarting...`);
      kitState.relaunch = true;
      forceQuit();
    }
  }
);

const subScriptErrorPath = subscribeKey(
  kitState,
  'scriptErrorPath',
  (scriptErrorPath) => {
    kitState.status = {
      status: scriptErrorPath ? 'warn' : 'default',
      message: ``,
    };
  }
);

// TODO: I don't need to return booleans AND set kitState.isSponsor. Pick one.
export const sponsorCheck = async (feature: string, block = true) => {
  log.info(
    `Checking sponsor status... login: ${kitState?.user?.login} ${
      kitState.isSponsor ? '✅' : '❌'
    }`
  );
  const isOnline = await online();
  if (
    !isOnline ||
    (process.env.KIT_SPONSOR === 'development' &&
      os.userInfo().username === 'johnlindquist')
  ) {
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
      log.error('Error checking sponsor status', error);
      kitState.isSponsor = true;
      return true;
    }

    log.info(`Response status: ${response.status}`);

    // check for axios post error
    if (response.status !== 200) {
      log.error('Error checking sponsor status', response);
    }

    log.info(`🕵️‍♀️ Sponsor check response`, JSON.stringify(response.data));

    if (
      response.data &&
      kitState.user.node_id &&
      response.data.id === kitState.user.node_id
    ) {
      log.info('User is sponsor');
      kitState.isSponsor = true;
      return true;
    }

    if (response.status !== 200) {
      log.error('Sponsor check service is down. Granting temp sponsor status');
      kitState.isSponsor = true;
      return true;
    }

    if (block) {
      log.info('User is not sponsor');
      kitState.isSponsor = false;

      emitter.emit(KitEvent.RunPromptProcess, {
        scriptPath: kitPath('pro', 'sponsor.js'),
        args: [feature],
        options: {
          force: true,
          trigger: Trigger.App,
        },
      });

      return false;
    }

    return false;
  }
  return true;
};

// sub to allowBlur
const subAllowBlur = subscribeKey(kitState, 'allowBlur', (allowBlur) => {
  if (!allowBlur) {
    setTimeout(() => {
      kitState.allowBlur = true;
    }, 100);
  }
});

// subs is an array of functions
export const subs: (() => void)[] = [];
subs.push(
  subRequiresAuthorizedRestart,
  subScriptErrorPath,
  subPromptCount,
  subDevToolsCount,
  subWidgets,
  subWindows,
  subStatus,
  subReady,
  subNotifyAuthFail,
  subAllowBlur,
  subWaking
);

export const updateAppDb = async (settings: Partial<AppDb>) => {
  const db = await getAppDb();
  assign(db, settings);
  assign(appDb, settings);

  try {
    await db.write();
  } catch (error) {
    log.info(error);
  }
};

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
const keymapLog = log.create('keymapLog');
keymapLog.transports.file.resolvePath = () => keymapLogPath;

export const convertKey = (sourceKey: string) => {
  if (typeof appDb?.convertKey === 'boolean' && !appDb.convertKey) {
    keymapLog.info(`🔑 Skipping key conversion: ${sourceKey}`);
    return sourceKey;
  }
  if (kitState.keymap) {
    const result = Object.entries(kitState.keymap).find(
      ([, { value }]: [string, any]) =>
        value.toLowerCase() === sourceKey.toLowerCase()
    ) || [''];

    const targetKey = result[0];

    if (targetKey) {
      const target = defaultKeyMap?.[targetKey]?.toUpperCase() || '';
      try {
        if (targetKey.at(-1) !== target.at(-1)) {
          keymapLog.info(`🔑 Converted key: ${targetKey} -> ${target}`);
        }
      } catch (error) {
        keymapLog.info(`🔑 Converted key error: ${targetKey} -> ${target}`);
      }

      return target || sourceKey;
    }
  }

  return sourceKey;
};

let prevKeyMap = {};
export const initKeymap = async () => {
  keymapLog.info(`🔑 Initializing keymap...`);
  if (!kitState.keymap) {
    try {
      let keymap = nativeKeymap.getKeyMap();
      keymapLog.verbose(`🔑 Detected Keymap:`, { keymap });
      writeJson(kitPath('db', 'keymap.json'), keymap);
      let value = keymap?.KeyA?.value;

      const alpha = /[A-Za-z]/;

      keymapLog.info(`🔑 Keymap`, { a: value });

      if (value && value.match(alpha)) {
        kitState.keymap = keymap;
      } else {
        keymapLog.info(
          `Ignore keymap, found: ${value} in the KeyA value, expected: [A-Za-z]`
        );
      }

      nativeKeymap.onDidChangeKeyboardLayout(
        debounce(() => {
          keymap = nativeKeymap.getKeyMap();
          keymapLog.info(`🔑 Keymap changed:`, { keymap });
          value = keymap?.KeyA.value;

          if (value && value.match(alpha)) {
            // Check if keymap changed
            if (JSON.stringify(keymap) !== JSON.stringify(prevKeyMap)) {
              kitState.keymap = keymap;
              prevKeyMap = keymap;
            } else {
              log.info('Keymap not changed');
            }
          } else {
            keymapLog.info(
              `Ignore keymap, found: ${value} in the KeyA value, expected: [A-Za-z]`
            );
          }
        }, 500)
      );

      if (kitState.keymap)
        keymapLog.info(
          `🔑 Keymap: ${JSON.stringify(
            Object.entries(kitState.keymap).map(([k, v]: any) => {
              if (v?.value) return `${k} -> ${v.value}`;
              return `${k} -> null`;
            })
          )}`
        );
    } catch (e) {
      keymapLog.error(`🔑 Keymap error... 🤔`);
      keymapLog.error(e);
    }
  }
};

export const clearStateTimers = () => {
  if (hideIntervalId) clearInterval(hideIntervalId);
};

// TODO: Removing logging

// let prevState: null | any = null;
// subscribe(kitState, () => {
//   const newState = snapshot(kitState);
//   if (prevState) {
//     const diff = rdiff.getDiff(prevState, newState);
//     if (diff.length > 0) {
//       log.info(`\n\n👀 State changed: ${JSON.stringify(diff)}`);
//     }
//   }
//   prevState = newState;
// });

// let prevAppDbState: null | any = null;
// subscribe(appDb, () => {
//   const newState = snapshot(appDb);
//   if (prevAppDbState) {
//     const diff = rdiff.getDiff(prevAppDbState, newState);
//     if (diff.length > 0) {
//       log.info(`\n\n👀 AppDb changed: ${JSON.stringify(diff)}`);
//     }
//   }
//   prevAppDbState = newState;
// });

// let prevConfigState: null | any = null;
// subscribe(kitConfig, () => {
//   const newState = snapshot(kitConfig);
//   if (prevConfigState) {
//     const diff = rdiff.getDiff(prevConfigState, newState);
//     if (diff.length > 0) {
//       log.info(`\n\n👀 Config changed: ${JSON.stringify(diff)}`);
//     }
//   }
//   prevConfigState = newState;
// });

// let prevWidgetState: null | any = null;
// subscribe(widgetState, () => {
//   const newState = snapshot(widgetState);
//   if (prevWidgetState) {
//     const diff = rdiff.getDiff(prevWidgetState, newState);
//     if (diff.length > 0) {
//       log.info(`\n\n👀 WidgetState changed: ${JSON.stringify(diff)}`);
//     }
//   }
//   prevWidgetState = newState;
// });
export const getEmojiShortcut = () => {
  return kitState?.kenvEnv?.KIT_EMOJI_SHORTCUT || kitState.isMac
    ? 'Command+Control+Space'
    : 'Super+.';
};

export const getThemes = () => ({
  scriptKitTheme: {
    foreground: '255, 255, 255',
    background: '22, 22, 22',
    accent: '251, 191, 36',
    opacity: kitState.isMac ? '0.5' : '1',
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
    opacity: kitState.isMac ? '0.5' : '1',
    ui: '204, 204, 204',
    'ui-bg-opacity': '0.5',
    'ui-border-opacity': '0.5',
    vibrancy: 'popover',
    appearance: 'light',
  },
});

export const preloadChoicesMap = new Map<string, Choice[]>();
export const preloadPreviewMap = new Map<string, string>();
export const preloadPromptDataMap = new Map<string, PromptData>();

export const kitSearch = {
  input: '',
  inputRegex: undefined as undefined | RegExp,
  keyword: '',
  generated: false,
  flaggedValue: '',
  choices: [] as Choice[],
  scripts: [] as Script[],
  shortcodes: new Map<string, Choice>(),
  keywords: new Map<string, Choice>(),
  hasGroup: false,
  qs: null as null | QuickScore<Choice>,
};

export const flagSearch = {
  input: '',
  choices: [] as Choice[],
  hasGroup: false,
  qs: null as null | QuickScore<Choice>,
};

export const clearSearch = () => {
  log.info(`🧹 Clearing search...`);
  kitState.ignoreBlur = false;
  kitSearch.keyword = '';
  kitSearch.choices = [];
  kitSearch.input = '';
  kitSearch.qs = null;
  kitSearch.keywords.clear();
  kitSearch.shortcodes.clear();
  kitSearch.hasGroup = false;
};
