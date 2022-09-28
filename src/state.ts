/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-nested-ternary */

import { Config, KitStatus } from '@johnlindquist/kit/types/kitapp';
import { proxy } from 'valtio/vanilla';
import { subscribeKey } from 'valtio/utils';
import log, { LogLevel } from 'electron-log';
import path from 'path';
import os from 'os';
import { ChildProcess } from 'child_process';
import { app, BrowserWindow, Menu, nativeTheme } from 'electron';
import schedule, { Job } from 'node-schedule';
import { readdir } from 'fs/promises';
import { debounce } from 'lodash';
import { Script } from '@johnlindquist/kit/types/core';
import {
  getScripts,
  setScriptTimestamp,
  getTimestamps,
} from '@johnlindquist/kit/cjs/db';

import {
  parseScript,
  kitPath,
  isParentOfDir,
  mainScriptPath,
  tmpClipboardDir,
} from '@johnlindquist/kit/cjs/utils';
import { UI } from '@johnlindquist/kit/cjs/enum';
import internetAvailable from './internet-available';
import { noScript } from './defaults';
import { ProcessInfo } from './types';
import { getAssetPath } from './assets';

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
  kitState.scripts = await getScripts(false);
};

export const scriptChanged = debounce(async (filePath: string) => {
  await setScriptTimestamp(filePath);
  kitState.scripts = await getScripts();
}, 50);

export const scriptRemoved = debounce(async () => {
  kitState.scripts = await getScripts(false);
}, 50);

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

const initState = {
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
  isMac: os.platform() === 'darwin',
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
  settled: false,
  authorized: false,
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
  scripts: [] as Script[],
  kitScripts: [] as Script[],
  interruptScript: false,
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
};

const initAppDb = {
  version: '0.0.0',
  openAtLogin: true,
  previewScripts: true,
  autoUpdate: true,
  tray: true,
  appearance: 'auto',
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

export const appDb: typeof initAppDb = proxy(initAppDb);
export const kitConfig: Config = proxy(initConfig);
export const kitState: typeof initState = proxy(initState);
export type kitStateType = typeof initState;

export const widgetState: typeof initWidgets = proxy(initWidgets);
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

subscribeKey(kitState, 'status', (status: KitStatus) => {
  if (status.status !== 'default' && status.message) {
    kitState.notifications.push(status);
    log.info(`👀 Status: ${JSON.stringify(status)}`);
  } else if (kitState.notifications.length > 0) {
    kitState.notifications = [];
  }
});

subscribeKey(kitState, 'ready', (ready) => {
  if (ready) {
    kitState.status = {
      status: 'default',
      message: '',
    };
  }
});

subscribeKey(kitState, 'notifyAuthFail', (notifyAuthFail) => {
  if (notifyAuthFail) {
    kitState.status = {
      status: 'warn',
      message: '',
    };
  }
});

const hideDock = debounce(() => {
  if (!kitState.isMac) return;
  if (kitState.devToolsCount > 0) return;
  if (kitState.scriptPath) return;
  if (widgetState.widgets.length) return;
  if (app?.dock.isVisible()) {
    app?.dock?.setIcon(getAssetPath('icon.png'));
    app?.dock?.hide();
  }
}, 250);

const showDock = () => {
  if (!kitState.isMac) return;
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
  }
};

subscribeKey(widgetState, 'widgets', (widgets) => {
  log.info(`👀 Widgets: ${JSON.stringify(widgets)}`);
  if (widgets.length !== 0) {
    showDock();
  } else {
    hideDock();
  }
});

subscribeKey(kitState, 'scriptPath', (scriptPath) => {
  if (scriptPath) {
    showDock();
  } else {
    hideDock();
  }
});

subscribeKey(kitState, 'devToolsCount', (count) => {
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
  kitState.allowQuit = true;
  log.info(`👋 Quitting...`);

  setTimeout(() => {
    try {
      app.quit();
      app.exit(0);
    } catch (e) {
      log.error(e);
    }
  }, 1000);
};
