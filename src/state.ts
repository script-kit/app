/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-nested-ternary */

import { Config, KitStatus } from '@johnlindquist/kit/types/kitapp';
import { proxy, subscribe } from 'valtio/vanilla';
import { subscribeKey } from 'valtio/utils';
import log, { LogLevel } from 'electron-log';
import { assign, debounce } from 'lodash';
import path from 'path';
import os from 'os';
import { ChildProcess } from 'child_process';
import { app, BrowserWindow, Menu, nativeTheme } from 'electron';
import schedule, { Job } from 'node-schedule';
import { readdir } from 'fs/promises';
import { KeyboardClass } from '@nut-tree/nut-js';
import { Script, ProcessInfo } from '@johnlindquist/kit/types/core';
import {
  getScripts,
  setScriptTimestamp,
  getTimestamps,
  getPromptDb as getKitPromptDb,
  UserDb,
  AppDb,
  getAppDb,
} from '@johnlindquist/kit/cjs/db';

import {
  parseScript,
  kitPath,
  isParentOfDir,
  mainScriptPath,
  tmpClipboardDir,
} from '@johnlindquist/kit/cjs/utils';
import { UI } from '@johnlindquist/kit/cjs/enum';
import axios from 'axios';
import internetAvailable from './internet-available';
import { noScript } from './defaults';
import { getAssetPath } from './assets';
import { emitter, KitEvent } from './events';
import { Trigger } from './enums';

// const css = readFileSync(path.resolve(__dirname, './App.global.css'), 'utf8');
const css = `
:root {
  --color-text: 255, 255, 255;
  --color-primary: 251, 191, 36;
  --color-secondary: 52, 52, 52;
  --color-contrast: 251, 191, 36;
  --color-background: 0, 0, 0;
  --opacity: 0.85;
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

export const updateScripts = async () => {
  await getTimestamps(false);
};

export const scriptChanged = debounce(async (filePath: string) => {
  await setScriptTimestamp(filePath);
}, 25);

export const scriptRemoved = debounce(async () => {
  kitState.scripts = await getScripts(false);
}, 25);

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
    } else {
      log.info(`💻 Not Mac. Skipping accessibility check.`);
      kitState.authorized = true;
      resolve(kitState.authorized);
    }
  });

const isMac = os.platform() === 'darwin';

const initState = {
  debugging: false,
  isPanel: false,
  hidden: false,
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
  socketURL: '',
  isShiftDown: false,
  isMac,
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
  watcherEnabled: !isMac,
  wakeWatcher: new Date().getTime(),
  allowBlur: true,
  keymap: null as any,
  keyboardConfig: {
    autoDelayMs: 0,
  } as KeyboardClass['config'],
  cancelTyping: false,
};

const initAppDb: AppDb = {
  version: '0.0.0',
  openAtLogin: true,
  previewScripts: true,
  autoUpdate: true,
  tray: true,
  appearance: 'auto',
  authorized: false,
};

nativeTheme.addListener('updated', () => {
  kitState.isDark = nativeTheme.shouldUseDarkColors;
  // kitState.transparencyEnabled = checkTransparencyEnabled();
});

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

export const appDb: AppDb = proxy(initAppDb);
export const kitConfig: Config = proxy(initConfig);
export const kitState: typeof initState = proxy(initState);
export type kitStateType = typeof initState;

export const widgetState: typeof initWidgets = proxy(initWidgets);
export const windowsState: typeof initWindows = proxy(initWindows);
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

let _promptDb: any = null;

export const getPromptDb: typeof getKitPromptDb = async () => {
  if (!_promptDb) {
    const promptDb = await getKitPromptDb();
    _promptDb = promptDb;
    _promptDb.write = debounce(async () => {
      await promptDb.write();
    }, 100);
  }

  return _promptDb;
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
      response = await axios.post(`https://scriptkit.com/api/check-sponsor`, {
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
  subAllowBlur
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

let nativeKeymap: any = null;

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

export const convertKey = (sourceKey: string) => {
  if (kitState.keymap) {
    const result = Object.entries(kitState.keymap).find(
      ([, { value }]: [string, any]) =>
        value.toLowerCase() === sourceKey.toLowerCase()
    ) || [''];

    const targetKey = result[0];
    log.info(
      `🔑 Converting key: ${sourceKey} -> ${targetKey}`,
      sourceKey,
      targetKey
    );

    if (targetKey) {
      const target = defaultKeyMap?.[targetKey]?.toUpperCase() || '';
      log.info(`🔑 Converted key: ${targetKey} -> ${target}`);
      return target || sourceKey;
    }
  }

  return sourceKey;
};

export const initKeymap = async () => {
  log.info(`🔑 Initializing keymap...`);
  if (!kitState.keymap) {
    try {
      ({ default: nativeKeymap } = await import('native-keymap' as any));
      kitState.keymap = nativeKeymap.getKeyMap();
      log.info(`Set keymap`);
      nativeKeymap.onDidChangeKeyboardLayout(() => {
        kitState.keymap = nativeKeymap.getKeyMap();
      });

      log.info(`🔑 Keymap: ${JSON.stringify(kitState.keymap)}`);
    } catch (e) {
      log.error(e);
    }
  }
};

export const clearStateTimers = () => {
  if (hideIntervalId) clearInterval(hideIntervalId);
};
