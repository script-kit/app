import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
import type { PromptData } from '@johnlindquist/kit/types/core';
import { debounce } from 'lodash-es';
import { AppChannel } from '../shared/enums';
import { applyPromptDataBounds } from './prompt.bounds-utils';
import { createPty } from './pty';
import { getCurrentScreen } from './screen';
import { setFlags } from './search';
import { kitState, preloadPromptDataMap, promptState } from './state';

/**
 * Determine if we should defer showing the window until layout is complete
 *
 * The layout engine ensures that when we defer, the window will be shown
 * after the first resize completes with the correct bounds. This prevents
 * "The Flash" where the window briefly appears at the wrong size.
 *
 * We defer when:
 * 1. Not the main script (main menu must be instant)
 * 2. Window is not already visible
 * 3. Script has explicit dimensions OR this is the first run (no cached bounds)
 */
function shouldDeferShowForLayout(
  prompt: any,
  promptData: PromptData,
  isMainScript: boolean,
  visible: boolean,
  shouldShow: boolean,
): { defer: boolean; reason: string } {
  // Main script never defers - must be instant
  if (isMainScript) {
    return { defer: false, reason: 'main-script' };
  }

  // Already visible or shouldn't show
  if (visible || !shouldShow) {
    return { defer: false, reason: visible ? 'already-visible' : 'no-show' };
  }

  // Check for explicit dimensions that differ from current
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

  // Check for cached bounds
  const currentScreen = getCurrentScreen();
  const screenId = String(currentScreen.id);
  const scriptPath = promptData?.scriptPath;
  const hasCachedBounds = Boolean(scriptPath && promptState?.screens?.[screenId]?.[scriptPath]);

  // Defer for explicit dimensions with significant size difference
  if (hasExplicitDimensions && significantSizeDifference) {
    return { defer: true, reason: 'explicit-dimensions' };
  }

  // Defer for first run of arg UI (no cached bounds)
  if (!hasCachedBounds && promptData?.ui === UI.arg) {
    return { defer: true, reason: 'first-run-no-cache' };
  }

  return { defer: false, reason: 'no-defer-needed' };
}

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
  prompt.logInfo(`Early user data considered: ${userSnapshot?.login || 'not logged in'}`);
  if (!(prompt as any).__userBootstrapped) {
    prompt.sendToPrompt(AppChannel.USER_CHANGED, userSnapshot);
    (prompt as any).__userBootstrapped = true;
  }

  prompt.sendToPrompt(Channel.SET_PROMPT_DATA, promptData);

  const isMainScript = getMainScriptPath() === promptData.scriptPath;
  const visible = prompt.isVisible();
  const shouldShow = promptData?.show !== false;

  // ============================================================================
  // Layout Engine Integration
  // ============================================================================
  // Use the shouldDeferShowForLayout helper to determine if we should defer
  // showing the window until the first resize completes. The layout engine
  // handles the "show after resize" guarantee, eliminating race conditions.
  // ============================================================================
  const deferResult = shouldDeferShowForLayout(prompt, promptData, isMainScript, visible, shouldShow);
  const shouldDeferShow = deferResult.defer;

  prompt.logInfo(`${prompt.id}: [LayoutEngine] shouldDeferShow=${shouldDeferShow} (${deferResult.reason})`, {
    visible,
    shouldShow,
    isMainScript,
  });

  // ============================================================================
  // DEPRECATED: Legacy synchronization flags
  // ============================================================================
  // These flags are still set for backward compatibility with code that checks
  // them, but the new layout engine handles synchronization atomically.
  // TODO: Remove these once all callers are migrated to the layout engine
  // ============================================================================
  if (shouldDeferShow) {
    // Set legacy flags for backward compatibility
    prompt.boundsLockedForResize = true;
    if (prompt.boundsLockTimeout) {
      clearTimeout(prompt.boundsLockTimeout);
    }
    // Shorter timeout since layout engine handles this deterministically
    prompt.boundsLockTimeout = setTimeout(() => {
      try {
        if (prompt.window?.isDestroyed?.()) return;
        prompt.logInfo(`${prompt.id}: [LayoutEngine] boundsLockedForResize timeout – unlocking`);
        prompt.boundsLockedForResize = false;
        prompt.boundsLockTimeout = null;
      } catch {
        // ignore
      }
    }, 300); // Reduced from 500ms since layout engine is more deterministic
  } else {
    if (prompt.boundsLockTimeout) {
      clearTimeout(prompt.boundsLockTimeout);
      prompt.boundsLockTimeout = null;
    }
    prompt.boundsLockedForResize = false;
  }

  // Only call initBounds if NOT deferring for resize
  // The layout engine will set the correct dimensions on first resize
  if (prompt.firstPrompt && !isMainScript) {
    if (shouldDeferShow) {
      prompt.logInfo(`${prompt.pid} [LayoutEngine] Skipping initBounds - deferring for layout`);
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

  // ============================================================================
  // Show Logic
  // ============================================================================
  // When deferring, set showAfterNextResize so the layout engine knows to show
  // the window after applying bounds. The layout engine provides a deterministic
  // guarantee that the window will be shown after the first resize.
  // ============================================================================
  if (!visible && shouldShow) {
    prompt.logInfo(`${prompt.id}: Prompt not visible but should show`);

    if (shouldDeferShow) {
      // Tell the layout engine to show after the first resize
      prompt.showAfterNextResize = true;
      prompt.skipInitBoundsForResize = true;

      // Safety fallback with shorter timeout since layout engine is deterministic
      // This handles edge cases like resize being disabled or already at target size
      setTimeout(() => {
        if (prompt.showAfterNextResize && !prompt.window?.isDestroyed()) {
          prompt.logWarn(`${prompt.id}: [LayoutEngine] showAfterNextResize fallback triggered`);
          prompt.showAfterNextResize = false;
          prompt.skipInitBoundsForResize = false;
          prompt.boundsLockedForResize = false;
          prompt.showPrompt();
        }
      }, 150); // Reduced from 200ms since layout engine is faster
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
