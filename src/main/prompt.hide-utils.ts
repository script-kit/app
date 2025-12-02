import { HideReason } from '../shared/enums';
import { emitter, KitEvent } from '../shared/events';
import { invokeSearch } from './search';
import { kitState } from './state';

export const actualHideImpl = (prompt: any): void => {
  if (!prompt?.window) return;
  if (prompt.window.isDestroyed()) return;
  if (kitState.emojiActive) {
    kitState.emojiActive = false;
  }
  prompt.setPromptAlwaysOnTop(false);
  if (!isVisibleImpl(prompt)) return;
  prompt.logInfo('🙈 Hiding prompt window');
  prompt.hideInstant();
};

export const isVisibleImpl = (prompt: any): boolean => {
  if (!prompt.window) return false;
  if (prompt.window.isDestroyed()) return false;
  return Boolean(prompt.window?.isVisible());
};

export const maybeHideImpl = (prompt: any, reason: string): void => {
  if (!(isVisibleImpl(prompt) && prompt.boundToProcess)) return;
  prompt.logInfo(`Attempt Hide: ${reason}`);

  if (reason === HideReason.NoScript || reason === HideReason.Escape || reason === HideReason.BeforeExit) {
    actualHideImpl(prompt);
    prompt.clearSearch();
    invokeSearch(prompt, '', 'maybeHide, so clear');
    return;
  }

  if (reason === HideReason.PingTimeout) {
    prompt.logInfo('⛑ Attempting recover...');
    emitter.emit(KitEvent.KillProcess, prompt.pid);
    actualHideImpl(prompt);
    prompt.reload();
    return;
  }

  if (reason === HideReason.DebuggerClosed) {
    actualHideImpl(prompt);
    return;
  }

  if (prompt.window?.isVisible()) {
    prompt.logInfo(`Hiding because ${reason}`);
    if (!kitState.preventClose) {
      actualHideImpl(prompt);
    }
  }
};
