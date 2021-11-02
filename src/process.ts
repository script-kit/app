/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import log from 'electron-log';
import { app, clipboard, Notification, screen } from 'electron';
import http from 'http';
import https from 'https';
import url from 'url';
import sizeOf from 'image-size';

import { autoUpdater } from 'electron-updater';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ChildProcess, fork } from 'child_process';
import { Channel, Mode, ProcessType } from '@johnlindquist/kit/cjs/enum';
import { Choice, Script, PromptData } from '@johnlindquist/kit/types/core';
import { MessageData } from '@johnlindquist/kit/types/kitapp';
import { getAppDb } from '@johnlindquist/kit/cjs/db';

import {
  resolveToScriptPath,
  KIT_APP,
  KIT_APP_PROMPT,
  kitPath,
  kenvPath,
  kitDotEnvPath,
  execPath,
} from '@johnlindquist/kit/cjs/utils';

import { getLog } from './logs';
import {
  clearPromptCache,
  focusPrompt,
  getPromptBounds,
  getPromptPid,
  hidePromptWindow,
  sendToPrompt,
  setBlurredByKit,
  setBounds,
  setChoices,
  setHint,
  setIgnoreBlur,
  setInput,
  setLog,
  setMode,
  setPanel,
  setPlaceholder,
  setPreview,
  setPromptData,
  setPromptProp,
  setScript,
  setTabIndex,
} from './prompt';
import { setAppHidden } from './appHidden';
import {
  makeRestartNecessary,
  serverState,
  getBackgroundTasks,
  getSchedule,
} from './state';

import { emitter, KitEvent } from './events';
import { show } from './show';
import { showNotification } from './notifications';

import { getVersion } from './version';
import { getTray, toggleTray } from './tray';

export const checkScriptChoices = (data: MessageData) => {
  // console.log(`🤔 checkScriptChoices ${data?.choices?.length}`);
  if (data?.scripts) {
    const dataChoices: Script[] = (data?.choices || []) as Script[];
    const choices = dataChoices.map((script) => {
      if (script.background) {
        const backgroundScript = getBackgroundTasks().find(
          (t) => t.filePath === script.filePath
        );

        script.description = `${script.description || ''}${
          backgroundScript
            ? `🟢  Uptime: ${formatDistanceToNowStrict(
                new Date(backgroundScript.process.start)
              )} PID: ${backgroundScript.process.pid}`
            : "🛑 isn't running"
        }`;
      }

      if (script.schedule) {
        const scheduleScript = getSchedule().find(
          (s) => s.filePath === script.filePath
        );

        if (scheduleScript) {
          const date = new Date(scheduleScript.date);
          const next = `Next ${formatDistanceToNowStrict(date)}`;
          const cal = `${format(date, 'MMM eo, h:mm:ssa ')}`;

          script.description = `${
            script.description || ``
          } ${next} - ${cal} - ${script.schedule}`;
        }
      }

      if (script.watch) {
        script.description = `${script.description || ``} Watching: ${
          script.watch
        }`;
      }

      if (script.img) {
        script.img = script.img.match(/(^http)|^\//)
          ? script.img
          : kenvPath(
              script.kenv && `kenvs/${script.kenv}`,
              'assets',
              script.img
            );
      }
      // script.hasPreview = true;

      return script;
    });

    data.choices = choices as Choice[];
  }

  setChoices(data.choices);
};

export type ChannelHandler = {
  [key in Channel]?: (data: MessageData) => void;
};

const SHOW_IMAGE = async (data: MessageData) => {
  setBlurredByKit();

  const { image, options } = data;
  const imgOptions = url.parse(image.src);

  // eslint-disable-next-line promise/param-names
  const { width, height } = await new Promise((resolveImage, rejectImage) => {
    const proto = imgOptions.protocol?.startsWith('https') ? https : http;
    proto.get(imgOptions, (response: any) => {
      const chunks: any = [];
      response
        .on('data', (chunk: any) => {
          chunks.push(chunk);
        })
        .on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolveImage(sizeOf(buffer));
        });
    });
  });

  const imageWindow = await show(
    data?.script?.command || 'show-image',
    String.raw`<img src="${image?.src}" alt="${image?.alt}" title="${image?.title}" />`,
    { width, height, ...options }
  );
  if (imageWindow && !imageWindow.isDestroyed()) {
    imageWindow.on('close', () => {
      focusPrompt();
    });
  }
};

const toProcess =
  (fn: (processInfo: ProcessInfo, data: MessageData) => void) =>
  (data: MessageData) => {
    const processInfo = processes.getByPid(data?.pid);

    if (processInfo) {
      fn(processInfo, data);
    } else {
      console.warn(`⚠️ Failed channel ${data?.channel} to pid ${data?.pid}`);
    }
  };

const kitMessageMap: ChannelHandler = {
  CONSOLE_LOG: (data) => {
    getLog(data.kitScript).info(data.log);
    setLog(data.log as string);
  },

  CONSOLE_WARN: (data) => {
    getLog(data.kitScript).warn(data.warn);
    setLog(data.warn as string);
  },

  COPY_PATH_AS_PICTURE: (data) => {
    clipboard.writeImage(data.path as any);
  },

  GET_SCRIPTS_STATE: toProcess(({ child }) => {
    child?.send({
      channel: 'SCRIPTS_STATE',
      schedule: getSchedule(),
      tasks: getBackgroundTasks(),
    });
  }),

  GET_SCHEDULE: toProcess(({ child }) => {
    child?.send({ channel: 'SCHEDULE', schedule: getSchedule() });
  }),

  GET_BOUNDS: toProcess(({ child }) => {
    const bounds = getPromptBounds();
    child?.send({ channel: 'BOUNDS', bounds });
  }),

  GET_BACKGROUND: toProcess(({ child }) => {
    child?.send({ channel: 'BACKGROUND', tasks: getBackgroundTasks() });
  }),

  TOGGLE_BACKGROUND: (data) => {
    emitter.emit(KitEvent.ToggleBackground, data);
  },

  TOGGLE_TRAY: () => {
    toggleTray();
  },

  GET_SCREEN_INFO: toProcess(({ child }) => {
    const cursor = screen.getCursorScreenPoint();
    // Get display with cursor
    const activeScreen = screen.getDisplayNearestPoint({
      x: cursor.x,
      y: cursor.y,
    });

    child?.send({ channel: 'SCREEN_INFO', activeScreen });
  }),

  GET_MOUSE: toProcess(({ child }) => {
    const mouseCursor = screen.getCursorScreenPoint();
    child?.send({ channel: 'MOUSE', mouseCursor });
  }),
  GET_SERVER_STATE: toProcess(({ child }) => {
    child?.send({ channel: 'SERVER', ...serverState });
  }),
  HIDE_APP: () => {
    setAppHidden(true);
  },
  NEEDS_RESTART: async () => {
    await makeRestartNecessary();
  },
  QUIT_APP: () => {
    app.exit();
  },
  SET_SCRIPT: toProcess(async ({ type, scriptPath }, data) => {
    // log.info(`🏘 SET_SCRIPT ${type} ${data.pid}`, data.script.filePath);
    if (type === ProcessType.Prompt && scriptPath !== data.filePath) {
      await setScript(data.script as Script);
    }
  }),

  SET_LOGIN: async (data: any) => {
    app.setLoginItemSettings(data);
    const appDb = await getAppDb();
    appDb.openAtLogin = data?.openAtLogin;
    await appDb.write();
  },

  SET_MODE: (data) => {
    if (data.mode === Mode.HOTKEY) {
      emitter.emit(KitEvent.PauseShortcuts);
    }
    setMode(data.mode as Mode);
  },

  SET_HINT: (data) => {
    setHint(data.hint as string);
  },

  SET_BOUNDS: (data) => {
    setBounds(data.bounds);
  },

  SET_IGNORE_BLUR: (data) => {
    setIgnoreBlur(data?.ignore);
  },

  SET_INPUT: (data) => {
    setInput(data.input as string);
  },

  SET_PLACEHOLDER: (data) => {
    setPlaceholder(data.text as string);
  },

  SET_PANEL: (data) => {
    setPanel(data.html as string);
  },

  SET_PREVIEW: (data) => {
    setPreview(data.html as string);
  },

  CONSOLE_CLEAR: () => {
    setLog(Channel.CONSOLE_CLEAR);
  },

  SET_TAB_INDEX: (data) => {
    setTabIndex(data.tabIndex as number);
  },
  SHOW_TEXT: (data) => {
    setBlurredByKit();

    show(
      String.raw`<div class="text-xs font-mono">${data.text}</div>`,
      data.options
    );
  },
  SHOW_NOTIFICATION: (data) => {
    setBlurredByKit();

    showNotification(data.html || 'You forgot html', data.options);
  },
  SET_PROMPT_DATA: async (data) => {
    await setPromptData(data as PromptData);
  },
  SET_PROMPT_PROP: async (data: any) => {
    setPromptProp(data);
  },
  SHOW_IMAGE,
  SHOW: async (data) => {
    setBlurredByKit();
    const showWindow = await show(
      'show',
      data.html || 'You forgot html',
      data.options
    );
    if (showWindow && !showWindow.isDestroyed()) {
      showWindow.on('close', () => {
        focusPrompt();
      });
    }
  },
  UPDATE_APP: () => {
    autoUpdater.once('update-available', (info) => {
      log.info('Update available.', info);
      const notification = new Notification({
        title: `Kit.app update available`,
        body: `Downloading ${info.version} and relaunching...`,
        silent: true,
      });

      notification.show();
    });
    autoUpdater.once('update-not-available', (info) => {
      log.info('Update not available.', info);

      const notification = new Notification({
        title: `Kit.app is on the latest version`,
        body: `${getVersion()}`,
        silent: true,
      });

      notification.show();
    });
    autoUpdater.checkForUpdates();
  },
  SET_CHOICES: (data) => {
    checkScriptChoices(data);
  },

  UPDATE_PROMPT_WARN: (data) => {
    setPlaceholder(data.info as string);
  },
  CLEAR_PROMPT_CACHE: async () => {
    await clearPromptCache();
  },
  SET_EDITOR_CONFIG: (data) => {
    sendToPrompt(Channel.SET_EDITOR_CONFIG, data.options);
  },
  SET_TEXTAREA_CONFIG: (data) => {
    sendToPrompt(Channel.SET_TEXTAREA_CONFIG, data.options);
  },
  SET_THEME: (data) => {
    sendToPrompt(Channel.SET_THEME, data);
  },

  SET_DIV_HTML: (data) => {
    sendToPrompt(Channel.SET_DIV_HTML, data.html);
  },
  SET_FORM_HTML: (data) => {
    sendToPrompt(Channel.SET_FORM_HTML, data);
  },
  SET_FLAGS: (data: any) => {
    sendToPrompt(Channel.SET_FLAGS, data.flags);
  },
};

export const createMessageHandler =
  (type: ProcessType) => (data: MessageData) => {
    if (!data.kitScript) log.info(data);
    log.info(
      `${data.channel} ${type} process ${data.kitScript.replace(
        /.*\//gi,
        ''
      )} id: ${data.pid}`
    );

    if (kitMessageMap[data?.channel as Channel]) {
      const channelFn = kitMessageMap[data.channel as Channel] as (
        data: any
      ) => void;
      channelFn(data);
    } else {
      console.warn(`Channel ${data?.channel} not found on ${type}.`);
    }
  };

export interface ProcessInfo {
  pid: number;
  scriptPath: string;
  child: ChildProcess;
  type: ProcessType;
  values: any[];
  date: Date;
}

interface CreateChildInfo {
  type: ProcessType;
  scriptPath?: string;
  runArgs?: string[];
  resolve?: (data: any) => void;
  reject?: (error: any) => void;
}

const DEFAULT_TIMEOUT = 15000;

const createChild = ({
  type,
  scriptPath = 'kit',
  runArgs = [],
}: CreateChildInfo) => {
  let args: string[] = [];
  if (!scriptPath) {
    args = [];
  } else {
    const resolvePath = resolveToScriptPath(scriptPath);
    args = [resolvePath, ...runArgs];
  }

  const entry = type === ProcessType.Prompt ? KIT_APP_PROMPT : KIT_APP;
  const env = {
    ...process.env,
    NODE_NO_WARNINGS: '1',
    KIT_CONTEXT: 'app',
    KIT_MAIN: scriptPath,
    KENV: kenvPath(),
    KIT: kitPath(),
    KIT_DOTENV_PATH: kitDotEnvPath(),
    KIT_APP_VERSION: getVersion(),
    PROCESS_TYPE: type,
    FORCE_COLOR: '1',
  };
  const child = fork(entry, args, {
    silent: false,
    // stdio: 'inherit',
    execPath,
    env,
  });

  return child;
};

/* eslint-disable import/prefer-default-export */

interface ProcessHandlers {
  onExit?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (data: MessageData) => void;
  resolve?: (values: any[]) => any;
  reject?: (value: any) => any;
}

class Processes extends Array<ProcessInfo> {
  public endPreviousPromptProcess(promptScriptPath: string) {
    const previousPromptProcess = this.find(
      (info) => info.type === ProcessType.Prompt && info.scriptPath
    );

    const same =
      previousPromptProcess?.scriptPath === promptScriptPath &&
      previousPromptProcess.values.length === 0;

    if (previousPromptProcess) {
      this.removeByPid(previousPromptProcess.pid, same);
    }

    return same;
  }

  public getAllProcessInfo() {
    return this.map(({ scriptPath, type, pid }) => ({
      type,
      scriptPath,
      pid,
    }));
  }

  public add(
    type: ProcessType,
    scriptPath = '',
    args: string[] = [],
    { resolve, reject }: ProcessHandlers = {}
  ): ProcessInfo {
    const child = createChild({
      type,
      scriptPath,
      runArgs: args,
    });

    const info = {
      pid: child.pid,
      child,
      type,
      scriptPath,
      values: [],
      date: new Date(),
    };

    this.push(info);

    if (scriptPath) {
      log.info(`🟢 start ${type} ${scriptPath} id: ${child.pid}`);
    } else {
      log.info(`🟢 start idle ${type} id: ${child.pid}`);
    }

    const id =
      ![ProcessType.Background, ProcessType.Prompt].includes(type) &&
      setTimeout(() => {
        log.info(
          `> ${type} process: ${scriptPath} took > ${DEFAULT_TIMEOUT} seconds. Ending...`
        );
        child?.kill();
      }, DEFAULT_TIMEOUT);

    child?.on('message', createMessageHandler(type));

    const { pid } = child;

    child.on('exit', () => {
      sendToPrompt(Channel.EXIT, false);
      if (id) clearTimeout(id);
      if (type === ProcessType.Prompt) {
        setAppHidden(false);
        emitter.emit(KitEvent.ExitPrompt);
        emitter.emit(KitEvent.ResumeShortcuts);
      }

      const { values } = processes.getByPid(pid) as ProcessInfo;
      if (resolve) {
        resolve(values);
      }
      log.info(`🟡 end ${type} process: ${scriptPath} id: ${child.pid}`);
      processes.removeByPid(pid);
    });

    child.on('error', (error) => {
      if (reject) reject(error);
    });

    return info;
  }

  public async findPromptProcess(): Promise<ProcessInfo> {
    const promptProcess = this.find(
      (processInfo) => processInfo.type === ProcessType.Prompt
    );
    if (promptProcess) return promptProcess;

    log.warn(`☠️ Can't find Prompt Process. Starting another`);
    const newProcess = processes.add(ProcessType.Prompt);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(newProcess);
      }, 1000);
    });
  }

  public resetIdlePromptProcess() {
    const idleProcess = this.find(
      (processInfo) =>
        processInfo.type === ProcessType.Prompt && processInfo.scriptPath === ''
    );

    if (idleProcess?.pid) {
      log.info(`Found idle ${idleProcess.pid}. Removing`);
      this.removeByPid(idleProcess.pid);
    }
  }

  public getByPid(pid: number) {
    return this.find((processInfo) => processInfo.pid === pid);
  }

  public removeByPid(pid: number, same = false) {
    const processInfo = this.find((info) => info.pid === pid);

    if (processInfo) {
      const { child, type, scriptPath } = processInfo;
      if (child) {
        child?.removeAllListeners();
        if (!child?.killed) {
          child?.kill();
          log.info(`🛑 kill ${type} ${scriptPath || 'idle'} id: ${child.pid}`);
          if (getPromptPid() === child.pid && same) {
            hidePromptWindow();
          }
        }
      }
      this.splice(
        this.findIndex((info) => info.pid === pid),
        1
      );
    }
  }

  public assignScriptToProcess(
    scriptPath: ProcessInfo['scriptPath'],
    pid: number
  ) {
    const index = this.findIndex((processInfo) => processInfo.pid === pid);
    if (index !== -1) {
      this[index] = { ...this[index], scriptPath };
    } else {
      log.warn(`⚠️ pid ${pid} not found. Can't run`, scriptPath);
    }
  }
}

export const processes = new Processes();
