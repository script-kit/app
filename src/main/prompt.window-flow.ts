import path from 'node:path';
import type { Rectangle } from 'electron';
import { Channel, PROMPT } from '@johnlindquist/kit/core/enum';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import type { KitPrompt } from './prompt';
import { processWindowCoordinator, WindowOperation } from './process-window-coordinator';
import { ensureIdleProcess } from './process';
import { kitState } from './state';
import { getCurrentScreenPromptCache } from './prompt.screen-utils';

export function initShowPromptFlow(prompt: KitPrompt) {
  prompt.logInfo(`${prompt.pid}:🎪 initShowPrompt: ${prompt.id} ${prompt.scriptPath}`);
  if (!kitState.isMac) {
    if ((kitState?.kenvEnv as any)?.KIT_PROMPT_RESTORE === 'true') {
      prompt.window?.restore();
    }
  }

  prompt.setPromptAlwaysOnTop(true);
  if (prompt.window && !prompt.window.isDestroyed()) {
    (prompt as any).handleBlurVisibility?.(prompt);
  }
  prompt.focusPrompt();
  prompt.sendToPrompt(Channel.SET_OPEN, true);
  const topTimeout = (prompt as any).topTimeout;
  if (topTimeout) clearTimeout(topTimeout);
  setTimeout(() => {
    ensureIdleProcess();
  }, 10);
}

export function hideFlow(prompt: KitPrompt) {
  if (prompt.window.isVisible()) {
    prompt.hasBeenHidden = true as any;
  }
  prompt.logInfo('Hiding prompt window...');
  if (prompt.window.isDestroyed()) {
    prompt.logWarn('Prompt window is destroyed. Not hiding.');
    return;
  }
  const hideOpId = processWindowCoordinator.registerOperation(prompt.pid, WindowOperation.Hide, prompt.window.id);
  (prompt as any).actualHide();
  processWindowCoordinator.completeOperation(hideOpId);
}

export function onHideOnceFlow(prompt: KitPrompt, fn: () => void) {
  let id: null | NodeJS.Timeout = null;
  if (prompt.window) {
    const handler = () => {
      if (id) clearTimeout(id);
      prompt.window.removeListener('hide', handler);
      fn();
    };
    id = setTimeout(() => {
      if (!prompt?.window || prompt.window?.isDestroyed()) return;
      prompt.window?.removeListener('hide', handler);
    }, 1000);
    prompt.window?.once('hide', handler);
  }
}

export function showPromptFlow(prompt: KitPrompt) {
  if (prompt.window.isDestroyed()) return;
  const showOpId = processWindowCoordinator.registerOperation(prompt.pid, WindowOperation.Show, prompt.window.id);
  initShowPromptFlow(prompt);
  prompt.sendToPrompt(Channel.SET_OPEN, true);
  if (!prompt?.window || prompt.window?.isDestroyed()) {
    processWindowCoordinator.completeOperation(showOpId);
    return;
  }
  prompt.shown = true as any;
  processWindowCoordinator.completeOperation(showOpId);
}

export function moveToMouseScreenFlow(prompt: KitPrompt) {
  const { getCurrentScreenFromMouse } = require('./prompt.screen-utils');
  if (prompt?.window?.isDestroyed()) {
    prompt.logWarn('moveToMouseScreen. Window already destroyed', prompt?.id);
    return;
  }
  const mouseScreen = getCurrentScreenFromMouse();
  prompt.window.setPosition(mouseScreen.workArea.x, mouseScreen.workArea.y);
}

export function initBoundsFlow(prompt: KitPrompt, forceScriptPath?: string) {
  if (prompt?.window?.isDestroyed()) {
    prompt.logWarn('initBounds. Window already destroyed', prompt?.id);
    return;
  }
  const bounds = prompt.window.getBounds();
  const cachedBounds = getCurrentScreenPromptCache(forceScriptPath || (prompt as any).scriptPath, {
    ui: (prompt as any).ui,
    resize: (prompt as any).allowResize,
    bounds: { width: bounds.width, height: bounds.height },
  });
  const currentBounds = prompt?.window?.getBounds();
  prompt.logInfo(`${prompt.pid}:${path.basename((prompt as any)?.scriptPath || '')}: ↖ Init bounds: ${(prompt as any).ui} ui`, {
    currentBounds,
    cachedBounds,
  });
  const { x, y, width, height } = prompt.window.getBounds();
  if (cachedBounds.width !== width || cachedBounds.height !== height) {
    prompt.logVerbose(`Started resizing: ${prompt.window?.getSize()}. First prompt?: ${(prompt as any).firstPrompt ? 'true' : 'false'}`);
    (prompt as any).resizing = true;
  }
  if ((prompt as any).promptData?.scriptlet) cachedBounds.height = (prompt as any).promptData?.inputHeight;
  if (prompt?.window?.isFocused()) {
    cachedBounds.x = x;
    cachedBounds.y = y;
  }
  (prompt as any).setBounds(cachedBounds, 'initBounds');
}

export function blurPromptFlow(prompt: KitPrompt) {
  prompt.logInfo(`${prompt.pid}: blurPrompt`);
  if (prompt.window.isDestroyed()) return;
  if (prompt.window) {
    if (kitState.isMac) {
      const shims = require('./shims').default;
      shims['@johnlindquist/mac-panel-window'].blurInstant(prompt.window);
    }
    prompt.window.blur();
  }
}

export function initMainBoundsFlow(prompt: KitPrompt) {
  const cached = getCurrentScreenPromptCache(getMainScriptPath());
  if (!cached.height || cached.height < PROMPT.HEIGHT.BASE) cached.height = PROMPT.HEIGHT.BASE;
  (prompt as any).setBounds(cached as Partial<Rectangle>, 'initMainBounds');
}


