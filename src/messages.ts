/* eslint-disable import/prefer-default-export */
import log from 'electron-log';
import { app, clipboard, screen } from 'electron';
import http from 'http';
import https from 'https';
import url from 'url';
import sizeOf from 'image-size';

import { isUndefined } from 'lodash';
import { autoUpdater } from 'electron-updater';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { getLog } from './logs';
import {
  clearPromptDb,
  focusPrompt,
  sendToPrompt,
  setBlurredByKit,
  setIgnoreBlur,
  setPlaceholder,
  showPrompt,
} from './prompt';
import { getSchedule } from './schedule';
import { getAppHidden, setAppHidden } from './appHidden';
import {
  makeRestartNecessary,
  serverState,
  getBackgroundTasks,
  ChildInfo,
  processMap,
} from './state';
import { reset } from './ipc';
import { emitter, EVENT } from './events';
import { Channel, Mode } from './enums';
import { show } from './show';
import { showNotification } from './notifications';
import { setKenv, createKenv } from './helpers';

const setChoices = (data: MessageData) => {
  if (data?.scripts) {
    const choices: Script[] = (
      (data as { choices: Script[] })?.choices || []
    ).map((script) => {
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

      return script;
    });

    sendToPrompt(Channel.SET_CHOICES, { choices });
  } else {
    sendToPrompt(Channel.SET_CHOICES, data);
  }
};

export type ChannelHandler = {
  [key in Channel]?: (data: MessageData) => void;
};

interface Choice<Value = unknown> {
  name: string;
  value: Value;
  description?: string;
  focused?: string;
  img?: string;
  html?: string;
  preview?: string;
  id?: string;
}

interface Script extends Choice {
  file: string;
  filePath: string;
  command: string;
  menu?: string;
  shortcut?: string;
  description?: string;
  shortcode?: string;
  alias?: string;
  author?: string;
  twitter?: string;
  exclude?: string;
  schedule?: string;
  system?: string;
  watch?: string;
  background?: string;
  isRunning?: boolean;
}

export type MessageData = {
  channel: Channel;
  kitScript: string;
  pid: number;
  log?: string;
  warn?: string;
  path?: string;
  filePath?: string;
  name?: string;
  args?: string[];
  mode?: string;
  ignore?: boolean;
  text?: string;
  options?: any;
  image?: any;
  html?: string;
  choices?: any[];
  info?: any;
  scripts?: boolean;
  scriptInfo?: Script;
  kenvPath?: string;
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
    data?.scriptInfo?.command || 'show-image',
    String.raw`<img src="${image?.src}" alt="${image?.alt}" title="${image?.title}" />`,
    { width, height, ...options }
  );
  if (imageWindow && !imageWindow.isDestroyed()) {
    imageWindow.on('close', () => {
      focusPrompt();
    });
  }
};

const kitMessageMap: ChannelHandler = {
  CLEAR_CACHE: (data) => {
    clearPromptDb();
  },

  CONSOLE_LOG: (data) => {
    getLog(data.kitScript).info(data.log);
  },

  CONSOLE_WARN: (data) => {
    getLog(data.kitScript).warn(data.warn);
  },

  COPY_PATH_AS_PICTURE: (data) => {
    clipboard.writeImage(data.path as any);
  },

  CREATE_KENV: (data) => {
    if (data.kenvPath) createKenv(data.kenvPath);
  },

  GET_SCRIPTS_STATE: (data) => {
    if (processMap.has(data.pid)) {
      const { child } = processMap.get(data.pid) as ChildInfo;

      child?.send({
        channel: 'SCRIPTS_STATE',
        schedule: getSchedule(),
        tasks: getBackgroundTasks(),
      });
    }
  },

  GET_SCHEDULE: (data) => {
    if (processMap.has(data.pid)) {
      const { child } = processMap.get(data.pid) as ChildInfo;
      child?.send({ channel: 'SCHEDULE', schedule: getSchedule() });
    }
  },

  GET_BACKGROUND: (data) => {
    if (processMap.has(data.pid)) {
      const { child } = processMap.get(data.pid) as ChildInfo;
      child?.send({ channel: 'BACKGROUND', tasks: getBackgroundTasks() });
    }
  },

  TOGGLE_BACKGROUND: (data) => {
    emitter.emit(Channel.TOGGLE_BACKGROUND, data);
  },

  GET_SCREEN_INFO: (data) => {
    if (processMap.has(data.pid)) {
      const cursor = screen.getCursorScreenPoint();
      // Get display with cursor
      const activeScreen = screen.getDisplayNearestPoint({
        x: cursor.x,
        y: cursor.y,
      });

      const { child } = processMap.get(data.pid) as ChildInfo;
      child?.send({ channel: 'SCREEN_INFO', activeScreen });
    }
  },

  GET_MOUSE: (data) => {
    if (processMap.has(data.pid)) {
      const mouseCursor = screen.getCursorScreenPoint();
      const { child } = processMap.get(data.pid) as ChildInfo;
      child?.send({ channel: 'MOUSE', mouseCursor });
    }
  },
  GET_SERVER_STATE: (data) => {
    if (processMap.has(data.pid)) {
      const { child } = processMap.get(data.pid) as ChildInfo;
      child?.send({ channel: 'SERVER', ...serverState });
    }
  },
  HIDE_APP: () => {
    setAppHidden(true);
  },
  NEEDS_RESTART: () => {
    makeRestartNecessary();
  },
  QUIT_APP: () => {
    reset();
    app.exit();
  },
  RUN_SCRIPT: (data) => {
    sendToPrompt(Channel.RUN_SCRIPT, data);
  },

  SET_LOGIN: (data) => {
    app.setLoginItemSettings(data);
  },
  SET_MODE: (data) => {
    if (data.mode === Mode.HOTKEY) {
      emitter.emit(EVENT.PAUSE_SHORTCUTS);
    }
    sendToPrompt(Channel.SET_MODE, data);
  },

  SET_HINT: (data) => {
    sendToPrompt(Channel.SET_HINT, data);
  },

  SET_IGNORE_BLUR: (data) => {
    setIgnoreBlur(data?.ignore);
  },

  SET_INPUT: (data) => {
    sendToPrompt(Channel.SET_INPUT, data);
  },

  SET_PLACEHOLDER: (data) => {
    showPrompt();
    sendToPrompt(Channel.SET_PLACEHOLDER, data);
  },

  SET_PANEL: (data) => {
    sendToPrompt(Channel.SET_PANEL, data);
  },
  SET_TAB_INDEX: (data) => {
    sendToPrompt(Channel.SET_TAB_INDEX, data);
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
  SHOW_PROMPT: (data) => {
    showPrompt(data);
    if (data?.choices) {
      // validate choices
      if (
        data?.choices.every(
          ({ name, value }: any) => !isUndefined(name) && !isUndefined(value)
        )
      ) {
        sendToPrompt(Channel.SHOW_PROMPT, data);
      } else {
        log.warn(`Choices must have "name" and "value"`);
        log.warn(data?.choices);
        if (!getAppHidden())
          setPlaceholder(`Warning: arg choices must have "name" and "value"`);
      }
    } else {
      sendToPrompt(Channel.SHOW_PROMPT, data);
    }
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
    autoUpdater.checkForUpdatesAndNotify({
      title: 'Script Kit Updated',
      body: 'Relaunching...',
    });
  },
  SET_CHOICES: (data) => {
    setChoices(data);
  },
  SWITCH_KENV: (data) => {
    if (data.kenvPath) setKenv(data.kenvPath);
  },
  UPDATE_PROMPT_WARN: (data) => {
    setPlaceholder(data.info);
  },
};

export const createMessageHandler = (from: string) => (data: MessageData) => {
  log.info(`${data?.channel} ${data?.kitScript}`);

  if (kitMessageMap[data?.channel]) {
    const channelFn = kitMessageMap[data.channel] as (data: any) => void;
    channelFn(data);
  } else {
    console.warn(`Channel ${data?.channel} not found on ${from}.`);
  }
};
