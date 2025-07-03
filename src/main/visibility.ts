import { Channel } from '@johnlindquist/kit/core/enum';
import { HideReason } from '../shared/enums';
import { createLogger } from './log-utils';
// visibility.ts
import type { KitPrompt } from './prompt';
import { kitState } from './state';

const log = createLogger('visibility.ts');

export enum FocusState {
  Focused = 'focused',
  Blurred = 'blurred',
}

interface PromptState {
  focusState: FocusState;
  escapeCount: number;
  lastEscapeTime: number;
}

class VisibilityController {
  private states = new Map<number, PromptState>();
  private readonly ESCAPE_RESET_TIME = 300; // ms between escape presses
  private readonly ESCAPE_RELOAD_COUNT = 4;

  // --- public API -------------------------------------------------

  handleFocus(prompt: KitPrompt) {
    const windowId = prompt.window.id;
    log.info(`👓 handleFocus: window ${windowId}, script: ${prompt.scriptName}`);

    // Initialize or update state
    const state = this.states.get(windowId) || {
      focusState: FocusState.Focused,
      escapeCount: 0,
      lastEscapeTime: 0,
    };

    state.focusState = FocusState.Focused;
    state.escapeCount = 0; // Reset escape counter on focus
    this.states.set(windowId, state);

    // Reset shared flags
    prompt.kitSearch.keywordCleared = false;
    prompt.emojiActive = false;

    // Reset global activation state when focusing
    if (kitState.isActivated) {
      log.info('👓 Resetting isActivated flag on focus');
      kitState.isActivated = false;
    }

    log.info(`👓 Window ${windowId} state updated to ${FocusState.Focused}`);
  }

  handleBlur(prompt: KitPrompt) {
    const windowId = prompt.window.id;
    log.info(`🙈 handleBlur: window ${windowId}, script: ${prompt.scriptName}`);

    // Central checks for ignoring blur
    if (prompt.emojiActive) {
      log.info('🙈 Ignoring blur - emoji panel is active');
      return;
    }

    if (prompt.window.webContents.isDevToolsOpened()) {
      log.info('🙈 Ignoring blur - DevTools are open');
      return;
    }

    // Update state
    const state = this.states.get(windowId) || {
      focusState: FocusState.Blurred,
      escapeCount: 0,
      lastEscapeTime: 0,
    };
    state.focusState = FocusState.Blurred;
    this.states.set(windowId, state);

    log.info(`🙈 Window ${windowId} state updated to ${FocusState.Blurred}`);
  }

  handleEscape(prompt: KitPrompt, hasChildProcess = false): boolean {
    const windowId = prompt.window.id;
    const state = this.states.get(windowId);

    log.info(
      `␛ handleEscape: window ${windowId}, state: ${state?.focusState}, hideOnEscape: ${prompt.hideOnEscape}, script: ${prompt.scriptPath}`,
    );

    // Don't act if window is blurred
    if (!state || state.focusState !== FocusState.Focused) {
      log.info(`␛ Ignoring escape - window not focused (state: ${state?.focusState})`);
      return false;
    }

    // Handle escape counter for quad-escape reload
    const currentTime = Date.now();
    if (currentTime - state.lastEscapeTime > this.ESCAPE_RESET_TIME) {
      state.escapeCount = 1;
    } else {
      state.escapeCount++;
    }
    state.lastEscapeTime = currentTime;

    log.info(`␛ Escape count: ${state.escapeCount}`);

    // Check for quad-escape reload - always handle this
    if (state.escapeCount >= this.ESCAPE_RELOAD_COUNT) {
      log.info('␛ Quad-escape detected - reloading window');
      prompt.window.reload();
      state.escapeCount = 0;
      return true; // We handled it, don't forward to child
    }

    // Special handling for main menu - always hide on escape
    if (prompt.isMainMenu) {
      log.info('␛ Main menu detected - hiding on escape');
      prompt.maybeHide(HideReason.Escape);
      prompt.sendToPrompt(Channel.SET_INPUT, '');
      return true; // We handled it
    }

    // For single escape, only handle if hideOnEscape is true AND there's no child process
    // This allows child processes to override onEscape behavior
    if (prompt.hideOnEscape && !hasChildProcess) {
      log.info('␛ Hiding prompt due to escape (no child process)');
      prompt.maybeHide(HideReason.Escape);
      prompt.sendToPrompt(Channel.SET_INPUT, '');
      return true; // We handled it
    }

    // Return false to allow escape to propagate to child process
    log.info('␛ Allowing escape to propagate to child process');
    return false;
  }

  // Helper methods for testing and debugging
  getState(windowId: number): PromptState | undefined {
    return this.states.get(windowId);
  }

  clearState(windowId: number) {
    this.states.delete(windowId);
  }

  clearAllStates() {
    this.states.clear();
  }
}

export const visibilityController = new VisibilityController();
