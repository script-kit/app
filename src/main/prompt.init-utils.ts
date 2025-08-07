import type { KitPrompt } from './prompt';
import { Channel } from '@johnlindquist/kit/core/enum';
import { HideReason } from '../shared/enums';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import { kitState } from './state';

export function setupDevtoolsHandlers(prompt: KitPrompt) {
  prompt.window.webContents?.on('devtools-opened', () => {
    prompt.devToolsOpening = false;
    prompt.window.removeListener('blur', prompt.onBlur);
    prompt.makeWindow();
    prompt.sendToPrompt(Channel.DEV_TOOLS, true);
  });

  prompt.window.webContents?.on('devtools-closed', () => {
    prompt.logSilly('event: devtools-closed');

    if (kitState.isMac && !prompt.isWindow) {
      prompt.logInfo('👋 setPromptAlwaysOnTop: false, so makeWindow');
      prompt.makeWindow();
    } else {
      prompt.setPromptAlwaysOnTop(false);
    }

    if (prompt.scriptPath !== getMainScriptPath()) {
      prompt.maybeHide(HideReason.DevToolsClosed);
    }

    prompt.window.on('blur', prompt.onBlur);
    prompt.sendToPrompt(Channel.DEV_TOOLS, false);
  });
}


