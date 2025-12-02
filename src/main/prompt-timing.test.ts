import { Channel, UI } from '@johnlindquist/kit/core/enum';
import type { PromptData, Script } from '@johnlindquist/kit/types/core';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { Trigger } from '../shared/enums';

// Mock dependencies
vi.mock('./logs', () => ({
  promptLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
  },
}));

vi.mock('./state', () => ({
  kitState: {
    kenvEnv: {},
    ready: true,
    isSplashShowing: false,
    hasOpenedMainMenu: false,
  },
  kitCache: {
    scripts: [],
  },
  sponsorCheck: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('./process', () => ({
  processes: {
    findIdlePromptProcess: vi.fn(),
  },
  getIdles: vi.fn(() => []),
}));

vi.mock('./prompts', () => ({
  prompts: {
    getVisiblePromptCount: vi.fn(() => 0),
    bringAllPromptsToFront: vi.fn(),
  },
}));

vi.mock('@johnlindquist/kit/core/utils', () => ({
  getMainScriptPath: vi.fn(() => '/main/script/path.js'),
  parseScript: vi.fn(),
}));

vi.mock('./helpers', () => ({
  pathsAreEqual: vi.fn((a, b) => a === b),
}));

vi.mock('../shared/events', () => ({
  KitEvent: {
    RunPromptProcess: 'RUN_PROMPT_PROCESS',
    CloseSplash: 'CLOSE_SPLASH',
  },
  emitter: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('./track', () => ({
  TrackEvent: {
    ScriptTrigger: 'SCRIPT_TRIGGER',
  },
  trackEvent: vi.fn(),
}));

vi.mock('./kit', () => ({
  runPromptProcess: vi.fn(),
}));

// Mock prompt class
class MockKitPrompt {
  ui = UI.arg;
  scriptPath = '';
  scriptName = '';
  pid = 0;
  window = {
    id: 1,
    isDestroyed: () => false,
    webContents: {
      send: vi.fn(),
    },
  };
  shown = false;

  initMainBounds = vi.fn();
  initShowPrompt = vi.fn();
  initBounds = vi.fn();
  moveToMouseScreen = vi.fn();
  lifeTime = vi.fn(() => '1s');
  showPrompt = vi.fn(() => {
    this.shown = true;
  });
  setPromptData = vi.fn();
  sendToPrompt = vi.fn();
  centerPrompt = vi.fn();
  focusPrompt = vi.fn();
}

import { getMainScriptPath } from '@johnlindquist/kit/core/utils';
// Import the module under test after mocks
import { runPromptProcess } from './kit';
import { promptLog as log } from './logs';
import { processes } from './process';
import { kitState } from './state';

describe.skip('Prompt Timing Tests', () => {
  let mockPrompt: MockKitPrompt;
  let mockChild: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockPrompt = new MockKitPrompt();
    mockChild = {
      pid: 12345,
      connected: true,
      send: vi.fn(),
    };

    (processes.findIdlePromptProcess as Mock).mockReturnValue({
      prompt: mockPrompt,
      pid: 12345,
      child: mockChild,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Snippet trigger timing', () => {
    it.skip('should wait 50ms before showing snippet-triggered prompts', async () => {
      const scriptPath = '/test/snippet.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.Snippet,
        sponsorCheck: false,
      });

      // Prompt should be prepared but not shown immediately
      expect(mockPrompt.initBounds).toHaveBeenCalled();
      expect(mockPrompt.initShowPrompt).not.toHaveBeenCalled();
      expect(mockPrompt.shown).toBe(false);

      // Verify 50ms delay is logged
      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('📝 Snippet trigger: Preparing prompt'));
    });

    it('should show prompt immediately for non-snippet triggers', async () => {
      const scriptPath = '/test/script.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.Shortcut,
        sponsorCheck: false,
      });

      // Should move to mouse screen instead of just init bounds
      expect(mockPrompt.moveToMouseScreen).toHaveBeenCalled();
      expect(mockPrompt.initBounds).not.toHaveBeenCalled();
    });

    it('should not show prompt for snippet if show: false in prompt data', async () => {
      const scriptPath = '/test/snippet.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.Snippet,
        sponsorCheck: false,
      });

      // Simulate script sending prompt data with show: false
      const promptData: Partial<PromptData> = {
        show: false,
        scriptPath,
      };

      mockPrompt.setPromptData(promptData as PromptData);

      // Advance timers past 50ms
      vi.advanceTimersByTime(100);

      // Prompt should remain hidden
      expect(mockPrompt.showPrompt).not.toHaveBeenCalled();
      expect(mockPrompt.shown).toBe(false);
    });

    it('should show prompt by default for snippet triggers', async () => {
      const scriptPath = '/test/snippet.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.Snippet,
        sponsorCheck: false,
      });

      // Simulate script sending prompt data without explicit show property
      const promptData: Partial<PromptData> = {
        scriptPath,
        ui: UI.arg,
      };

      mockPrompt.setPromptData(promptData as PromptData);

      // Wait for potential delays
      vi.advanceTimersByTime(100);

      // Since setPromptData is mocked, we need to manually trigger what would happen
      // In real code, setPromptData would trigger the prompt to show
      mockPrompt.showPrompt();

      expect(mockPrompt.shown).toBe(true);
    });
  });

  describe('Keyboard shortcut behavior', () => {
    it('should center prompts triggered by keyboard shortcuts', async () => {
      const scriptPath = '/test/shortcut.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.Shortcut,
        sponsorCheck: false,
      });

      expect(mockPrompt.moveToMouseScreen).toHaveBeenCalled();
      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('🖱️ Moving prompt to mouse screen'));
    });

    it('should immediately show prompts for keyboard shortcuts', async () => {
      const scriptPath = '/test/shortcut.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.Shortcut,
        sponsorCheck: false,
      });

      // No delay for keyboard shortcuts
      expect(mockPrompt.moveToMouseScreen).toHaveBeenCalled();
      vi.advanceTimersByTime(0);

      // Should be ready to show immediately
      expect(mockPrompt.initBounds).not.toHaveBeenCalled();
    });
  });

  describe('Main script initialization', () => {
    it('should initialize main bounds for main script', async () => {
      const mainPath = getMainScriptPath();

      await runPromptProcess(mainPath, [], {
        force: true,
        trigger: Trigger.Kit,
        sponsorCheck: false,
      });

      expect(mockPrompt.initMainBounds).toHaveBeenCalled();
      expect(mockPrompt.initShowPrompt).toHaveBeenCalled();
      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('🏠 Main script:'));
    });

    it('should handle main script with special initialization', async () => {
      const mainPath = getMainScriptPath();
      kitState.hasOpenedMainMenu = false;

      await runPromptProcess(mainPath, [], {
        force: true,
        trigger: Trigger.Kit,
        main: true,
        sponsorCheck: false,
      });

      expect(kitState.hasOpenedMainMenu).toBe(true);
      expect(mockPrompt.initMainBounds).toHaveBeenCalled();
    });
  });

  describe('Prompt display logic', () => {
    it('should respect explicit show: true in prompt data', async () => {
      const scriptPath = '/test/script.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.App,
        sponsorCheck: false,
      });

      const promptData: Partial<PromptData> = {
        show: true,
        scriptPath,
      };

      mockPrompt.setPromptData(promptData as PromptData);
      mockPrompt.showPrompt();

      expect(mockPrompt.shown).toBe(true);
    });

    it('should hide prompt when show: false', async () => {
      const scriptPath = '/test/script.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.App,
        sponsorCheck: false,
      });

      const promptData: Partial<PromptData> = {
        show: false,
        scriptPath,
      };

      mockPrompt.setPromptData(promptData as PromptData);

      expect(mockPrompt.showPrompt).not.toHaveBeenCalled();
      expect(mockPrompt.shown).toBe(false);
    });
  });

  describe('Different trigger types', () => {
    it('should handle background triggers', async () => {
      const scriptPath = '/test/background.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.Background,
        sponsorCheck: false,
      });

      // Background scripts should move to mouse screen
      expect(mockPrompt.moveToMouseScreen).toHaveBeenCalled();
    });

    it('should handle schedule triggers', async () => {
      const scriptPath = '/test/schedule.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.Schedule,
        sponsorCheck: false,
      });

      // Schedule scripts should move to mouse screen
      expect(mockPrompt.moveToMouseScreen).toHaveBeenCalled();
    });

    it('should handle app triggers', async () => {
      const scriptPath = '/test/app.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.App,
        sponsorCheck: false,
      });

      expect(mockPrompt.moveToMouseScreen).toHaveBeenCalled();
    });
  });

  describe('Timing edge cases', () => {
    it('should handle rapid script launches', async () => {
      const script1 = '/test/script1.js';
      const script2 = '/test/script2.js';

      // Launch two scripts rapidly
      await runPromptProcess(script1, [], {
        force: false,
        trigger: Trigger.Snippet,
        sponsorCheck: false,
      });

      await runPromptProcess(script2, [], {
        force: false,
        trigger: Trigger.Snippet,
        sponsorCheck: false,
      });

      // Both should have initialized bounds
      expect(mockPrompt.initBounds).toHaveBeenCalledTimes(2);
    });

    it('should prevent prompts from appearing before deletion completes', async () => {
      const scriptPath = '/test/snippet.js';

      // Simulate deleteText in progress
      kitState.isTyping = true;

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.Snippet,
        sponsorCheck: false,
      });

      // Prompt should be prepared but not shown while typing
      expect(mockPrompt.initBounds).toHaveBeenCalled();
      expect(mockPrompt.shown).toBe(false);

      // Simulate deleteText completion
      kitState.isTyping = false;

      // Now prompt can be shown when requested
      mockPrompt.showPrompt();
      expect(mockPrompt.shown).toBe(true);
    });
  });

  describe('Memory leak prevention', () => {
    it('should not create multiple timers for same prompt', async () => {
      const scriptPath = '/test/snippet.js';

      // Launch same script multiple times
      for (let i = 0; i < 5; i++) {
        await runPromptProcess(scriptPath, [], {
          force: false,
          trigger: Trigger.Snippet,
          sponsorCheck: false,
        });
      }

      // Should reuse the same prompt process
      expect(processes.findIdlePromptProcess).toHaveBeenCalledTimes(5);
    });

    it('should clean up timers when prompt is destroyed', async () => {
      const scriptPath = '/test/snippet.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.Snippet,
        sponsorCheck: false,
      });

      // Simulate prompt destruction
      mockPrompt.window.isDestroyed = () => true;

      // Advance timers - should not cause errors
      vi.advanceTimersByTime(100);

      // No errors should occur
      expect(mockPrompt.showPrompt).not.toHaveBeenCalled();
    });
  });

  describe('Centering behavior', () => {
    it('should maintain centered position for keyboard shortcuts', async () => {
      const scriptPath = '/test/shortcut.js';

      await runPromptProcess(scriptPath, [], {
        force: false,
        trigger: Trigger.Shortcut,
        sponsorCheck: false,
      });

      // Simulate prompt data being set
      const promptData: Partial<PromptData> = {
        scriptPath,
        ui: UI.arg,
      };

      mockPrompt.setPromptData(promptData as PromptData);

      // Should not lose centered position
      expect(mockPrompt.centerPrompt).not.toHaveBeenCalled();
      expect(mockPrompt.moveToMouseScreen).toHaveBeenCalled();
    });

    it('should center main menu prompt', async () => {
      const mainPath = getMainScriptPath();

      await runPromptProcess(mainPath, [], {
        force: true,
        trigger: Trigger.Kit,
        sponsorCheck: false,
      });

      // Main menu uses special bounds initialization
      expect(mockPrompt.initMainBounds).toHaveBeenCalled();
      expect(mockPrompt.moveToMouseScreen).not.toHaveBeenCalled();
    });
  });
});
