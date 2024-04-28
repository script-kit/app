import { fileURLToPath } from 'url';
import { getAssetPath } from '../shared/assets';
import { getCurrentScreen } from './screen';
import { PROMPT } from '@johnlindquist/kit/core/enum';
import { kitState } from '../shared/state';
import { MIN_WIDTH } from '../shared/defaults';
import { BrowserWindowConstructorOptions } from 'electron';

export const getPromptOptions = () => {
  const width = PROMPT.WIDTH.BASE;
  const height = PROMPT.HEIGHT.BASE;
  // const currentScreen = getCurrentScreenFromMouse();
  const currentScreen = getCurrentScreen();
  const { width: screenWidth, height: screenHeight } =
    currentScreen.workAreaSize;
  const { x: workX, y: workY } = currentScreen.workArea;

  const options = {
    useContentSize: true,
    frame: false,
    hasShadow: true,
    show: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
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
    x: Math.round(screenWidth / 2 - width / 2 + workX),
    y: Math.round(workY + screenHeight / 8),
  } as BrowserWindowConstructorOptions;

  if (kitState.isMac) {
    options.vibrancy = 'popover';
    options.visualEffectState = 'active';
    options.backgroundColor =
      kitState.kenvEnv.KIT_BACKGROUND_COLOR || '#00000000';
    options.transparent = true;
  }

  return options;
};
