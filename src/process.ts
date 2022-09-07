/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import log from 'electron-log';
import untildify from 'untildify';
import { keyboard, mouse, Key } from '@nut-tree/nut-js';
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
import { remove } from 'lodash';

import { subscribe } from 'valtio';
import http from 'http';
import path from 'path';
import https from 'https';
import url from 'url';
import sizeOf from 'image-size';
import { writeFile } from 'fs/promises';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { fork } from 'child_process';
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
  mainScriptPath,
} from '@johnlindquist/kit/cjs/utils';

import { getLog, warn } from './logs';
import {
  alwaysOnTop,
  clearPromptCache,
  focusPrompt,
  forceFocus,
  getPromptBounds,
  hideAppIfNoWindows,
  isVisible,
  onHideOnce,
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
  kitConfig,
  widgetState,
  findWidget,
} from './state';

import { emitter, KitEvent } from './events';
import { show, showDevTools, showWidget } from './show';

import { getVersion } from './version';
import {
  clearClipboardHistory,
  getClipboardHistory,
  removeFromClipboardHistory,
} from './tick';
import { getTray, getTrayIcon, setTrayMenu } from './tray';
import { startPty } from './pty';
import { createWidget } from './widget';

// const trash = async (...args: string[]) => {
//   const parent = app.isPackaged
//     ? path.resolve(process.resourcesPath, 'app.asar.unpacked')
//     : path.resolve(__dirname, '..', 'src');

//   const bin = path.resolve(parent, 'node_modules', '.bin', 'trash');

//   log.info(`Trash: ${bin} ${args.join(' ')}`);

//   const pExec = promisify(exec);

//   return pExec(`${bin} ${args.join(' ')}`);
// };

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
  const { width, height } = await new Promise((resolveImage) => {
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

const toProcess = <K extends keyof ChannelMap>(
  fn: (processInfo: ProcessInfo, data: SendData<K>) => void
) => (data: SendData<K>) => {
  const processInfo = processes.getByPid(data?.pid);
  const isWidgetMessage = data.channel.includes('WIDGET');

  if (!processInfo) {
    return warn(
      `${data?.pid}: Can't find process associated with ${
        isWidgetMessage ? `widget` : `script`
      }`
    );
  }

  if (
    data.channel !== Channel.HIDE_APP &&
    !isWidgetMessage &&
    processInfo?.type === ProcessType.Prompt &&
    processInfo?.pid !== kitState.promptProcess?.pid
  ) {
    return warn(
      `${data?.pid}: ⚠️ ${data.channel} failed. ${data.pid} doesn't match ${kitState.promptProcess?.pid}`
    );
  }

  return fn(processInfo, data);
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

    const widget = findWidget(widgetId);
    if (!widget) return;

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

    const widget = findWidget(widgetId);
    if (!widget) return;

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
    const widget = findWidget(widgetId);
    if (!widget) return;

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
    const widget = findWidget(widgetId);
    if (!widget) return;

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
      }: {
        channel: Channel;
        value: { command: string; html: string; options: any };
      }
    ) => {
      const { command, html, options } = value;
      const filePath = await createWidget(command, html, options);
      kitState.blurredByKit = true;
      const widgetId = Date.now().toString();
      const widget = await showWidget(widgetId, filePath, options);
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

      widgetState.widgets.push({
        id: widgetId,
        widget,
        child,
        moved: false,
        ignoreMouse: value?.options?.ignoreMouse || false,
        ignoreMeasure: Boolean(
          value?.options?.width || value?.options?.height || false
        ),
      });

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
        if (!findWidget(widgetId)) return;

        const w = findWidget(widgetId);
        if (!w) return;
        if (w?.isDestroyed()) return;

        log.info(`${widgetId}: Widget closed`);
        focusPrompt();
        if (child?.channel) {
          child?.send({
            channel: Channel.WIDGET_END,
            widgetId,
            ...w.getBounds(),
          });
        }

        w.removeAllListeners();
        w.destroy();

        remove(widgetState.widgets, ({ id }) => id === widgetId);
      };

      widget?.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape') {
          closeHandler();
        }

        if (input.key === 'l' && (input.control || input.meta)) {
          const o = widgetState.widgets.find(({ id }) => id === widgetId);
          if (!o) return;
          if (o?.ignoreMouse) {
            log.info(`${widgetId}: 🔓 Unlock widget`);
            widget.setIgnoreMouseEvents(false);
            o.ignoreMouse = false;
          } else {
            log.info(`${widgetId}: 🔒 Lock widget`);
            widget.setIgnoreMouseEvents(true, { forward: true });
            o.ignoreMouse = true;
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
        log.verbose(`${widgetId}: 📦 widget will move`);
        const o = widgetState.widgets.find(({ id }) => id === widgetId);
        if (!o) return;
        o.moved = true;
      });

      child?.send({
        channel,
        widgetId,
      });
    }
  ),

  WIDGET_END: toProcess((_, { value }) => {
    const { widgetId } = value as any;
    const widget = findWidget(widgetId);

    if (!widget) return;

    log.info(`${widgetId}: Widget closed`);
    focusPrompt();

    widget.removeAllListeners();
    widget.destroy();

    remove(widgetState.widgets, ({ id }) => id === widgetId);
  }),

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

  CLEAR_CLIPBOARD_HISTORY: toProcess(({ child }, { channel, value }) => {
    log.verbose(channel);

    clearClipboardHistory();

    child?.send({ channel });
  }),

  REMOVE_CLIPBOARD_HISTORY_ITEM: toProcess(({ child }, { channel, value }) => {
    log.verbose(channel, value);

    removeFromClipboardHistory(value);

    child?.send({ channel });
  }),

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
  GET_SCREENS_INFO: toProcess(({ child }, { channel }) => {
    const displays = screen.getAllDisplays();

    child?.send({ channel, displays });
  }),
  GET_ACTIVE_APP: toProcess(async ({ child }, { channel }) => {
    if (kitState.isMac) {
      const { default: frontmost } = await import('frontmost-app' as any);
      const frontmostApp = await frontmost();
      child?.send({ channel, app: frontmostApp });
    } else {
      // TODO: implement for windows
      child?.send({ channel, app: {} });
    }
  }),

  GET_MOUSE: toProcess(({ child }, { channel }) => {
    const mouseCursor = screen.getCursorScreenPoint();
    child?.send({ channel, mouseCursor });
  }),

  GET_PROCESSES: toProcess(({ child }, { channel }) => {
    child?.send({ channel, processes });
  }),

  HIDE_APP: toProcess(({ child, scriptPath }, { channel }) => {
    log.info(`🫣 Hiding app`);

    if (!isVisible()) {
      log.info(`🫣 App is not visible`);
      child?.send({ channel });
      return;
    }

    kitState.hidden = true;

    onHideOnce(() => {
      child?.send({
        channel,
      });
    });
    hideAppIfNoWindows(scriptPath, 'HIDE_APP event');
  }),
  NEEDS_RESTART: async () => {
    await makeRestartNecessary();
  },
  QUIT_APP: () => {
    kitState.allowQuit = true;
    app.quit();
    app.exit();
  },
  SET_KIT_STATE: toProcess(async (processInfo, data) => {
    log.info(`SET_KIT_STATE`, data?.value);
    for (const [key, value] of Object.entries(data?.value)) {
      if ((kitState as any)?.[key] !== undefined) {
        log.info(`Setting kitState.${key} to ${value}`);
        (kitState as any)[key] = value;
      }
    }
  }),
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
  SET_STATUS: toProcess(async (_, data) => {
    if (data?.value) kitState.status = data?.value;
  }),
  SET_SUBMIT_VALUE: toProcess(({ child }, { channel, value }) => {
    sendToPrompt(Channel.SET_SUBMIT_VALUE, value);

    child?.send({ channel });
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

  SET_RESIZE: (data) => {
    sendToPrompt(Channel.SET_RESIZE, data.value);
    kitState.resize = data?.value;
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
      const { socketURL } = await startPty(data?.value);

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
  ADD_CHOICE: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.ADD_CHOICE, value);

    if (child) {
      child?.send({
        channel,
        value,
      });
    }
  }),

  SET_CHOICES: toProcess(async ({ child }, { channel, value }) => {
    if (kitState.isScripts) {
      setChoices(formatScriptChoices(value));
    } else {
      setChoices(value);
    }

    if (child) {
      child?.send({
        channel,
      });
    }
  }),

  // UPDATE_PROMPT_WARN: (data) => {
  //   setPlaceholder(data.info as string);
  // },

  CLEAR_PROMPT_CACHE: toProcess(async ({ child }, { channel, value }) => {
    log.verbose(`${channel}: Clearing prompt cache`);
    await clearPromptCache();

    if (child) {
      child?.send({
        channel,
        value,
      });
    }
  }),
  FOCUS: toProcess(async ({ child }, { channel, value }) => {
    log.verbose(`${channel}: Manually focusing prompt`);
    forceFocus();

    if (child) {
      child?.send({
        channel,
      });
    }
  }),
  SET_ALWAYS_ON_TOP: toProcess(async ({ child }, { channel, value }) => {
    log.verbose(`${channel}: Setting always on top to ${value}`);
    alwaysOnTop(value as boolean);

    if (child) {
      child?.send({
        channel,
        value,
      });
    }
  }),
  CLEAR_TABS: () => {
    sendToPrompt(Channel.CLEAR_TABS, []);
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
  // SET_FORM_HTML: (data) => {
  //   sendToPrompt(Channel.SET_FORM_HTML, data.value);
  // },
  SET_FORM: (data) => {
    sendToPrompt(Channel.SET_FORM, data.value);
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
    log.verbose(`SET_LOADING`, { data });
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
  TERMINATE_PROCESS: toProcess(async ({ child }, { channel, value }) => {
    warn(`${value}: Terminating process ${value}`);
    processes.removeByPid(value);

    if (child) {
      child?.send({
        channel,
        value,
      });
    }
  }),
  TERMINAL: (data) => {
    sendToPrompt(Channel.TERMINAL, data.value);
  },

  KEYBOARD_TYPE: toProcess(async ({ child }, { channel, value }) => {
    if (!kitState.authorized) kitState.notifyAuthFail = true;
    log.info(`>>>>>>>>>>>> ${channel}: ${value}`);
    keyboard.config.autoDelayMs = 0;
    kitState.isTyping = true;
    try {
      await keyboard.type(value);
    } catch (error) {
      log.error(`KEYBOARD ERROR TYPE`, error);
    }

    setTimeout(() => {
      kitState.isTyping = false;
      child?.send({
        channel,
      });
    }, 100);
  }),

  KEYBOARD_PRESS_KEY: toProcess(async ({ child }, { channel, value }) => {
    if (!kitState.authorized) kitState.notifyAuthFail = true;
    log.info(`PRESSING KEY`, { value });
    await keyboard.pressKey(...(value as any));

    child?.send({
      channel,
      value,
    });
  }),

  KEYBOARD_RELEASE_KEY: toProcess(async ({ child }, { channel, value }) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });

    await keyboard.releaseKey(...(value as any));

    child?.send({
      channel,
      value,
    });
  }),

  MOUSE_LEFT_CLICK: toProcess(async ({ child }, { channel, value }) => {
    await mouse.leftClick();

    child?.send({
      channel,
      value,
    });
  }),

  MOUSE_RIGHT_CLICK: toProcess(async ({ child }, { channel, value }) => {
    await mouse.rightClick();

    child?.send({
      channel,
      value,
    });
  }),

  MOUSE_MOVE: toProcess(async ({ child }, { channel, value }) => {
    await mouse.move(value);

    child?.send({
      channel,
      value,
    });
  }),

  // TRASH: toProcess(async ({ child }, { channel, value }) => {
  //   // const result = await trash(value);
  //   // log.info(`TRASH RESULT`, result);
  //   // child?.send({
  //   //   result,
  //   //   channel,
  //   // });
  // }),

  COPY: toProcess(async ({ child }, { channel, value }) => {
    log.info(`>>>> COPY`);
    clipboard.writeText(value);

    child?.send({
      channel,
    });
  }),

  // Maybe I need to wait between presses?
  // Or maybe not?

  PASTE: toProcess(async ({ child }, { channel }) => {
    const value = clipboard.readText();
    log.info(`>>>> PASTE`, value);

    child?.send({
      value,
      channel,
    });
  }),

  KEYBOARD_CONFIG: async (data) => {
    if (data?.value) {
      keyboard.config = data.value;
    }
  },
  SET_CONFIG: async (data) => {
    if (data?.value) {
      for (const [key, value] of Object.entries(data.value)) {
        let v = value;
        if (key.toLowerCase().includes('path')) {
          v = untildify(v);
        }

        (kitConfig as any)[key] = v;
      }
    }
  },
  CLEAR_SCRIPTS_MEMORY: toProcess(async ({ child }, { channel }) => {
    // await updateScripts();
    child?.send({
      channel,
    });
  }),

  VERIFY_FULL_DISK_ACCESS: toProcess(async ({ child }, { channel }) => {
    let value = false;
    if (kitState.isMac) {
      const { getAuthStatus, askForFullDiskAccess } = await import(
        'node-mac-permissions'
      );
      const authStatus = await getAuthStatus('full-disk-access');
      if (authStatus === 'authorized') {
        value = true;
      } else {
        askForFullDiskAccess();
      }
    } else {
      value = true;
    }

    child?.send({ channel, value });
  }),

  SET_SELECTED_TEXT: toProcess(async ({ child }, { channel, value }) => {
    log.info(`SET SELECTED TEXT`, value);
    const prevText = clipboard.readText();
    clipboard.writeText(value);

    const modifier = kitState.isMac ? Key.LeftSuper : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.V);
    await keyboard.releaseKey(modifier, Key.V);
    child?.send({ channel, value });
    clipboard.writeText(prevText);
  }),
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
    log.verbose(`➡ ${data.channel}`);
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
      log.info(`CLOSE`);
    });

    child.on('disconnect', () => {
      log.info(`DISCONNECT`);
    });

    child.on('exit', (code) => {
      log.info(`EXIT`, { pid, code });

      if (id) clearTimeout(id);

      if (child?.pid === kitState.promptProcess?.pid) {
        sendToPrompt(Channel.EXIT, pid);
      }

      const processInfo = processes.getByPid(pid) as ProcessInfo;
      if (processInfo.type === ProcessType.Background) {
        emitter.emit(KitEvent.RemoveBackground, processInfo.scriptPath);
      }

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
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(newProcess);
      }, 1000);
    });
  }

  public getByPid(pid: number) {
    return [...this, ...this.abandonnedProcesses].find(
      (processInfo) => processInfo.pid === pid
    );
  }

  public removeByPid(pid: number) {
    const index = this.findIndex((info) => info.pid === pid);
    if (index === -1) return;
    const { child, type, scriptPath } = this[index];
    if (!child?.killed) {
      if (type === ProcessType.Background) {
        emitter.emit(KitEvent.RemoveBackground, scriptPath);
      }
      child?.removeAllListeners();
      child?.kill();
      log.info(`${pid}: 🛑 removed`);
      if (kitState.promptProcess?.pid === pid) {
        hideAppIfNoWindows(
          kitState.promptProcess.scriptPath,
          `remove ${kitState.promptProcess.scriptPath}`
        );
      }
    }
    this.splice(index, 1);

    kitState.removeP(pid);

    // const mainAbandon = kitState.ps.find(
    //   (p) => p?.scriptPath === mainScriptPath
    // );
    // if (mainAbandon?.child) {
    //   log.info(`Found stray main . Exiting...`);
    //   mainAbandon?.child?.killed && mainAbandon?.child?.kill();
    // }
  }
}

export const processes = new Processes();

export const handleWidgetEvents = () => {
  const clickHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;

    const w = widgetState.widgets.find(({ id }) => id === widgetId);
    if (!w) return;
    const { widget, child, moved } = w;
    if (!child) return;

    if (moved) {
      w.moved = false;
      return;
    }

    log.info(`🔎 click ${widgetId}`);

    child?.send({
      ...data,
      ...widget.getBounds(),
      pid: child.pid,
      channel: Channel.WIDGET_CLICK,
    });
  };

  const inputHandler: WidgetHandler = (event, data) => {
    const { widgetId } = data;
    const options = widgetState.widgets.find(({ id }) => id === widgetId);
    if (!options) return;
    const { child, widget } = options;
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

    const options = widgetState.widgets.find(({ id }) => id === widgetId);
    if (!options) return;

    const { widget, child, ignoreMeasure } = options;
    if (!child || ignoreMeasure) return;

    widget.setSize(data.width, data.height, true);
  };

  ipcMain.on(Channel.WIDGET_CLICK, clickHandler);
  ipcMain.on(Channel.WIDGET_INPUT, inputHandler);
  ipcMain.on('WIDGET_MEASURE', measureHandler);
};

emitter.on(KitEvent.KillProcess, (pid) => {
  processes.removeByPid(pid);
});

// emitter.on(KitEvent.MainScript, () => {
//   sendToPrompt(Channel.SET_DESCRIPTION, 'Run Script');
//   const scripts = getScriptsSnapshot();
//   log.verbose({ scripts });
//   setChoices(formatScriptChoices(scripts));
// });
