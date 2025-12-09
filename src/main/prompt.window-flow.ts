import path from 'node:path';
import { Channel, PROMPT } from '@johnlindquist/kit/core/enum';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import type { Rectangle } from 'electron';
import { ensureIdleProcess } from './process';
import { processWindowCoordinator, WindowOperation } from './process-window-coordinator';
import type { KitPrompt } from './prompt';
import { PromptEvent } from './prompt/state-machine';
import { getCurrentScreenFromMouse, getCurrentScreenPromptCache } from './prompt.screen-utils';
import shims from './shims';
import { kitState } from './state';

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
  if (prompt.window.isDestroyed()) {
    prompt.logWarn('Prompt window is destroyed. Not hiding.');
    return;
  }

  // Check actual window visibility - FSM state might be out of sync
  const windowIsVisible = prompt.window.isVisible();

  // FSM guard: prevent hiding when already hidden or disposing
  // But allow hiding if window is actually visible (state desync recovery)
  if (!prompt.fsm.guardHide('hideFlow') && !windowIsVisible) {
    return;
  }

  if (windowIsVisible) {
    prompt.hasBeenHidden = true;
  }
  prompt.logInfo('Hiding prompt window...');

  const hideOpId = processWindowCoordinator.registerOperation(prompt.pid, WindowOperation.Hide, prompt.window.id);
  (prompt as any).actualHide();

  // Transition FSM to HIDDEN state
  prompt.fsm.hide();

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
  // FSM guard: prevent showing when already visible or disposing
  if (!prompt.fsm.guardShow('showPromptFlow')) {
    return;
  }

  if (prompt.window.isDestroyed()) return;
  const showOpId = processWindowCoordinator.registerOperation(prompt.pid, WindowOperation.Show, prompt.window.id);
  initShowPromptFlow(prompt);
  prompt.sendToPrompt(Channel.SET_OPEN, true);
  if (!prompt?.window || prompt.window?.isDestroyed()) {
    processWindowCoordinator.completeOperation(showOpId);
    return;
  }

  // Transition FSM to VISIBLE state
  prompt.fsm.show();

  processWindowCoordinator.completeOperation(showOpId);
}

export function moveToMouseScreenFlow(prompt: KitPrompt) {
  if (prompt?.window?.isDestroyed()) {
    prompt.logWarn('moveToMouseScreen. Window already destroyed', prompt?.id);
    return;
  }
  const mouseScreen = getCurrentScreenFromMouse();
  prompt.window.setPosition(mouseScreen.workArea.x, mouseScreen.workArea.y);
}

export function initBoundsFlow(prompt: KitPrompt, forceScriptPath?: string) {
  // FSM guard: prevent bounds operations when disposing or bounds locked
  if (!prompt.fsm.guardBounds('initBoundsFlow')) {
    return;
  }

  if (prompt?.window?.isDestroyed()) {
    prompt.logWarn('initBounds. Window already destroyed', prompt?.id);
    return;
  }

  // During a deferred-show resize cycle we don't want cached bounds (from
  // attemptPreload or similar) to overwrite the renderer-calculated size.
  // We only skip when forceScriptPath is provided, which is the preload path.
  // However, we still apply the POSITION (x, y) so the window isn't stuck at top-left.
  if (prompt.boundsLockedForResize && forceScriptPath) {
    const cacheKey = `${forceScriptPath}::${(prompt as any).windowMode || 'panel'}`;
    const currentBounds = prompt.window.getBounds();
    const cachedBounds = getCurrentScreenPromptCache(cacheKey, {
      ui: (prompt as any).ui,
      resize: (prompt as any).allowResize,
      bounds: { width: currentBounds.width, height: currentBounds.height },
    });
    prompt.logInfo(
      `${prompt.pid}:${path.basename(forceScriptPath)}: ⏭ initBounds size skipped (boundsLockedForResize=true), applying position only`,
      { cachedX: cachedBounds.x, cachedY: cachedBounds.y, currentBounds },
    );
    // Apply position only, keep current width/height (which may be set by resize)
    if (typeof cachedBounds.x === 'number' && typeof cachedBounds.y === 'number') {
      (prompt as any).setBounds(
        { x: cachedBounds.x, y: cachedBounds.y, width: currentBounds.width, height: currentBounds.height },
        'initBounds-positionOnly',
      );
    }
    return;
  }

  const bounds = prompt.window.getBounds();
  const cacheKey = `${forceScriptPath || (prompt as any).scriptPath}::${(prompt as any).windowMode || 'panel'}`;
  const cachedBounds = getCurrentScreenPromptCache(cacheKey, {
    ui: (prompt as any).ui,
    resize: (prompt as any).allowResize,
    bounds: { width: bounds.width, height: bounds.height },
  });
  const currentBounds = prompt?.window?.getBounds();
  prompt.logInfo(
    `${prompt.pid}:${path.basename((prompt as any)?.scriptPath || '')}: ↖ Init bounds: ${(prompt as any).ui} ui`,
    {
      currentBounds,
      cachedBounds,
    },
  );
  const { x, y, width, height } = prompt.window.getBounds();
  if (cachedBounds.width !== width || cachedBounds.height !== height) {
    prompt.logVerbose(
      `Started resizing: ${prompt.window?.getSize()}. First prompt?: ${(prompt as any).firstPrompt ? 'true' : 'false'}`,
    );
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
    prompt.window.blur();
  }
}

export function initMainBoundsFlow(prompt: KitPrompt) {
  const cached = getCurrentScreenPromptCache(getMainScriptPath());
  if (!cached.height || cached.height < PROMPT.HEIGHT.BASE) cached.height = PROMPT.HEIGHT.BASE;
  (prompt as any).setBounds(cached as Partial<Rectangle>, 'initMainBounds');
}
