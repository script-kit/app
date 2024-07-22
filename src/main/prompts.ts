import { KitPrompt } from './prompt';
import { createLogger } from '../shared/log-utils';

const log = createLogger('prompts.ts');

const promptMap = new Map<number, KitPrompt>();

export const prompts = {
  appRunning: true,
  lastFocused: null as KitPrompt | null,
  pids() {
    return Array.from(promptMap.keys());
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
      this.idle = new KitPrompt();
      log.info(`🌅 Initializing idle prompt with window id:${this.idle?.window?.id}`);
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
    this.createPromptIfNoIdle();
    const idlePrompt = this.idle;
    if (idlePrompt && !idlePrompt.ready) {
      log.info('🐞 Waiting for prompt to be ready...');
      await idlePrompt.waitForReady();
    }
    log.info(`${idlePrompt?.pid}: 🌅 Idle prompt ready with window id:${idlePrompt?.window?.id}`);
    return idlePrompt!;
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
  attachIdlePromptToProcess(pid: number): KitPrompt {
    const created = this.createPromptIfNoIdle();
    log.info(`🔗 Attaching idle prompt ${this.idle?.window?.id} to process ${pid}`);
    const prompt = this.idle as KitPrompt;
    this.idle = null;
    prompt.bindToProcess(pid);
    prompt.window?.on('focus', () => {
      this.focused = prompt;
      this.prevFocused = null;
      log.info(`${pid}: Focusing on prompt ${prompt.id}`);
    });
    prompt.window?.on('blur', () => {
      this.prevFocused = prompt;
    });

    prompt.window?.on('hide', () => {
      if (this.focused === prompt) {
        this.focused = null;
      }
      if (this.prevFocused === prompt) {
        this.prevFocused = null;
      }
    });
    promptMap.set(pid, prompt);
    // Only set a new idle prompt if the current one has been used
    setTimeout(() => {
      if (!created) {
        this.createPromptIfNoIdle();
      }
    }, 100);
    return prompt;
  },

  /**
   * Deletes the prompt associated with the given PID.
   * @param pid The PID of the prompt to delete.
   */
  delete: function (pid: number): void {
    const prompt = promptMap.get(pid);
    if (!prompt) {
      return;
    }
    promptMap.delete(pid);
    if (prompt.isDestroyed()) {
      return;
    }
    if (this.focused === prompt) {
      this.focused = null;
    }
    if (this.prevFocused === prompt) {
      this.prevFocused = null;
    }
    prompt.actualHide();
    log.info(`${pid}: 🥱 Closing prompt`);
    prompt.close();
    log.info(`${pid}: 🚮 Deleted prompt. ${promptMap.size} prompts remaining.`);
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
    for (const prompt of prompts) {
      if (prompt.isFocused()) {
        log.info(`🔍 Found focused prompt: ${prompt.id}.`);
        return null;
      }
    }
    const prevFocused = prompts.focused && !prompts.focused.isDestroyed() && !prompts.focused ? prompts.focused : null;

    log.info(`🔍 Found prev-focused prompt that's not focused: ${prevFocused?.id}`);
    return prevFocused;
  },

  bringAllPromptsToFront: () => {
    const sortedPrompts = Array.from(promptMap.values()).sort((a, b) => {
      const posA = a.window?.getPosition() || [0, 0];
      const posB = b.window?.getPosition() || [0, 0];
      if (posA[1] !== posB[1]) {
        return posA[1] - posB[1]; // Sort by y-coordinate first
      }
      return posA[0] - posB[0]; // Then sort by x-coordinate
    });

    for (const prompt of sortedPrompts) {
      // ignore this
      if (prompt === prompts.idle) {
        continue;
      }
      prompt.window?.focus();
    }
  },

  /**
   * Allows iteration over all prompts.
   */
  *[Symbol.iterator]() {
    yield* promptMap.values();
  },
};
