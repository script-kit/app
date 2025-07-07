import { promptLog } from './logs';
import { processes } from './process';
import { KitPrompt } from './prompt';
import { processWindowCoordinator } from './process-window-coordinator';

const promptMap = new Map<number, KitPrompt>();

export const prompts = {
  appRunning: true,
  lastFocused: null as KitPrompt | null,
  pids() {
    return Array.from(promptMap.keys());
  },

  getPromptMap() {
    return promptMap;
  },
  /**
   * The idle prompt, which is used when no other prompt is active.
   */
  idle: null as KitPrompt | null,

  /**
   * Creates a new idle prompt if one doesn't exist.
   * @returns True if a new idle prompt was created, false otherwise.
   */
  createPromptIfNoIdle: function (): boolean {
    if (this.idle === null && this.appRunning) {
      promptLog.info('-------------------------------> No idle... 🌅 Initializing idle prompt');
      const prompt = new KitPrompt();
      promptLog.info(`🌅 Initializing idle prompt with window id:${prompt.window?.id}`);

      // Set up window event handlers with error handling
      if (prompt.window) {
        prompt.window.on('focus', () => {
          try {
            this.focused = prompt;
            this.prevFocused = null;
            promptLog.info(`${prompt.pid}: Focusing on prompt from prompts handler ${prompt.id}`);
          } catch (error) {
            promptLog.error(`Error handling focus event for prompt ${prompt.pid}:`, error);
          }
        });

        prompt.window.on('blur', () => {
          try {
            this.prevFocused = prompt;
            promptLog.info(`${prompt.pid}: Blurred prompt from prompts handler ${prompt.id}`);
          } catch (error) {
            promptLog.error(`Error handling blur event for prompt ${prompt.pid}:`, error);
          }
        });

        prompt.window.on('hide', () => {
          try {
            if (this.focused === prompt) {
              this.focused = null;
            }
            if (this.prevFocused === prompt) {
              this.prevFocused = null;
            }
          } catch (error) {
            promptLog.error(`Error handling hide event for prompt ${prompt.pid}:`, error);
          }
        });
      } else {
        promptLog.warn(`No window available for prompt ${prompt.pid}, skipping event handlers`);
      }

      this.idle = prompt;

      return true;
    }
    return false;
  },

  /**
   * Creates a new idle prompt for debugging purposes.
   * Waits for the prompt to be ready before returning.
   * @returns The newly created prompt.
   */
  createDebuggedPrompt: async function (): Promise<KitPrompt> {
    const created = this.createPromptIfNoIdle();
    const idlePrompt = this.idle;

    if (!idlePrompt) {
      throw new Error('Failed to create idle prompt for debugging');
    }

    if (!idlePrompt.ready) {
      promptLog.info('🐞 Waiting for prompt to be ready...');
      try {
        await idlePrompt.waitForReady();
      } catch (error) {
        promptLog.error('Failed to wait for prompt to be ready:', error);
        throw new Error(`Failed to initialize idle prompt: ${error}`);
      }
    }

    promptLog.info(`${idlePrompt.pid}: 🌅 Idle prompt ready with window id:${idlePrompt.window?.id}`);
    return idlePrompt;
  },

  /**
   * The currently focused prompt.
   */
  focused: null as KitPrompt | null,
  prevFocused: null as KitPrompt | null,

  /**
   * Attaches the idle prompt to a process with the given PID.
   * @param pid The PID of the process to attach the prompt to.
   * @returns The attached prompt.
   */
  timeout: null as NodeJS.Timeout | null,

  /**
   * Safely clears the current timeout if it exists
   */
  _clearTimeout: function () {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  },

  /**
   * Schedules idle prompt creation with proper timeout management
   */
  _scheduleIdleCreation: function (runId: string, delay = 100) {
    this._clearTimeout();

    promptLog.info(`${runId}: 🔗 Scheduling new idle prompt creation in ${delay}ms`);
    this.timeout = setTimeout(() => {
      promptLog.info(`${runId}: 🔗 Creating new idle prompt after timeout`);
      this.timeout = null;
      try {
        this.createPromptIfNoIdle();
      } catch (error) {
        promptLog.error(`${runId}: Failed to create idle prompt after timeout:`, error);
      }
    }, delay);
  },
  setIdle: function (idlePrompt: KitPrompt) {
    promptLog.info(`-------------------------------> Setting idle prompt to ${idlePrompt.pid}`);
    promptMap.delete(idlePrompt.pid);
    const [pid, prompt] = Array.from(promptMap.entries()).find(([_, prompt]) => prompt === idlePrompt) || [];
    if (pid) {
      promptLog.info(
        `-------------------------------> Deleting idle prompt ${pid} because it's already set from ${idlePrompt.pid} : ${prompt?.window?.id}`,
      );
      promptMap.delete(pid);
    }
    this.idle = idlePrompt;
  },
  attachIdlePromptToProcess(reason: string, pid: number): KitPrompt {
    const idleSet = this.idle !== null;
    const runId = Math.random().toString(36).substring(2, 15);
    promptLog.info(
      `${runId}: 🔗 Attaching idle prompt to process ${pid} because ${reason}: idleSet? ${idleSet ? 'yes' : 'no'}`,
    );

    const created = this.createPromptIfNoIdle();
    promptLog.info(
      `🔗 Attaching created prompt ${this.idle?.window?.id} to process ${pid}. Created? ${created ? 'yes' : 'no'}`,
    );

    if (!this.idle) {
      promptLog.error(`${runId}: Failed to create or get idle prompt for process ${pid}. Attempting recovery...`);

      // Try one more time to create an idle prompt
      const retryCreated = this.createPromptIfNoIdle();
      promptLog.info(
        `${runId}: Retry attempt: Created? ${retryCreated ? 'yes' : 'no'}, idle exists? ${this.idle ? 'yes' : 'no'}`,
      );

      if (!this.idle) {
        throw new Error(`Failed to create or get idle prompt for process ${pid} after retry`);
      }
    }

    const prompt = this.idle;
    this.idle = null;
    prompt.bindToProcess(pid);

    promptMap.set(pid, prompt);

    if (idleSet) {
      prompt.initMainPrompt('attachIdlePromptToProcess');
    }

    // Always schedule creation of a new idle prompt to ensure we have one ready
    this._scheduleIdleCreation(runId);

    return prompt;
  },

  /**
   * Deletes the prompt associated with the given PID.
   * @param pid The PID of the prompt to delete.
   */
  delete: function (pid: number): void {
    const prompt = promptMap.get(pid);
    if (!prompt) {
      promptLog.info(`${pid}: 🤷‍♂️ Attempted "delete". Prompt not found...`);
      return;
    }

    promptLog.info(`${pid}: 🥱 Deleting prompt from map`);
    promptMap.delete(pid);

    // Clean up references
    if (this.focused === prompt) {
      this.focused = null;
    }
    if (this.prevFocused === prompt) {
      this.prevFocused = null;
    }

    // Only close if not already destroyed
    if (!prompt.isDestroyed()) {
      try {
        if (prompt.window && typeof prompt.actualHide === 'function') {
          prompt.actualHide();
        }
        promptLog.info(`${pid}: 🥱 Closing prompt`);
        prompt.close('prompts.delete');
      } catch (error) {
        promptLog.warn(`${pid}: Error closing prompt:`, error);
      }
    }

    promptLog.info(`${pid}: 🚮 Deleted prompt. ${promptMap.size} prompts remaining.`);
  },

  /**
   * Gets the prompt associated with the given PID.
   * @param pid The PID of the prompt to get.
   * @returns The prompt associated with the given PID, or undefined if no such prompt exists.
   */
  get: (pid: number): KitPrompt | undefined => promptMap.get(pid),

  /**
   * Finds the first prompt that satisfies the given predicate.
   * @param predicate The predicate function to test each prompt against.
   * @returns The first prompt that satisfies the predicate, or null if no such prompt exists.
   */
  find: (predicate: (prompt: KitPrompt) => boolean): KitPrompt | null =>
    Array.from(promptMap.values()).find(predicate) ?? null,

  /**
   * Filters the prompts that satisfy the given predicate.
   * @param predicate The predicate function to test each prompt against.
   * @returns An array of prompts that satisfy the predicate.
   */
  filter: (predicate: (prompt: KitPrompt) => boolean): KitPrompt[] => Array.from(promptMap.values()).filter(predicate),
  /**
   * Determines whether any prompt is currently visible.
   * @returns True if any prompt is visible, false otherwise.
   */
  isAnyPromptVisible: (): boolean => Array.from(promptMap.values()).some((prompt) => prompt.isVisible()),

  /**
   * Gets the number of currently visible prompts.
   * @returns The number of currently visible prompts.
   */
  getVisiblePromptCount: (): number => Array.from(promptMap.values()).filter((prompt) => prompt.isVisible()).length,

  /**
   * Gets the last focused prompt, if any.
   * @returns The last focused prompt, or null if no prompt is focused or the last focused prompt is destroyed.
   */
  getPrevFocusedPrompt: (): KitPrompt | null => {
    for (const prompt of promptMap.values()) {
      if (prompt.isFocused()) {
        promptLog.info(`🔍 Found focused prompt: ${prompt.id}.`);
        return null;
      }
    }
    const prevFocused = prompts.prevFocused && !prompts.prevFocused.isDestroyed() ? prompts.prevFocused : null;

    promptLog.info(`🔍 Found prev-focused prompt that's not focused: ${prevFocused?.id}`);
    return prevFocused;
  },

  bringAllPromptsToFront: () => {
    try {
      const sortedPrompts = Array.from(promptMap.values())
        .filter((prompt) => prompt !== prompts.idle && prompt.window && !prompt.isDestroyed())
        .sort((a, b) => {
          try {
            const posA = a.window?.getPosition() || [0, 0];
            const posB = b.window?.getPosition() || [0, 0];
            if (posA[1] !== posB[1]) {
              return posA[1] - posB[1]; // Sort by y-coordinate first
            }
            return posA[0] - posB[0]; // Then sort by x-coordinate
          } catch (error) {
            promptLog.warn('Error getting window position for sorting:', error);
            return 0;
          }
        });

      for (const prompt of sortedPrompts) {
        try {
          if (prompt.window && !prompt.isDestroyed()) {
            prompt.window.focus();
          }
        } catch (error) {
          promptLog.warn(`Failed to focus prompt ${prompt.pid}:`, error);
        }
      }
    } catch (error) {
      promptLog.error('Error bringing prompts to front:', error);
    }
  },

  /**
   * Allows iteration over all prompts.
   */
  *[Symbol.iterator]() {
    yield* promptMap.values();
  },

  /**
   * Cleanup all orphaned prompts that aren't attached to running processes
   */
  cleanupOrphanedPrompts: function (): number {
    let cleanedCount = 0;
    const allProcessPids = new Set(processes.getAllProcessInfo().map((p) => p.pid));

    // Check all prompts in the map
    for (const [pid, prompt] of promptMap.entries()) {
      if (!allProcessPids.has(pid)) {
        promptLog.warn(`Found orphaned prompt ${prompt.window?.id} for PID ${pid}, cleaning up`);
        // Force cleanup any pending operations for this orphaned process
        processWindowCoordinator.forceCleanupProcess(pid);
        prompt.close('orphaned prompt cleanup');
        promptMap.delete(pid);
        cleanedCount++;
      }
    }

    // Check for prompts bound to processes that no longer exist
    // Note: This only iterates over promptMap.values(), so idle prompts are safe
    for (const prompt of this) {
      // Extra safety: never reset the current idle prompt
      if (prompt === this.idle) {
        promptLog.info(`Skipping cleanup for current idle prompt ${prompt.window?.id}`);
        continue;
      }

      if (prompt.boundToProcess && prompt.pid && !allProcessPids.has(prompt.pid)) {
        promptLog.warn(`Found prompt ${prompt.window?.id} bound to non-existent process ${prompt.pid}, resetting`);
        prompt.resetState();
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      promptLog.info(`Cleaned up ${cleanedCount} orphaned prompts`);
    }

    return cleanedCount;
  },

  /**
   * Get detailed status of all prompts for debugging
   */
  getPromptStatus: function (): Array<{
    windowId: number;
    pid: number;
    boundToProcess: boolean;
    scriptPath: string;
    isVisible: boolean;
    isFocused: boolean;
    isDestroyed: boolean;
    isIdle: boolean;
  }> {
    const status: Array<{
      windowId: number;
      pid: number;
      boundToProcess: boolean;
      scriptPath: string;
      isVisible: boolean;
      isFocused: boolean;
      isDestroyed: boolean;
      isIdle: boolean;
    }> = [];

    // Add idle prompt status
    if (this.idle) {
      status.push({
        windowId: this.idle.window?.id || -1,
        pid: this.idle.pid,
        boundToProcess: this.idle.boundToProcess,
        scriptPath: this.idle.scriptPath || '(idle)',
        isVisible: this.idle.isVisible(),
        isFocused: this.idle.isFocused(),
        isDestroyed: this.idle.isDestroyed(),
        isIdle: true,
      });
    }

    // Add all mapped prompts
    for (const [pid, prompt] of promptMap.entries()) {
      status.push({
        windowId: prompt.window?.id || -1,
        pid,
        boundToProcess: prompt.boundToProcess,
        scriptPath: prompt.scriptPath || '(unknown)',
        isVisible: prompt.isVisible(),
        isFocused: prompt.isFocused(),
        isDestroyed: prompt.isDestroyed(),
        isIdle: false,
      });
    }

    return status;
  },
};
