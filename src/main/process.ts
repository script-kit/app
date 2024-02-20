/* eslint-disable no-nested-ternary */
/* eslint-disable import/prefer-default-export */
import log from 'electron-log';
// REMOVE-MAC
import nmp from 'node-mac-permissions';
const { askForAccessibilityAccess, getAuthStatus, askForFullDiskAccess } = nmp;
// END-REMOVE-MAC

import {
  BrowserWindow,
  ipcMain,
  IpcMainEvent,
  globalShortcut,
  nativeTheme,
  powerMonitor,
} from 'electron';
import os from 'os';
import { assign, debounce } from 'lodash-es';
import ContrastColor from 'contrast-color';
import { subscribe } from 'valtio';
import { pathToFileURL } from 'url';

import { ChildProcess, fork, spawn } from 'child_process';
import { Channel, ProcessType, UI } from '@johnlindquist/kit/core/enum';
import { ProcessInfo } from '@johnlindquist/kit/types/core';

import { GenericSendData } from '@johnlindquist/kit/types/kitapp';

import {
  resolveToScriptPath,
  KIT_APP,
  KIT_APP_PROMPT,
  kitPath,
} from '@johnlindquist/kit/core/utils';

import { subscribeKey } from 'valtio/utils';
import fsExtra from 'fs-extra';
const { pathExistsSync, readJson } = fsExtra;
import { getLog, mainLog, warn } from './logs';
import { KitPrompt } from './prompt';
import {
  kitState,
  appDb,
  getThemes,
  kitStore,
  debounceSetScriptTimestamp,
} from '../shared/state';

import { widgetState } from '../shared/widget';

import { sendToAllPrompts } from './channel';

import { emitter, KitEvent } from '../shared/events';
import { showInspector } from './show';

import { AppChannel } from '../shared/enums';
import { isKitScript, toRgb } from './helpers';
import { toHex } from '../shared/color-utils';
import { stripAnsi } from './ansi';
import { TrackEvent, trackEvent } from './track';
import { createMessageMap } from './messages';
import { prompts } from './prompts';
import { createIdlePty } from './pty';
import { createEnv } from './env.utils';

export type ProcessAndPrompt = ProcessInfo & {
  prompt: KitPrompt;
  promptId?: string;
  launched: boolean;
  launchedFromMain: boolean;
};

// TODO: Reimplement SET_PREVIEW
export const clearPreview = () => {
  // sendToSpecificPrompt(Channel.SET_PREVIEW, `<div></div>`);
};

// TODO: Reimplement SET_FLAGS
export const clearFlags = () => {
  // sendToSpecificPrompt(Channel.SET_FLAG_VALUE, '');
  // sendToSpecificPrompt(Channel.SET_FLAGS, {});
  // setFlags({});
};

export const maybeConvertColors = async (theme: any = {}) => {
  log.verbose(`🎨 Convert Colors:`, theme);

  // eslint-disable-next-line prettier/prettier
  theme.foreground ||= theme?.['--color-text'];
  theme.background ||= theme?.['--color-background'];
  theme.accent ||= theme?.['--color-primary'];
  theme.ui ||= theme?.['--color-secondary'];

  const { scriptKitTheme, scriptKitLightTheme } = getThemes();
  theme.opacity ||=
    theme?.['--opacity'] ||
    (!kitState.isMac
      ? '1'
      : nativeTheme.shouldUseDarkColors
        ? scriptKitTheme.opacity
        : scriptKitLightTheme.opacity);

  log.info(`🫥 Theme opacity: ${theme.opacity}`);

  theme['--ui-bg-opacity'] ||=
    theme?.['ui-bg-opacity'] || kitState.isDark
      ? scriptKitTheme['ui-bg-opacity']
      : scriptKitLightTheme['ui-bg-opacity'];
  theme['--ui-border-opacity'] ||=
    theme?.['ui-border-opacity'] || kitState.isDark
      ? scriptKitTheme['ui-border-opacity']
      : scriptKitLightTheme['ui-border-opacity'];

  if (appDb?.disableBlurEffect) theme.opacity = '1';

  if (theme.foreground) {
    const foreground = toRgb(theme.foreground);
    theme['--color-text'] = foreground;
  }
  if (theme.accent) {
    const accent = toRgb(theme.accent);
    theme['--color-primary'] = accent;
  }

  if (theme.ui) {
    const ui = toRgb(theme.ui);
    theme['--color-secondary'] = toRgb(ui);
  }

  let result = ``;
  if (theme.background) {
    const background = toRgb(theme.background);
    theme['--color-background'] = background;
    const bgColor = toHex(theme.background);

    const cc = new ContrastColor({
      bgColor,
    });
    result = cc.contrastColor();

    theme.appearance ||= result === '#FFFFFF' ? 'dark' : 'light';
    log.verbose(`💄 Setting appearance to ${theme.appearance}`);
  }

  if (!kitState.isMac) {
    theme['--opacity'] = '.96';
  } else if (theme.opacity) {
    theme['--opacity'] = theme.opacity;
  }

  if (theme.ui) delete theme.ui;
  if (theme.background) delete theme.background;
  if (theme.foreground) delete theme.foreground;
  if (theme.accent) delete theme.accent;
  if (theme.opacity) delete theme.opacity;
  if (theme?.['ui-bg-opacity']) delete theme['ui-bg-opacity'];
  if (theme?.['ui-border-opacity']) delete theme['ui-border-opacity'];

  // if(value?.['--color-text']) delete value['--color-text']
  // if(value?.['--color-background']) delete value['--color-background']
  // if(value?.['--color-primary']) delete value['--color-primary']
  // if(value?.['--color-secondary']) delete value['--color-secondary']
  // if(value?.['--opacity']) delete value['--opacity']

  const validVibrancies = [
    'appearance-based',
    'light',
    'dark',
    'titlebar',
    'selection',
    'menu',
    'popover',
    'sidebar',
    'medium-light',
    'ultra-dark',
    'header',
    'sheet',
    'window',
    'hud',
    'fullscreen-ui',
    'tooltip',
    'content',
    'under-window',
    'under-page',
  ];

  const defaultVibrancy = 'hud';

  const vibrancy =
    theme?.vibrancy && validVibrancies.includes(theme.vibrancy)
      ? theme.vibrancy
      : defaultVibrancy;

  // setVibrancy(vibrancy);

  return theme;
};

export const setTheme = async (value: any = {}, check = true) => {
  log.verbose(`🎨 Setting theme:`, {
    hasCss: kitState.hasCss,
    value,
  });
  // if (kitState.hasCss) return;
  // if (check) {
  //   await sponsorCheck('Custom Themes');
  //   if (!kitState.isSponsor) return;
  // }

  const newValue = await maybeConvertColors(value);
  assign(kitState.theme, newValue);

  // TODO: https://github.com/electron/electron/issues/37705
  // const promptWindow = getMainPrompt();
  // const backgroundColor = `rgba(${kitState.theme['--color-background']}, ${kitState.theme['--opacity']})`;
  // log.info(`🎨 Setting backgroundColor: ${backgroundColor}`);

  // promptWindow.setBackgroundColor(backgroundColor);

  // TODO: Reimplement SET_THEME
  sendToAllPrompts(Channel.SET_THEME, newValue);
};

export const updateTheme = async () => {
  kitState.isDark = nativeTheme.shouldUseDarkColors;
  log.info({
    isDarkState: kitState.isDark ? 'true' : 'false',
    isDarkNative: nativeTheme.shouldUseDarkColors ? 'true' : 'false',
  });

  const themePath = kitState.isDark
    ? kitState.kenvEnv?.KIT_THEME_DARK
    : kitState.kenvEnv?.KIT_THEME_LIGHT;

  if (themePath && pathExistsSync(themePath)) {
    log.info(
      `▓ ${kitState.isDark ? 'true' : 'false'} 👀 Theme path: ${themePath}`,
    );
    try {
      const currentTheme = await readJson(themePath);
      setTheme(currentTheme);
    } catch (error) {
      log.warn(error);
    }
  } else {
    log.info(`👀 No themes configured in .env. Using defaults`);
    const { scriptKitLightTheme, scriptKitTheme } = getThemes();
    setTheme(kitState.isDark ? scriptKitTheme : scriptKitLightTheme);
  }
};
nativeTheme.addListener('updated', updateTheme);

type WidgetData = {
  widgetId: string;
  value?: any;
  width?: number;
  height?: number;
  filePath?: string;
  iconPath?: string;
};
type WidgetHandler = (event: IpcMainEvent, data: WidgetData) => void;

export const cachePreview = async (scriptPath: string, preview: string) => {
  // log.verbose(`🎁 Caching preview for ${kitState.scriptPath}`);
  // preloadPreviewMap.set(scriptPath, preview);
  // if (
  //   kitState.scriptPath === getMainScriptPath() &&
  //   preview &&
  //   kitSearch.input === '' &&
  //   !kitSearch.inputRegex
  // ) {
  // TODO: Going to need to cache preview so the _next_ prompt has access
  // appToSpecificPrompt(AppChannel.SET_CACHED_MAIN_PREVIEW, preview);
  // }
};

export const childSend = (child: ChildProcess, data: any) => {
  try {
    if (child && child?.connected && child.pid) {
      const prompt = prompts.get(child.pid);
      if (prompt) {
        data.promptId = prompt.id;
      }
      // log.info(`✉️: ${data.channel}`);
      child.send(data, (error) => {
        if (error)
          log.warn(`Channel ${data?.channel} failed on ${data?.promptId}`);
      });
    }
  } catch (error) {
    log.error('childSend error', error);
  }
};

export const sendToAllActiveChildren = (data: any) => {
  // log.info(`Sending ${data?.channel} to all active children`);
  processes.getActiveProcesses().forEach((processInfo) => {
    childSend(processInfo.child, data);
  });
};

export const createMessageHandler = (info: ProcessInfo) => {
  const { type } = info;
  const kitMessageMap = createMessageMap(info);
  // log.info({ kitMessageMap });

  return async (data: GenericSendData) => {
    if (!data.kitScript && data?.channel !== Channel.HEARTBEAT) {
      log.info(data);
    }

    const channelFn = kitMessageMap[data.channel as Channel];

    if (channelFn) {
      // type C = keyof ChannelMap;
      // const channelFn = kitMessageMap[data.channel as C] as (
      //   data: SendData<C>
      // ) => void;
      try {
        log.silly(`📬 ${data.channel}`);
        channelFn(data);
      } catch (error) {
        log.error(`Error in channel ${data.channel}`, error);
      }
    } else {
      warn(`Channel ${data?.channel} not found on ${type}.`);
    }
  };
};

interface CreateChildInfo {
  type: ProcessType;
  scriptPath?: string;
  runArgs?: string[];
  port?: number;
  resolve?: (data: any) => void;
  reject?: (error: any) => void;
}

const DEFAULT_TIMEOUT = 15000;

const createChild = ({
  type,
  scriptPath = 'kit',
  runArgs = [],
  port = 0,
}: CreateChildInfo) => {
  let args: string[] = [];
  if (!scriptPath) {
    args = [];
  } else {
    const resolvePath = resolveToScriptPath(scriptPath);
    args = [resolvePath, ...runArgs];
  }

  const isPrompt = type === ProcessType.Prompt;
  const entry = isPrompt ? KIT_APP_PROMPT : KIT_APP;

  const env = createEnv();
  // console.log({ env });
  const loaderFileUrl = pathToFileURL(kitPath('build', 'loader.js')).href;
  const isWin = os.platform().startsWith('win');
  const child = fork(entry, args, {
    silent: true,
    stdio: 'pipe',
    // TODO: Testing execPath on Windows????
    // execPath,
    cwd: os.homedir(),
    execArgv: [`--loader`, loaderFileUrl],
    env: {
      ...env,
      KIT_DEBUG: port ? '1' : '0',
    },
    ...(port
      ? {
          stdio: 'pipe',
          execArgv: [`--loader`, loaderFileUrl, `--inspect=${port}`],
        }
      : {}),
  });

  let win: BrowserWindow | null = null;

  if (port && child && child.stdout && child.stderr) {
    // TODO: Reimplement SET_PROMPT_DATA for debugger
    // sendToSpecificPrompt(Channel.SET_PROMPT_DATA, {
    //   ui: UI.debugger,
    // } as any);
    log.info(`Created ${type} process`);
    // child.stdout.on('data', (data) => {
    //   log.info(`Child ${type} data`, data);
    // });

    child.once('disconnect', () => {
      if (!child.killed) {
        child.kill();
      }
    });

    child.once('exit', () => {
      kitState.debugging = false;
      if (win && !win.isDestroyed()) {
        win.close();
      }
    });

    child.stderr.once('data', async (data) => {
      log.info(data?.toString());
      const [debugUrl] = data.toString().match(/(?<=ws:\/\/).*/g) || [''];

      if (debugUrl) {
        if (child.pid) {
          const prompt = prompts.get(child.pid);
        }

        // TODO: I'm going to have to handle this outside of creatChild so it has access to the prompt created after it or something
        // setPromptAlwaysOnTop(true);
        log.info({ debugUrl });
        const devToolsUrl = `devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=${debugUrl}`;
        log.info(`DevTools URL: ${devToolsUrl}`);

        win = showInspector(devToolsUrl);
        setTimeout(() => {
          win?.setAlwaysOnTop(false);
        }, 500);

        win.on('close', () => {
          if (child && !child.killed) child?.kill();
          // TODO: I'm going to have to handle this outside of creatChild so it has access to the prompt created after it or something

          // maybeHide(HideReason.DebuggerClosed);
        });
      }
    });

    const scriptLog = getLog(scriptPath);

    const routeToScriptLog = (d: any) => {
      scriptLog.info(`\n${stripAnsi(d.toString())}`);
    };

    child.stdout?.on('data', routeToScriptLog);
    child.stderr?.on('data', routeToScriptLog);
  }

  return child;
};

interface ProcessHandlers {
  onExit?: () => void;
  onError?: (error: Error) => void;
  resolve?: (values: any[]) => any;
  reject?: (value: any) => any;
}

const processesChanged = debounce(() => {
  if (kitState.allowQuit) return;
  const pinfos = processes.getAllProcessInfo().filter((p) => p.scriptPath);

  for (const pinfo of processes) {
    pinfo.prompt.sendToPrompt(AppChannel.PROCESSES, pinfos);
    log.info(
      `🏃‍♂️💨 Active process: ${pinfo.pid} - ${pinfo.scriptPath || 'Idle'}`,
    );
  }
}, 10);

export const clearIdleProcesses = () => {
  return;
  log.info(`Reset all idle processes`);
  processes.getAllProcessInfo().forEach((processInfo) => {
    if (
      processInfo.type === ProcessType.Prompt &&
      processInfo.scriptPath === ''
    ) {
      processes.removeByPid(processInfo.pid);
    }
  });
};

export const getIdles = () => {
  return processes
    .getAllProcessInfo()
    .filter(
      (processInfo) =>
        processInfo.type === ProcessType.Prompt &&
        processInfo?.scriptPath === '',
    );
};

export const ensureIdleProcess = () => {
  if (!kitState.ready) return;
  log.info(`Ensure idle process`);
  setTimeout(() => {
    const idles = getIdles();
    if (idles.length === 0) {
      log.info(`Add one idle process`);
      processes.add(ProcessType.Prompt);
    }
  }, 0);
};

const setTrayScriptError = (pid: number) => {
  try {
    const { scriptPath: errorScriptPath } = processes.getByPid(pid) || {
      scriptPath: '',
    };

    kitState.scriptErrorPath = errorScriptPath;
  } catch {
    kitState.scriptErrorPath = '';
  }
};

const childShortcutMap = new Map<ChildProcess, string[]>();

let promptCount = 0;
class Processes extends Array<ProcessAndPrompt> {
  public abandonnedProcesses: ProcessAndPrompt[] = [];

  public getAllProcessInfo() {
    return this.map(({ scriptPath, type, pid, launched }) => ({
      type,
      scriptPath,
      pid,
      launched,
    }));
  }

  public addExistingProcess(child: ChildProcess, scriptPath: string) {
    const info = {
      pid: child.pid,
      child,
      type: ProcessType.Prompt,
      scriptPath,
      values: [],
      date: Date.now(),
    };

    this.push(info);
    processesChanged();
  }

  private stampPid(pid: number) {
    log.info(`>>>>>>>>>>>>>>>>>>>>>>>> ATTEMPTING STAMP!!!!!`);
    const processInfo = this.getByPid(pid);
    if (!processInfo || !processInfo.launchedFromMain) return;
    if (
      processInfo.type === ProcessType.Prompt &&
      !processInfo.scriptPath.includes('.kit')
    ) {
      const now = Date.now();
      const stamp = {
        filePath: processInfo?.scriptPath,
        runCount: 1,
        executionTime: now - processInfo.date,
        runStamp: processInfo.date,
        exitStamp: now,
      };

      log.info(`>>>>>>>>>>>>>>>>>>>>>>>> STAMPING!!!!!`, stamp);
      debounceSetScriptTimestamp(stamp);
    }
  }

  private heartbeatInterval: NodeJS.Timeout | null = null;

  public startHeartbeat() {
    if (this.heartbeatInterval) return;
    this.heartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, 10000);
  }

  public stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public heartbeat() {
    for (const pInfo of this) {
      if (!pInfo?.prompt?.isVisible()) return;
      if (pInfo.child && pInfo.child.connected && !pInfo.child?.killed) {
        pInfo.child.send({
          channel: Channel.HEARTBEAT,
        });
      }
    }
  }

  public add(
    type: ProcessType = ProcessType.Prompt,
    scriptPath = '',
    args: string[] = [],
    port = 0,
    { resolve, reject }: ProcessHandlers = {},
  ): ProcessAndPrompt {
    const child = createChild({
      type,
      scriptPath,
      runArgs: args,
      port,
    });

    if (!child.pid) {
      log.error(`Child process has no pid`, child);
      throw new Error(`Child process has no pid`);
    }

    const prompt = prompts.attachIdlePromptToProcess(child.pid);
    prompt.count = ++promptCount;

    log.info(`👶 Create child ${type} process: ${child.pid}`, scriptPath, args);

    const info = {
      pid: child.pid,
      child,
      type,
      scriptPath,
      values: [],
      date: Date.now(),
      prompt,
      launchedFromMain: false,
      launched: false,
    } as ProcessAndPrompt;

    // prompt.window.on('closed', () => {
    //   info.prompt = null;
    // });

    this.push(info);

    processesChanged();

    if (scriptPath) {
      log.info(`${child.pid}: 🟢 start ${type} ${scriptPath}`);
    } else {
      log.info(`${child.pid}: 🟢 start idle ${type}`);
    }

    const id =
      ![ProcessType.Background, ProcessType.Prompt].includes(type) &&
      setTimeout(() => {
        log.info(
          `${child.pid}: ${type} process: ${scriptPath} took > ${DEFAULT_TIMEOUT} seconds. Ending...`,
        );
        child?.kill();
      }, DEFAULT_TIMEOUT);

    const messageHandler = createMessageHandler(info);
    child?.on('message', messageHandler);

    const { pid } = child;

    child.on('spawn', () => {
      log.info(`${pid}: SPAWN`);
    });

    child.on('close', () => {
      log.info(`${pid}: CLOSE`);
      processes.removeByPid(pid);
    });

    child.on('disconnect', () => {
      log.info(`${pid}: DISCONNECTED`);
      this.stampPid(pid);
      processes.removeByPid(pid);
    });

    child.on('exit', (code) => {
      log.info(`EXIT`, { pid, code });
      if (id) clearTimeout(id);

      prompt.sendToPrompt(Channel.EXIT, pid);
      emitter.emit(KitEvent.TERM_KILL, prompt.id);

      const processInfo = processes.getByPid(pid) as ProcessInfo;

      if (!processInfo) return;

      if (resolve) {
        resolve(processInfo?.values);
      }

      if (code === 0) {
        log.info(
          `${child.pid}: 🟡 exit ${code}. ${processInfo.type} process: ${processInfo?.scriptPath}`,
        );

        if (child.pid) {
          this.stampPid(child.pid);
        }
      } else if (typeof code === 'number') {
        log.error(
          `${child.pid}: 🟥 exit ${code}. ${processInfo.type} process: ${processInfo?.scriptPath}`,
        );
        log.error(
          `👋 Ask for help: https://github.com/johnlindquist/kit/discussions/categories/errors`,
        );

        setTrayScriptError(pid);
      }

      processes.removeByPid(pid);
    });

    child.on('error', (error) => {
      if (error?.message?.includes('EPIPE')) return;
      log.error(`ERROR`, { pid, error });
      log.error(
        `👋 Ask for help: https://github.com/johnlindquist/kit/discussions/categories/errors`,
      );
      kitState.status = {
        status: 'warn',
        message: ``,
      };

      setTrayScriptError(pid);
      processes.removeByPid(pid);

      trackEvent(TrackEvent.ChildError, {
        error: error?.message,
      });
      if (reject) reject(error);
    });

    return info;
  }

  public findIdlePromptProcess(): ProcessAndPrompt {
    log.info(`>>>>>>>>>>>>>> FINDING IDLE PROCESS <<<<<<<<<<<<<<<<`);
    const idles = this.filter(
      (processInfo) =>
        processInfo.type === ProcessType.Prompt &&
        processInfo?.scriptPath === '',
    );

    ensureIdleProcess();

    if (idles.length) {
      return idles[0];
    }

    log.info(`>>>>>>>>>>>>>> NO IDLE PROCESS FOUND <<<<<<<<<<<<<<<<`);

    return processes.add(ProcessType.Prompt);
  }

  public getActiveProcesses() {
    return this.filter((processInfo) => processInfo.scriptPath);
  }

  public getByPid(pid: number): ProcessAndPrompt {
    return [...this, ...this.abandonnedProcesses].find(
      (processInfo) => processInfo.pid === pid,
    ) as ProcessAndPrompt;
  }

  public removeByPid(pid: number) {
    log.info(`🛑 removeByPid: ${pid}`);
    if (pid === 0) {
      log.info(`Invalid pid: ${pid} 🤔`);
    }
    prompts.delete(pid);
    const index = this.findIndex((info) => info.pid === pid);
    if (index === -1) return;
    const { child, type, scriptPath, prompt } = this[index];

    if (!child?.killed) {
      emitter.emit(KitEvent.RemoveProcess, scriptPath);
      child?.removeAllListeners();
      child?.kill();

      if (childShortcutMap.has(child)) {
        log.info(`Unregistering shortcuts for child: ${child.pid}`);
        const shortcuts = childShortcutMap.get(child) || [];
        shortcuts.forEach((shortcut) => {
          log.info(`Unregistering shortcut: ${shortcut}`);

          try {
            globalShortcut.unregister(shortcut);
          } catch (error) {
            log.error(`Error unregistering shortcut: ${shortcut}`, error);
          }
        });
        childShortcutMap.delete(child);
      }

      log.info(`${pid}: 🛑 removed`);
    }

    // TODO: Does this matter anymore?
    // if (kitState?.pid === pid) {
    //   kitState.scriptPath = '';
    //   kitState.promptId = '';
    //   kitState.promptCount = 0;
    // }

    if (this.find((i) => i.pid === pid)) {
      this.splice(index, 1);

      processesChanged();
    }
  }

  public removeCurrentProcess() {
    // TODO: Reimplement?
    // const info = this.find(
    //   (processInfo) =>
    //     processInfo.scriptPath === prompt.scriptPath &&
    //     processInfo.type === ProcessType.Prompt
    // );
    // if (info) {
    //   this.removeByPid(info.pid);
    // }
  }
}

export const processes = new Processes();
processes.startHeartbeat();
powerMonitor.addListener('resume', () => processes.startHeartbeat());
powerMonitor.addListener('unlock-screen', () => processes.startHeartbeat());
powerMonitor.addListener('suspend', () => processes.stopHeartbeat());
powerMonitor.addListener('lock-screen', () => processes.stopHeartbeat());

export const removeAbandonnedKit = () => {
  const kitProcess = processes.find((processInfo) =>
    isKitScript(processInfo.scriptPath),
  );

  if (kitProcess) {
    setTimeout(() => {
      log.info(`🛑 Cancel main menu process: ${kitProcess.scriptPath}`);
      processes.removeByPid(kitProcess.pid);
    }, 250);
  }
};

export const handleWidgetEvents = () => {
  const initHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;

    const w = widgetState.widgets.find(({ id }) => id === widgetId);
    if (!w) return;
    const { wid, moved, pid } = w;
    const widget = BrowserWindow.fromId(wid);
    const { child } = processes.getByPid(pid) as ProcessInfo;
    if (!child) return;

    if (moved) {
      w.moved = false;
      return;
    }

    log.info(`👋 ${widgetId} Initialized`);

    childSend(child, {
      ...data,
      ...widget.getBounds(),
      pid: child.pid,
      channel: Channel.WIDGET_INIT,
    });
  };

  const clickHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;

    const w = widgetState.widgets.find(({ id }) => id === widgetId);
    log.info(`🔎 click ${widgetId}`, {
      w,
      widgets: widgetState.widgets.map((w) => w.id),
    });
    if (!w) return;
    const { wid, moved, pid } = w;
    const widget = BrowserWindow.fromId(wid);
    const { child } = processes.getByPid(pid) as ProcessInfo;
    if (!child) return;

    if (moved) {
      w.moved = false;
      return;
    }

    childSend(child, {
      ...data,
      ...widget.getBounds(),
      pid: child.pid,
      channel: Channel.WIDGET_CLICK,
    });
  };

  const dropHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;

    const w = widgetState.widgets.find(({ id }) => id === widgetId);
    if (!w) return;
    const { wid, moved, pid } = w;
    const widget = BrowserWindow.fromId(wid);
    const { child } = processes.getByPid(pid) as ProcessInfo;
    if (!child) return;

    log.info(`💧 drop ${widgetId}`);

    childSend(child, {
      ...data,
      ...widget.getBounds(),
      pid: child.pid,
      channel: Channel.WIDGET_DROP,
    });
  };

  const customHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;

    const w = widgetState.widgets.find(({ id }) => id === widgetId);
    if (!w) return;
    const { wid, moved, pid } = w;
    const widget = BrowserWindow.fromId(wid);
    const { child } = processes.getByPid(pid) as ProcessInfo;
    if (!child) return;

    log.info(`💧 custom ${widgetId}`);

    childSend(child, {
      ...data,
      ...widget.getBounds(),
      pid: child.pid,
      channel: Channel.WIDGET_CUSTOM,
    });
  };

  const mouseDownHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;

    const w = widgetState.widgets.find(({ id }) => id === widgetId);
    log.info(`🔽 mouseDown ${widgetId}`, { w });
    if (!w) return;
    const { wid, moved, pid } = w;
    const widget = BrowserWindow.fromId(wid);
    const { child } = processes.getByPid(pid) as ProcessInfo;
    if (!child) return;

    // if (moved) {
    //   w.moved = false;
    //   return;
    // }

    childSend(child, {
      ...data,
      ...widget.getBounds(),
      pid: child.pid,
      channel: Channel.WIDGET_MOUSE_DOWN,
    });
  };

  const mouseUpHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;
    log.info(`🔽 mouseUp ${widgetId}`);

    const w = widgetState.widgets.find(({ id }) => id === widgetId);
    if (!w) return;
    const { wid, moved, pid } = w;
    const widget = BrowserWindow.fromId(wid);
    const { child } = processes.getByPid(pid) as ProcessInfo;
    if (!child) return;

    // if (moved) {
    //   w.moved = false;
    //   return;
    // }

    childSend(child, {
      ...data,
      ...widget.getBounds(),
      pid: child.pid,
      channel: Channel.WIDGET_MOUSE_UP,
    });
  };

  const inputHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;
    const options = widgetState.widgets.find(({ id }) => id === widgetId);
    if (!options) return;
    const { pid, wid } = options;
    const widget = BrowserWindow.fromId(wid);
    const { child } = processes.getByPid(pid) as ProcessInfo;
    if (!child || !widget) return;

    childSend(child, {
      ...data,

      ...widget.getBounds(),
      widgetId,
      pid: child?.pid,
      channel: Channel.WIDGET_INPUT,
    });
  };

  const dragHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;
    log.info(`📦 ${data.widgetId} Widget: Dragging file`, data);
    const options = widgetState.widgets.find(({ id }) => id === widgetId);
    if (!options) return;
    const { pid, wid } = options;
    const widget = BrowserWindow.fromId(wid);
    const { child } = processes.getByPid(pid) as ProcessInfo;
    if (!child || !widget) return;

    try {
      event.sender.startDrag({
        file: data?.filePath as string,
        icon: data?.iconPath as string,
      });
    } catch (error) {
      log.error(error);
    }
  };

  const measureHandler: WidgetHandler = (event, data: any) => {
    const { widgetId } = data;
    log.info(`📏 ${widgetId} Widget: Fitting to inner child`);

    const options = (widgetState?.widgets || []).find(
      ({ id }) => id === widgetId,
    );
    if (!options) return;

    const { wid, ignoreMeasure, pid } = options;
    const widget = BrowserWindow.fromId(wid);
    const { child } = processes.getByPid(pid) as ProcessInfo;
    if (!child || !widget || ignoreMeasure) return;

    widget.setSize(data.width, data.height, true);
  };

  // These events are not being caught in the script...
  ipcMain.on(Channel.WIDGET_INIT, initHandler);
  ipcMain.on(Channel.WIDGET_CLICK, clickHandler);
  ipcMain.on(Channel.WIDGET_DROP, dropHandler);
  ipcMain.on(Channel.WIDGET_MOUSE_DOWN, mouseDownHandler);
  ipcMain.on(Channel.WIDGET_MOUSE_UP, mouseUpHandler);
  ipcMain.on(Channel.WIDGET_INPUT, inputHandler);
  ipcMain.on(Channel.WIDGET_DRAG_START, dragHandler);
  ipcMain.on(Channel.WIDGET_CUSTOM, customHandler);
  ipcMain.on(Channel.WIDGET_MEASURE, measureHandler);
};

emitter.on(KitEvent.KillProcess, (pid) => {
  log.info(`🛑 Kill Process: ${pid}`);
  processes.removeByPid(pid);
});

emitter.on(KitEvent.TermExited, (pid) => {
  log.info(`🛑 Term Exited: SUMBMITTING`);
  const prompt = prompts.get(pid);
  if (prompt && prompt.ui === UI.term) {
    prompt.sendToPrompt(AppChannel.TERM_EXIT, '');
  }
});

export const destroyAllProcesses = () => {
  mainLog.info(`Destroy all processes`);
  processes.forEach((pinfo) => {
    if (!pinfo?.child.killed) {
      pinfo?.child?.removeAllListeners();
      pinfo?.child?.kill();
    }
  });
  processes.length = 0;
};

export const spawnShebang = async ({
  shebang,
  filePath,
}: {
  shebang: string;
  filePath: string;
}) => {
  const [command, ...args] = shebang.split(' ');
  const child = spawn(command, [...args, filePath]);
  processes.addExistingProcess(child, filePath);

  log.info(
    `🚀 Spawned process ${child.pid} for ${filePath} with command ${command}`,
  );

  child.unref();

  if (child.stdout && child.stderr) {
    const scriptLog = getLog(filePath);
    child.stdout.removeAllListeners();
    child.stderr.removeAllListeners();

    const routeToScriptLog = (d: any) => {
      if (child?.killed) return;
      const result = d.toString();
      scriptLog.info(`\n${stripAnsi(result)}`);
    };

    child.stdout?.on('data', routeToScriptLog);
    child.stdout?.on('error', routeToScriptLog);

    child.stderr?.on('data', routeToScriptLog);
    child.stderr?.on('error', routeToScriptLog);

    // Log out when the process exits
    child.on('exit', (code) => {
      scriptLog.info(`\nProcess exited with code ${code}`);
      processes.removeByPid(child.pid);
    });
  }
};

emitter.on(
  KitEvent.RemoveMostRecent,
  processes.removeCurrentProcess.bind(processes),
);
// emitter.on(KitEvent.MainScript, () => {
//   sendToPrompt(Channel.SET_DESCRIPTION, 'Run Script');
//   const scripts = getScriptsSnapshot();
//   log.verbose({ scripts });
//   setChoices(formatScriptChoices(scripts));
// });

let observer: PerformanceObserver | null = null;
emitter.on(KitEvent.DID_FINISH_LOAD, async () => {
  try {
    // REMOVE-MAC
    if (kitState.isMac) {
      const authorized = getAuthStatus('accessibility') === 'authorized';

      if (authorized) {
        kitStore.set('accessibilityAuthorized', authorized);
      }
    }
    // END-REMOVE-MAC

    // TODO: Why did I even do this? There has to be a simpler way now
    // togglePromptEnv('KIT_MAIN_SCRIPT');

    if (kitState.kenvEnv?.KIT_MEASURE) {
      // if (observer) observer.disconnect();
      // if (PerformanceObserver) {
      //   observer = new PerformanceObserver((list) => {
      //     const entries = list.getEntries();
      //     const entry = entries[0];
      //     log.info(`⌚️ [Perf] ${entry.name}: ${entry.duration}`);
      //   });
      //   observer.observe({ entryTypes: ['measure'] });
      // }
    }

    performance.mark('script');
  } catch (error) {
    log.warn(`Error reading kenv env`, error);
  }

  updateTheme();
});

let prevKenvEnv: Record<string, string> = {};
subscribeKey(kitState, 'kenvEnv', (kenvEnv) => {
  log.info(`🔑 kenvEnv updated`, kenvEnv);
  // Compare prevKenvEnv to kenvEnv
  const keys = Object.keys(kenvEnv);
  const prevKeys = Object.keys(prevKenvEnv);
  const addedKeys = keys.filter((key) => !prevKeys.includes(key));
  const removedKeys = prevKeys.filter((key) => !keys.includes(key));
  const changedKeys = keys.filter(
    (key) => prevKeys.includes(key) && prevKenvEnv[key] !== kenvEnv[key],
  );
  if (addedKeys.length || removedKeys.length || changedKeys.length) {
    log.info(`🔑 kenvEnv changes`);
    prevKenvEnv = kenvEnv;
  } else {
    log.info(`🔑 kenvEnv no changes`);
    return;
  }
  if (Object.keys(kenvEnv).length === 0) return;
  if (processes.getAllProcessInfo().length === 0) return;
  clearIdleProcesses();
  ensureIdleProcess();
  createIdlePty();
});

subscribe(appDb, (db) => {
  log.info(`👩‍💻 Reading app.json`, { ...appDb });

  // TODO: Reimplement SET_APP_DB
  sendToAllPrompts(Channel.APP_DB, { ...appDb });
});
