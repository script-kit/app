/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/prefer-default-export */
import { Channel, Mode, UI } from 'kit-bridge/cjs/enum';
import { Choice, Script, PromptData, PromptBounds } from 'kit-bridge/cjs/type';

import { BrowserWindow, screen, nativeTheme, app, Rectangle } from 'electron';
import log from 'electron-log';
import { debounce, throttle } from 'lodash';
import minimist from 'minimist';
import { readFileSync } from 'fs';
import { mainScriptPath, isFile, kenvPath, kitPath } from 'kit-bridge/cjs/util';
import { getPromptDb } from 'kit-bridge/cjs/db';
import { Display } from 'electron/main';
import { getAssetPath } from './assets';
// import { Channel, Mode, UI } from 'kit-bridge/cjs/type';
import { getAppHidden } from './appHidden';
import { getScriptsMemory } from './state';
import { emitter, KitEvent } from './events';

let promptScript: Script;
let promptWindow: BrowserWindow;
let blurredByKit = false;
let ignoreBlur = false;

export const setBlurredByKit = (value = true) => {
  blurredByKit = value;
};

export const setIgnoreBlur = (value = true) => {
  ignoreBlur = value;
};

const miniArgs = minimist(process.argv);
const { devTools } = miniArgs;
log.info(process.argv.join(' '), devTools);

let lastResizedByUser = false;

export const createPromptWindow = async () => {
  promptWindow = new BrowserWindow({
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: nativeTheme.shouldUseDarkColors
      ? '#33000000'
      : '#C0FFFF00',
    vibrancy: 'popover',
    visualEffectState: 'active',
    show: false,
    hasShadow: true,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: process.env.NODE_ENV === 'development' || devTools,
      backgroundThrottling: false,
    },
    alwaysOnTop: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    movable: true,
    skipTaskbar: true,
  });

  promptWindow.setAlwaysOnTop(true, 'floating', 1);
  promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  promptWindow.loadURL(`file://${__dirname}/index.html`);

  promptWindow.webContents.once('did-finish-load', () => {
    promptWindow?.webContents.closeDevTools();
  });

  promptWindow?.setMaxListeners(2);

  // promptWindow?.webContents.on('before-input-event', (event: any, input) => {
  //   if (input.key === 'Escape') {
  //     if (promptWindow) escapePromptWindow(promptWindow);
  //   }
  // });

  promptWindow.on('focus', () => {
    promptWindow.setVibrancy('popover');
  });

  promptWindow.on('hide', () => {
    ignoreBlur = false;
  });

  promptWindow?.on('blur', () => {
    if (promptScript.filePath !== mainScriptPath && ignoreBlur) {
      promptWindow.setVibrancy('hud');
    } else {
      hidePromptWindow();
    }

    if (
      !ignoreBlur &&
      !getAppHidden() &&
      !promptWindow?.webContents.isDevToolsOpened()
    ) {
      emitter.emit(KitEvent.Blur);
    }
  });

  const userResize = (event: Event, rect: Rectangle) => {
    lastResizedByUser = true;
    sendToPrompt(Channel.USER_RESIZED, rect);
  };

  const userMove = async (event: Event) => {
    await cachePromptBounds(Bounds.Position);
  };

  promptWindow?.on('will-resize', throttle(userResize, 500));
  promptWindow?.on(
    'resized',
    debounce(async (event: Event, rect: Rectangle) => {
      await cachePromptBounds(Bounds.Size);
    }, 500)
  );

  promptWindow?.on('move', debounce(userMove, 500));

  // setInterval(() => {
  //   const [, newHeight] = promptWindow?.getSize() as number[];
  //   const { height: boundsHeight } = promptWindow?.getBounds() as Rectangle;
  //   const {
  //     height: normalBoundsHeight,
  //   } = promptWindow?.getNormalBounds() as Rectangle;
  //   const {
  //     height: contentBoundsHeight,
  //   } = promptWindow?.getContentBounds() as Rectangle;
  //   log.info(
  //     `REPORTING HEIGHT: `,
  //     newHeight,
  //     boundsHeight,
  //     normalBoundsHeight,
  //     contentBoundsHeight
  //   );
  // }, 2000);

  return promptWindow;
};

export const setPromptProp = (key: string, value: any) => {
  (promptWindow as any)[key](value);
};

export const focusPrompt = () => {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow?.focus();
  }
};

export const escapePromptWindow = () => {
  blurredByKit = false;
  hideAppIfNoWindows();
};

const getCurrentScreen = (): Display => {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
};

export const getCurrentScreenPromptCache = async () => {
  const currentScreen = getCurrentScreen();
  const promptDb = await getPromptDb();

  const screenCache = promptDb.screens?.[String(currentScreen.id)];

  const currentPromptCache = screenCache?.[promptScript?.filePath as string];

  if (currentPromptCache) return currentPromptCache;

  const { id, bounds } = getDefaultBounds(currentScreen);
  if (!promptDb.screens[String(currentScreen.id)])
    promptDb.screens[String(currentScreen.id)] = {};
  promptDb.screens[String(currentScreen.id)][promptScript.filePath] = bounds;
  await promptDb.write();

  return bounds;
};

const guessTopHeight = (script: Script) => {
  let height = 0;
  if (script?.description || script?.twitter || script?.menu) {
    height += 12;
  }

  height += 64;

  if (script?.tabs?.length) {
    height += 12;
  }

  return height;
};

export const getDefaultBounds = (currentScreen: Display) => {
  const { width: screenWidth, height: screenHeight } =
    currentScreen.workAreaSize;

  const DEFAULT_WIDTH = 370;

  const height =
    promptScript.filePath.includes(kitPath()) || instantChoices.length
      ? Math.round((DEFAULT_WIDTH * 11) / 8.5)
      : currentUI === UI.arg
      ? guessTopHeight(promptScript)
      : heightMap[currentUI]; // Math.round(screenHeight / 1.5);
  const width = DEFAULT_WIDTH; // Math.round(height * (8.5 / 11));
  const { x: workX, y: workY } = currentScreen.workArea;
  const x = Math.round(screenWidth / 2 - width / 2 + workX);
  const y = Math.round(workY + height / 10);

  return { id: currentScreen.id, bounds: { x, y, width, height } };
};

const INPUT_HEIGHT = 64;
const MIN_HEIGHT = INPUT_HEIGHT;
const MIN_WIDTH = 320;

const heightMap: { [key in UI]: number } = {
  [UI.none]: INPUT_HEIGHT,
  [UI.arg]: INPUT_HEIGHT,
  [UI.textarea]: 480,
  [UI.hotkey]: INPUT_HEIGHT,
  [UI.drop]: 280,
  [UI.editor]: 480,
  [UI.form]: 480,
  [UI.div]: 480,
  [UI.log]: INPUT_HEIGHT,
};

const setBounds = async () => {
  const bounds = await getCurrentScreenPromptCache();

  if (!promptWindow?.isVisible()) {
    // sendToPrompt(Channel.SET_MAX_HEIGHT, bounds.height);

    log.info(`↖ BOUNDS:`, bounds);
    promptWindow.setBounds(bounds);
  }
};

export const showPrompt = async () => {
  await setBounds();

  if (!promptWindow?.isVisible()) {
    promptWindow?.show();
    if (devTools) promptWindow?.webContents.openDevTools();
  }

  return promptWindow;
};

export const resizePromptHeight = ({
  height,
  cache,
}: {
  height: number;
  cache: boolean;
}) => {
  if (lastResizedByUser) {
    lastResizedByUser = false;
    return;
  }

  const bounds = promptWindow?.getBounds();

  // console.log({
  //   height,
  //   cache,
  //   boundsHeight: bounds.height,
  //   visible: promptWindow.isVisible(),
  // });

  if (height !== bounds.height && promptWindow?.isVisible()) {
    log.info(`↕ RESIZE: ${bounds.width} x ${height}`);

    promptWindow?.setBounds({ ...bounds, height });
    if (cache) cachePromptBounds(Bounds.Size);
  }
};

export const sendToPrompt = (channel: string, data: any) => {
  if (channel === Channel.SET_SCRIPT) {
    promptScript = data as Script;
  }
  // log.info(`>_ ${channel} ${data?.kitScript}`);
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow?.webContents.send(channel, data);
  }
};

enum Bounds {
  Position = 1 << 0,
  Size = 1 << 1,
}

const cachePromptBounds = async (b = Bounds.Position | Bounds.Size) => {
  const currentScreen = getCurrentScreen();
  const promptDb = await getPromptDb();

  const bounds = promptWindow?.getBounds();
  const prevBounds =
    promptDb.screens?.[String(currentScreen.id)]?.[promptScript.filePath] ||
    bounds;
  // Ignore if flag
  const size = b & Bounds.Size;
  const position = b & Bounds.Position;

  const { x, y } = position ? bounds : prevBounds;
  const { width, height } = size ? bounds : prevBounds;

  const promptBounds: PromptBounds = {
    x,
    y,
    width: width < MIN_WIDTH ? MIN_WIDTH : width,
    height: height < MIN_HEIGHT ? MIN_HEIGHT : height,
  };

  promptDb.screens[String(currentScreen.id)][promptScript.filePath] =
    promptBounds;

  log.info(`Cache prompt:`, {
    script: promptScript.filePath,
    screen: currentScreen.id,
    ...promptBounds,
  });

  await promptDb.write();
};

const hideAppIfNoWindows = () => {
  if (promptWindow?.isVisible()) {
    const allWindows = BrowserWindow.getAllWindows();
    // Check if all other windows are hidden

    promptWindow?.hide();
    // setPromptBounds();

    if (allWindows.every((window) => !window.isVisible())) {
      app?.hide();
    }
  }
};

export const hidePromptWindow = () => {
  if (promptWindow?.webContents.isDevToolsFocused()) return;

  if (blurredByKit) {
    blurredByKit = false;
    return;
  }

  hideAppIfNoWindows();

  blurredByKit = false;
};

export const setPlaceholder = (text: string) => {
  // if (!getAppHidden())
  sendToPrompt(Channel.SET_PLACEHOLDER, text);
};

let promptPid = 0;

export const getPromptPid = () => promptPid;

export const setPromptPid = (pid: number) => {
  promptPid = pid;
  sendToPrompt(Channel.SET_PID, pid);
};

let instantChoices = [];

export const setScript = async (script: Script) => {
  // if (promptScript?.id === script?.id) return;
  // log.info(script);

  if (script.filePath === mainScriptPath) {
    script.tabs = script?.tabs?.filter((tab) => !tab.match(/join|live/i));
  }

  sendToPrompt(Channel.SET_SCRIPT, script);
  instantChoices = [];
  if (script.filePath === mainScriptPath) {
    instantChoices = getScriptsMemory();
  } else if (script.requiresPrompt) {
    const maybeCachedChoices = kenvPath('db', `_${script.command}.json`);
    if (await isFile(maybeCachedChoices)) {
      const choicesFile = readFileSync(maybeCachedChoices, 'utf-8');
      const { items } = JSON.parse(choicesFile);
      log.info(`📦 Setting choices from ${maybeCachedChoices}`);
      instantChoices = items.map((item: string | Choice, id: number) =>
        typeof item === 'string' ? { name: item, id } : item
      );
    }
  }
  // log.info({ length: instantChoices.length, path: script.filePath });

  if (instantChoices.length) setChoices(instantChoices);
};

export const setMode = (mode: Mode) => {
  sendToPrompt(Channel.SET_MODE, mode);
};

export const setInput = (input: string) => {
  sendToPrompt(Channel.SET_INPUT, input);
};

export const setPanel = (html: string) => {
  sendToPrompt(Channel.SET_PANEL, html);
};

export const setLog = (_log: string) => {
  sendToPrompt(Channel.SET_LOG, _log);
};

export const setHint = (hint: string) => {
  sendToPrompt(Channel.SET_HINT, hint);
};

export const setTabIndex = (tabIndex: number) => {
  sendToPrompt(Channel.SET_TAB_INDEX, tabIndex);
};

let currentUI: UI;
export const setPromptData = async (promptData: PromptData) => {
  currentUI = promptData.ui;
  sendToPrompt(Channel.SET_PROMPT_DATA, promptData);
  await showPrompt();
};

export const setChoices = (choices: Choice[]) => {
  sendToPrompt(Channel.SET_CHOICES, choices);
};

export const clearPromptCache = async () => {
  const promptDb = await getPromptDb();
  promptDb.screens = {};
  await promptDb.write();
};

emitter.on(KitEvent.ExitPrompt, () => {
  escapePromptWindow();
});

export const reload = () => {
  promptWindow?.reload();
};
