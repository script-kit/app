import { Channel } from '@johnlindquist/kit/core/enum';
import { AppChannel } from '../shared/enums';
import { kitCache, kitState } from './state';

export const initMainChoicesImpl = (prompt: any): void => {
  prompt.logInfo(`${prompt.pid}: Caching main scored choices: ${kitCache.choices.length}`);
  prompt.logInfo(
    'Most recent 3:',
    kitCache.choices.slice(1, 4).map((c) => c?.item?.name),
  );
  if (prompt.window && !prompt.window.isDestroyed()) {
    prompt.sendToPrompt(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, kitCache.choices);
  }
};

export const initMainPreviewImpl = (prompt: any): void => {
  if (!prompt.window || prompt.window.isDestroyed()) {
    prompt.logWarn('initMainPreview: Window is destroyed. Skipping sendToPrompt.');
    return;
  }
  prompt.sendToPrompt(AppChannel.SET_CACHED_MAIN_PREVIEW, kitCache.preview);
};

export const initMainShortcutsImpl = (prompt: any): void => {
  if (prompt.window && !prompt.window.isDestroyed()) {
    prompt.sendToPrompt(AppChannel.SET_CACHED_MAIN_SHORTCUTS, kitCache.shortcuts);
  }
};

export const initMainFlagsImpl = (prompt: any): void => {
  if (prompt.window && !prompt.window.isDestroyed()) {
    prompt.sendToPrompt(AppChannel.SET_CACHED_MAIN_SCRIPT_FLAGS, kitCache.scriptFlags);
  }
};

export const initThemeImpl = (prompt: any): void => {
  prompt.themeLogInfo(`${prompt.pid}: initTheme: ${kitState.themeName}`);
  prompt.sendToPrompt(Channel.SET_THEME, kitState.theme);
};

export const initPromptImpl = (prompt: any): void => {
  prompt.logInfo(
    `📤📤📤 SENDING INIT_PROMPT to renderer: pid=${prompt.pid}, scriptPath="${prompt.scriptPath}", initMain=${prompt.initMain}`,
  );
  prompt.sendToPrompt(AppChannel.INIT_PROMPT, {});
};
