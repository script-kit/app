import { fileURLToPath } from 'node:url';
import { PROMPT } from '@johnlindquist/kit/core/enum';
import type { BrowserWindowConstructorOptions } from 'electron';
import { getAssetPath } from '../shared/assets';
import { MIN_WIDTH } from '../shared/defaults';
import { getCurrentScreen } from './screen';
import { kitState } from './state';

import { createLogger } from './log-utils';

const log = createLogger('prompt.options.ts');

export const OFFSCREEN_X = -10000;
export const OFFSCREEN_Y = -10000;

export const getPromptOptions = () => {
  const width = PROMPT.WIDTH.BASE;
  const height = PROMPT.HEIGHT.BASE;
  // const currentScreen = getCurrentScreenFromMouse();
  const currentScreen = getCurrentScreen();
  const { width: screenWidth, height: screenHeight } = currentScreen.workAreaSize;
  const { x: workX, y: workY } = currentScreen.workArea;

  let backgroundThrottling = true;
  if (kitState?.kenvEnv?.KIT_BACKGROUND_THROTTLE) {
    backgroundThrottling = kitState.kenvEnv.KIT_BACKGROUND_THROTTLE === 'true';
  }

  let hasShadow = true;
  if (kitState?.kenvEnv?.KIT_SHADOW) {
    hasShadow = kitState.kenvEnv.KIT_SHADOW === 'true';
  }

  let frame = false;
  if (kitState?.kenvEnv?.KIT_FRAME) {
    frame = kitState.kenvEnv.KIT_FRAME === 'true';
  }

  let transparent = false;
  if (kitState?.kenvEnv?.KIT_TRANSPARENT) {
    transparent = kitState.kenvEnv.KIT_TRANSPARENT === 'true';
  }

  let x = Math.round(screenWidth / 2 - width / 2 + workX);
  // TODO: Windows prompt behavior
  // if (kitState.isWindows) {
  //   x = OFFSCREEN_X;
  // }

  if (kitState?.kenvEnv?.KIT_PROMPT_INITIAL_X) {
    x = Number.parseInt(kitState?.kenvEnv?.KIT_PROMPT_INITIAL_X);
  }

  let y = Math.round(workY + screenHeight / 8);

  // TODO: Windows prompt behavior
  // if (kitState.isWindows) {
  //   y = OFFSCREEN_Y;
  // }

  if (kitState?.kenvEnv?.KIT_PROMPT_INITIAL_Y) {
    y = Number.parseInt(kitState?.kenvEnv?.KIT_PROMPT_INITIAL_Y);
  }

  let show = false;

  // TODO: Windows prompt behavior
  // if (kitState.isWindows) {
  //   show = true;
  // }

  if (kitState?.kenvEnv?.KIT_PROMPT_INITIAL_SHOW === 'true') {
    show = true;
  }

  let backgroundColor: BrowserWindowConstructorOptions['backgroundColor'] = '#00000000';
  if (kitState?.kenvEnv?.KIT_BACKGROUND_COLOR) {
    backgroundColor = kitState.kenvEnv.KIT_BACKGROUND_COLOR;
  }

  let backgroundMaterial: BrowserWindowConstructorOptions['backgroundMaterial'] = 'acrylic';
  if (kitState?.kenvEnv?.KIT_BACKGROUND_MATERIAL) {
    backgroundMaterial = kitState.kenvEnv
      .KIT_BACKGROUND_MATERIAL as BrowserWindowConstructorOptions['backgroundMaterial'];
  }

  let roundedCorners: BrowserWindowConstructorOptions['roundedCorners'] = true;
  if (kitState?.kenvEnv?.KIT_ROUNDED_CORNERS === 'false') {
    roundedCorners = false;
  }

  let thickFrame: BrowserWindowConstructorOptions['thickFrame'] = true;
  if (kitState?.kenvEnv?.KIT_THICK_FRAME === 'false') {
    thickFrame = false;
  }

  // Log all of the conditional options:
  log.info('Prompt Options:', {
    gpu: kitState.gpuEnabled,
    backgroundThrottling,
    hasShadow,
    frame,
    transparent,
    x,
    y,
    show,
    backgroundColor,
    backgroundMaterial,
  });

  const options = {
    useContentSize: true,
    frame,
    hasShadow,
    show,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      backgroundThrottling,
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true,
      // backgroundThrottling: false,
      // experimentalFeatures: true,
      spellcheck: true,
      preload: fileURLToPath(new URL('../preload/index.mjs', import.meta.url)),
      webSecurity: false,
    },
    minimizable: false,
    maximizable: false,
    movable: true,
    skipTaskbar: true,
    width,
    height,
    minWidth: MIN_WIDTH,
    minHeight: PROMPT.INPUT.HEIGHT.XS,
    transparent,
    x,
    y,
    backgroundColor,
    backgroundMaterial,
    thickFrame,
    roundedCorners,
    focusable: kitState.isLinux,
  } as BrowserWindowConstructorOptions;

  if (kitState.isMac) {
    options.vibrancy = 'popover';
    options.visualEffectState = 'active';
    options.backgroundColor = kitState.kenvEnv.KIT_BACKGROUND_COLOR || '#00000000';
    options.transparent = true;
  }

  return options;
};
