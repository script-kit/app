/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import log from 'electron-log';
import detect from 'detect-port';
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
  dialog,
  shell,
} from 'electron';
import os, { constants } from 'os';
import { assign, remove } from 'lodash';
import ContrastColor from 'contrast-color';
import { subscribe } from 'valtio';
import http from 'http';
import path from 'path';
import https from 'https';
import url from 'url';
import sizeOf from 'image-size';
import { writeFile } from 'fs/promises';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ChildProcess, exec, fork } from 'child_process';
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
  kitPath,
  kenvPath,
  kitDotEnvPath,
  mainScriptPath,
} from '@johnlindquist/kit/cjs/utils';

import axios from 'axios';
import { getLog, warn } from './logs';
import {
  alwaysOnTop,
  appToPrompt,
  blurPrompt,
  clearPromptCache,
  focusPrompt,
  forceFocus,
  getMainPrompt,
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
  setPromptProp,
  setScript,
  setTabIndex,
} from './prompt';
import {
  getBackgroundTasks,
  getSchedule,
  kitState,
  kitConfig,
  widgetState,
  findWidget,
  forceQuit,
  online,
} from './state';

import { emitter, KitEvent } from './events';
import { show, showDevTools, showInspector, showWidget } from './show';

import { getVersion } from './version';
import {
  clearClipboardHistory,
  getClipboardHistory,
  removeFromClipboardHistory,
} from './tick';
import { getTray, getTrayIcon, setTrayMenu } from './tray';
import { startPty } from './pty';
import { createWidget } from './widget';
import { AppChannel, Trigger } from './enums';
import { isKitScript, toRgb, pathsAreEqual } from './helpers';
import { toHex } from './color-utils';
import { deleteText } from './keyboard';
import { showLogWindow } from './window';

// const trash = async (...args: string[]) => {
//   const parent = app.isPackaged
//     ? path.resolve(process.resourcesPath, 'app.asar.unpacked')
//     : path.resolve(__dirname, '..', 'src');

//   const bin = path.resolve(parent, 'node_modules', '.bin', 'trash');

//   log.info(`Trash: ${bin} ${args.join(' ')}`);

//   const pExec = promisify(exec);

//   return pExec(`${bin} ${args.join(' ')}`);
// };

export const maybeConvertColors = (value: any) => {
  if (value.foreground) {
    const foreground = toRgb(value.foreground);
    value['--color-white'] = foreground;
    value['--color-black'] = foreground;
    value.foregroundHex = toHex(foreground);
  }
  if (value.accent) {
    const accent = toRgb(value.accent);
    value['--color-primary-light'] = accent;
    value['--color-primary-dark'] = accent;
    value.accentHex = toHex(accent);

    const contrast = ContrastColor.contrastColor({
      bgColor: toHex(value.accent),
    }) as string;

    const contrastRgb = toRgb(contrast);
    value['--color-contrast-light'] = contrastRgb;
    value['--color-contrast-dark'] = contrastRgb;
    value.contrastHex = contrast;
  }

  if (value.background) {
    const background = toRgb(value.background);
    value['--color-background-light'] = background;
    value['--color-background-dark'] = background;
    value.backgroundHex = toHex(value.background);

    const cc = new ContrastColor({
      bgColor: toHex(value.background),
    });
    const result = cc.contrastColor();

    const appearance = result === '#FFFFFF' ? 'dark' : 'light';
    log.info(`💄 Setting appearance to ${appearance}`);

    kitState.appearance = appearance;
    sendToPrompt(Channel.SET_APPEARANCE, appearance);
  }

  if (value.opacity) {
    value['--opacity-light'] = value.opacity;
    value['--opacity-dark'] = value.opacity;
  }

  log.info(value);

  if (value.background) delete value.background;
  if (value.foreground) delete value.foreground;
  if (value.accent) delete value.accent;
  if (value.opacity) delete value.opacity;

  // Save theme as JSON to disk
  const themePath = kitPath('db', 'theme.json');
  writeFile(themePath, JSON.stringify(value, null, 2));
};

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

export const sponsorCheck = async (feature: string) => {
  log.info('Checking sponsor status...');

  const isOnline = await online();
  if (!isOnline || process.env.KIT_SPONSOR === 'development') {
    kitState.isSponsor = true;
  }

  if (!kitState.isSponsor) {
    const response = await axios.post(
      `https://scriptkit.com/api/check-sponsor`,
      {
        ...kitState.user,
        feature,
      }
    );

    // check for axios post error
    if (response.status !== 200) {
      log.error('Error checking sponsor status', response);
    }

    log.info(`🕵️‍♀️ Sponsor check response`, JSON.stringify(response.data));

    if (
      (kitState.user.node_id && response.data.id === kitState.user.node_id) ||
      response.status !== 200
    ) {
      log.info('User is sponsor');
      kitState.isSponsor = true;
    } else {
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
    }
  }
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
  log.verbose(`toProcess: ${data.channel}`);
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
    isVisible() &&
    !isWidgetMessage &&
    processInfo?.pid !== kitState.pid
  ) {
    return warn(
      `💁‍♂️ ${path.basename(processInfo.scriptPath)}: ${data?.pid}: ${
        data.channel
      } ignored on current UI. ${data.pid} doesn't match ${kitState.pid}`
    );
  }

  return fn(processInfo, data);
};

const childSend = (child: ChildProcess, data: any) => {
  try {
    if (child && child?.connected) {
      child.send(data);
    }
  } catch (error) {
    log.error('childSend error', error);
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
    childSend(child, {
      channel,
      schedule: getSchedule(),
      tasks: getBackgroundTasks(),
    });
  }),

  GET_SCHEDULE: toProcess(({ child }, { channel }) => {
    childSend(child, { channel, schedule: getSchedule() });
  }),

  GET_BOUNDS: toProcess(({ child }, { channel }) => {
    const bounds = getPromptBounds();
    childSend(child, { channel, bounds });
  }),

  GET_BACKGROUND: toProcess(({ child }, { channel }) => {
    childSend(child, { channel, tasks: getBackgroundTasks() });
  }),

  GET_CLIPBOARD_HISTORY: toProcess(({ child }, { channel }) => {
    childSend(child, {
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

    const widget = findWidget(widgetId, channel);
    if (!widget) return;

    // log.info(`WIDGET_SET_STATE`, value);
    if (widget) {
      widget?.webContents.send(channel, state);
    } else {
      warn(`${widgetId}: widget not found. Terminating process.`);
      child?.kill();
    }
  }),

  WIDGET_CALL: toProcess(({ child }, { channel, value }) => {
    const { widgetId, method, args } = value as any;

    const widget = findWidget(widgetId, channel);
    if (!widget) return;

    // log.info(`WIDGET_CALL`, value);
    if (widget) {
      try {
        (widget as any)?.[method]?.(...args);
      } catch (error) {
        log.error(error);
      }
    } else {
      warn(`${widgetId}: widget not found. Terminating process.`);
      child?.kill();
    }
  }),
  WIDGET_FIT: toProcess(({ child }, { channel, value }) => {
    const { widgetId, state } = value as any;
    // log.info({ widgetId }, `${channel}`);

    const widget = findWidget(widgetId, channel);
    if (!widget) return;

    // log.info(`WIDGET_SET_STATE`, value);
    if (widget) {
      widget?.webContents.send(channel, state);
    } else {
      warn(`${widgetId}: widget not found. Terminating process.`);
      child?.kill();
    }
  }),

  WIDGET_SET_SIZE: toProcess(({ child }, { channel, value }) => {
    const { widgetId, width, height } = value as any;
    // log.info({ widgetId }, `${channel}`);
    const widget = findWidget(widgetId, channel);
    if (!widget) return;

    // log.info(`WIDGET_SET_STATE`, value);
    if (widget) {
      widget?.setSize(width, height);
    } else {
      warn(`${widgetId}: widget not found. Terminating process.`);
      child?.kill();
    }
  }),

  WIDGET_SET_POSITION: toProcess(({ child }, { value, channel }) => {
    const { widgetId, x, y } = value as any;
    // log.info({ widgetId }, `${channel}`);
    const widget = findWidget(widgetId, channel);
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
        wid: widget?.id,
        pid: child?.pid,
        moved: false,
        ignoreMouse: value?.options?.ignoreMouse || false,
        ignoreMeasure: Boolean(
          value?.options?.width || value?.options?.height || false
        ),
      });

      widget.on('resized', () => {
        childSend(child, {
          channel: Channel.WIDGET_RESIZED,
          widgetId,
          ...widget.getBounds(),
        });
      });

      widget.on('moved', () => {
        childSend(child, {
          channel: Channel.WIDGET_MOVED,
          widgetId,
          ...widget.getBounds(),
        });
      });

      const closeHandler = () => {
        const w = findWidget(widgetId, 'CLOSE_HANDLER');

        if (!w) return;
        if (w?.isDestroyed()) return;

        log.info(`${widgetId}: Widget closed`);
        focusPrompt();
        if (child?.channel) {
          childSend(child, {
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

      childSend(child, {
        channel,
        widgetId,
      });
    }
  ),

  WIDGET_END: toProcess((_, { value, channel }) => {
    const { widgetId } = value as any;
    const widget = findWidget(widgetId, channel);

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

      childSend(child, {
        channel,
        imagePath,
      });
    } else {
      const imagePath = `⚠️ Failed to capture page for widget ${widgetId}`;
      childSend(child, {
        channel,
        imagePath,
      });
      warn(imagePath);
    }
  }),

  CLEAR_CLIPBOARD_HISTORY: toProcess(({ child }, { channel, value }) => {
    log.verbose(channel);

    clearClipboardHistory();

    childSend(child, { channel });
  }),

  REMOVE_CLIPBOARD_HISTORY_ITEM: toProcess(({ child }, { channel, value }) => {
    log.verbose(channel, value);

    removeFromClipboardHistory(value);

    childSend(child, { channel });
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

    childSend(child, { channel, activeScreen });
  }),
  GET_SCREENS_INFO: toProcess(({ child }, { channel }) => {
    const displays = screen.getAllDisplays();

    childSend(child, { channel, displays });
  }),
  GET_ACTIVE_APP: toProcess(async ({ child }, { channel }) => {
    if (kitState.isMac) {
      const { default: frontmost } = await import('frontmost-app' as any);
      const frontmostApp = await frontmost();
      childSend(child, { channel, app: frontmostApp });
    } else {
      // TODO: implement for windows
      childSend(child, { channel, app: {} });
    }
  }),

  GET_MOUSE: toProcess(({ child }, { channel }) => {
    const mouseCursor = screen.getCursorScreenPoint();
    childSend(child, { channel, mouseCursor });
  }),

  GET_PROCESSES: toProcess(({ child }, { channel }) => {
    childSend(child, { channel, processes });
  }),

  BLUR_APP: toProcess(({ child }, { channel }) => {
    blurPrompt();

    childSend(child, { channel });
  }),

  HIDE_APP: toProcess(async ({ child, scriptPath }, { channel }) => {
    if (kitState.isMac && app?.dock) app?.dock?.hide();

    kitState.hidden = true;
    log.info(`😳 Hiding app`);

    const handler = () => {
      log.info(`🫣 App hidden`);
      if (!child?.killed) {
        childSend(child, {
          channel,
        });
      }
    };

    // If windows, force blur
    if (kitState.isWindows) {
      blurPrompt();
    }

    if (isVisible()) {
      onHideOnce(handler);
    } else {
      handler();
    }

    hideAppIfNoWindows('HIDE_APP event');
  }),

  QUIT_APP: () => {
    forceQuit();
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
  DEBUG_SCRIPT: toProcess(async (processInfo, data) => {
    await sponsorCheck('Debugging Scripts');
    if (!kitState.isSponsor) return;

    kitState.debugging = true;
    processes.removeByPid(processInfo.child?.pid);

    log.info(`DEBUG_SCRIPT`, data?.value?.filePath);

    sendToPrompt(Channel.START, data?.value?.filePath);

    const port = await detect(51515);
    const pInfo = processes.add(ProcessType.Prompt, '', [], port);
    pInfo.scriptPath = data?.value?.filePath;

    log.info(`🐞 ${pInfo?.pid}: ${data?.value?.filePath} `);

    await setScript(data.value, pInfo.pid, true);

    // wait 1000ms for script to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    childSend(pInfo?.child, {
      channel: Channel.VALUE_SUBMITTED,
      input: '',
      value: {
        script: data?.value?.filePath,
        args: [],
        trigger: Trigger.App,
      },
    });
  }),
  SET_SCRIPT: toProcess(async (processInfo, data) => {
    if (processInfo.type === ProcessType.Prompt) {
      processInfo.scriptPath = data.value?.filePath;
      const foundP = kitState.ps.find((p) => p.pid === processInfo.pid);
      if (foundP) {
        foundP.scriptPath = data.value?.filePath;
      }
    }
    await setScript(data.value, processInfo.pid);
  }),
  SET_STATUS: toProcess(async (_, data) => {
    if (data?.value) kitState.status = data?.value;
  }),
  SET_SUBMIT_VALUE: toProcess(({ child }, { channel, value }) => {
    sendToPrompt(Channel.SET_SUBMIT_VALUE, value);

    childSend(child, { channel });
  }),

  SET_MODE: (data) => {
    setMode(data.value);
  },

  SET_HINT: (data) => {
    setHint(data.value);
  },

  SET_BOUNDS: (data) => {
    setBounds(data.value);
    sendToPrompt(Channel.SET_BOUNDS, data.value);
  },

  SET_IGNORE_BLUR: toProcess(async ({ child }, { channel, value }) => {
    log.info(`SET_IGNORE_BLUR`, { value });
    kitState.ignoreBlur = value;

    if (child) {
      childSend(child, {
        channel,
        value,
      });
    }
  }),

  SET_RESIZE: (data) => {
    kitState.resize = data?.value;
  },

  SET_INPUT: toProcess(async ({ child }, { channel, value }) => {
    setInput(value);

    childSend(child, { channel, value });
  }),

  SET_PLACEHOLDER: (data) => {
    setPlaceholder(data.value);
  },

  SET_ENTER: (data) => {
    sendToPrompt(Channel.SET_ENTER, data.value);
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

  SET_SHORTCUTS: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.SET_SHORTCUTS, value);

    childSend(child, { channel, value });
  }),

  CONSOLE_CLEAR: () => {
    setLog(Channel.CONSOLE_CLEAR);
  },

  SET_TAB_INDEX: (data) => {
    setTabIndex(data.value);
  },
  DEV_TOOLS: toProcess(async ({ child }, { channel, value }) => {
    showDevTools(value);

    childSend(child, { channel });
  }),
  SHOW_LOG_WINDOW: toProcess(
    async ({ child, scriptPath, pid }, { channel, value }) => {
      await showLogWindow({
        scriptPath: value || scriptPath,
        pid,
      });

      childSend(child, { channel });
    }
  ),

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
  SET_PROMPT_DATA: toProcess(async ({ child, pid }, { channel, value }) => {
    setPromptData(value);
    kitState.isScripts = Boolean(value?.scripts);

    if (value?.ui === UI.term) {
      const { socketURL } = await startPty(value);

      sendToPrompt(Channel.TERMINAL, socketURL);
    }

    childSend(child, { channel });
  }),
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
      childSend(child, {
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
      childSend(child, {
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
      childSend(child, {
        channel,
        value,
      });
    }
  }),
  FOCUS: toProcess(async ({ child }, { channel, value }) => {
    log.verbose(`${channel}: Manually focusing prompt`);
    forceFocus();

    if (child) {
      childSend(child, {
        channel,
      });
    }
  }),
  SET_ALWAYS_ON_TOP: toProcess(async ({ child }, { channel, value }) => {
    log.verbose(`${channel}: Setting always on top to ${value}`);
    alwaysOnTop(value as boolean);

    if (child) {
      childSend(child, {
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

  SET_THEME: toProcess(async ({ child }, { channel, value }) => {
    await sponsorCheck('Custom Themes');
    if (!kitState.isSponsor) return;

    maybeConvertColors(value);

    assign(kitState.theme, value);

    sendToPrompt(Channel.SET_THEME, value);
    if (child) {
      childSend(child, {
        channel,
        value,
      });
    }
  }),

  SET_TEMP_THEME: toProcess(async ({ child }, { channel, value }) => {
    maybeConvertColors(value);
    sendToPrompt(Channel.SET_TEMP_THEME, value);
    if (child) {
      childSend(child, {
        channel,
        value,
      });
    }
  }),

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
      childSend(child, {
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
    log.info(`${channel}: ${typeof value} ${value}`);
    log.info(`${channel}: ${[...value]}`);
    keyboard.config.autoDelayMs = 0;
    kitState.isTyping = true;
    try {
      for await (const k of value) {
        await keyboard.type(k);
      }
    } catch (error) {
      log.error(`KEYBOARD ERROR TYPE`, error);
    }

    setTimeout(() => {
      kitState.isTyping = false;
      childSend(child, {
        channel,
      });
    }, value.length);
  }),

  KEYBOARD_PRESS_KEY: toProcess(async ({ child }, { channel, value }) => {
    if (!kitState.authorized) kitState.notifyAuthFail = true;
    log.info(`PRESSING KEY`, { value });
    await keyboard.pressKey(...(value as any));

    childSend(child, {
      channel,
      value,
    });
  }),

  KEYBOARD_RELEASE_KEY: toProcess(async ({ child }, { channel, value }) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });

    await keyboard.releaseKey(...(value as any));

    childSend(child, {
      channel,
      value,
    });
  }),

  MOUSE_LEFT_CLICK: toProcess(async ({ child }, { channel, value }) => {
    await mouse.leftClick();

    childSend(child, {
      channel,
      value,
    });
  }),

  MOUSE_RIGHT_CLICK: toProcess(async ({ child }, { channel, value }) => {
    await mouse.rightClick();

    childSend(child, {
      channel,
      value,
    });
  }),

  MOUSE_MOVE: toProcess(async ({ child }, { channel, value }) => {
    await mouse.move(value);

    childSend(child, {
      channel,
      value,
    });
  }),

  // TRASH: toProcess(async ({ child }, { channel, value }) => {
  //   // const result = await trash(value);
  //   // log.info(`TRASH RESULT`, result);
  //   // childSend(child, {
  //   //   result,
  //   //   channel,
  //   // });
  // }),

  COPY: toProcess(async ({ child }, { channel, value }) => {
    log.info(`>>>> COPY`);
    clipboard.writeText(value);

    childSend(child, {
      channel,
    });
  }),

  // Maybe I need to wait between presses?
  // Or maybe not?

  PASTE: toProcess(async ({ child }, { channel }) => {
    const value = clipboard.readText();
    log.info(`>>>> PASTE`, value);

    childSend(child, {
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
    childSend(child, {
      channel,
    });
  }),

  VERIFY_FULL_DISK_ACCESS: toProcess(async ({ child }, { channel }) => {
    let value = false;
    if (process.env.NODE_ENV === 'development' || !kitState.isMac) {
      value = true;
    } else {
      const { getAuthStatus, askForFullDiskAccess } = await import(
        'node-mac-permissions'
      );
      const authStatus = getAuthStatus('full-disk-access');
      if (authStatus === 'authorized') {
        value = true;
      } else {
        askForFullDiskAccess();
      }
    }

    childSend(child, { channel, value });
  }),

  SET_SELECTED_TEXT: toProcess(async ({ child }, { channel, value }) => {
    if (kitState.isMac && app?.dock && app?.dock?.isVisible())
      app?.dock?.hide();
    log.info(`SET SELECTED TEXT`, value);
    clipboard.writeText(value);

    const modifier = kitState.isMac ? Key.LeftSuper : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.V);
    await keyboard.releaseKey(modifier, Key.V);
    setTimeout(() => {
      childSend(child, { channel, value });
      log.info(`SET SELECTED TEXT DONE`, value);
    }, 10);
  }),

  SHOW_EMOJI_PANEL: toProcess(async ({ child }, { channel, value }) => {
    app.showEmojiPanel();

    childSend(child, { channel, value });
  }),
  SET_APPEARANCE: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.SET_APPEARANCE, value);

    childSend(child, { channel, value });
  }),
  SELECT_FILE: toProcess(async ({ child }, { channel, value }) => {
    // Show electron file selector dialog
    const response = await dialog.showOpenDialog(getMainPrompt(), {
      defaultPath: os.homedir(),
      message: 'Select a file',
      properties: ['openFile'],
    });

    const returnValue = response.canceled ? '' : response.filePaths[0];

    childSend(child, { channel, value: returnValue });
  }),
  SELECT_FOLDER: toProcess(async ({ child }, { channel, value }) => {
    // Show electron file selector dialog
    const response = await dialog.showOpenDialog(getMainPrompt(), {
      defaultPath: os.homedir(),
      message: 'Select a file',
      properties: ['openDirectory'],
    });

    const returnValue = response.canceled ? '' : response.filePaths[0];

    childSend(child, { channel, value: returnValue });
  }),
  REVEAL_FILE: toProcess(async ({ child }, { channel, value }) => {
    shell.showItemInFolder(value);

    childSend(child, { channel, value });
  }),
  BEEP: toProcess(async ({ child }, { channel, value }) => {
    shell.beep();
    childSend(child, { channel, value });
  }),
  PLAY_AUDIO: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.PLAY_AUDIO, value);
    childSend(child, { channel, value });
  }),
  SPEAK_TEXT: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.SPEAK_TEXT, value);
    childSend(child, { channel, value });
  }),

  CUT_TEXT: toProcess(async ({ child }, { channel, value }) => {
    const text = kitState.snippet;
    log.info(`Yanking text`, text);
    await deleteText(text);
    kitState.snippet = '';

    childSend(child, {
      channel,
      value: text,
    });
  }),
};

export const createMessageHandler = (type: ProcessType) => async (
  data: GenericSendData
) => {
  if (!data.kitScript) log.info(data);

  if (kitMessageMap[data.channel]) {
    type C = keyof ChannelMap;
    log.verbose(`➡ ${data.channel}`);
    const channelFn = kitMessageMap[data.channel as C] as (
      data: SendData<C>
    ) => void;
    try {
      channelFn(data);
    } catch (error) {
      log.error(`Error in channel ${data.channel}`, error);
    }
  } else {
    warn(`Channel ${data?.channel} not found on ${type}.`);
  }
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
  // const isWin = os.platform().startsWith('win');
  const child = fork(entry, args, {
    silent: false,
    // ...(isWin ? {} : { execPath }),
    cwd: os.homedir(),
    env: {
      ...env,
      KIT_DEBUG: port ? '1' : '0',
    },
    ...(port
      ? {
          stdio: 'pipe',
          execArgv: [`--inspect=${port}`],
        }
      : {}),
  });

  let win: BrowserWindow | null = null;

  if (port && child && child.stdout && child.stderr) {
    sendToPrompt(Channel.SET_PROMPT_DATA, {
      ui: UI.debugger,
    } as any);
    log.info(`Created ${type} process`);
    // child.stdout.on('data', (data) => {
    //   log.info(`Child ${type} data`, data);
    // });

    child.once('disconnect', () => {
      if (!child.killed) child.kill();
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
        kitState.ignoreBlur = true;
        alwaysOnTop(true);
        log.info({ debugUrl });
        const devToolsUrl = `devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=${debugUrl}`;
        log.info(`DevTools URL: ${devToolsUrl}`);

        win = showInspector(devToolsUrl);
        setTimeout(() => {
          win?.setAlwaysOnTop(false);
        }, 500);
      }
    });
  }

  return child;
};

interface ProcessHandlers {
  onExit?: () => void;
  onError?: (error: Error) => void;
  resolve?: (values: any[]) => any;
  reject?: (value: any) => any;
}

const processesChanged = () => {
  const pinfos = processes.getAllProcessInfo().filter((p) => p.scriptPath);
  appToPrompt(AppChannel.PROCESSES, pinfos);

  const mains = processes.filter((p) =>
    pathsAreEqual(p.scriptPath, mainScriptPath)
  );

  // kill all but the newest
  if (mains.length > 1) {
    const [, ...others] = mains.sort((a, b) => b.pid - a.pid);
    others.forEach((p) => {
      log.info(`Killing stray main process ${p.pid}`);
      p.child.kill();
    });
  }
};

const ensureTwoIdleProcesses = () => {
  setTimeout(() => {
    const idles = processes
      .getAllProcessInfo()
      .filter(
        (processInfo) =>
          processInfo.type === ProcessType.Prompt &&
          processInfo?.scriptPath === ''
      );

    if (idles.length === 0) {
      processes.add(ProcessType.Prompt);
      processes.add(ProcessType.Prompt);
    }

    if (idles.length === 1) {
      processes.add(ProcessType.Prompt);
    }
  }, 100);
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

class Processes extends Array<ProcessInfo> {
  public abandonnedProcesses: ProcessInfo[] = [];

  public getAllProcessInfo() {
    return this.map(({ scriptPath, type, pid }) => ({
      type,
      scriptPath,
      pid,
    }));
  }

  public add(
    type: ProcessType = ProcessType.Prompt,
    scriptPath = '',
    args: string[] = [],
    port = 0,
    { resolve, reject }: ProcessHandlers = {}
  ): ProcessInfo {
    log.info(`👶 Create child ${type} process`, scriptPath, args);
    const child = createChild({
      type,
      scriptPath,
      runArgs: args,
      port,
    });

    const info = {
      pid: child.pid,
      child,
      type,
      scriptPath,
      values: [],
      date: Date.now(),
    };

    this.push(info);
    kitState.addP(info);

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

      if (child?.pid === kitState?.pid) {
        sendToPrompt(Channel.EXIT, pid);
      }

      const processInfo = processes.getByPid(pid) as ProcessInfo;
      if (processInfo?.type === ProcessType.Background) {
        emitter.emit(KitEvent.RemoveBackground, processInfo.scriptPath);
      }

      if (!processInfo) return;

      if (resolve) {
        resolve(processInfo?.values);
      }

      if (code === 0) {
        log.info(
          `${child.pid}: 🟡 exit ${code}. ${processInfo.type} process: ${processInfo?.scriptPath}`
        );
      } else if (typeof code === 'number') {
        log.error(
          `${child.pid}: 🟥 exit ${code}. ${processInfo.type} process: ${processInfo?.scriptPath}`
        );
        log.error(
          `👋 Ask for help: https://github.com/johnlindquist/kit/discussions/categories/errors`
        );

        setTrayScriptError(pid);
      }

      processes.removeByPid(pid);
    });

    child.on('error', (error) => {
      log.error(`ERROR`, { pid, error });
      log.error(
        `👋 Ask for help: https://github.com/johnlindquist/kit/discussions/categories/errors`
      );
      kitState.status = {
        status: 'warn',
        message: ``,
      };

      setTrayScriptError(pid);
      if (reject) reject(error);
    });

    return info;
  }

  public findIdlePromptProcess(): ProcessInfo {
    const idles = this.filter(
      (processInfo) =>
        processInfo.type === ProcessType.Prompt &&
        processInfo?.scriptPath === ''
    );

    ensureTwoIdleProcesses();

    if (idles.length) {
      return idles[0];
    }

    return processes.add(ProcessType.Prompt);
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
      emitter.emit(KitEvent.RemoveBackground, scriptPath);
      child?.removeAllListeners();
      child?.kill();
      log.info(`${pid}: 🛑 removed`);
    }
    if (kitState?.pid === pid) {
      kitState.scriptPath = '';
      kitState.promptId = '';
      kitState.promptCount = 0;
    }

    this.splice(index, 1);
    kitState.removeP(pid);

    // check if two paths are the same

    processesChanged();

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

export const removeAbandonnedKit = () => {
  const kitProcess = processes.find((processInfo) =>
    isKitScript(processInfo.scriptPath)
  );

  if (kitProcess) {
    log.info(`🛑 Cancel main menu process: ${kitProcess.scriptPath}`);
    processes.removeByPid(kitProcess.pid);
  }
};

export const handleWidgetEvents = () => {
  const clickHandler: WidgetHandler = (event, data) => {
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

    log.info(`🔎 click ${widgetId}`);

    childSend(child, {
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

  const measureHandler: WidgetHandler = (event, data: any) => {
    const { widgetId } = data;
    log.info(`📏 ${widgetId} Widget: Fitting to inner child`);

    const options = widgetState.widgets.find(({ id }) => id === widgetId);
    if (!options) return;

    const { wid, ignoreMeasure, pid } = options;
    const widget = BrowserWindow.fromId(wid);
    const { child } = processes.getByPid(pid) as ProcessInfo;
    if (!child || !widget || ignoreMeasure) return;

    widget.setSize(data.width, data.height, true);
  };

  ipcMain.on(Channel.WIDGET_CLICK, clickHandler);
  ipcMain.on(Channel.WIDGET_INPUT, inputHandler);
  ipcMain.on('WIDGET_MEASURE', measureHandler);
};

emitter.on(KitEvent.KillProcess, (pid) => {
  log.info(`🛑 Kill Process: ${pid}`);
  processes.removeByPid(pid);
});

// emitter.on(KitEvent.MainScript, () => {
//   sendToPrompt(Channel.SET_DESCRIPTION, 'Run Script');
//   const scripts = getScriptsSnapshot();
//   log.verbose({ scripts });
//   setChoices(formatScriptChoices(scripts));
// });
