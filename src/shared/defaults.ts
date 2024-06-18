import { ProcessType, UI } from '@johnlindquist/kit/core/enum';
import type { Choice, Script } from '@johnlindquist/kit/types/core';

export const DEFAULT_LIST_WIDTH = 300; // 256;
export const DEFAULT_WIDTH = 300; // 256;
export const DEFAULT_EXPANDED_WIDTH = 768;
export const DEFAULT_HEIGHT = 480; // Math.round((DEFAULT_EXPANDED_WIDTH * 10) / 16); // 480;
export const INPUT_HEIGHT = 56;
export const TOP_HEIGHT = 88;
export const MIN_HEIGHT = TOP_HEIGHT;
export const MIN_TEXTAREA_HEIGHT = MIN_HEIGHT * 3;
export const MIN_WIDTH = 256;
export const DROP_HEIGHT = 232;
export const BUTTON_HEIGHT = 56;
export const EMOJI_WIDTH = 278;
export const EMOJI_HEIGHT = 380;
export const ZOOM_LEVEL = 0;

export const heightMap: { [key in UI]: number } = {
  [UI.none]: INPUT_HEIGHT,
  [UI.arg]: DEFAULT_HEIGHT,
  [UI.textarea]: DEFAULT_HEIGHT,
  [UI.hotkey]: INPUT_HEIGHT,
  [UI.drop]: DROP_HEIGHT,
  [UI.editor]: DEFAULT_HEIGHT,
  [UI.form]: DEFAULT_HEIGHT,
  [UI.div]: DEFAULT_HEIGHT,
  [UI.log]: INPUT_HEIGHT,
};

export const SPLASH_PATH = '__app__/splash-screen';
export const noScript: Script = {
  id: '',
  filePath: '__app__/no-script',
  command: '',
  name: '',
  type: ProcessType.App,
  kenv: '',
};

export const noChoice: Choice = {
  id: '',
  name: '__app__/no-choice',
  hasPreview: false,
};

export const closedDiv = '<div></div>';
