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

export type PromptWindowMode = 'panel' | 'window';

/**
 * Get window options for creating prompts
 * @param arg - Can be boolean (backward compat) or PromptWindowMode
 *              boolean true or 'window' creates a standard window
 *              boolean false or 'panel' creates a panel window
 */
export const getPromptOptions = (arg: boolean | PromptWindowMode = false) => {
  const useStandardWindow = arg === true || arg === 'window';
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
  // Standard windows always get OS chrome & controls
  if (useStandardWindow) {
    frame = true;
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
    mode: useStandardWindow ? 'window' : 'panel',
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
    minimizable: useStandardWindow,
    maximizable: useStandardWindow,
    movable: true,
    skipTaskbar: !useStandardWindow,
    width,
    height,
    minWidth: MIN_WIDTH,
    minHeight: PROMPT.INPUT.HEIGHT.XS,
    // transparent,
    x,
    y,
    backgroundColor,
    // backgroundMaterial,
    thickFrame,
    roundedCorners,
    focusable: kitState.isLinux || useStandardWindow,
    type: useStandardWindow ? undefined : 'panel',
    visualEffectState: 'followWindow',
    // Panel-specific options for macOS to avoid NSWindow warnings
    ...(kitState.isMac && !useStandardWindow ? {
      alwaysOnTop: false,  // Don't set alwaysOnTop in constructor for panels
      titleBarStyle: undefined,  // Ensure no title bar style conflicts
    } : {}),
  } as BrowserWindowConstructorOptions;

  if (kitState.isMac) {
    // Only give panel vibrancy to panel mode
    if (!useStandardWindow) {
      options.vibrancy = 'popover';
      options.visualEffectState = 'followWindow';
      // options.backgroundColor = kitState.kenvEnv.KIT_BACKGROUND_COLOR || '#00000000';
      // options.transparent = true;
    }
  }

  return options;
};
