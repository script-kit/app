/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import log from 'electron-log';
import { randomUUID } from 'crypto';
import detect from 'detect-port';
import untildify from 'untildify';
import dotenv from 'dotenv';

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
  globalShortcut,
  nativeTheme,
} from 'electron';
import os from 'os';
import { assign, remove, debounce } from 'lodash';
import ContrastColor from 'contrast-color';
import { snapshot, subscribe } from 'valtio';
import http from 'http';
import path from 'path';
import https from 'https';
import url, { pathToFileURL } from 'url';
import sizeOf from 'image-size';
import { writeFile } from 'fs/promises';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ChildProcess, fork, spawn } from 'child_process';
import { Channel, ProcessType, Value, UI } from '@johnlindquist/kit/cjs/enum';
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
  execPath,
} from '@johnlindquist/kit/cjs/utils';

import { subscribeKey } from 'valtio/utils';
import { readJson } from 'fs-extra';
import { setScriptTimestamp, getTimestamps } from '@johnlindquist/kit/cjs/db';
import { readFileSync } from 'fs';
import { getLog, mainLog, warn } from './logs';
import {
  setPromptAlwaysOnTop,
  appToPrompt,
  blurPrompt,
  clearPromptCache,
  focusPrompt,
  forceFocus,
  getFromPrompt,
  getMainPrompt,
  getPromptBounds,
  hideAppIfNoWindows,
  isVisible,
  maybeHide,
  onHideOnce,
  sendToPrompt,
  setBounds,
  setChoices,
  setFlags,
  setFooter,
  setHint,
  setInput,
  setLog,
  setMode,
  setPanel,
  setPlaceholder,
  setPreview,
  setShortcuts,
  setPromptData,
  setPromptProp,
  setScript,
  setTabIndex,
  setVibrancy,
  preload,
} from './prompt';
import {
  getBackgroundTasks,
  getSchedule,
  kitState,
  kitConfig,
  widgetState,
  findWidget,
  forceQuit,
  sponsorCheck,
  appDb,
  getThemes,
  preloadChoicesMap,
  preloadPreviewMap,
  kitSearch,
  clearSearch,
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
import { createWidget } from './widget';
import { AppChannel, HideReason, Trigger } from './enums';
import { isKitScript, toRgb, pathsAreEqual, convertShortcut } from './helpers';
import { toHex } from './color-utils';
import { deleteText } from './keyboard';
import { showLogWindow } from './window';
import { stripAnsi } from './ansi';
import { darkTheme, lightTheme } from './components/themes';
import { getAssetPath } from './assets';
import { TrackEvent, trackEvent } from './track';

// const trash = async (...args: string[]) => {
//   const parent = app.isPackaged
//     ? path.resolve(process.resourcesPath, 'app.asar.unpacked')
//     : path.resolve(__dirname, '..', 'src');

//   const bin = path.resolve(parent, 'node_modules', '.bin', 'trash');

//   log.info(`Trash: ${bin} ${args.join(' ')}`);

//   const pExec = promisify(exec);

//   return pExec(`${bin} ${args.join(' ')}`);
// };

export const maybeConvertColors = async (theme: any = {}) => {
  log.info(`🎨 Convert Colors:`, theme);

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

  theme['--ui-bg-opacity'] ||= theme?.['ui-bg-opacity'] || '0.4';
  theme['--ui-border-opacity'] ||= theme?.['ui-border-opacity'] || '0.7';

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
    log.info(`💄 Setting appearance to ${theme.appearance}`);
  }

  if (theme.opacity) {
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

  setVibrancy(vibrancy);

  return theme;
};

export const formatScriptChoices = (data: Choice[]) => {
  const dataChoices: Script[] = (data || []) as Script[];
  log.verbose('formatScriptChoices', { length: dataChoices?.length || 0 });
  const choices = dataChoices.map((script) => {
    // TODO: I'm kinda torn about showing descriptions in the main menu...
    // if (script.group !== 'Kit') script.description = '';
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
      script.img = script.img.includes(path.sep)
        ? script.img
        : kenvPath(script.kenv && `kenvs/${script.kenv}`, 'assets', script.img);
    }

    return script;
  });

  return choices;
};

export const setTheme = async (value: any = {}, check = true) => {
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

  sendToPrompt(Channel.SET_THEME, newValue);
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

export const updateTheme = async () => {
  kitState.isDark = nativeTheme.shouldUseDarkColors;
  log.info({
    isDarkState: kitState.isDark ? 'true' : 'false',
    isDarkNative: nativeTheme.shouldUseDarkColors ? 'true' : 'false',
  });

  const themePath = kitState.isDark
    ? kitState.kenvEnv?.KIT_THEME_DARK
    : kitState.kenvEnv?.KIT_THEME_LIGHT;

  if (themePath) {
    log.info(
      `▓ ${kitState.isDark ? 'true' : 'false'} 👀 Theme path: ${themePath}`
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

export const cacheChoices = async (scriptPath: string, choices: Choice[]) => {
  log.info(
    `🎁 Caching choices for ${kitState.scriptPath}: Choices ${choices?.length}`
  );
  preloadChoicesMap.set(scriptPath, choices);
};

export const cachePreview = async (scriptPath: string, preview: string) => {
  log.verbose(`🎁 Caching preview for ${kitState.scriptPath}`);
  preloadPreviewMap.set(scriptPath, preview);
};

const toProcess =
  <K extends keyof ChannelMap>(
    fn: (processInfo: ProcessInfo, data: SendData<K>) => void
  ) =>
  (data: SendData<K>) => {
    if (kitState.allowQuit)
      return warn(`⚠️  Tried to send data to ${data.channel} after quit`);

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
      // TODO: Why was I allowing HIDE_APP from a non-focused script?
      // data.channel !== Channel.HIDE_APP &&
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
      data.promptId = kitState.promptId;
      child.send(data);
    }
  } catch (error) {
    log.error('childSend error', error);
  }
};

const kitMessageMap: ChannelHandler = {
  PONG: (data) => {},
  CONSOLE_LOG: (data) => {
    getLog(data.kitScript).info(data?.value || Value.Undefined);
    setLog(data.value || Value.Undefined);
  },
  CONSOLE_INFO: (data) => {
    getLog(data.kitScript).info(data?.value || Value.Undefined);
    setLog(data.value || Value.Undefined);
  },

  CONSOLE_WARN: (data) => {
    getLog(data.kitScript).warn(data.value);
    setLog(data.value);
  },

  CONSOLE_ERROR: (data) => {
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

  GET_CLIPBOARD_HISTORY: toProcess(async ({ child }, { channel }) => {
    childSend(child, {
      channel,
      history: await getClipboardHistory(),
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

  WIDGET_EXECUTE_JAVASCRIPT: toProcess(
    async ({ child }, { channel, value }) => {
      log.info(value);
      const { widgetId, value: js } = value as any;
      const widget = findWidget(widgetId, channel);
      if (!widget) return;

      log.info(`WIDGET_EXECUTE_JAVASCRIPT`, {
        widgetId,
        js: js.trim(),
      });

      if (widget) {
        const result = await widget?.webContents.executeJavaScript(js);

        childSend(child, {
          channel,
          value: result,
        });
      } else {
        warn(`${widgetId}: widget not found. Killing process.`);
        child?.kill();
      }
    }
  ),

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
      const theme = kitState.isDark ? darkTheme : lightTheme;
      const filePath = await createWidget(command, html, options, theme);
      kitState.blurredByKit = true;
      const widgetId = Date.now().toString();
      const widget = await showWidget(widgetId, html, filePath, options);
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
        if (child?.channel && child?.connected) {
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
        if (input.key === 'Escape' && !options?.preventEscape) {
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
          try {
            closeHandler();
            un();
          } catch (error) {
            log.error(error);
          }
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

  WIDGET_END: toProcess(({ child }, { value, channel }) => {
    const { widgetId } = value as any;
    const widget = findWidget(widgetId, channel);

    if (!widget) return;

    log.info(`${widgetId}: Widget closed`);
    focusPrompt();

    widget.removeAllListeners();
    widget.destroy();

    remove(widgetState.widgets, ({ id }) => id === widgetId);

    if (child?.channel) {
      childSend(child, {
        channel: Channel.WIDGET_END,
        widgetId,
      });
    }
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

  REMOVE_CLIPBOARD_HISTORY_ITEM: toProcess(
    async ({ child }, { channel, value }) => {
      log.verbose(channel, value);

      await removeFromClipboardHistory(value);

      childSend(child, { channel });
    }
  ),

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

    sendToPrompt(Channel.HIDE_APP);

    kitState.hiddenByUser = true;
    log.info(`😳 Hiding app`);

    const handler = () => {
      log.info(`🫣 App hidden`);

      if (!child?.killed) {
        childSend(child, {
          channel,
        });
      }
    };

    if (isVisible()) {
      onHideOnce(handler);
    } else {
      handler();
    }

    hideAppIfNoWindows(HideReason.User);
  }),

  QUIT_APP: toProcess(async ({ child }, { channel, value }) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    forceQuit();
  }),
  SET_KIT_STATE: toProcess(async (processInfo, data) => {
    log.info(`SET_KIT_STATE`, data?.value);
    for (const [key, value] of Object.entries(data?.value)) {
      if ((kitState as any)?.[key] !== undefined) {
        log.info(`Setting kitState.${key} to ${value}`);
        (kitState as any)[key] = value;
      }
    }
  }),
  DEBUG_SCRIPT: toProcess(async (processInfo, data: any) => {
    await sponsorCheck('Debugging Scripts');
    if (!kitState.isSponsor) return;

    kitState.debugging = true;
    processes.removeByPid(processInfo.child?.pid);

    log.info(`DEBUG_SCRIPT`, data?.value?.filePath);
    trackEvent(TrackEvent.DebugScript, {
      scriptName: path.basename(data?.value?.filePath || ''),
    });

    sendToPrompt(Channel.START, data?.value?.filePath);
    sendToPrompt(Channel.SET_PROMPT_DATA, {
      ui: UI.debugger,
    });

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
  VALUE_SUBMITTED: toProcess(async (processInfo, data: any) => {
    // log.info(`VALUE_SUBMITTED`, data?.value);
    clearSearch();
  }),
  SET_SCRIPT: toProcess(async (processInfo: ProcessInfo, data) => {
    if (processInfo.type === ProcessType.Prompt) {
      processInfo.scriptPath = data.value?.filePath;

      if (processInfo.child.stdout && processInfo.child.stderr) {
        const scriptLog = getLog(processInfo.scriptPath);
        processInfo.child.stdout.removeAllListeners();
        processInfo.child.stderr.removeAllListeners();

        const routeToScriptLog = (d: any) => {
          if (processInfo?.child?.killed) return;
          if (data?.value?.verbose) {
            const result = d.toString();
            scriptLog.info(`\n${stripAnsi(result)}`);
          }
        };

        processInfo.child.stdout?.on('data', routeToScriptLog);
        processInfo.child.stdout?.on('error', routeToScriptLog);

        processInfo.child.stderr?.on('data', routeToScriptLog);
        processInfo.child.stderr?.on('error', routeToScriptLog);
      }

      const foundP = kitState.ps.find((p) => p.pid === processInfo.pid);
      if (foundP) {
        foundP.scriptPath = data.value?.filePath;
      }
    }
    await setScript(data.value, processInfo.pid);

    processInfo.child?.send({
      channel: Channel.SET_SCRIPT,
      value: data.value,
    });
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

  SET_BOUNDS: toProcess(async ({ child }, { channel, value }) => {
    setBounds(value);

    childSend(child, { channel });
  }),

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

  SET_PAUSE_RESIZE: toProcess(async ({ child }, { channel, value }) => {
    log.info(`⏸ Resize`, `${value ? 'paused' : 'resumed'}`);
    kitState.resizePaused = value;

    childSend(child, { channel });
  }),

  SET_INPUT: toProcess(async ({ child }, { channel, value }) => {
    // log.info(`💌 SET_INPUT to ${value}`);
    setInput(value);

    childSend(child, { channel, value });
  }),

  GET_INPUT: toProcess(async ({ child }, { channel }) => {
    sendToPrompt(Channel.GET_INPUT);
  }),

  EDITOR_GET_SELECTION: toProcess(async ({ child }, { channel }) => {
    sendToPrompt(Channel.EDITOR_GET_SELECTION);
  }),

  EDITOR_GET_CURSOR_OFFSET: toProcess(async ({ child }, { channel }) => {
    sendToPrompt(Channel.EDITOR_GET_CURSOR_OFFSET);
  }),

  EDITOR_SET_CODE_HINT: toProcess(async ({ child }, { channel }) => {
    sendToPrompt(Channel.EDITOR_SET_CODE_HINT);
  }),

  EDITOR_MOVE_CURSOR: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.EDITOR_MOVE_CURSOR, value);
  }),

  EDITOR_INSERT_TEXT: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.EDITOR_INSERT_TEXT, value);
  }),

  APPEND_INPUT: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.APPEND_INPUT, value);

    childSend(child, { channel, value });
  }),

  SCROLL_TO: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.SCROLL_TO, value);

    childSend(child, { channel, value });
  }),

  SET_PLACEHOLDER: (data) => {
    setPlaceholder(data.value);
  },

  SET_ENTER: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.SET_ENTER, value);
    childSend(child, { channel });
  }),

  SET_FOOTER: (data) => {
    setFooter(data.value);
  },

  SET_PANEL: toProcess(async ({ child }, { channel, value }) => {
    setPanel(value);
    childSend(child, { channel, value });
  }),

  SET_PREVIEW: (data) => {
    if (kitState.cachePreview) {
      cachePreview(kitState.scriptPath, data.value);
      kitState.cachePreview = false;
    }
    setPreview(data.value);
  },

  SET_SHORTCUTS: toProcess(async ({ child }, { channel, value }) => {
    setShortcuts(value);

    // TOOD: Consider caching shortcuts
    // const cachePath = getCachePath(kitState.scriptPath, 'shortcuts');

    // ensureDir(path.dirname(cachePath))
    //   .then((success) => {
    //     // eslint-disable-next-line promise/no-nesting
    //     return writeJson(cachePath, value).catch((error) => {
    //       log.warn({ error });
    //       return error;
    //     });
    //   })
    //   .catch((error) => {
    //     log.warn({ error });
    //   });

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
      await sponsorCheck('Log Window');
      if (!kitState.isSponsor) return;
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
    kitState.scriptPathChanged = false;
    kitState.promptScriptPath = value?.scriptPath || '';
    kitState.hideOnEscape = Boolean(value?.hideOnEscape);

    if (typeof value?.keyword === 'string') {
      kitSearch.keywords.clear();
      kitSearch.input = '';
      kitSearch.keyword = value?.keyword;
    }

    if (value?.ui === UI.mic) {
      appToPrompt(AppChannel.SET_MIC_CONFIG, {
        timeSlice: value?.timeSlice || 200,
        format: value?.format || 'webm',
      });
    }
    // log.silly(`SET_PROMPT_DATA`);

    // if (value?.ui === UI.term) {
    //   kitState.termCommand = value?.input || ''
    //   kitState.termCwd = value?.cwd || ''
    //   kitState.termEnv = value?.env || {}
    // }

    if (kitSearch.keyword) {
      value.input = `${kitSearch.keyword} `;
    } else if (value.input && kitState.promptCount < 2) {
      kitSearch.input = value.input;
    }

    setPromptData(value);
    kitState.isScripts = Boolean(value?.scripts);

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
    log.info(`SET_CHOICES preloaded ${kitState.preloaded ? 'true' : 'false'}`);
    if (![UI.arg, UI.hotkey].includes(kitState.ui)) {
      log.info(`⛔️ UI changed before choices sent. Skipping SET_CHOICES`);

      if (child) {
        childSend(child, {
          channel,
        });
      }
      return;
    }
    if (kitState.scriptPathChanged) {
      log.info(
        `⛔️ Script path changed, but new prompt not set. Skipping SET_CHOICES`
      );

      if (child) {
        childSend(child, {
          channel,
        });
      }
      return;
    }

    const { choices, skipInitialSearch, inputRegex, generated } = value;

    // log.info({
    //   skipInitialSearch: Boolean(skipInitialSearch) ? 'true' : 'false',
    //   inputRegex: Boolean(inputRegex) ? 'true' : 'false',
    //   generated: Boolean(generated) ? 'true' : 'false',
    // });

    kitSearch.inputRegex = inputRegex
      ? new RegExp(inputRegex, 'gi')
      : undefined;

    let formattedChoices = choices;
    if (kitState.isScripts) {
      formattedChoices = formatScriptChoices(choices);
    }

    setChoices(formattedChoices, {
      preload: false,
      skipInitialSearch,
      generated: Boolean(generated),
    });

    if (child) {
      childSend(child, {
        channel,
      });
    }

    if (kitState.cacheChoices && !kitState.preloaded) {
      kitState.cacheChoices = false;

      cacheChoices(kitState.scriptPath, formattedChoices);
    }
  }),

  APPEND_CHOICES: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.APPEND_CHOICES, value);

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
    setPromptAlwaysOnTop(value as boolean);

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

  SET_EDITOR_CONFIG: toProcess(async ({ child }, { channel, value }) => {
    setChoices([], {
      preload: false,
      skipInitialSearch: true,
    });
    sendToPrompt(Channel.SET_EDITOR_CONFIG, value);

    childSend(child, {
      channel,
      value,
    });
  }),

  SET_EDITOR_SUGGESTIONS: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.SET_EDITOR_SUGGESTIONS, value);

    childSend(child, {
      channel,
      value,
    });
  }),

  APPEND_EDITOR_VALUE: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.APPEND_EDITOR_VALUE, value);
  }),

  SET_TEXTAREA_CONFIG: (data) => {
    sendToPrompt(Channel.SET_TEXTAREA_CONFIG, data.value);
  },

  SET_THEME: toProcess(async ({ child }, { channel, value }) => {
    await setTheme(value);

    if (child) {
      childSend(child, {
        channel,
        value,
      });
    }
  }),

  SET_TEMP_THEME: toProcess(async ({ child }, { channel, value }) => {
    const newValue = await maybeConvertColors(value);
    sendToPrompt(Channel.SET_TEMP_THEME, newValue);
    // TOOD: https://github.com/electron/electron/issues/37705
    // const backgroundColor = `rgba(${newValue['--color-background']}, ${newValue['--opacity']})`;
    // log.info(`🎨 Setting backgroundColor: ${backgroundColor}`);

    // getMainPrompt().setBackgroundColor(backgroundColor);
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
    log.info(`🇺🇸 Set flags ${Object.keys(data?.value).length}`);
    sendToPrompt(Channel.SET_FLAGS, data.value);
    setFlags(data.value);
  },
  SET_FLAG_VALUE: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.SET_FLAG_VALUE, value);
    childSend(child, { channel, value });
  }),
  SET_NAME: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.SET_NAME, value);
    childSend(child, { channel, value });
  }),
  SET_DESCRIPTION: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.SET_DESCRIPTION, value);
    childSend(child, { channel, value });
  }),
  SET_FOCUSED: (data) => {
    sendToPrompt(Channel.SET_FOCUSED, data.value);
  },
  SET_TEXTAREA_VALUE: (data) => {
    sendToPrompt(Channel.SET_TEXTAREA_VALUE, data.value);
  },
  SET_LOADING: (data) => {
    // log.info(`🏃 setLoading`, { data });
    sendToPrompt(Channel.SET_LOADING, data.value);
  },
  SET_RUNNING: (data) => {
    // log.info(`🏃‍♂️ setRunning`, { data });
    sendToPrompt(Channel.SET_RUNNING, data.value);
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
  PREVENT_SUBMIT: (data) => {
    sendToPrompt(Channel.PREVENT_SUBMIT, data.value);
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

  GET_APP_STATE: toProcess(async ({ child }, { channel, value }) => {
    childSend(child, {
      channel,
      value: snapshot(kitState),
    });
  }),

  TERMINAL: (data) => {
    sendToPrompt(Channel.TERMINAL, data.value);
  },
  CLIPBOARD_READ_TEXT: toProcess(async ({ child }, { channel, value }) => {
    const text = await clipboard.readText();
    childSend(child, {
      channel,
      value: text,
    });
  }),

  CLIPBOARD_READ_IMAGE: toProcess(async ({ child }, { channel, value }) => {
    const image = clipboard.readImage();
    // write image to a tmp file path with a uuid name
    const tmpPath = path.join(os.tmpdir(), `kit-${randomUUID()}.png`);
    await writeFile(tmpPath, image.toPNG());

    childSend(child, {
      channel,
      value: tmpPath,
    });
  }),
  CLIPBOARD_READ_RTF: toProcess(async ({ child }, { channel, value }) => {
    const rtf = await clipboard.readRTF();
    childSend(child, {
      channel,
      value: rtf,
    });
  }),
  CLIPBOARD_READ_HTML: toProcess(async ({ child }, { channel, value }) => {
    const html = await clipboard.readHTML();
    childSend(child, {
      channel,
      value: html,
    });
  }),
  CLIPBOARD_READ_BOOKMARK: toProcess(async ({ child }, { channel, value }) => {
    const bookmark = await clipboard.readBookmark();
    childSend(child, {
      channel,
      value: bookmark,
    });
  }),
  CLIPBOARD_READ_FIND_TEXT: toProcess(async ({ child }, { channel, value }) => {
    const findText = await clipboard.readFindText();
    childSend(child, {
      channel,
      value: findText,
    });
  }),

  CLIPBOARD_WRITE_TEXT: toProcess(async ({ child }, { channel, value }) => {
    await clipboard.writeText(value);
    childSend(child, {
      channel,
      value,
    });
  }),
  CLIPBOARD_WRITE_IMAGE: toProcess(async ({ child }, { channel, value }) => {
    const image = nativeImage.createFromPath(value);
    await clipboard.writeImage(image);
    childSend(child, {
      channel,
      value,
    });
  }),
  CLIPBOARD_WRITE_RTF: toProcess(async ({ child }, { channel, value }) => {
    await clipboard.writeRTF(value);
    childSend(child, {
      channel,
      value,
    });
  }),
  CLIPBOARD_WRITE_HTML: toProcess(async ({ child }, { channel, value }) => {
    await clipboard.writeHTML(value);
    childSend(child, {
      channel,
      value,
    });
  }),

  CLIPBOARD_WRITE_BOOKMARK: toProcess(async ({ child }, { channel, value }) => {
    await clipboard.writeBookmark(value.title, value.url);
    childSend(child, {
      channel,
      value,
    });
  }),
  CLIPBOARD_WRITE_FIND_TEXT: toProcess(
    async ({ child }, { channel, value }) => {
      await clipboard.writeFindText(value);
      childSend(child, {
        channel,
        value,
      });
    }
  ),
  CLIPBOARD_CLEAR: toProcess(async ({ child }, { channel, value }) => {
    await clipboard.clear();
    childSend(child, {
      channel,
      value,
    });
  }),

  REGISTER_GLOBAL_SHORTCUT: toProcess(
    async ({ child, scriptPath }, { channel, value }) => {
      const properShortcut = convertShortcut(value, scriptPath);
      log.info(
        `App: registering global shortcut ${value} as ${properShortcut}`
      );
      const result = globalShortcut.register(properShortcut, async () => {
        kitState.shortcutPressed = properShortcut;
        log.info(
          `Global shortcut: Sending ${value} on ${Channel.GLOBAL_SHORTCUT_PRESSED}`
        );
        childSend(child, {
          channel: Channel.GLOBAL_SHORTCUT_PRESSED,
          value,
        });
      });

      log.info(`Shortcut ${value}: ${result ? 'success' : 'failure'}}`);

      if (result) {
        if (!childShortcutMap.has(child)) {
          childShortcutMap.set(child, [properShortcut]);
        } else {
          childShortcutMap.get(child)?.push(properShortcut);
        }

        childSend(child, {
          channel,
          value,
        });
      } else {
        log.error(
          `😅 Kit.app: Global shortcut: ${value} as ${properShortcut} failed to register`
        );
        const infoScript = kitPath('cli', 'info.js');
        const markdown = `# Failed to register global shortcut: ${value}`;
        emitter.emit(KitEvent.RunPromptProcess, {
          scriptPath: infoScript,
          args: [path.basename(scriptPath), value, markdown],
          options: {
            force: true,
            trigger: Trigger.App,
          },
        });

        childSend(child, {
          channel,
          value: false,
        });
      }
    }
  ),

  UNREGISTER_GLOBAL_SHORTCUT: toProcess(
    async ({ child, scriptPath }, { channel, value }) => {
      log.info(`App: unregistering global shortcut ${value}`);

      const properShortcut = convertShortcut(value, scriptPath);
      if (childShortcutMap.has(child)) {
        const shortcuts = childShortcutMap.get(child);
        const index = shortcuts?.indexOf(value);
        if (index !== -1) {
          shortcuts?.splice(index, 1);
        }
        if (shortcuts?.length === 0) {
          childShortcutMap.delete(child);
        }
      }

      globalShortcut.unregister(properShortcut);
      childSend(child, {
        channel,
        value,
      });
    }
  ),

  KEYBOARD_TYPE: toProcess(async ({ child }, { channel, value }) => {
    if (!kitState.supportsNut) {
      log.warn(
        `Keyboard type: Nut not supported on Windows arm64 or Linux arm64. Hoping to find a solution soon!`
      );
      return;
    }

    // REMOVE-NUT
    const { keyboard, Key } = await import('@nut-tree/nut-js');
    if (kitState.shortcutPressed) {
      // Get the modifiers from the accelerator
      const modifiers = kitState.shortcutPressed.split('+');
      // Remove the last item, which is the key
      const mainKey: any = modifiers.pop() || '';

      log.info(`Pressing ${mainKey}`);

      if (Key?.[mainKey]) {
        log.info(`Releasing ${mainKey}`);
        await keyboard.releaseKey(Key[mainKey] as any);
      }
    }

    //   modifiers.forEach(async (modifier) => {
    //     log.info(`Releasing ${modifier}`);
    //     if (modifier === 'Control')
    //       await keyboard.releaseKey(Key.LeftControl, Key.RightControl);

    //     if (modifier === 'Command')
    //       await keyboard.releaseKey(Key.LeftSuper, Key.RightSuper);

    //     if (modifier === 'Alt' || modifier === 'Option')
    //       await keyboard.releaseKey(Key.LeftAlt, Key.RightAlt);

    //     if (modifier === 'Shift')
    //       await keyboard.releaseKey(Key.LeftShift, Key.RightShift);
    //   });
    // }
    if (!kitState.authorized) kitState.notifyAuthFail = true;
    log.info(`${channel}: ${typeof value} ${value}`, {
      isArray: Array.isArray(value),
    });
    log.info(`${channel}: ${[...value]}`);
    const firstItem = value?.[0];
    log.info({ type: typeof firstItem, firstItem });
    keyboard.config.autoDelayMs = kitState?.keyboardConfig?.autoDelayMs || 0;
    kitState.isTyping = true;

    try {
      for await (const k of typeof firstItem === 'string'
        ? firstItem.split('')
        : value) {
        if (!kitState.cancelTyping) await keyboard.type(k);
      }
    } catch (error) {
      log.error(`KEYBOARD ERROR TYPE`, error);
    }

    setTimeout(() => {
      kitState.snippet = '';
      kitState.isTyping = false;
      kitState.cancelTyping = false;
      keyboard.config.autoDelayMs = 0;
      childSend(child, {
        channel,
      });
    }, value.length);

    // END-REMOVE-NUT
  }),

  KEYBOARD_PRESS_KEY: toProcess(async ({ child }, { channel, value }) => {
    if (!kitState.supportsNut) {
      log.warn(
        `Keyboard type: Nut not supported on Windows arm64 or Linux arm64. Hoping to find a solution soon!`
      );
      return;
    }
    // REMOVE-NUT
    const { keyboard } = await import('@nut-tree/nut-js');

    if (!kitState.authorized) kitState.notifyAuthFail = true;
    log.info(`PRESSING KEY`, { value });
    await keyboard.pressKey(...(value as any));

    childSend(child, {
      channel,
      value,
    });

    // END-REMOVE-NUT
  }),

  KEYBOARD_RELEASE_KEY: toProcess(async ({ child }, { channel, value }) => {
    if (!kitState.supportsNut) {
      log.warn(
        `Keyboard type: Nut not supported on Windows arm64 or Linux arm64. Hoping to find a solution soon!`
      );
      return;
    }

    // REMOVE-NUT
    const { keyboard, Key } = await import('@nut-tree/nut-js');

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });

    await keyboard.releaseKey(...(value as any));

    childSend(child, {
      channel,
      value,
    });

    // END-REMOVE-NUT
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
      kitState.keyboardConfig = data.value;
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
      // REMOVE-MAC
      const { getAuthStatus, askForFullDiskAccess } = await import(
        'node-mac-permissions'
      );
      const authStatus = getAuthStatus('full-disk-access');
      if (authStatus === 'authorized') {
        value = true;
      } else {
        askForFullDiskAccess();
      }
      // END-REMOVE-MAC
    }

    childSend(child, { channel, value });
  }),

  SET_SELECTED_TEXT: toProcess(async ({ child }, { channel, value }) => {
    if (!kitState.supportsNut) {
      log.warn(
        `SET_SELECTED_TEXT: Nut not supported on Windows arm64 or Linux arm64. Hoping to find a solution soon!`
      );
      return;
    }

    // REMOVE-NUT
    const { keyboard, Key } = await import('@nut-tree/nut-js');

    const text = value?.text;
    const hide = value?.hide;

    if (hide && kitState.isMac && app?.dock && app?.dock?.isVisible()) {
      app?.dock?.hide();
    }

    // log.info(`SET SELECTED TEXT`, text);
    clipboard.writeText(text);

    const modifier = kitState.isMac ? Key.LeftSuper : Key.LeftControl;
    await keyboard.pressKey(modifier, Key.V);
    await keyboard.releaseKey(modifier, Key.V);
    setTimeout(() => {
      kitState.snippet = '';
      childSend(child, { channel, value });
      // log.info(`SET SELECTED TEXT DONE`, text);
    }, 10);

    // END-REMOVE-NUT
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
  PLAY_AUDIO: toProcess(async ({ child }, { channel, value }: any) => {
    try {
      log.info(`🔊 Playing ${value?.filePath || value}`);
    } catch (error) {
      log.error(`🔊 Error playing ${value}`, error);
    }
    sendToPrompt(Channel.PLAY_AUDIO, value);
    // childSend(child, { channel, value });
  }),
  STOP_AUDIO: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(Channel.STOP_AUDIO, value);
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
  PRO_STATUS: toProcess(async ({ child }, { channel, value }) => {
    const isSponsor = await sponsorCheck('Check Status', false);
    log.info(`PRO STATUS`, JSON.stringify({ isSponsor }));
    childSend(child, {
      channel,
      value: isSponsor,
    });
  }),
  OPEN_MENU: toProcess(async ({ child }, { channel, value }) => {
    emitter.emit(KitEvent.TrayClick);
    childSend(child, { channel, value });
  }),
  OPEN_DEV_TOOLS: toProcess(async ({ child }, { channel, value }) => {
    const prompt = getMainPrompt();
    if (prompt) {
      prompt.webContents.openDevTools();
    }
    childSend(child, { channel, value });
  }),
  START_DRAG: toProcess(async ({ child }, { channel, value }) => {
    const prompt = getMainPrompt();
    if (prompt) {
      try {
        prompt.webContents.startDrag({
          file: value?.filePath,
          icon: value?.iconPath || getAssetPath('icons8-file-50.png'),
        });
      } catch (error) {
        log.error(`Error starting drag`, error);
      }
    }
    childSend(child, { channel, value });
  }),
  GET_COLOR: toProcess(async ({ child }, { channel }) => {
    sendToPrompt(Channel.GET_COLOR);
  }),
  CHAT_GET_MESSAGES: toProcess(async ({ child }, { channel, value }) => {
    getFromPrompt(child, channel, value);
  }),
  CHAT_SET_MESSAGES: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(channel, value);

    childSend(child, { channel, value });
  }),
  CHAT_ADD_MESSAGE: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(channel, value);

    childSend(child, { channel, value });
  }),
  CHAT_PUSH_TOKEN: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(channel, value);

    childSend(child, { channel, value });
  }),
  CHAT_SET_MESSAGE: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(channel, value);

    childSend(child, { channel, value });
  }),
  TOAST: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(channel, value);

    childSend(child, { channel, value });
  }),
  TERM_EXIT: toProcess(async ({ child }, { channel, value }) => {
    log.info(`TERM EXIT FROM SCRIPT`, value);
    sendToPrompt(channel, kitState.promptId);

    childSend(child, { channel, value });
  }),
  GET_DEVICES: toProcess(async ({ child }, { channel, value }) => {
    sendToPrompt(channel, value);
  }),
  SHEBANG: toProcess(async ({ child }, { channel, value }) => {
    spawnShebang(value);

    childSend(child, { channel, value });
  }),
  GET_TYPED_TEXT: toProcess(async ({ child }, { channel, value }) => {
    childSend(child, { channel, value: kitState.typedText });
  }),
  TERM_WRITE: toProcess(async ({ child }, { channel, value }) => {
    emitter.emit(KitEvent.TermWrite, value);
    childSend(child, { channel, value });
  }),
  SET_FORM_DATA: toProcess(async ({ child }, { channel, value }) => {
    log.info(`SET FORM DATA`, value);
    sendToPrompt(channel, value);
    childSend(child, { channel, value });
  }),
  SET_DISABLE_SUBMIT: toProcess(async ({ child }, { channel, value }) => {
    log.info(`SET DISABLE SUBMIT`, value);
    sendToPrompt(channel, value);
    childSend(child, { channel, value });
  }),
  START_MIC: toProcess(async ({ child }, { channel, value }) => {
    log.info(`START MIC`, value);
    sendToPrompt(channel, value);
    // childSend(child, { channel, value });
  }),
  STOP_MIC: toProcess(async ({ child }, { channel, value }) => {
    log.info(`STOP MIC`, value);
    sendToPrompt(channel, value);
    childSend(child, { channel, value });
  }),
  TRASH: toProcess(async ({ child }, { channel, value }) => {
    for await (const item of value) {
      log.info(`🗑 Trashing`, item);
      await shell.trashItem(item);
    }

    childSend(child, { channel, value });
  }),
  SET_SCORED_CHOICES: toProcess(async ({ child }, { channel, value }) => {
    log.verbose(`SET SCORED CHOICES`);
    sendToPrompt(channel, value);
    childSend(child, { channel, value });
  }),
  PRELOAD: toProcess(async ({ child }, { channel, value }) => {
    preload(value);
    childSend(child, { channel, value });
  }),
  CLEAR_TIMESTAMPS: toProcess(async ({ child }, { channel, value }) => {
    const stampDb = await getTimestamps();
    stampDb.stamps = [];
    await stampDb.write();

    log.verbose(`CLEAR TIMESTAMPS`);

    childSend(child, { channel, value });
  }),
  REMOVE_TIMESTAMP: toProcess(async ({ child }, { channel, value }) => {
    log.verbose(`REMOVE TIMESTAMP for ${value}`);

    const stampDb = await getTimestamps();
    const stamp = stampDb.stamps.findIndex((s) => s.filePath === value);

    stampDb.stamps.splice(stamp, 1);
    await stampDb.write();

    childSend(child, { channel, value });
  }),
  TOGGLE_WATCHER: toProcess(async ({ child }, { channel, value }) => {
    kitState.clipboardWatcherEnabled = !kitState.clipboardWatcherEnabled;

    log.verbose(
      `👀 Toggling watcher`,
      kitState.clipboardWatcherEnabled ? 'ON' : 'OFF'
    );
    childSend(child, { channel, value });
  }),
  SET_SELECTED_CHOICES: toProcess(async ({ child }, { channel, value }) => {
    log.verbose(`SET SELECTED CHOICES`);
    sendToPrompt(channel, value);
    childSend(child, { channel, value });
  }),

  TOGGLE_ALL_SELECTED_CHOICES: toProcess(
    async ({ child }, { channel, value }) => {
      log.verbose(`TOGGLE ALL SELECTED CHOICES`);
      sendToPrompt(channel, value);
      childSend(child, { channel, value });
    }
  ),
};

export const createMessageHandler =
  (type: ProcessType) => async (data: GenericSendData) => {
    if (!data.kitScript) log.info(data);

    if (kitMessageMap[data.channel]) {
      type C = keyof ChannelMap;
      log.silly(`➡ ${data.channel}`);
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

  const PATH = KIT_FIRST_PATH + path.delimiter + process?.env?.PATH;

  const env = {
    ...process.env,
    NODE_NO_WARNINGS: '1',
    KIT_CONTEXT: 'app',
    KIT_MAIN: scriptPath,
    KENV: kenvPath(),
    KIT: kitPath(), // Note: KIT is overwritten by the kenv env in the "app-prompt.js" to load from ~/.kenv/node_modules
    KIT_DOTENV_PATH: kitDotEnvPath(),
    KIT_APP_VERSION: getVersion(),
    PROCESS_TYPE: type,
    FORCE_COLOR: '1',
    PATH,
    KIT_APP_PATH: app.getAppPath(),
    ...kitState.kenvEnv,
  };
  // console.log({ env });
  const loaderFileUrl = pathToFileURL(kitPath('build', 'loader.js')).href;
  const isWin = os.platform().startsWith('win');
  const child = fork(entry, args, {
    silent: true,
    stdio: 'pipe',
    execPath,
    cwd: os.homedir(),
    execArgv: [`--experimental-loader`, loaderFileUrl],
    env: {
      ...env,
      KIT_DEBUG: port ? '1' : '0',
    },
    ...(port
      ? {
          stdio: 'pipe',
          execArgv: [
            `--experimental-loader`,
            loaderFileUrl,
            `--inspect=${port}`,
          ],
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
        kitState.ignoreBlur = true;
        setPromptAlwaysOnTop(true);
        log.info({ debugUrl });
        const devToolsUrl = `devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=${debugUrl}`;
        log.info(`DevTools URL: ${devToolsUrl}`);

        win = showInspector(devToolsUrl);
        setTimeout(() => {
          win?.setAlwaysOnTop(false);
        }, 500);

        win.on('close', () => {
          if (child && !child.killed) child?.kill();
          maybeHide(HideReason.DebuggerClosed);
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
  appToPrompt(AppChannel.PROCESSES, pinfos);
}, 10);

export const clearIdleProcesses = () => {
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
        processInfo?.scriptPath === ''
    );
};

export const ensureIdleProcess = () => {
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

class Processes extends Array<ProcessInfo> {
  public abandonnedProcesses: ProcessInfo[] = [];

  public getAllProcessInfo() {
    return this.map(({ scriptPath, type, pid }) => ({
      type,
      scriptPath,
      pid,
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
    kitState.addP(info);
    processesChanged();
  }

  public add(
    type: ProcessType = ProcessType.Prompt,
    scriptPath = '',
    args: string[] = [],
    port = 0,
    { resolve, reject }: ProcessHandlers = {}
  ): ProcessInfo {
    const child = createChild({
      type,
      scriptPath,
      runArgs: args,
      port,
    });

    log.info(`👶 Create child ${type} process: ${child.pid}`, scriptPath, args);
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
        emitter.emit(KitEvent.TERM_KILL, kitState.promptId);
      }

      const processInfo = processes.getByPid(pid) as ProcessInfo;
      emitter.emit(KitEvent.RemoveProcess, processInfo.scriptPath);

      if (!processInfo) return;

      if (resolve) {
        resolve(processInfo?.values);
      }

      if (code === 0) {
        log.info(
          `${child.pid}: 🟡 exit ${code}. ${processInfo.type} process: ${processInfo?.scriptPath}`
        );

        if (
          processInfo.type === ProcessType.Prompt &&
          !processInfo.scriptPath.includes('.kit')
        ) {
          const stamp = {
            filePath: processInfo?.scriptPath,
            runCount: 1,
            executionTime: Date.now() - processInfo.date,
          };
          log.info(`💮 Stamping:`, stamp);
          if (kitState.mainMenuHasRun) {
            setScriptTimestamp(stamp);
          }
        }
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
      if (error?.message?.includes('EPIPE')) return;
      log.error(`ERROR`, { pid, error });
      log.error(
        `👋 Ask for help: https://github.com/johnlindquist/kit/discussions/categories/errors`
      );
      kitState.status = {
        status: 'warn',
        message: ``,
      };

      setTrayScriptError(pid);

      trackEvent(TrackEvent.ChildError, {
        error: error?.message,
      });
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

    ensureIdleProcess();

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
    if (kitState?.pid === pid) {
      kitState.scriptPath = '';
      kitState.promptId = '';
      kitState.promptCount = 0;
    }

    if (this.find((i) => i.pid === pid)) {
      this.splice(index, 1);
      kitState.removeP(pid);

      processesChanged();
    }
  }

  public removeCurrentProcess() {
    const info = this.find(
      (processInfo) =>
        processInfo.scriptPath === kitState.scriptPath &&
        processInfo.type === ProcessType.Prompt
    );
    if (info) {
      this.removeByPid(info.pid);
    }
  }
}

export const processes = new Processes();

export const removeAbandonnedKit = () => {
  const kitProcess = processes.find((processInfo) =>
    isKitScript(processInfo.scriptPath)
  );

  if (kitProcess) {
    setTimeout(() => {
      log.info(`🛑 Cancel main menu process: ${kitProcess.scriptPath}`);
      processes.removeByPid(kitProcess.pid);
    }, 250);
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
    log.info(`🔽 mouseDown ${widgetId}`);

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
      channel: Channel.WIDGET_MOUSE_DOWN,
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

    const options = widgetState.widgets.find(({ id }) => id === widgetId);
    if (!options) return;

    const { wid, ignoreMeasure, pid } = options;
    const widget = BrowserWindow.fromId(wid);
    const { child } = processes.getByPid(pid) as ProcessInfo;
    if (!child || !widget || ignoreMeasure) return;

    widget.setSize(data.width, data.height, true);
  };

  ipcMain.on(Channel.WIDGET_CLICK, clickHandler);
  ipcMain.on(Channel.WIDGET_DROP, dropHandler);
  ipcMain.on(Channel.WIDGET_MOUSE_DOWN, mouseDownHandler);
  ipcMain.on(Channel.WIDGET_INPUT, inputHandler);
  ipcMain.on(Channel.WIDGET_DRAG_START, dragHandler);
  ipcMain.on(Channel.WIDGET_CUSTOM, customHandler);
  ipcMain.on('WIDGET_MEASURE', measureHandler);
};

emitter.on(KitEvent.KillProcess, (pid) => {
  log.info(`🛑 Kill Process: ${pid}`);
  processes.removeByPid(pid);
});

emitter.on(KitEvent.TermExited, (pid) => {
  log.info(`🛑 Term Exited: SUMBMITTING`);
  if (kitState.ui === UI.term) {
    sendToPrompt(AppChannel.TERM_EXIT, '');
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
    `🚀 Spawned process ${child.pid} for ${filePath} with command ${command}`
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
    });
  }
};

emitter.on(
  KitEvent.RemoveMostRecent,
  processes.removeCurrentProcess.bind(processes)
);
// emitter.on(KitEvent.MainScript, () => {
//   sendToPrompt(Channel.SET_DESCRIPTION, 'Run Script');
//   const scripts = getScriptsSnapshot();
//   log.verbose({ scripts });
//   setChoices(formatScriptChoices(scripts));
// });

emitter.on(KitEvent.DID_FINISH_LOAD, () => {
  try {
    const envData = dotenv.parse(readFileSync(kenvPath('.env')));
    kitState.kenvEnv = envData;
  } catch (error) {
    log.warn(`Error reading kenv env`, error);
  }

  updateTheme();
});

subscribeKey(kitState, 'kenvEnv', (kenvEnv) => {
  if (Object.keys(kenvEnv).length === 0) return;
  if (processes.getAllProcessInfo().length === 0) return;
  clearIdleProcesses();
  ensureIdleProcess();
});

subscribe(appDb, (db) => {
  log.info(`👩‍💻 Reading app.json`, { ...appDb });
  sendToPrompt(Channel.APP_DB, { ...appDb });
});

subscribeKey(
  kitState,
  'scriptPath',
  debounce(() => {
    if (kitState.scriptPath === '') {
      if (kitState.allowQuit) return;
      const mains = processes.filter((p) =>
        pathsAreEqual(p.scriptPath, mainScriptPath)
      );

      mains.forEach((p) => {
        log.info(`Killing stray main process ${p.pid}`);
        if (kitState.pid !== p.pid) {
          p.child.kill();
        }
      });
    }
  }, 250)
);
