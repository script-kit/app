import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { visibilityController, FocusState } from './visibility';
import type { KitPrompt } from './prompt';
import { HideReason } from '../shared/enums';
import { Channel } from '@johnlindquist/kit/core/enum';

// Mock dependencies
vi.mock('./state', () => ({
  kitState: {
    isActivated: false,
  },
}));

// Helper to create a mock prompt
function createMockPrompt(overrides: Partial<KitPrompt> = {}): KitPrompt {
  return {
    window: {
      id: 1,
      webContents: {
        isDevToolsOpened: vi.fn(() => false),
      },
      reload: vi.fn(),
    },
    scriptName: 'test-script',
    emojiActive: false,
    hideOnEscape: true,
    kitSearch: {
      keywordCleared: false,
    },
    maybeHide: vi.fn(),
    sendToPrompt: vi.fn(),
    logInfo: vi.fn(),
    ...overrides,
  } as any;
}

describe('VisibilityController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    visibilityController.clearAllStates();
  });

  describe('handleFocus', () => {
    it('should set focus state and reset flags', () => {
      const prompt = createMockPrompt();
      
      visibilityController.handleFocus(prompt);
      
      const state = visibilityController.getState(prompt.window.id);
      expect(state?.focusState).toBe(FocusState.Focused);
      expect(state?.escapeCount).toBe(0);
      expect(prompt.emojiActive).toBe(false);
      expect(prompt.kitSearch.keywordCleared).toBe(false);
    });

    it('should reset global isActivated flag if set', async () => {
      const { kitState } = await import('./state');
      kitState.isActivated = true;
      
      const prompt = createMockPrompt();
      visibilityController.handleFocus(prompt);
      
      expect(kitState.isActivated).toBe(false);
    });
  });

  describe('handleBlur', () => {
    it('should set blur state for normal blur', () => {
      const prompt = createMockPrompt();
      
      visibilityController.handleFocus(prompt); // First focus
      visibilityController.handleBlur(prompt);
      
      const state = visibilityController.getState(prompt.window.id);
      expect(state?.focusState).toBe(FocusState.Blurred);
    });

    it('should ignore blur when emoji panel is active', () => {
      const prompt = createMockPrompt();
      
      // First focus to establish state
      visibilityController.handleFocus(prompt);
      
      // Then set emoji active
      prompt.emojiActive = true;
      
      // Try to blur - should be ignored
      visibilityController.handleBlur(prompt);
      
      const state = visibilityController.getState(prompt.window.id);
      expect(state?.focusState).toBe(FocusState.Focused); // Should remain focused
    });

    it('should ignore blur when DevTools are open', () => {
      const prompt = createMockPrompt();
      (prompt.window.webContents.isDevToolsOpened as Mock).mockReturnValue(true);
      
      visibilityController.handleFocus(prompt);
      visibilityController.handleBlur(prompt);
      
      const state = visibilityController.getState(prompt.window.id);
      expect(state?.focusState).toBe(FocusState.Focused); // Should remain focused
    });
  });

  describe('handleEscape', () => {
    it('should hide prompt when focused, hideOnEscape is true, and no child process', () => {
      const prompt = createMockPrompt();
      
      visibilityController.handleFocus(prompt);
      const handled = visibilityController.handleEscape(prompt, false); // No child process
      
      expect(handled).toBe(true);
      expect(prompt.maybeHide).toHaveBeenCalledWith(HideReason.Escape);
      expect(prompt.sendToPrompt).toHaveBeenCalledWith(Channel.SET_INPUT, '');
    });

    it('should allow escape to propagate when child process exists', () => {
      const prompt = createMockPrompt({ hideOnEscape: true });
      
      visibilityController.handleFocus(prompt);
      const handled = visibilityController.handleEscape(prompt, true); // Has child process
      
      expect(handled).toBe(false); // Should not handle, let it propagate
      expect(prompt.maybeHide).not.toHaveBeenCalled();
    });

    it('should not act when window is blurred', () => {
      const prompt = createMockPrompt();
      
      visibilityController.handleFocus(prompt);
      visibilityController.handleBlur(prompt);
      const handled = visibilityController.handleEscape(prompt);
      
      expect(handled).toBe(false);
      expect(prompt.maybeHide).not.toHaveBeenCalled();
    });

    it('should not hide when hideOnEscape is false', () => {
      const prompt = createMockPrompt({ hideOnEscape: false });
      
      visibilityController.handleFocus(prompt);
      const handled = visibilityController.handleEscape(prompt);
      
      expect(handled).toBe(false);
      expect(prompt.maybeHide).not.toHaveBeenCalled();
    });

    it('should reload window on quad-escape', () => {
      const prompt = createMockPrompt();
      visibilityController.handleFocus(prompt);
      
      // Press escape 4 times quickly
      for (let i = 0; i < 4; i++) {
        visibilityController.handleEscape(prompt, false);
      }
      
      expect(prompt.window.reload).toHaveBeenCalled();
      
      // Escape count should be reset after reload
      const state = visibilityController.getState(prompt.window.id);
      expect(state?.escapeCount).toBe(0);
    });

    it('should reset escape count after timeout', async () => {
      const prompt = createMockPrompt();
      visibilityController.handleFocus(prompt);
      
      // Press escape twice
      visibilityController.handleEscape(prompt, false);
      visibilityController.handleEscape(prompt, false);
      
      let state = visibilityController.getState(prompt.window.id);
      expect(state?.escapeCount).toBe(2);
      
      // Wait for timeout (> 300ms)
      await new Promise(resolve => setTimeout(resolve, 350));
      
      // Press escape again - should reset to 1
      visibilityController.handleEscape(prompt, false);
      state = visibilityController.getState(prompt.window.id);
      expect(state?.escapeCount).toBe(1);
    });
  });

  describe('Race condition prevention', () => {
    it('should handle rapid focus-blur-escape sequence', () => {
      const prompt = createMockPrompt();
      
      // Simulate rapid sequence
      visibilityController.handleFocus(prompt);
      visibilityController.handleBlur(prompt);
      visibilityController.handleFocus(prompt);
      
      // Escape should work immediately after focus
      const handled = visibilityController.handleEscape(prompt, false);
      
      expect(handled).toBe(true);
      expect(prompt.maybeHide).toHaveBeenCalled();
    });

    it('should maintain correct state across multiple windows', () => {
      const prompt1 = createMockPrompt();
      const prompt2 = createMockPrompt();
      prompt2.window.id = 2;
      
      // Focus both windows
      visibilityController.handleFocus(prompt1);
      visibilityController.handleFocus(prompt2);
      
      // Blur first window
      visibilityController.handleBlur(prompt1);
      
      // States should be independent
      const state1 = visibilityController.getState(prompt1.window.id);
      const state2 = visibilityController.getState(prompt2.window.id);
      
      expect(state1?.focusState).toBe(FocusState.Blurred);
      expect(state2?.focusState).toBe(FocusState.Focused);
      
      // Escape should work on focused window
      const handled2 = visibilityController.handleEscape(prompt2, false);
      expect(handled2).toBe(true);
      
      // Escape should not work on blurred window
      const handled1 = visibilityController.handleEscape(prompt1, false);
      expect(handled1).toBe(false);
    });
  });
});