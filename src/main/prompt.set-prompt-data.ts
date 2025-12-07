import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import type { PromptData } from '@johnlindquist/kit/types/core';
import { debounce } from 'lodash-es';
import { AppChannel } from '../shared/enums';
import { applyPromptDataBounds } from './prompt.bounds-utils';
import type { IPromptContext } from './prompt.types';
import { createPty } from './pty';
import { getCurrentScreen } from './screen';
import { setFlags } from './search';
import { kitState, preloadPromptDataMap, promptState } from './state';

export const setPromptDataImpl = async (prompt: any, promptData: PromptData): Promise<void> => {
  prompt.promptData = promptData;

  const setPromptDataHandler = debounce(
    (_x: unknown, { ui }: { ui: UI }) => {
      prompt.logInfo(`${prompt.pid}: Received SET_PROMPT_DATA from renderer. ${ui} Ready!`);
      prompt.refocusPrompt();
    },
    100,
    {
      leading: true,
      trailing: false,
    },
  );

  prompt.window.webContents.ipc.removeHandler(Channel.SET_PROMPT_DATA);
  prompt.window.webContents.ipc.once(Channel.SET_PROMPT_DATA, setPromptDataHandler);

  if (promptData.ui === UI.term) {
    const termConfig = {
      command: (promptData as any)?.command || '',
      cwd: promptData.cwd || '',
      shell: (promptData as any)?.shell || '',
      promptId: prompt.id || '',
      env: promptData.env || {},
      args: (promptData as any)?.args || [],
      closeOnExit: typeof (promptData as any)?.closeOnExit === 'boolean' ? (promptData as any).closeOnExit : undefined,
      pid: prompt.pid,
    };
    prompt.sendToPrompt(AppChannel.SET_TERM_CONFIG, termConfig);
    createPty(prompt);
  }

  prompt.scriptPath = promptData?.scriptPath;
  prompt.clearFlagSearch();
  prompt.kitSearch.shortcodes.clear();
  prompt.kitSearch.triggers.clear();
  if (promptData?.hint) {
    for (const trigger of promptData?.hint?.match(/(?<=\[)\w+(?=\])/gi) || []) {
      prompt.kitSearch.triggers.set(trigger, { name: trigger, value: trigger });
    }
  }

  prompt.kitSearch.commandChars = promptData.inputCommandChars || [];
  prompt.updateShortcodes();

  if (prompt.cacheScriptPromptData && !promptData.preload) {
    prompt.cacheScriptPromptData = false;
    promptData.name ||= prompt.script.name || '';
    promptData.description ||= prompt.script.description || '';
    prompt.logInfo(`💝 Caching prompt data: ${prompt?.scriptPath}`);
    preloadPromptDataMap.set(prompt.scriptPath, {
      ...promptData,
      input: promptData?.keyword ? '' : promptData?.input || '',
      keyword: '',
    });
  }

  if (promptData.flags && typeof promptData.flags === 'object') {
    prompt.logInfo(`🏳️‍🌈 Setting flags from setPromptData: ${Object.keys(promptData.flags)}`);
    setFlags(prompt, promptData.flags);
  }

  kitState.hiddenByUser = false;

  if (typeof promptData?.alwaysOnTop === 'boolean') {
    prompt.logInfo(`📌 setPromptAlwaysOnTop from promptData: ${promptData.alwaysOnTop ? 'true' : 'false'}`);
    prompt.setPromptAlwaysOnTop(promptData.alwaysOnTop, true);
  }

  if (typeof promptData?.skipTaskbar === 'boolean') {
    prompt.setSkipTaskbar(promptData.skipTaskbar);
  }

  prompt.allowResize = promptData?.resize;
  kitState.shortcutsPaused = promptData.ui === UI.hotkey;

  prompt.logVerbose(`setPromptData ${promptData.scriptPath}`);

  prompt.id = promptData.id;
  prompt.ui = promptData.ui;

  if (prompt.kitSearch.keyword) {
    promptData.keyword = prompt.kitSearch.keyword || prompt.kitSearch.keyword;
  }

  // Send user data BEFORE prompt data only if we haven't bootstrapped this prompt yet
  const userSnapshot = (await import('valtio')).snapshot(kitState.user);
  const ctx = prompt as IPromptContext;
  prompt.logInfo(`Early user data considered: ${userSnapshot?.login || 'not logged in'}`);
  if (!ctx.__userBootstrapped) {
    prompt.sendToPrompt(AppChannel.USER_CHANGED, userSnapshot);
    ctx.__userBootstrapped = true;
  }

  prompt.sendToPrompt(Channel.SET_PROMPT_DATA, promptData);

  const isMainScript = getMainScriptPath() === promptData.scriptPath;
  const visible = prompt.isVisible();
  const shouldShow = promptData?.show !== false;

  // FAST PATH: Main script never defers - must be instant
  // Skip all the expensive defer calculations for main menu
  let shouldDeferShow = false;
  if (!isMainScript && !visible && shouldShow) {
    // Only compute defer logic for non-main scripts that need to show
    const hasExplicitDimensions =
      typeof promptData?.width === 'number' ||
      typeof promptData?.height === 'number' ||
      typeof promptData?.inputHeight === 'number';

    const currentBounds = prompt.window?.getBounds();
    const targetWidth = promptData?.width ?? currentBounds?.width;
    const targetHeight = promptData?.height ?? promptData?.inputHeight ?? currentBounds?.height;
    const significantSizeDifference =
      currentBounds &&
      (Math.abs(currentBounds.width - targetWidth) > 20 || Math.abs(currentBounds.height - targetHeight) > 20);

    // Check if this script has cached bounds from a previous run
    const currentScreen = getCurrentScreen();
    const screenId = String(currentScreen.id);
    const scriptPath = promptData?.scriptPath;
    const hasCachedBounds = Boolean(scriptPath && promptState?.screens?.[screenId]?.[scriptPath]);

    const shouldDeferForExplicitDimensions = hasExplicitDimensions && significantSizeDifference;
    const shouldDeferForFirstRun = !hasCachedBounds && promptData?.ui === UI.arg;
    shouldDeferShow = shouldDeferForExplicitDimensions || shouldDeferForFirstRun;

    prompt.logInfo(`${prompt.id}: shouldDeferShow=${shouldDeferShow}`, {
      visible,
      shouldShow,
      hasExplicitDimensions,
      significantSizeDifference,
      hasCachedBounds,
      shouldDeferForExplicitDimensions,
      shouldDeferForFirstRun,
      currentBounds: currentBounds ? { w: currentBounds.width, h: currentBounds.height } : null,
      target: { w: targetWidth, h: targetHeight },
    });
  }

  // If we're deferring the initial show, lock bounds so that any
  // initBounds() calls (for example from attemptPreload) can't overwrite
  // the renderer-calculated size while we're waiting on resize().
  if (shouldDeferShow) {
    prompt.boundsLockedForResize = true;
    if (prompt.boundsLockTimeout) {
      clearTimeout(prompt.boundsLockTimeout);
    }
    prompt.boundsLockTimeout = setTimeout(() => {
      try {
        if (prompt.window?.isDestroyed?.()) return;
        prompt.logInfo(`${prompt.id}: boundsLockedForResize timeout – unlocking`);
        prompt.boundsLockedForResize = false;
        prompt.boundsLockTimeout = null;
      } catch {
        // ignore
      }
    }, 500);
  } else {
    if (prompt.boundsLockTimeout) {
      clearTimeout(prompt.boundsLockTimeout);
      prompt.boundsLockTimeout = null;
    }
    prompt.boundsLockedForResize = false;
  }

  // Only call initBounds if NOT deferring for resize
  // When deferring, let the first resize set the correct dimensions
  if (prompt.firstPrompt && !isMainScript) {
    if (shouldDeferShow) {
      prompt.logInfo(`${prompt.pid} Skipping initBounds - deferring for resize`);
    } else {
      prompt.logInfo(`${prompt.pid} Before initBounds`);
      prompt.initBounds();
      prompt.logInfo(`${prompt.pid} After initBounds`);
    }
    prompt.logInfo(`${prompt.pid} Disabling firstPrompt`);
    prompt.firstPrompt = false;
  }

  if (!isMainScript) {
    applyPromptDataBounds(prompt.window, promptData);
  }

  if (kitState.hasSnippet) {
    const timeout = prompt.script?.snippetdelay || 0;
    await new Promise((r) => setTimeout(r, timeout));
    kitState.hasSnippet = false;
  }

  prompt.logInfo(`${prompt.id}: visible ${visible ? 'true' : 'false'} 👀`);

  if (!visible && shouldShow) {
    prompt.logInfo(`${prompt.id}: Prompt not visible but should show`);

    if (shouldDeferShow) {
      prompt.showAfterNextResize = true;
      // Prevent attemptPreload->initBounds from overwriting resize-calculated dimensions
      prompt.skipInitBoundsForResize = true;
      // Safety fallback: if resize doesn't happen within 200ms, show anyway
      // This handles edge cases like resize being disabled or already at target size
      setTimeout(() => {
        if (prompt.showAfterNextResize && !prompt.window?.isDestroyed()) {
          prompt.logWarn(`${prompt.id}: showAfterNextResize fallback triggered`);
          prompt.showAfterNextResize = false;
          prompt.skipInitBoundsForResize = false;
          prompt.showPrompt();
        }
      }, 200);
    } else if (!prompt.firstPrompt) {
      prompt.showPrompt();
    } else {
      prompt.showAfterNextResize = true;
    }
  } else if (visible && !shouldShow) {
    prompt.actualHide();
  }

  if (!visible && promptData?.scriptPath.includes('.md#')) {
    prompt.focusPrompt();
  }
};
