/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { app, clipboard, ipcMain, screen } from 'electron';
import { autoUpdater } from 'electron-updater';
import url from 'url';
import http from 'http';
import https from 'https';
import sizeOf from 'image-size';
import minimist from 'minimist';

import path from 'path';
import { fork, ChildProcess } from 'child_process';
import log from 'electron-log';
import { debounce, isUndefined } from 'lodash';
import ipc from 'node-ipc';
import {
  invokePromptWindow,
  hidePromptWindow,
  focusPrompt,
  showPreview,
  hidePreview,
  hideEmitter,
  getPromptCache,
  setBlurredByKit,
} from './prompt';
import { showNotification } from './notifications';
import { show } from './show';
import {
  kitPath,
  kenvPath,
  stringifyScriptArgsKey,
  KIT,
  KENV,
} from './helpers';
import { getCache } from './cache';
import { makeRestartNecessary } from './restart';
import { getVersion } from './version';
import {
  SHOW_PROMPT,
  SET_TAB_INDEX,
  VALUE_SUBMITTED,
  SET_PROMPT_TEXT,
  RUN_SCRIPT,
  SET_PANEL,
  SET_CHOICES,
  SET_MODE,
  GENERATE_CHOICES,
  TAB_CHANGED,
  CHOICE_FOCUSED,
  RESET_PROMPT,
  SET_HINT,
} from './channels';
import { serverState, startServer, stopServer } from './server';

let child: ChildProcess | null = null;
let script = '';
let key = '';
let cacheKeyParts: any[] = [];

const consoleLog = log.create('consoleLog');
consoleLog.transports.file.resolvePath = () => kenvPath('logs', 'console.log');

let kitScriptName = '';
export const processMap = new Map();

const setPromptText = (text) => {
  if (!appHidden) invokePromptWindow(SET_PROMPT_TEXT, text);
};

ipcMain.on(VALUE_SUBMITTED, (_event, { value }) => {
  cacheKeyParts.push(value);
  if (child) {
    child?.send(value);
    setPromptText(`>_ ${script} ${value}...`);
  } else {
    tryKitScript(script, cacheKeyParts);
  }
});

ipcMain.on(
  GENERATE_CHOICES,
  debounce((_event, input) => {
    if (child && input) {
      child?.send({ channel: GENERATE_CHOICES, input });
    } else if (script && input) {
      tryKitScript(script, [...cacheKeyParts, '--kit-input', input]);
    }
  }, 100)
);

ipcMain.on('PROMPT_ERROR', (_event, error: Error) => {
  log.warn(error);
  if (!appHidden) setPromptText(error.message);
});

// ipcMain.on(
//   CHOICE_FOCUSED,
//   debounce((_event, choice: any) => {
//     child?.send({ channel: CHOICE_FOCUSED, choice });
//   }, 100)
// );

ipcMain.on(TAB_CHANGED, (event, { tab, input = '' }) => {
  console.log(`SENDING TAB_CHANGED ${tab} ${input}`);
  if (child && tab) {
    child?.send({ channel: TAB_CHANGED, tab, input });
  }
});

let appHidden = false;
const reset = () => {
  invokePromptWindow(RESET_PROMPT, { kitScript: kitScriptName });
  cacheKeyParts = [];
  if (child) {
    log.info(`> end process id: ${child.pid} <
`);
    processMap.delete(child?.pid);
    child?.removeAllListeners();
    child?.kill();
    child = null;
    script = '';
    key = '';
  }
  appHidden = false;
};

// TODO: Work out states
// Closed by user
// Closed by script
// Closed by need to copy/paste
hideEmitter.on('hide', () => {
  if (appHidden) {
    appHidden = false;
  } else {
    reset();
    hidePromptWindow();
  }
});

app.on('second-instance', async (event, argv, workingDirectory) => {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { _ } = minimist(argv);
  const [, , argScript, ...argArgs] = _;
  tryKitScript(argScript, argArgs);
});

ipc.config.id = KIT;
ipc.config.retry = 1500;
ipc.config.silent = true;

ipc.serve(kitPath('tmp', 'ipc'), () => {
  ipc.server.on('message', (data, socket) => {
    console.log(data.scriptPath, data.scriptArgs);
    tryKitScript(data.scriptPath, data.scriptArgs);
  });
});

ipc.server.start();

const kitScript = (scriptPath: string, runArgs: string[] = []) => {
  kitScriptName = scriptPath;
  reset();
  // eslint-disable-next-line no-nested-ternary
  let resolvePath = scriptPath.startsWith(path.sep)
    ? scriptPath
    : scriptPath.includes(path.sep)
    ? kenvPath(scriptPath)
    : kenvPath('scripts', scriptPath);

  if (!resolvePath.endsWith('.js')) resolvePath = `${resolvePath}.js`;

  const codePath = 'usr/local/bin/';

  ({ key, script } = stringifyScriptArgsKey(scriptPath, runArgs));

  // kitLog.info(`>>> GET: ${key}`);
  const cachedResult: any = getCache()?.get(key);
  if (cachedResult) {
    log.info(`GOT CACHE:`, key);
    invokePromptWindow(SHOW_PROMPT, cachedResult);

    return;
  }

  // kitLog.info(`FORK: ${resolvePath} ${[...runArgs, '--app']}`);

  child = fork(resolvePath, [...runArgs, '--app'], {
    silent: true,
    // stdio: 'inherit',
    execPath: kitPath('node', 'bin', 'node'),
    execArgv: [
      '--require',
      'dotenv/config',
      '--require',
      kitPath('preload', 'api.cjs'),
      '--require',
      kitPath('preload', 'kit.cjs'),
      '--require',
      kitPath('preload', 'mac.cjs'),
    ],
    env: {
      ...process.env,
      KIT_CONTEXT: 'app',
      KIT_MAIN: resolvePath,
      PATH: `${kitPath('node', 'bin')}:${codePath}:${process.env.PATH}`,
      KENV,
      KIT,
      NODE_PATH: `${kenvPath('node_modules')}:${kitPath('node_modules')}`,
      DOTENV_CONFIG_PATH: kenvPath('.env'),
      KIT_APP_VERSION: getVersion(),
    },
  });
  processMap.set(child.pid, scriptPath);

  log.info(`> begin process id: ${child.pid} <`);

  const tryClean = (on: string) => () => {
    try {
      // kitLog.info(on, scriptPath, '| PID:', child?.pid);
      // kitLog.info(`tryClean...`, scriptPath);
      reset();
      hidePromptWindow();
    } catch (error) {
      log.warn(error);
    }
  };

  child.on('exit', tryClean('EXIT'));
  child.on('message', async (data: any) => {
    log.info(
      `${data.channel} ${
        data?.kitScript ? data.kitScript : 'please attach kitScript'
      }`
    );

    // kitLog.log(data.scriptInfo);

    // TODO: Refactor into something better than this :D
    switch (data.channel) {
      case 'CLEAR_CACHE':
        getPromptCache()?.clear();
        getCache()?.clear();
        break;

      case 'CONSOLE_LOG':
        consoleLog.info(data.log);
        break;

      case 'CONSOLE_WARN':
        consoleLog.warn(data.warn);
        break;

      case 'COPY_PATH_AS_PICTURE':
        clipboard.writeImage(data?.path);
        break;

      case 'GET_SCREEN_INFO':
        const cursor = screen.getCursorScreenPoint();
        // Get display with cursor
        const activeScreen = screen.getDisplayNearestPoint({
          x: cursor.x,
          y: cursor.y,
        });

        child?.send({ channel: 'SCREEN_INFO', activeScreen });
        break;

      case 'GET_MOUSE':
        const mouseCursor = screen.getCursorScreenPoint();

        child?.send({ channel: 'MOUSE', mouseCursor });
        break;

      case 'GET_SERVER_STATE':
        child?.send({ channel: 'SERVER', ...serverState });
        break;

      case 'HIDE_APP':
        appHidden = true;
        app?.hide();
        break;

      case 'NEEDS_RESTART':
        makeRestartNecessary();
        break;

      case 'QUIT_APP':
        reset();
        app.exit();
        break;

      case RUN_SCRIPT:
        invokePromptWindow(RUN_SCRIPT, data);
        break;

      case 'SET_LOGIN':
        app.setLoginItemSettings(data);
        break;

      case SET_MODE:
        invokePromptWindow(SET_MODE, data);
        break;

      case SET_HINT:
        invokePromptWindow(SET_HINT, data);
        break;

      case SET_PROMPT_TEXT:
        invokePromptWindow(SET_PROMPT_TEXT, data);
        break;

      case SET_PANEL:
        invokePromptWindow(SET_PANEL, data);
        break;

      case SET_TAB_INDEX:
        invokePromptWindow(SET_TAB_INDEX, data);
        break;

      case 'SHOW_TEXT':
        setBlurredByKit();

        show(
          String.raw`<div class="text-xs font-mono">${data.text}</div>`,
          data.options
        );

        break;

      case 'SHOW_IMAGE':
        setBlurredByKit();

        const { image, options } = data;
        const imgOptions = url.parse(image.src);

        const { width, height } = await new Promise((resolve, reject) => {
          const proto = imgOptions.protocol?.startsWith('https') ? https : http;
          proto.get(imgOptions, (response) => {
            const chunks: any = [];
            response
              .on('data', (chunk) => {
                chunks.push(chunk);
              })
              .on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(sizeOf(buffer));
              });
          });
        });

        const imageWindow = await show(
          data?.kitScript || 'show-image',
          String.raw`<img src="${image?.src}" alt="${image?.alt}" title="${image?.title}" />`,
          { width, height, ...options }
        );
        if (imageWindow && !imageWindow.isDestroyed()) {
          imageWindow.on('close', () => {
            focusPrompt();
          });
        }
        break;

      case 'SHOW_NOTIFICATION':
        setBlurredByKit();

        showNotification(data.html, data.options);
        break;

      case SHOW_PROMPT:
        ({ script, key } = stringifyScriptArgsKey(script, cacheKeyParts));

        if (data?.cache && !getCache()?.get(key)) {
          // kitLog.info(`>>>SET: ${key}`);
          if (key && data?.choices?.length > 0) {
            getCache()?.set(key, data);
          }
        }
        if (data?.choices) {
          // validate choices
          if (
            data?.choices.every(
              ({ name, value }: any) =>
                !isUndefined(name) && !isUndefined(value)
            )
          ) {
            invokePromptWindow(SHOW_PROMPT, data);
          } else {
            log.warn(`Choices must have "name" and "value"`);
            log.warn(data?.choices);
            if (!appHidden)
              setPromptText(
                `Warning: arg choices must have "name" and "value"`
              );
          }
        } else {
          invokePromptWindow(SHOW_PROMPT, data);
        }

        break;

      case 'SHOW':
        setBlurredByKit();
        const showWindow = await show('show', data.html, data.options);
        if (showWindow && !showWindow.isDestroyed()) {
          showWindow.on('close', () => {
            focusPrompt();
          });
        }
        break;

      case 'START_SERVER':
        const serverCallback = (s: string, a: string[]) => {
          tryKitScript(s, a);
        };
        startServer(data.host, parseInt(data.port, 10), serverCallback);
        break;

      case 'STOP_SERVER':
        stopServer();
        break;

      case 'UPDATE_APP':
        autoUpdater.checkForUpdatesAndNotify({
          title: 'Script Kit Updated',
          body: 'Relaunching...',
        });

        break;

      case SET_CHOICES:
        invokePromptWindow(SET_CHOICES, data);
        break;

      case 'UPDATE_PROMPT_WARN':
        getCache()?.delete(key);
        consoleLog.warn(`Prompt received warning. Deleting ${key} from cache`);

        setPromptText(data?.info);
        break;

      default:
        log.info(`Unknown message ${data.channel}`);
    }
  });

  child.on('error', (error) => {
    getCache()?.delete(key);
    consoleLog.warn(`Error ${error.message}. Deleting ${key} from cache`);
    reset();
    hidePromptWindow();
  });

  (child as any).stdout.on('data', (data: string) => {
    const line = data?.toString();
    log.info(line);
  });
};

export const tryKitScript = (filePath: string, runArgs: string[] = []) => {
  log.info(
    `
*** ${filePath} ${runArgs} ***`.trim()
  );
  try {
    kitScript(filePath, runArgs);
  } catch (error) {
    log.error(error);
  }
};
