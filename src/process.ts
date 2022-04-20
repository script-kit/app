/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import log from 'electron-log';
import {
  app,
  clipboard,
  screen,
  Notification,
  nativeImage,
  BrowserWindow,
  ipcMain,
  IpcMainEvent,
} from 'electron';
import os from 'os';
import { setTimeout } from 'timers';

import { subscribe } from 'valtio';
import http from 'http';
import path from 'path';
import https from 'https';
import url from 'url';
import sizeOf from 'image-size';
import { writeFile } from 'fs/promises';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ChildProcess, fork } from 'child_process';
import {
  Channel,
  Mode,
  ProcessType,
  Value,
  UI,
} from '@johnlindquist/kit/cjs/enum';
import { Choice, Script, ProcessInfo } from '@johnlindquist/kit/types/core';

import {
  ChannelMap,
  GenericSendData,
  SendData,
} from '@johnlindquist/kit/types/kitapp';

import {
  resolveToScriptPath,
  KIT_APP,
  KIT_APP_PROMPT,
  KIT_FIRST_PATH,
  execPath,
  kitPath,
  kenvPath,
  kitDotEnvPath,
} from '@johnlindquist/kit/cjs/utils';

import { getLog, warn } from './logs';
import {
  clearPromptCache,
  focusPrompt,
  getPromptBounds,
  hideAppIfNoWindows,
  sendToPrompt,
  setBounds,
  setChoices,
  setFooter,
  setHint,
  setInput,
  setLog,
  setMode,
  setPanel,
  setPlaceholder,
  setPreview,
  setPromptData,
  setPromptPid,
  setPromptProp,
  setScript,
  setTabIndex,
} from './prompt';
import {
  makeRestartNecessary,
  getBackgroundTasks,
  getSchedule,
  kitState,
} from './state';

import { emitter, KitEvent } from './events';
import { show, showDevTools, showWidget } from './show';

import { getVersion } from './version';
import { getClipboardHistory } from './tick';
import { getTray, getTrayIcon, setTrayMenu } from './tray';
import { start } from './pty';

export const formatScriptChoices = (data: Choice[]) => {
  const dataChoices: Script[] = (data || []) as Script[];
  const choices = dataChoices.map((script) => {
    if (!script.description && script.name !== script.command) {
      script.description = script.command;
    }
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
      // log.info(`📅 ${script.name} scheduled for ${script.schedule}`);
      const scheduleScript = getSchedule().find(
        (s) => s.filePath === script.filePath
      );

      if (scheduleScript) {
        const date = new Date(scheduleScript.date);
        const next = `${formatDistanceToNowStrict(date)}`;
        const cal = `${format(date, 'MMM eo, h:mm:a ')}`;

        script.description = `Next: ${next} - ${cal} - ${script.schedule}`;
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
        : kenvPath(script.kenv && `kenvs/${script.kenv}`, 'assets', script.img);
    }

    return script;
  });

  return choices;
};

export type ChannelHandler = {
  [key in keyof ChannelMap]: (data: SendData<key>) => void;
};

const SHOW_IMAGE = async (data: SendData<Channel.SHOW_IMAGE>) => {
  kitState.blurredByKit = true;

  const { image, options } = data.value;
  const imgOptions = url.parse((image as { src: string }).src);

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

type WidgetData = {
  widgetId: string;
  value?: any;
  width?: number;
  height?: number;
};
type WidgetHandler = (event: IpcMainEvent, data: WidgetData) => void;

const widgetMap: {
  [widgetId: string]: {
    widget: BrowserWindow;
    child: ChildProcess;
    moved: boolean;
    ignoreMouse: boolean;
    ignoreMeasure: boolean;
  };
} = {};

const toProcess = <K extends keyof ChannelMap>(
  fn: (processInfo: ProcessInfo, data: SendData<K>) => void
) => (data: SendData<K>) => {
  const processInfo = processes.getByPid(data?.pid);

  // Send data to Widget process if ids match
  if (data.channel.includes('WIDGET')) {
    if (processInfo) {
      fn(processInfo, data);
    } else {
      warn(`${data?.pid}: Can't find processInfo associated with widget`);
    }
  }
  // Send data to Prompt process only if id matches current prompt
  else if (processInfo && processInfo?.pid === kitState.promptProcess?.pid) {
    fn(processInfo, data);
  } else if (processInfo?.type === ProcessType.PROMPT) {
    warn(
      `${data?.pid}: ⚠️ ${data.channel} failed. ${data.pid} doesn't match ${kitState.promptProcess?.pid}`
    );
  }
};

const kitMessageMap: ChannelHandler = {
  [Channel.CONSOLE_LOG]: (data) => {
    getLog(data.kitScript).info(data?.value || Value.Undefined);
    setLog(data.value || Value.Undefined);
  },

  CONSOLE_WARN: (data) => {
    getLog(data.kitScript).warn(data.value);
    setLog(data.value);
  },

  COPY_PATH_AS_PICTURE: (data) => {
    clipboard.writeImage(data.value as any);
  },

  GET_SCRIPTS_STATE: toProcess(({ child }, { channel }) => {
    child?.send({
      channel,
      schedule: getSchedule(),
      tasks: getBackgroundTasks(),
    });
  }),

  GET_SCHEDULE: toProcess(({ child }, { channel }) => {
    child?.send({ channel, schedule: getSchedule() });
  }),

  GET_BOUNDS: toProcess(({ child }, { channel }) => {
    const bounds = getPromptBounds();
    child?.send({ channel, bounds });
  }),

  GET_BACKGROUND: toProcess(({ child }, { channel }) => {
    child?.send({ channel, tasks: getBackgroundTasks() });
  }),

  GET_CLIPBOARD_HISTORY: toProcess(({ child }, { channel }) => {
    child?.send({
      channel,
      history: getClipboardHistory(),
    });
  }),

  WIDGET_UPDATE: toProcess(({ child }, { channel, value }) => {
    const { widgetId } = value as any;
    const widget = BrowserWindow.fromId(widgetId);

    if (widget) {
      widget?.webContents.send(channel, value);
    } else {
      warn(`${widgetId}: widget not found. Killing process.`);
      child?.kill();
    }
  }),

  WIDGET_SET_STATE: toProcess(({ child }, { channel, value }) => {
    const { widgetId, state } = value as any;
    // log.info({ widgetId }, `${channel}`);
    if (!widgetMap[widgetId]) return;

    const { widget } = widgetMap[widgetId];

    // log.info(`WIDGET_SET_STATE`, value);
    if (widget) {
      widget?.webContents.send(channel, state);
    } else {
      warn(`${widgetId}: widget not found. Terminating process.`);
      child?.kill();
    }
  }),
  WIDGET_FIT: toProcess(({ child }, { channel, value }) => {
    const { widgetId, state } = value as any;
    // log.info({ widgetId }, `${channel}`);
    if (!widgetMap[widgetId]) return;
    const { widget } = widgetMap[widgetId];
    // log.info(`WIDGET_SET_STATE`, value);
    if (widget) {
      widget?.webContents.send(channel, state);
    } else {
      warn(`${widgetId}: widget not found. Terminating process.`);
      child?.kill();
    }
  }),

  WIDGET_SET_SIZE: toProcess(({ child }, { value }) => {
    const { widgetId, width, height } = value as any;
    // log.info({ widgetId }, `${channel}`);
    const { widget } = widgetMap[widgetId];

    // log.info(`WIDGET_SET_STATE`, value);
    if (widget) {
      widget?.setSize(width, height);
    } else {
      warn(`${widgetId}: widget not found. Terminating process.`);
      child?.kill();
    }
  }),

  WIDGET_SET_POSITION: toProcess(({ child }, { value }) => {
    const { widgetId, x, y } = value as any;
    // log.info({ widgetId }, `${channel}`);
    const { widget } = widgetMap[widgetId];

    // log.info(`WIDGET_SET_STATE`, value);
    if (widget) {
      widget?.setPosition(x, y);
    } else {
      warn(`${widgetId}: widget not found. Terminating process.`);
      child?.kill();
    }
  }),

  WIDGET_GET: toProcess(
    async (
      { child },
      {
        channel,
        value,
      }: { channel: Channel; value: { filePath: string; options: any } }
    ) => {
      kitState.blurredByKit = true;
      const widgetId = Date.now().toString();
      const widget = await showWidget(widgetId, value.filePath, value.options);
      log.info(`${child?.pid}: ⚙️ Creating widget ${widgetId}`);

      // widget.on('move', () => {
      //   log.info(`${widget?.id}: 📦 widget moved`);
      // });

      // const ignoreMouseHandler = (event, data: boolean) => {
      //   if (data) {
      //     widget.setIgnoreMouseEvents(true, { forward: true });
      //   } else {
      //     widget.setIgnoreMouseEvents(false);
      //   }
      // };

      // const resizeHandler = (
      //   event,
      //   size: { width: number; height: number }
      // ) => {
      //   log.info({ size });
      //   if (size) {
      //     widget.setSize(size.width, size.height);
      //   }
      // };

      widgetMap[widgetId] = {
        widget,
        child,
        moved: false,
        ignoreMouse: value?.options?.ignoreMouse || false,
        ignoreMeasure: Boolean(
          value?.options?.width || value?.options?.height || false
        ),
      };

      widget.on('resized', () => {
        child.send({
          channel: Channel.WIDGET_RESIZED,
          widgetId,
          ...widget.getBounds(),
        });
      });

      widget.on('moved', () => {
        child.send({
          channel: Channel.WIDGET_MOVED,
          widgetId,
          ...widget.getBounds(),
        });
      });

      const closeHandler = () => {
        if (widget?.isDestroyed()) return;
        if (typeof widgetMap?.[widgetId] === 'undefined') return;

        log.info(`${widgetId}: Widget closed`);
        focusPrompt();
        child?.send({
          channel: Channel.WIDGET_END,
          widgetId,
          ...widget.getBounds(),
        });

        delete widgetMap?.[widgetId];
        widget.removeAllListeners();
        widget.destroy();
      };

      widget?.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape') {
          closeHandler();
        }

        if (input.key === 'l' && (input.control || input.meta)) {
          if (widgetMap[widgetId]?.ignoreMouse) {
            log.info(`${widgetId}: 🔓 Unlock widget`);
            widget.setIgnoreMouseEvents(false);
            widgetMap[widgetId].ignoreMouse = false;
          } else {
            log.info(`${widgetId}: 🔒 Lock widget`);
            widget.setIgnoreMouseEvents(true, { forward: true });
            widgetMap[widgetId].ignoreMouse = true;
          }
        }
      });

      widget?.on('close', closeHandler);
      child?.on('close', closeHandler);
      const un = subscribe(kitState.ps, () => {
        if (!kitState.ps.find((p) => p.pid === child?.pid)) {
          closeHandler();
          un();
        }
      });

      widget?.on('will-move', () => {
        console.log(`${widgetId}: 📦 widget will move`);
        widgetMap[widgetId].moved = true;
      });

      child?.send({
        channel,
        widgetId,
      });
    }
  ),

  WIDGET_CAPTURE_PAGE: toProcess(async ({ child }, { channel, value }) => {
    const { widgetId } = value as any;
    const widget = BrowserWindow.fromId(widgetId);
    const image = await widget?.capturePage();

    if (image) {
      const imagePath = kenvPath('tmp', `${widgetId}-capture.png`);
      log.info(`Captured page for widget ${widgetId} to ${imagePath}`);
      await writeFile(imagePath, image.toPNG());

      child?.send({
        channel,
        imagePath,
      });
    } else {
      const imagePath = `⚠️ Failed to capture page for widget ${widgetId}`;
      child?.send({
        channel,
        imagePath,
      });
      warn(imagePath);
    }
  }),

  CLEAR_CLIPBOARD_HISTORY: () => {
    emitter.emit(Channel.CLEAR_CLIPBOARD_HISTORY);
  },

  REMOVE_CLIPBOARD_HISTORY_ITEM: (data: any) => {
    emitter.emit(Channel.REMOVE_CLIPBOARD_HISTORY_ITEM, data.value);
  },

  TOGGLE_BACKGROUND: (data: any) => {
    emitter.emit(KitEvent.ToggleBackground, data);
  },

  GET_SCREEN_INFO: toProcess(({ child }, { channel }) => {
    const cursor = screen.getCursorScreenPoint();
    // Get display with cursor
    const activeScreen = screen.getDisplayNearestPoint({
      x: cursor.x,
      y: cursor.y,
    });

    child?.send({ channel, activeScreen });
  }),

  GET_MOUSE: toProcess(({ child }, { channel }) => {
    const mouseCursor = screen.getCursorScreenPoint();
    child?.send({ channel, mouseCursor });
  }),

  GET_PROCESSES: toProcess(({ child }, { channel }) => {
    child?.send({ channel, processes });
  }),

  HIDE_APP: toProcess(({ type, scriptPath }) => {
    if (type === ProcessType.Prompt) {
      kitState.hidden = true;
      hideAppIfNoWindows(scriptPath);
    }
  }),
  NEEDS_RESTART: async () => {
    await makeRestartNecessary();
  },
  QUIT_APP: () => {
    app.exit();
  },
  SET_SCRIPT: toProcess(async (processInfo, data) => {
    if (processInfo.type === ProcessType.Prompt) {
      processInfo.scriptPath = data.value?.filePath;
      const foundP = kitState.ps.find((p) => p.pid === processInfo.pid);
      if (foundP) {
        foundP.scriptPath = data.value?.filePath;
      }
      kitState.promptCount = -1;
      await setScript(data.value);
    }
  }),
  SET_SUBMIT_VALUE: toProcess(async (_, data) => {
    sendToPrompt(Channel.SET_SUBMIT_VALUE, data.value);
  }),

  SET_MODE: (data) => {
    if (data.value === Mode.HOTKEY) {
      emitter.emit(KitEvent.PauseShortcuts);
    }
    setMode(data.value);
  },

  SET_HINT: (data) => {
    setHint(data.value);
  },

  SET_BOUNDS: (data) => {
    setBounds(data.value);
  },

  SET_IGNORE_BLUR: (data) => {
    log.info(`SET_IGNORE_BLUR`, { data });
    kitState.ignoreBlur = data.value;
  },

  SET_INPUT: (data) => {
    setInput(data.value);
  },

  SET_PLACEHOLDER: (data) => {
    setPlaceholder(data.value);
  },

  SET_FOOTER: (data) => {
    setFooter(data.value);
  },

  SET_PANEL: (data) => {
    setPanel(data.value);
  },

  SET_PREVIEW: (data) => {
    setPreview(data.value);
  },

  CONSOLE_CLEAR: () => {
    setLog(Channel.CONSOLE_CLEAR);
  },

  SET_TAB_INDEX: (data) => {
    setTabIndex(data.value);
  },
  DEV_TOOLS: (data) => {
    showDevTools(data.value);
  },
  // SHOW_TEXT: (data) => {
  //   setBlurredByKit();

  //   show(
  //     String.raw`<div class="text-xs font-mono">${data.value}</div>`,
  //     data.options
  //   );
  // },
  // SHOW_NOTIFICATION: (data) => {
  //   setBlurredByKit();

  //   showNotification(data.html || 'You forgot html', data.options);
  // },
  SET_PROMPT_DATA: async (data) => {
    setPromptPid(data.pid);
    setPromptData(data.value);
    kitState.isScripts = Boolean(data.value?.scripts);
    kitState.promptCount += 1;

    if (data?.value?.ui === UI.term) {
      const { socketURL } = await start(data);

      sendToPrompt(Channel.TERMINAL, socketURL);
    }
  },
  SET_PROMPT_PROP: async (data) => {
    setPromptProp(data.value);
  },
  SHOW_IMAGE,
  SHOW: async (data) => {
    kitState.blurredByKit = true;

    const showWindow = await show(
      'show',
      data.value.html || 'You forgot html',
      data.value.options
    );
    if (showWindow && !showWindow.isDestroyed()) {
      showWindow.on('close', () => {
        focusPrompt();
      });
    }
  },
  UPDATE_APP: () => {
    emitter.emit(KitEvent.CheckForUpdates, true);
  },
  SET_CHOICES: (data) => {
    if (kitState.isScripts) {
      setChoices(formatScriptChoices(data.value));
    } else {
      setChoices(data.value);
    }
  },

  // UPDATE_PROMPT_WARN: (data) => {
  //   setPlaceholder(data.info as string);
  // },
  CLEAR_PROMPT_CACHE: async () => {
    await clearPromptCache();
  },
  CLEAR_PREVIEW: () => {
    sendToPrompt(Channel.CLEAR_PREVIEW, ``);
  },
  SET_EDITOR_CONFIG: (data) => {
    sendToPrompt(Channel.SET_EDITOR_CONFIG, data.value);
  },
  SET_TEXTAREA_CONFIG: (data) => {
    sendToPrompt(Channel.SET_TEXTAREA_CONFIG, data.value);
  },
  SET_THEME: (data) => {
    sendToPrompt(Channel.SET_THEME, data.value);
  },

  SET_DIV_HTML: (data) => {
    sendToPrompt(Channel.SET_DIV_HTML, data.value);
  },
  SET_FORM_HTML: (data) => {
    sendToPrompt(Channel.SET_FORM_HTML, data.value);
  },
  SET_FLAGS: (data) => {
    sendToPrompt(Channel.SET_FLAGS, data.value);
  },
  SET_NAME: (data) => {
    sendToPrompt(Channel.SET_NAME, data.value);
  },
  SET_DESCRIPTION: (data) => {
    sendToPrompt(Channel.SET_DESCRIPTION, data.value);
  },
  SET_FOCUSED: (data) => {
    sendToPrompt(Channel.SET_FOCUSED, data.value);
  },
  SET_TEXTAREA_VALUE: (data) => {
    sendToPrompt(Channel.SET_TEXTAREA_VALUE, data.value);
  },
  SET_LOADING: (data) => {
    sendToPrompt(Channel.SET_LOADING, data.value);
  },
  SEND_KEYSTROKE: (data) => {
    sendToPrompt(Channel.SEND_KEYSTROKE, data.value);
  },
  KIT_LOG: (data) => {
    getLog(data.kitScript).info(data?.value || Value.Undefined);
  },
  KIT_WARN: (data) => {
    getLog(data.kitScript).warn(data?.value || Value.Undefined);
  },
  KIT_CLEAR: (data) => {
    getLog(data.kitScript).clear(data?.value || Value.Undefined);
  },
  SET_OPEN: (data) => {
    sendToPrompt(Channel.SET_OPEN, data.value);
  },
  SET_SPLASH_BODY: (data) => {
    sendToPrompt(Channel.SET_SPLASH_BODY, data.value);
  },
  SET_SPLASH_HEADER: (data) => {
    sendToPrompt(Channel.SET_SPLASH_HEADER, data.value);
  },
  SET_SPLASH_PROGRESS: (data) => {
    sendToPrompt(Channel.SET_SPLASH_PROGRESS, data.value);
  },
  VALUE_INVALID: (data) => {
    sendToPrompt(Channel.VALUE_INVALID, data.value);
  },
  SET_SCRIPT_HISTORY: (data) => {
    sendToPrompt(Channel.SET_SCRIPT_HISTORY, data.value);
  },
  SET_FILTER_INPUT: (data) => {
    sendToPrompt(Channel.SET_FILTER_INPUT, data.value);
  },
  START: (data) => {
    sendToPrompt(Channel.START, data.value);
  },
  NOTIFY: (data) => {
    const notification = new Notification(data.value);
    notification.show();
  },
  SET_TRAY: (data) => {
    log.info(JSON.stringify(data));
    const { label, scripts } = data?.value;
    if (label) {
      const image = nativeImage.createFromDataURL(``);
      getTray()?.setImage(image);
      getTray()?.setTitle(label);
    } else {
      getTray()?.setImage(getTrayIcon());
      getTray()?.setTitle('');
    }

    if (scripts?.length) {
      setTrayMenu(scripts);
    } else {
      setTrayMenu([]);
    }
  },
  GET_EDITOR_HISTORY: toProcess(() => {
    sendToPrompt(Channel.GET_EDITOR_HISTORY);
  }),
  TERMINATE_PROCESS: (data) => {
    warn(`${data?.value}: Terminating process ${data.value}`);
    processes.removeByPid(data?.value);
  },
  TERMINAL: (data) => {
    sendToPrompt(Channel.TERMINAL, data.value);
  },
  KEYBOARD_TYPE: async (data) => {},
};

export const createMessageHandler = (type: ProcessType) => async (
  data: GenericSendData
) => {
  // if (data.pid !== processes.promptProcess?.pid) {
  //   warn(data?.pid, data?.channel, data?.value);
  //   const processInfo = processes.getByPid(data?.pid);
  //   if (processInfo?.type === ProcessType.Prompt) {
  //     const title = 'Script Message Failed';
  //     const message = `${path.basename(
  //       data?.kitScript
  //     )} doesn't match ${path.basename(
  //       processes.promptProcess?.scriptPath || ''
  //     )}.\nUse //Background metadata for long-running processes.\nExiting...`;
  //     warn(
  //       `${data?.pid} doesn't match ${processes.promptProcess?.pid}`,
  //       message
  //     );

  //     processes.removeByPid(data.pid);
  //     runScript(
  //       kitPath('cli', 'notify.js'),
  //       '--title',
  //       title,
  //       '--message',
  //       message
  //     );

  //     return;
  //   }
  // }
  if (!data.kitScript) log.info(data);
  // if (
  //   ![Channel.SET_PREVIEW, Channel.SET_LOADING, Channel.KIT_LOG].includes(
  //     data.channel
  //   )
  // ) {
  //   log.info(
  //     `${data.channel === Channel.SET_SCRIPT ? `\n\n` : ``}${data.pid}: ${
  //       data.channel
  //     } ${type} process ${data.kitScript?.replace(/.*\//gi, '')}`
  //   );
  // }

  if (kitMessageMap[data.channel]) {
    type C = keyof ChannelMap;
    const channelFn = kitMessageMap[data.channel as C] as (
      data: SendData<C>
    ) => void;
    channelFn(data);
  } else {
    warn(`Channel ${data?.channel} not found on ${type}.`);
  }
};

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
    PATH: KIT_FIRST_PATH + path.delimiter + process?.env?.PATH,
    KIT_APP_PATH: app.getAppPath(),
  };
  // console.log({ env });
  const isWin = os.platform().startsWith('win');
  const child = fork(entry, args, {
    silent: false,
    // stdio: 'inherit',
    ...(isWin ? {} : { execPath }),
    cwd: os.homedir(),
    env,
  });

  return child;
};

interface ProcessHandlers {
  onExit?: () => void;
  onError?: (error: Error) => void;
  resolve?: (values: any[]) => any;
  reject?: (value: any) => any;
}

class Processes extends Array<ProcessInfo> {
  public endCurrentPromptProcess() {
    if (kitState.promptProcess?.pid)
      this.removeByPid(kitState.promptProcess?.pid);
  }

  public abandonnedProcesses: ProcessInfo[] = [];

  constructor(...args: ProcessInfo[]) {
    super(...args);

    setInterval(() => {
      if (this.abandonnedProcesses.length) {
        log.info(
          `Still running:`,
          this.abandonnedProcesses
            .filter(({ child }) => !child?.killed)
            .map(({ pid, scriptPath }) => `${pid} ${scriptPath}`)
        );
      }
    }, 2000);
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
    kitState.addP(info);

    if (scriptPath) {
      log.info(`${child.pid}: 🟢 start ${type} ${scriptPath}`);
    } else {
      log.info(`${child.pid}: 🟢 start idle ${type}`);
    }

    const id =
      ![ProcessType.Background, ProcessType.Prompt].includes(type) &&
      setTimeout(() => {
        log.info(
          `${child.pid}: ${type} process: ${scriptPath} took > ${DEFAULT_TIMEOUT} seconds. Ending...`
        );
        child?.kill();
      }, DEFAULT_TIMEOUT);

    child?.on('message', createMessageHandler(type));

    const { pid } = child;

    child.on('close', () => {
      // log.info(`CLOSE`);
    });

    child.on('disconnect', () => {
      // log.info(`DISCONNECT`);
    });

    child.on('exit', (code) => {
      // log.info(`EXIT`, { pid, code });
      if (id) clearTimeout(id);

      if (child?.pid === kitState.promptProcess?.pid) {
        sendToPrompt(Channel.EXIT, pid);
      }

      const processInfo = processes.getByPid(pid) as ProcessInfo;

      if (!processInfo) return;

      if (resolve) {
        resolve(processInfo?.values);
      }
      log.info(
        `${child.pid}: 🟡 exit ${code}. ${processInfo.type} process: ${processInfo?.scriptPath}`
      );
      processes.removeByPid(pid);
    });

    child.on('error', (error) => {
      if (reject) reject(error);
    });

    return info;
  }

  public async findIdlePromptProcess(): Promise<ProcessInfo> {
    const promptProcess = this.find(
      (processInfo) =>
        processInfo.type === ProcessType.Prompt &&
        processInfo?.scriptPath === ''
    );

    if (promptProcess) {
      log.info(`Found:`, promptProcess.scriptPath);
      return promptProcess;
    }

    warn(`🤔 Can't find idle Prompt Process. Starting another`);
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
      log.info(`${idleProcess.pid}: Removing idle process`);
      this.removeByPid(idleProcess.pid);
    }
  }

  public getByPid(pid: number) {
    return [...this, ...this.abandonnedProcesses].find(
      (processInfo) => processInfo.pid === pid
    );
  }

  public removeByPid(pid: number) {
    const index = this.findIndex((info) => info.pid === pid);
    if (index === -1) return;
    if (!this[index].child?.killed) {
      this[index]?.child?.removeAllListeners();
      this[index]?.child?.kill();
      log.info(`${pid}: 🛑 removed`);
      if (kitState.promptProcess?.pid === pid) {
        hideAppIfNoWindows(kitState.promptProcess.scriptPath);
      }
    }
    this.splice(index, 1);

    kitState.removeP(pid);
  }

  public killAbandonnedProcess(pid: number) {
    const processInfo = this.abandonnedProcesses.find(
      (info) => info.pid === pid
    );
    if (!processInfo) {
      log.info(`${pid}: Can't find abandonned process`);
      return;
    }

    const { child, type, scriptPath } = processInfo;
    if (child) {
      child?.removeAllListeners();

      if (!child?.killed) {
        child?.kill();
        log.info(`${child.pid}: 🛑 kill ${type} ${scriptPath || 'idle'}`);
        const aIndex = this.abandonnedProcesses.findIndex(
          (info) => info.pid === pid
        );
        this.abandonnedProcesses.splice(aIndex, 1);
        kitState.removeP(child?.pid);
      }
    }
  }

  public abandonByPid(pid: number) {
    const processInfo = this.find((info) => info.pid === pid);

    this.removeByPid(pid);
    kitState.removeP(pid);

    if (processInfo) {
      log.info(`${processInfo.pid}: 👋 Abandonning ${processInfo.scriptPath}`);

      setTimeout(() => {
        this.killAbandonnedProcess(pid);
      }, 5000);

      this.abandonnedProcesses.push(processInfo);
      kitState.addP(processInfo);
    }
  }
}

export const processes = new Processes();

export const handleWidgetEvents = () => {
  const clickHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;
    const { widget, child, moved } = widgetMap[widgetId];
    if (!child) return;

    if (moved) {
      widgetMap[widgetId].moved = false;
      return;
    }

    child?.send({
      ...data,
      ...widget.getBounds(),
      pid: child.pid,
      channel: Channel.WIDGET_CLICK,
    });
  };

  const inputHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;
    const { child, widget } = widgetMap[widgetId];
    if (!child) return;

    child?.send({
      ...data,
      ...widget.getBounds(),
      widgetId,
      pid: child?.pid,
      channel: Channel.WIDGET_INPUT,
    });
  };

  const measureHandler: WidgetHandler = (event, data: any) => {
    const { widgetId } = data;
    log.info(`📏 ${widgetId} Widget: Fitting to inner child`);
    const { widget, child, ignoreMeasure } = widgetMap[widgetId];
    if (!child || ignoreMeasure) return;

    widget.setSize(data.width, data.height, true);
  };

  ipcMain.on(Channel.WIDGET_CLICK, clickHandler);
  ipcMain.on(Channel.WIDGET_INPUT, inputHandler);
  ipcMain.on('WIDGET_MEASURE', measureHandler);
};
