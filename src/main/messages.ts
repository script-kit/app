import log from 'electron-log';
import url, { pathToFileURL } from 'url';
import { randomUUID } from 'crypto';
import detect from 'detect-port';
import sizeOf from 'image-size';
import untildify from 'untildify';
// REMOVE-MAC
import nmp from 'node-mac-permissions';
const { askForAccessibilityAccess, getAuthStatus, askForFullDiskAccess } = nmp;
// END-REMOVE-MAC

import {
  app,
  clipboard,
  screen,
  Notification,
  nativeImage,
  BrowserWindow,
  dialog,
  shell,
  globalShortcut,
} from 'electron';
import os from 'os';
import { remove } from 'lodash-es';
import { snapshot, subscribe } from 'valtio';
import path from 'path';
import http from 'http';
import https from 'https';
import { writeFile } from 'fs/promises';
import { Channel, ProcessType, Value, UI } from '@johnlindquist/kit/core/enum';
import { Choice, ProcessInfo, Script } from '@johnlindquist/kit/types/core';

import { ChannelMap, SendData } from '@johnlindquist/kit/types/kitapp';

import { kitPath, getMainScriptPath } from '@johnlindquist/kit/core/utils';

import fsExtra from 'fs-extra';
const { pathExistsSync, readJson } = fsExtra;
import { getTimestamps } from '@johnlindquist/kit/core/db';
import { getLog, Logger, warn } from './logs';
import { clearPromptCache, attemptPreload } from './prompt';
import {
  getBackgroundTasks,
  getSchedule,
  kitState,
  kitConfig,
  forceQuit,
  sponsorCheck,
  kitStore,
  preloadChoicesMap,
} from '../shared/state';

import { widgetState, findWidget } from '../shared/widget';

import { createSendToChild } from './channel';
import { setFlags, setChoices, invokeSearch } from './search';

import { emitter, KitEvent } from '../shared/events';
import { show, showDevTools, showWidget } from './show';

import {
  getClipboardHistory,
  removeFromClipboardHistory,
  syncClipboardStore,
} from './clipboard';
import { getTray, getTrayIcon, setTrayMenu } from './tray';
import { AppChannel, HideReason, Trigger } from '../shared/enums';
import { convertShortcut } from './helpers';
import { deleteText } from './keyboard';
import { showLogWindow } from './window';
import { stripAnsi } from './ansi';
import { darkTheme, lightTheme } from '../shared/themes';
import { getAssetPath } from '../shared/assets';
import { TrackEvent, trackEvent } from './track';
import {
  cachePreview,
  childSend,
  clearFlags,
  clearPreview,
  ProcessAndPrompt,
  processes,
} from './process';
import { format, formatDistanceToNowStrict } from 'date-fns';

export type ChannelHandler = {
  [key in keyof ChannelMap]: (data: SendData<key>) => void;
};

export const cacheChoices = async (scriptPath: string, choices: Choice[]) => {
  log.info(`🎁 Caching choices for ${scriptPath}: Choices ${choices?.length}`);
  if (Array.isArray(choices)) {
    preloadChoicesMap.set(scriptPath, choices);
  }
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

export const createMessageMap = (info: ProcessAndPrompt) => {
  let resetting = false;

  const { prompt, scriptPath } = info;
  const sendToPrompt = prompt.sendToPrompt;
  const setLog = (value) => sendToPrompt(Channel.SET_LOG, value);
  const childSend = createSendToChild(info);

  const handleChannelMessage = <K extends keyof ChannelMap>(
    data: SendData<K>,
    fn: (processInfo: ProcessAndPrompt, data: SendData<K>) => void,
    sendToChild?: boolean
  ) => {
    if (kitState.allowQuit)
      return warn(`⚠️  Tried to send data to ${data.channel} after quit`);

    log.info(`--> toProcess: ${data.channel}`);
    const processInfo = processes.getByPid(data?.pid);
    const isWidgetMessage = data.channel.includes('WIDGET');

    if (!processInfo) {
      return warn(
        `${data?.pid}: Can't find process associated with ${
          isWidgetMessage ? `widget` : `script`
        }`
      );
    }

    if (sendToChild) {
      childSend(data);
    }

    return fn(processInfo, data);
  };

  const onChildChannel =
    <K extends keyof ChannelMap>(
      fn: (processInfo: ProcessAndPrompt, data: SendData<K>) => void
    ) =>
    (data: SendData<K>) =>
      handleChannelMessage(data, fn, true);

  const onChildChannelOverride =
    <K extends keyof ChannelMap>(
      fn: (processInfo: ProcessAndPrompt, data: SendData<K>) => void
    ) =>
    (data: SendData<K>) =>
      handleChannelMessage(data, fn);

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
        prompt?.focusPrompt();
      });
    }
  };

  const kitMessageMap: ChannelHandler = {
    PONG: (data) => {},
    QUIT_AND_RELAUNCH: () => {
      log.info(`👋 Quitting and relaunching`);
      app.relaunch();
      app.exit();
    },
    ENABLE_ACCESSIBILITY: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        log.info(`👋 Enabling accessibility`);
        // REMOVE-MAC
        askForAccessibilityAccess();
        // END-REMOVE-MAC
      }
    ),

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

    GET_SCRIPTS_STATE: onChildChannelOverride(({ child }, { channel }) => {
      childSend({
        channel,
        schedule: getSchedule(),
        tasks: getBackgroundTasks(),
      });
    }),

    GET_SCHEDULE: onChildChannelOverride(({ child }, { channel }) => {
      childSend({ channel, schedule: getSchedule() });
    }),

    GET_BOUNDS: onChildChannelOverride(({ child }, { channel }) => {
      const bounds = prompt?.getPromptBounds();
      childSend({ channel, bounds });
    }),

    GET_BACKGROUND: onChildChannelOverride(({ child }, { channel }) => {
      childSend({ channel, tasks: getBackgroundTasks() });
    }),

    GET_CLIPBOARD_HISTORY: onChildChannelOverride(
      async ({ child }, { channel }) => {
        childSend({
          channel,
          history: await getClipboardHistory(),
        });
      }
    ),

    WIDGET_UPDATE: onChildChannel(({ child }, { channel, value }) => {
      const { widgetId } = value as any;
      const widget = BrowserWindow.fromId(widgetId);

      if (widget) {
        widget?.webContents.send(channel, value);
      } else {
        warn(`${widgetId}: widget not found. Killing process.`);
        child?.kill();
      }
    }),

    WIDGET_EXECUTE_JAVASCRIPT: onChildChannelOverride(
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

          childSend({
            channel,
            value: result,
          });
        } else {
          warn(`${widgetId}: widget not found. Killing process.`);
          child?.kill();
        }
      }
    ),

    WIDGET_SET_STATE: onChildChannelOverride(
      ({ child }, { channel, value }) => {
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
      }
    ),

    WIDGET_CALL: onChildChannel(({ child }, { channel, value }) => {
      const { widgetId, method, args } = value as any;

      const widget = findWidget(widgetId, channel);
      if (!widget) return;

      log.info(`📞 WIDGET_CALL`, widgetId, value, args);
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
    WIDGET_FIT: onChildChannel(({ child }, { channel, value }) => {
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

    WIDGET_SET_SIZE: onChildChannel(({ child }, { channel, value }) => {
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

    WIDGET_SET_POSITION: onChildChannel(({ child }, { value, channel }) => {
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

    WIDGET_GET: onChildChannelOverride(
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
        // const filePath = await createWidget(command, html, options, theme);
        kitState.blurredByKit = true;
        const widgetId = Date.now().toString();
        const widget = await showWidget(scriptPath, widgetId, html, options);
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
          childSend({
            channel: Channel.WIDGET_RESIZED,
            widgetId,
            ...widget.getBounds(),
          });
        });

        widget.on('moved', () => {
          childSend({
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
          prompt?.focusPrompt();

          childSend({
            channel: Channel.WIDGET_END,
            widgetId,
            ...w.getBounds(),
          });

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

        // TODO: Widget close logic?
        // const un = subscribe(kitState.ps, () => {
        //   if (!kitState.ps.find((p) => p.pid === child?.pid)) {
        //     try {
        //       closeHandler();
        //       un();
        //     } catch (error) {
        //       log.error(error);
        //     }
        //   }
        // });

        widget?.on('will-move', () => {
          log.verbose(`${widgetId}: 📦 widget will move`);
          const o = widgetState.widgets.find(({ id }) => id === widgetId);
          if (!o) return;
          o.moved = true;
        });

        childSend({
          channel,
          widgetId,
        });
      }
    ),

    WIDGET_END: onChildChannelOverride(({ child }, { value, channel }) => {
      const { widgetId } = value as any;
      const widget = findWidget(widgetId, channel);

      if (!widget) return;

      log.info(`${widgetId}: Widget closed`);
      prompt?.focusPrompt();

      widget.removeAllListeners();
      widget.destroy();

      remove(widgetState.widgets, ({ id }) => id === widgetId);

      if (child?.channel) {
        childSend({
          channel: Channel.WIDGET_END,
          widgetId,
        });
      }
    }),

    WIDGET_CAPTURE_PAGE: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        const { widgetId } = value as any;
        const widget = findWidget(widgetId, channel);
        const image = await widget?.capturePage();
        log.info(`Captured page for widget ${widgetId}`);

        if (image) {
          const imagePath = path.join(
            os.tmpdir(),
            `kit-widget-capture-${randomUUID()}.png`
          );
          log.info(`Captured page for widget ${widgetId} to ${imagePath}`);
          await writeFile(imagePath, image.toPNG());

          childSend({
            channel,
            imagePath,
          });
        } else {
          const imagePath = `⚠️ Failed to capture page for widget ${widgetId}`;
          childSend({
            channel,
            imagePath,
          });
          warn(imagePath);
        }
      }
    ),

    CLIPBOARD_SYNC_HISTORY: onChildChannel(({ child }, { channel, value }) => {
      log.verbose(channel);

      syncClipboardStore();
    }),

    REMOVE_CLIPBOARD_HISTORY_ITEM: onChildChannel(
      async ({ child }, { channel, value }) => {
        log.verbose(channel, value);

        await removeFromClipboardHistory(value);
      }
    ),

    TOGGLE_BACKGROUND: (data: any) => {
      emitter.emit(KitEvent.ToggleBackground, data);
    },

    GET_SCREEN_INFO: onChildChannelOverride(({ child }, { channel }) => {
      const cursor = screen.getCursorScreenPoint();
      // Get display with cursor
      const activeScreen = screen.getDisplayNearestPoint({
        x: cursor.x,
        y: cursor.y,
      });

      childSend({ channel, activeScreen });
    }),
    GET_SCREENS_INFO: onChildChannelOverride(({ child }, { channel }) => {
      const displays = screen.getAllDisplays();

      childSend({ channel, displays });
    }),
    GET_ACTIVE_APP: onChildChannelOverride(async ({ child }, { channel }) => {
      if (kitState.isMac) {
        // REMOVE-MAC
        const { getFrontmostApp: frontmost } = await import(
          '@johnlindquist/mac-frontmost' as any
        );
        const frontmostApp = await frontmost();
        childSend({ channel, app: frontmostApp });
        // END-REMOVE-MAC
      } else {
        // TODO: implement for windows
        childSend({ channel, app: {} });
      }
    }),

    GET_MOUSE: onChildChannelOverride(({ child }, { channel }) => {
      const mouseCursor = screen.getCursorScreenPoint();
      childSend({ channel, mouseCursor });
    }),

    GET_PROCESSES: onChildChannelOverride(({ child }, { channel }) => {
      childSend({ channel, processes });
    }),

    GET_KIT_WINDOWS: onChildChannelOverride(({ child }, { channel }) => {
      const windows = BrowserWindow.getAllWindows().map((w) => {
        const title = w?.getTitle();
        // eslint-disable-next-line prefer-const
        let [name, tag, description] = title?.split(' | ');
        if (tag && description) {
          description = `Add a title to your widget to customize the name`;
        }
        return {
          name,
          tag,
          description,
          id: w?.id.toString(),
          value: w?.id.toString(),
          bounds: w?.getBounds(),
          isFocused: w?.isFocused(),
          isVisible: w?.isVisible(),
          isDestroyed: w?.isDestroyed(),
        };
      });

      log.info(`GET_KIT_WINDOWS`, { windows });

      childSend({ channel, windows });
    }),

    FOCUS_KIT_WINDOW: onChildChannel(({ child }, { channel, value }) => {
      const { id } = value;
      const window = BrowserWindow.fromId(parseInt(id, 10));
      log.info(`Focusing window ${id}: ${window?.getTitle()}`);
      if (window) {
        app.focus({ steal: true });
        window.focus();
      }
    }),

    BLUR_APP: onChildChannel(({ child }, { channel }) => {
      prompt?.blurPrompt();
    }),

    SHOW_APP: onChildChannel(({ child }, { channel }) => {
      prompt?.showPrompt();
    }),

    HIDE_APP: onChildChannelOverride(
      async ({ scriptPath, child }, { channel, value }) => {
        if (kitState.isMac && app?.dock) app?.dock?.hide();

        sendToPrompt(Channel.HIDE_APP);

        kitState.hiddenByUser = true;
        log.info(`😳 Hiding app`);

        const handler = () => {
          log.info(`🫣 App hidden`);
          if (!child?.killed) {
            childSend({
              channel,
            });
          }
        };

        if (prompt?.isVisible()) {
          prompt?.onHideOnce(handler);
        }
        handler();

        prompt.hide();

        // hideAppIfNoWindows(HideReason.User);
        // if (value?.preloadScript) {
        //   attemptPreload(value?.preloadScript as string, false);
        // }
      }
    ),

    BEFORE_EXIT: onChildChannelOverride(({ pid }) => {
      processes.removeByPid(pid);
    }),

    QUIT_APP: onChildChannel(async ({ child }, { channel, value }) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      forceQuit();
    }),
    SET_KIT_STATE: onChildChannel(async (processInfo, data) => {
      log.info(`SET_KIT_STATE`, data?.value);
      for (const [key, value] of Object.entries(data?.value)) {
        if ((kitState as any)?.[key] !== undefined) {
          log.info(`Setting kitState.${key} to ${value}`);
          (kitState as any)[key] = value;
        }
      }
    }),
    DEBUG_SCRIPT: onChildChannelOverride(async (processInfo, data: any) => {
      // TODO: Re-enable DEBUG_SCRIPT
      // await sponsorCheck('Debugging Scripts');
      // if (!kitState.isSponsor) return;
      // kitState.debugging = true;
      // processes.removeByPid(processInfo.child?.pid);
      // log.info(`DEBUG_SCRIPT`, data?.value?.filePath);
      // trackEvent(TrackEvent.DebugScript, {
      //   scriptName: path.basename(data?.value?.filePath || ''),
      // });
      // // Need to unset preloaded since the debugger is piggy-backing off the preloaded mainScript
      // kitState.preloaded = false;
      // sendToPrompt(Channel.START, data?.value?.filePath);
      // sendToPrompt(Channel.SET_PROMPT_DATA, {
      //   ui: UI.debugger,
      // });
      // const port = await detect(51515);
      // const pInfo = processes.add(ProcessType.Prompt, '', [], port);
      // pInfo.scriptPath = data?.value?.filePath;
      // log.info(`🐞 ${pInfo?.pid}: ${data?.value?.filePath} `);
      // await setScript(data.value, pInfo.pid, true);
      // // wait 1000ms for script to start
      // await new Promise((resolve) => setTimeout(resolve, 1000));
      // childSend({
      //   channel: Channel.VALUE_SUBMITTED,
      //   input: '',
      //   value: {
      //     script: data?.value?.filePath,
      //     args: [],
      //     trigger: Trigger.App,
      //   },
      // });
    }),
    VALUE_SUBMITTED: onChildChannelOverride(async (processInfo, data: any) => {
      // log.info(`VALUE_SUBMITTED`, data?.value);

      clearPreview();
      clearFlags();
      prompt.clearSearch();
    }),
    SET_SCRIPT: onChildChannel(async (processInfo: ProcessInfo, data) => {
      // "app-run" will invoke "SET_SCRIPT"
      // TODO: Attempting to preload on SET_SCRIPT causes weird resizing issues
      // Need to figure out initBounds, jotai's resize/hasPreview preload
      // const filePath = data?.value?.filePath;
      // attemptPreload(filePath);
      if (processInfo.type === ProcessType.Prompt) {
        processInfo.scriptPath = data.value?.filePath;

        if (processInfo.child.stdout && processInfo.child.stderr) {
          let scriptLog: Logger;

          try {
            scriptLog = getLog(processInfo.scriptPath);
          } catch (e) {
            return;
          }

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
          processInfo.child.stdout?.on('end', () => {
            log.info(`🏁 stdout ended for ${processInfo?.scriptPath}`);
          });

          processInfo.child.stderr?.on('data', routeToScriptLog);
          processInfo.child.stderr?.on('error', routeToScriptLog);
        }

        info.scriptPath = data.value?.filePath;
      }
      await prompt?.setScript(data.value, processInfo.pid);
    }),
    SET_STATUS: onChildChannel(async (_, data) => {
      if (data?.value) kitState.status = data?.value;
    }),
    SET_SUBMIT_VALUE: onChildChannel(({ child }, { channel, value }) => {
      sendToPrompt(Channel.SET_SUBMIT_VALUE, value);
    }),

    SET_MODE: (data) => {
      sendToPrompt(Channel.SET_MODE, data.value);
    },

    SET_HINT: (data) => {
      sendToPrompt(Channel.SET_HINT, data.value);
    },

    SET_BOUNDS: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(Channel.SET_BOUNDS, value);
    }),

    SET_IGNORE_BLUR: onChildChannel(async ({ child }, { channel, value }) => {
      log.info(`SET_IGNORE_BLUR`, { value });
    }),

    SET_RESIZE: (data) => {
      prompt.allowResize = data?.value;
    },

    SET_PAUSE_RESIZE: onChildChannel(async ({ child }, { channel, value }) => {
      log.info(`⏸ Resize`, `${value ? 'paused' : 'resumed'}`);
      kitState.resizePaused = value;
    }),

    SET_INPUT: onChildChannel(async ({ child }, { channel, value }) => {
      // log.info(`💌 SET_INPUT to ${value}`);
      prompt.kitSearch.keywords.clear();
      prompt.kitSearch.keyword = '';
      prompt.kitSearch.input = value;
      sendToPrompt(Channel.SET_INPUT, value);
    }),

    GET_INPUT: onChildChannel(async ({ child }, { channel }) => {
      sendToPrompt(Channel.GET_INPUT);
    }),

    EDITOR_GET_SELECTION: onChildChannel(async ({ child }, { channel }) => {
      sendToPrompt(Channel.EDITOR_GET_SELECTION);
    }),

    EDITOR_GET_CURSOR_OFFSET: onChildChannel(async ({ child }, { channel }) => {
      sendToPrompt(Channel.EDITOR_GET_CURSOR_OFFSET);
    }),

    EDITOR_SET_CODE_HINT: onChildChannel(async ({ child }, { channel }) => {
      sendToPrompt(Channel.EDITOR_SET_CODE_HINT);
    }),

    EDITOR_MOVE_CURSOR: onChildChannel(
      async ({ child }, { channel, value }) => {
        sendToPrompt(Channel.EDITOR_MOVE_CURSOR, value);
      }
    ),

    EDITOR_INSERT_TEXT: onChildChannel(
      async ({ child }, { channel, value }) => {
        sendToPrompt(Channel.EDITOR_INSERT_TEXT, value);
      }
    ),

    APPEND_INPUT: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(Channel.APPEND_INPUT, value);
    }),

    SCROLL_TO: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(Channel.SCROLL_TO, value);
    }),

    SET_PLACEHOLDER: (data) => {
      sendToPrompt(Channel.SET_PLACEHOLDER, data.value);
    },

    SET_ENTER: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(Channel.SET_ENTER, value);
    }),

    SET_FOOTER: (data) => {
      sendToPrompt(Channel.SET_FOOTER, data.value);
    },

    SET_PANEL: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(Channel.SET_PANEL, value);
    }),

    SET_PREVIEW: (data) => {
      if (prompt.cacheScriptPreview) {
        cachePreview(prompt.scriptPath, data.value);
        prompt.cacheScriptPreview = false;
      }
      sendToPrompt(Channel.SET_PREVIEW, data.value);
    },

    SET_SHORTCUTS: onChildChannel(
      async ({ child, prompt }, { channel, value }) => {
        sendToPrompt(channel, value);
        if (
          prompt.scriptPath === getMainScriptPath() &&
          prompt.kitSearch.input === '' &&
          value?.length
        ) {
          prompt.appToPrompt(AppChannel.SET_CACHED_MAIN_SHORTCUTS, value);
        }

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
      }
    ),

    CONSOLE_CLEAR: () => {
      setLog(Channel.CONSOLE_CLEAR);
    },

    SET_TAB_INDEX: (data) => {
      sendToPrompt(Channel.SET_TAB_INDEX, data.value);
    },
    DEV_TOOLS: onChildChannel(async ({ child }, { channel, value }) => {
      showDevTools(value);
    }),
    SHOW_LOG_WINDOW: onChildChannel(
      async ({ scriptPath, pid }, { channel, value }) => {
        await sponsorCheck('Log Window');
        if (!kitState.isSponsor) return;
        await showLogWindow({
          scriptPath: value || scriptPath,
          pid,
        });
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
    SET_PROMPT_DATA: onChildChannel(async (pap, { channel, value }) => {
      performance.measure('SET_PROMPT_DATA', 'script');
      prompt.scriptPath = value?.scriptPath || '';
      prompt.hideOnEscape = Boolean(value?.hideOnEscape);

      prompt.kitSearch.keys = value?.searchKeys || [
        'slicedName',
        'tag',
        'group',
        'command',
      ];
      if (typeof value?.keyword === 'string') {
        prompt.kitSearch.keywords.clear();
        prompt.kitSearch.input = '';
        prompt.kitSearch.keyword = value?.keyword;
      }

      if (value?.ui === UI.mic) {
        prompt.appToPrompt(AppChannel.SET_MIC_CONFIG, {
          timeSlice: value?.timeSlice || 200,
          format: value?.format || 'webm',
          stream: value?.stream || false,
          filePath: value?.filePath || '',
        });
      }
      // log.silly(`SET_PROMPT_DATA`);

      // if (value?.ui === UI.term) {
      //   kitState.termCommand = value?.input || ''
      //   kitState.termCwd = value?.cwd || ''
      //   kitState.termEnv = value?.env || {}
      // }

      if (prompt.kitSearch.keyword) {
        value.input = `${prompt.kitSearch.keyword} `;
      } else if (value.input && prompt.firstPrompt) {
        prompt.kitSearch.input = value.input;
      }

      prompt?.setPromptData(value);
      prompt.isScripts = Boolean(value?.scripts);
    }),
    SET_PROMPT_PROP: async (data) => {
      prompt?.setPromptProp(data.value);
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
          prompt?.focusPrompt();
        });
      }
    },
    UPDATE_APP: () => {
      emitter.emit(KitEvent.CheckForUpdates, true);
    },
    ADD_CHOICE: onChildChannel(async ({ child }, { channel, value }) => {
      prompt.kitSearch.choices.push(value);
      invokeSearch(prompt, prompt.kitSearch.input);
    }),

    SET_CHOICES: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        performance.measure('SET_CHOICES', 'script');
        log.info(
          `SET_CHOICES preloaded ${
            kitState.preloaded ? 'true' : 'false'
          } ${value.choices?.length} choices`
        );
        if (![UI.arg, UI.hotkey].includes(prompt.ui)) {
          log.info(`⛔️ UI changed before choices sent. Skipping SET_CHOICES`);

          if (child) {
            childSend({
              channel,
            });
          }
          return;
        }

        const { choices, skipInitialSearch, inputRegex, generated } = value;

        prompt.kitSearch.inputRegex = inputRegex
          ? new RegExp(inputRegex, 'gi')
          : undefined;

        let formattedChoices = choices;
        if (prompt.isScripts) {
          formattedChoices = formatScriptChoices(choices);
        }

        setChoices(prompt, formattedChoices, {
          preload: false,
          skipInitialSearch,
          generated: Boolean(generated),
        });

        if (child) {
          childSend({
            channel,
          });
        }
      }
    ),

    APPEND_CHOICES: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(channel, value);
    }),

    // UPDATE_PROMPT_WARN: (data) => {
    //   setPlaceholder(data.info as string);
    // },

    CLEAR_PROMPT_CACHE: onChildChannel(
      async ({ child }, { channel, value }) => {
        log.verbose(`${channel}: Clearing prompt cache`);
        await clearPromptCache();
        prompt?.resetWindow();
      }
    ),
    FOCUS: onChildChannel(async ({ child }, { channel, value }) => {
      log.verbose(`${channel}: Manually focusing prompt`);
      prompt?.forceFocus();
    }),
    SET_ALWAYS_ON_TOP: onChildChannel(
      async ({ child, prompt }, { channel, value }) => {
        log.verbose(`${channel}: Setting always on top to ${value}`);
        prompt?.setPromptAlwaysOnTop(value as boolean);
      }
    ),
    CLEAR_TABS: () => {
      sendToPrompt(Channel.CLEAR_TABS, []);
    },

    SET_EDITOR_CONFIG: onChildChannel(async ({ child }, { channel, value }) => {
      setChoices(prompt, [], {
        preload: false,
        skipInitialSearch: true,
      });
      sendToPrompt(Channel.SET_EDITOR_CONFIG, value);
    }),

    SET_EDITOR_SUGGESTIONS: onChildChannel(
      async ({ child }, { channel, value }) => {
        sendToPrompt(Channel.SET_EDITOR_SUGGESTIONS, value);
      }
    ),

    APPEND_EDITOR_VALUE: onChildChannel(
      async ({ child }, { channel, value }) => {
        sendToPrompt(Channel.APPEND_EDITOR_VALUE, value);
      }
    ),

    SET_TEXTAREA_CONFIG: (data) => {
      sendToPrompt(Channel.SET_TEXTAREA_CONFIG, data.value);
    },

    SET_THEME: onChildChannel(async ({ child }, { channel, value }) => {
      await setTheme(value);
    }),

    SET_TEMP_THEME: onChildChannel(async ({ child }, { channel, value }) => {
      const newValue = await maybeConvertColors(value);
      sendToPrompt(Channel.SET_TEMP_THEME, newValue);
      // TOOD: https://github.com/electron/electron/issues/37705
      // const backgroundColor = `rgba(${newValue['--color-background']}, ${newValue['--opacity']})`;
      // log.info(`🎨 Setting backgroundColor: ${backgroundColor}`);

      // getMainPrompt().setBackgroundColor(backgroundColor);
    }),

    // SET_FORM_HTML: (data) => {
    //   sendToPrompt(Channel.SET_FORM_HTML, data.value);
    // },
    SET_FORM: (data) => {
      sendToPrompt(Channel.SET_FORM, data.value);
    },
    SET_FLAGS: (data) => {
      log.info(`⛳️ Set flags ${Object.keys(data?.value).length}`);
      sendToPrompt(Channel.SET_FLAGS, data.value);
      setFlags(prompt, data.value);
    },
    SET_FLAG_VALUE: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(Channel.SET_FLAG_VALUE, value);
    }),
    SET_NAME: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(Channel.SET_NAME, value);
    }),
    SET_DESCRIPTION: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(Channel.SET_DESCRIPTION, value);
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
    SET_PROGRESS: (data) => {
      sendToPrompt(Channel.SET_PROGRESS, data.value);
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
    SET_TRAY: onChildChannel(async (_, { value }) => {
      log.info(JSON.stringify(value));
      const { label, scripts } = value;
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
    }),
    GET_EDITOR_HISTORY: onChildChannel(() => {
      sendToPrompt(Channel.GET_EDITOR_HISTORY);
    }),
    TERMINATE_PROCESS: onChildChannel(async ({ child }, { channel, value }) => {
      warn(`${value}: Terminating process ${value}`);
      processes.removeByPid(value);
    }),

    GET_APP_STATE: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        childSend({
          channel,
          value: snapshot(kitState),
        });
      }
    ),

    TERMINAL: (data) => {
      sendToPrompt(Channel.TERMINAL, data.value);
    },
    CLIPBOARD_READ_TEXT: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        const text = await clipboard.readText();
        childSend({
          channel,
          value: text,
        });
      }
    ),

    CLIPBOARD_READ_IMAGE: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        const image = clipboard.readImage();
        // write image to a tmp file path with a uuid name
        const tmpPath = path.join(os.tmpdir(), `kit-${randomUUID()}.png`);
        await writeFile(tmpPath, image.toPNG());

        childSend({
          channel,
          value: tmpPath,
        });
      }
    ),
    CLIPBOARD_READ_RTF: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        const rtf = await clipboard.readRTF();
        childSend({
          channel,
          value: rtf,
        });
      }
    ),
    CLIPBOARD_READ_HTML: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        const html = await clipboard.readHTML();
        childSend({
          channel,
          value: html,
        });
      }
    ),
    CLIPBOARD_READ_BOOKMARK: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        const bookmark = await clipboard.readBookmark();
        childSend({
          channel,
          value: bookmark,
        });
      }
    ),
    CLIPBOARD_READ_FIND_TEXT: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        const findText = await clipboard.readFindText();
        childSend({
          channel,
          value: findText,
        });
      }
    ),

    CLIPBOARD_WRITE_TEXT: onChildChannel(
      async ({ child }, { channel, value }) => {
        let text;
        if (typeof value === 'string') {
          text = value;
        } else if (typeof value === 'number') {
          text = value.toString();
        } else {
          text = JSON.stringify(value);
        }

        if (text) {
          await clipboard.writeText(text);
        }
      }
    ),
    CLIPBOARD_WRITE_IMAGE: onChildChannel(
      async ({ child }, { channel, value }) => {
        const image = nativeImage.createFromPath(value);
        await clipboard.writeImage(image);
      }
    ),
    CLIPBOARD_WRITE_RTF: onChildChannel(
      async ({ child }, { channel, value }) => {
        await clipboard.writeRTF(value);
      }
    ),
    CLIPBOARD_WRITE_HTML: onChildChannel(
      async ({ child }, { channel, value }) => {
        await clipboard.writeHTML(value);
      }
    ),

    CLIPBOARD_WRITE_BOOKMARK: onChildChannel(
      async ({ child }, { channel, value }) => {
        await clipboard.writeBookmark(value.title, value.url);
      }
    ),
    CLIPBOARD_WRITE_FIND_TEXT: onChildChannel(
      async ({ child }, { channel, value }) => {
        await clipboard.writeFindText(value);
      }
    ),
    CLIPBOARD_CLEAR: onChildChannel(async ({ child }, { channel, value }) => {
      await clipboard.clear();
    }),

    REGISTER_GLOBAL_SHORTCUT: onChildChannelOverride(
      async ({ scriptPath }, { channel, value }) => {
        const properShortcut = convertShortcut(value, scriptPath);
        log.info(
          `App: registering global shortcut ${value} as ${properShortcut}`
        );
        const result = globalShortcut.register(properShortcut, async () => {
          kitState.shortcutPressed = properShortcut;
          log.info(
            `Global shortcut: Sending ${value} on ${Channel.GLOBAL_SHORTCUT_PRESSED}`
          );
          childSend({
            channel: Channel.GLOBAL_SHORTCUT_PRESSED,
            value,
          });
        });

        log.info(`Shortcut ${value}: ${result ? 'success' : 'failure'}}`);

        if (result) {
          if (!childShortcutMap.has(child)) {
            childShortcutMap.set([properShortcut]);
          } else {
            childShortcutMap.get(child)?.push(properShortcut);
          }

          childSend({
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

          childSend({
            channel,
            value: false,
          });
        }
      }
    ),

    UNREGISTER_GLOBAL_SHORTCUT: onChildChannel(
      async ({ scriptPath }, { channel, value }) => {
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
      }
    ),

    KEYBOARD_TYPE: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
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
        log.info(`${channel}: ${typeof value} ${value}`, {
          isArray: Array.isArray(value),
        });
        log.info(`${channel}: ${[...value]}`);
        const firstItem = value?.[0];
        log.info({ type: typeof firstItem, firstItem });
        keyboard.config.autoDelayMs =
          kitState?.keyboardConfig?.autoDelayMs || 0;
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
          childSend({
            channel,
          });
        }, value.length);

        // END-REMOVE-NUT
      }
    ),

    KEYBOARD_PRESS_KEY: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        if (!kitState.supportsNut) {
          log.warn(
            `Keyboard type: Nut not supported on Windows arm64 or Linux arm64. Hoping to find a solution soon!`
          );
          return;
        }
        // REMOVE-NUT
        const { keyboard } = await import('@nut-tree/nut-js');

        log.info(`PRESSING KEY`, { value });
        await keyboard.pressKey(...(value as any));

        childSend({ channel, value });

        // END-REMOVE-NUT
      }
    ),

    KEYBOARD_RELEASE_KEY: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        if (!kitState.supportsNut) {
          log.warn(
            `Keyboard type: Nut not supported on Windows arm64 or Linux arm64. Hoping to find a solution soon!`
          );
          return;
        }

        // REMOVE-NUT
        const { keyboard } = await import('@nut-tree/nut-js');

        log.info(`RELEASING KEY`, { value });
        await keyboard.releaseKey(...(value as any));

        childSend({ channel, value });
        // END-REMOVE-NUT
      }
    ),

    MOUSE_LEFT_CLICK: onChildChannel(async ({ child }, { channel, value }) => {
      // REMOVE-NUT
      const { mouse } = await import('@nut-tree/nut-js');
      await mouse.leftClick();
      // END-REMOVE-NUT
    }),

    MOUSE_RIGHT_CLICK: onChildChannel(async ({ child }, { channel, value }) => {
      // REMOVE-NUT
      const { mouse } = await import('@nut-tree/nut-js');
      await mouse.rightClick();
      // END-REMOVE-NUT
    }),

    MOUSE_MOVE: onChildChannel(async ({ child }, { channel, value }) => {
      // REMOVE-NUT
      const { mouse } = await import('@nut-tree/nut-js');
      await mouse.move(value);
      // END-REMOVE-NUT
    }),

    MOUSE_SET_POSITION: onChildChannel(
      async ({ child }, { channel, value }) => {
        // REMOVE-NUT
        const { mouse } = await import('@nut-tree/nut-js');
        await mouse.setPosition(value);
        // END-REMOVE-NUT
      }
    ),

    // TRASH: toProcess(async ({ child }, { channel, value }) => {
    //   // const result = await trash(value);
    //   // log.info(`TRASH RESULT`, result);
    //   // childSend({
    //   //   result,
    //   //   channel,
    //   // });
    // }),

    COPY: onChildChannelOverride(async ({ child }, { channel, value }) => {
      log.info(`>>>> COPY`);
      clipboard.writeText(value);

      childSend({
        channel,
        value,
      });
    }),

    // Maybe I need to wait between presses?
    // Or maybe not?

    PASTE: onChildChannelOverride(async ({ child }, { channel }) => {
      const value = clipboard.readText();
      log.info(`>>>> PASTE`, value);
      childSend({
        channel,
        value,
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
    CLEAR_SCRIPTS_MEMORY: onChildChannel(async ({ child }, { channel }) => {
      // await updateScripts();
    }),

    VERIFY_FULL_DISK_ACCESS: onChildChannel(async ({ child }, { channel }) => {
      let value = false;
      if (process.env.NODE_ENV === 'development' || !kitState.isMac) {
        value = true;
      } else {
        // REMOVE-MAC
        const authStatus = getAuthStatus('full-disk-access');
        if (authStatus === 'authorized') {
          value = true;
        } else {
          // askForFullDiskAccess();
        }
        // END-REMOVE-MAC
      }
    }),

    SET_SELECTED_TEXT: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
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

        log.info(`SET SELECTED TEXT`, text);
        clipboard.writeText(text);

        const modifier = kitState.isMac ? Key.LeftSuper : Key.LeftControl;
        keyboard.pressKey(modifier, Key.V);
        await new Promise(setImmediate);
        keyboard.releaseKey(modifier, Key.V);
        setTimeout(() => {
          kitState.snippet = '';
          childSend({ channel, value });
          log.info(`SET SELECTED TEXT DONE with ${channel}`, text);
        }, 10);

        // END-REMOVE-NUT
      }
    ),

    SHOW_EMOJI_PANEL: onChildChannel(async ({ child }, { channel, value }) => {
      app.showEmojiPanel();
    }),
    SET_APPEARANCE: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(Channel.SET_APPEARANCE, value);
    }),
    SELECT_FILE: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        // Show electron file selector dialog
        const response = await dialog.showOpenDialog(prompt.window, {
          defaultPath: os.homedir(),
          message: 'Select a file',
          properties: ['openFile'],
        });

        log.info({ response });

        const returnValue = response.canceled ? '' : response.filePaths[0];

        log.info({
          returnValue,
        });

        childSend({ channel, value: returnValue });
      }
    ),
    SELECT_FOLDER: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        // Show electron file selector dialog
        const response = await dialog.showOpenDialog(prompt.window, {
          defaultPath: os.homedir(),
          message: 'Select a file',
          properties: ['openDirectory'],
        });

        const returnValue = response.canceled ? '' : response.filePaths[0];

        childSend({ channel, value: returnValue });
      }
    ),
    REVEAL_FILE: onChildChannel(async ({ child }, { channel, value }) => {
      shell.showItemInFolder(value);
    }),
    BEEP: onChildChannel(async ({ child }, { channel, value }) => {
      shell.beep();
    }),
    PLAY_AUDIO: onChildChannel(async ({ child }, { channel, value }: any) => {
      try {
        log.info(`🔊 Playing ${value?.filePath || value}`);
      } catch (error) {
        log.error(`🔊 Error playing ${value}`, error);
      }
      sendToPrompt(Channel.PLAY_AUDIO, value);
    }),
    STOP_AUDIO: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(Channel.STOP_AUDIO, value);
    }),
    SPEAK_TEXT: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(Channel.SPEAK_TEXT, value);
    }),

    CUT_TEXT: onChildChannelOverride(async ({ child }, { channel, value }) => {
      const text = kitState.snippet;
      log.info(`Yanking text`, text);
      await deleteText(text);
      kitState.snippet = '';

      childSend({
        channel,
        value: text,
      });
    }),
    PRO_STATUS: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        const isSponsor = await sponsorCheck('Check Status', false);
        log.info(`PRO STATUS`, JSON.stringify({ isSponsor }));
        childSend({
          channel,
          value: isSponsor,
        });
      }
    ),
    OPEN_MENU: onChildChannel(async ({ child }, { channel, value }) => {
      emitter.emit(KitEvent.TrayClick);
    }),
    OPEN_DEV_TOOLS: onChildChannel(async ({ child }, { channel, value }) => {
      if (prompt.window) {
        prompt.window.webContents.openDevTools();
      }
    }),
    START_DRAG: onChildChannel(async ({ child }, { channel, value }) => {
      if (prompt.window) {
        try {
          prompt.window.webContents.startDrag({
            file: value?.filePath,
            icon: value?.iconPath || getAssetPath('icons8-file-50.png'),
          });
        } catch (error) {
          log.error(`Error starting drag`, error);
        }
      }
    }),
    GET_COLOR: onChildChannelOverride(async ({ child }, { channel }) => {
      sendToPrompt(Channel.GET_COLOR);
    }),
    CHAT_GET_MESSAGES: onChildChannel(async (_, { channel, value }) => {
      prompt?.getFromPrompt(info.child, channel, value);
    }),
    CHAT_SET_MESSAGES: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(channel, value);
    }),
    CHAT_ADD_MESSAGE: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(channel, value);
    }),
    CHAT_PUSH_TOKEN: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(channel, value);
    }),
    CHAT_SET_MESSAGE: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(channel, value);
    }),
    TOAST: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(channel, value);
    }),
    TERM_EXIT: onChildChannel(
      async ({ child, promptId }, { channel, value }) => {
        log.info(`TERM EXIT FROM SCRIPT`, value);
        sendToPrompt(channel, promptId || '');
      }
    ),
    GET_DEVICES: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        sendToPrompt(channel, value);
      }
    ),
    SHEBANG: onChildChannel(async ({ child }, { channel, value }) => {
      spawnShebang(value);
    }),
    ERROR: onChildChannelOverride(async ({ child }, { channel, value }) => {
      log.error(`ERROR`, value);
      trackEvent(TrackEvent.Error, value);
    }),
    GET_TYPED_TEXT: onChildChannelOverride(
      async ({ child }, { channel, value }) => {
        childSend({ channel, value: kitState.typedText });
      }
    ),
    TERM_WRITE: onChildChannel(async ({ child }, { channel, value }) => {
      emitter.emit(KitEvent.TermWrite, value);
    }),
    SET_FORM_DATA: onChildChannel(async ({ child }, { channel, value }) => {
      log.info(`SET FORM DATA`, value);
      sendToPrompt(channel, value);
    }),
    SET_DISABLE_SUBMIT: onChildChannel(
      async ({ child }, { channel, value }) => {
        log.info(`SET DISABLE SUBMIT`, value);
        sendToPrompt(channel, value);
      }
    ),
    START_MIC: onChildChannel(async ({ child }, { channel, value }) => {
      sendToPrompt(channel, value);
    }),
    STOP_MIC: onChildChannelOverride(async ({ child }, { channel, value }) => {
      log.info(`STOP MIC`, value);
      sendToPrompt(channel, value);
    }),

    TRASH: onChildChannel(async ({ child }, { channel, value }) => {
      for await (const item of value) {
        log.info(`🗑 Trashing`, item);
        await shell.trashItem(item);
      }
    }),
    SET_SCORED_CHOICES: onChildChannel(
      async ({ child }, { channel, value }) => {
        log.verbose(`SET SCORED CHOICES`);
        if (!prompt.kitSearch.input) {
          sendToPrompt(channel, value);
        }
      }
    ),
    PRELOAD: onChildChannel(async ({ child }, { channel, value }) => {
      prompt.attemptPreload(value);
    }),
    CLEAR_TIMESTAMPS: onChildChannel(async ({ child }, { channel, value }) => {
      const stampDb = await getTimestamps();
      stampDb.stamps = [];
      await stampDb.write();

      log.verbose(`CLEAR TIMESTAMPS`);
    }),
    REMOVE_TIMESTAMP: onChildChannel(async ({ child }, { channel, value }) => {
      log.verbose(`REMOVE TIMESTAMP for ${value}`);

      const stampDb = await getTimestamps();
      const stamp = stampDb.stamps.findIndex((s) => s.filePath === value);

      stampDb.stamps.splice(stamp, 1);
      await stampDb.write();
    }),
    TOGGLE_WATCHER: onChildChannel(async ({ child }, { channel, value }) => {
      log.info(`TOGGLE WATCHER DEPRECATED`);
    }),
    SET_SELECTED_CHOICES: onChildChannel(
      async ({ child }, { channel, value }) => {
        log.verbose(`SET SELECTED CHOICES`);
        sendToPrompt(channel, value);
      }
    ),

    TOGGLE_ALL_SELECTED_CHOICES: onChildChannel(
      async ({ child }, { channel, value }) => {
        log.verbose(`TOGGLE ALL SELECTED CHOICES`);
        sendToPrompt(channel, value);
      }
    ),

    KENV_NEW_PATH: onChildChannel(async ({ child }, { channel, value }) => {
      log.verbose(`KENV NEW PATH`, { value });
      kitStore.set('KENV', value);
    }),

    HEARTBEAT: onChildChannelOverride(async ({ child }, { channel }) => {
      log.verbose(`❤️ ${channel} from ${child.pid}`);
    }),
  };

  return kitMessageMap;
};
