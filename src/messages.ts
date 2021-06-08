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
  focusPrompt,
  setBlurredByKit,
  setIgnoreBlur,
  setPlaceholder,
  showPrompt,
  setScript,
  setMode,
  setInput,
  setPanel,
  setHint,
  setTabIndex,
  setPromptData,
  setChoices,
  clearPromptCache,
} from './prompt';
import { getAppHidden, setAppHidden } from './appHidden';
import {
  makeRestartNecessary,
  serverState,
  getBackgroundTasks,
  getSchedule,
  getCurrentPromptScript,
  ifProcess,
} from './state';
import { reset } from './ipc';
import { emitter, AppEvent } from './events';
import { Channel, Mode, ProcessType } from './enums';
import { show } from './show';
import { showNotification } from './notifications';
import { setKenv, createKenv } from './helpers';
import { Choice, MessageData, Script, PromptData } from './types';

export const prepChoices = (data: MessageData) => {
  if (data?.scripts) {
    // TODO: Figure out if Scripts as Choices
    const dataChoices: Script[] = (data?.choices || []) as unknown as Script[];
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

      return script;
    });

    data.choices = choices as unknown as Choice[];
  }
  setChoices(data.choices as Choice[]);
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

const kitMessageMap: ChannelHandler = {
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
    ifProcess(data.pid, ({ child }) => {
      child?.send({
        channel: 'SCRIPTS_STATE',
        schedule: getSchedule(),
        tasks: getBackgroundTasks(),
      });
    });
  },

  GET_SCHEDULE: (data) => {
    ifProcess(data.pid, ({ child }) => {
      child?.send({ channel: 'SCHEDULE', schedule: getSchedule() });
    });
  },

  GET_BACKGROUND: (data) => {
    ifProcess(data.pid, ({ child }) => {
      child?.send({ channel: 'BACKGROUND', tasks: getBackgroundTasks() });
    });
  },

  TOGGLE_BACKGROUND: (data) => {
    emitter.emit(Channel.TOGGLE_BACKGROUND, data);
  },

  GET_SCREEN_INFO: (data) => {
    ifProcess(data.pid, ({ child }) => {
      const cursor = screen.getCursorScreenPoint();
      // Get display with cursor
      const activeScreen = screen.getDisplayNearestPoint({
        x: cursor.x,
        y: cursor.y,
      });

      child?.send({ channel: 'SCREEN_INFO', activeScreen });
    });
  },

  GET_MOUSE: (data) => {
    ifProcess(data.pid, ({ child }) => {
      const mouseCursor = screen.getCursorScreenPoint();
      child?.send({ channel: 'MOUSE', mouseCursor });
    });
  },
  GET_SERVER_STATE: (data) => {
    ifProcess(data.pid, ({ child }) => {
      child?.send({ channel: 'SERVER', ...serverState });
    });
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
  SET_SCRIPT: (data) => {
    setScript(data.script as Script);
  },

  SET_LOGIN: (data) => {
    app.setLoginItemSettings(data);
  },
  SET_MODE: (data) => {
    if (data.mode === Mode.HOTKEY) {
      emitter.emit(AppEvent.PAUSE_SHORTCUTS);
    }
    setMode(data.mode as Mode);
  },

  SET_HINT: (data) => {
    setHint(data.hint as string);
  },

  SET_IGNORE_BLUR: (data) => {
    setIgnoreBlur(data?.ignore);
  },

  SET_INPUT: (data) => {
    setInput(data.input as string);
  },

  SET_PLACEHOLDER: (data) => {
    setPlaceholder(data.text as string);
    showPrompt(getCurrentPromptScript());
  },

  SET_PANEL: (data) => {
    setPanel(data.html as string);
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
  SET_PROMPT_DATA: (data) => {
    const script = getCurrentPromptScript();
    showPrompt(script);
    if (data?.choices) {
      // validate choices
      if (
        data?.choices.every(
          ({ name, value }: any) => !isUndefined(name) && !isUndefined(value)
        )
      ) {
        setPromptData(data as PromptData);
      } else {
        log.warn(`Choices must have "name" and "value"`);
        log.warn(data?.choices);
        if (!getAppHidden())
          setPlaceholder(`Warning: arg choices must have "name" and "value"`);
      }
    } else {
      setPromptData(data);
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
    prepChoices(data);
  },
  SWITCH_KENV: (data) => {
    if (data.kenvPath) setKenv(data.kenvPath);
  },
  UPDATE_PROMPT_WARN: (data) => {
    setPlaceholder(data.info as string);
  },
  CLEAR_PROMPT_CACHE: () => {
    clearPromptCache();
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

    if (kitMessageMap[data?.channel]) {
      const channelFn = kitMessageMap[data.channel] as (data: any) => void;
      channelFn(data);
    } else {
      console.warn(`Channel ${data?.channel} not found on ${type}.`);
    }
  };
