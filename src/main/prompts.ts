import log from 'electron-log';
import { KitPrompt } from './prompt';

const promptMap = new Map<number, KitPrompt>();

export const prompts = {
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
    if (this.idle === null) {
      this.idle = new KitPrompt();
      log.info(
        `🌅 Initializing idle prompt with window id:${this.idle?.window?.id}`,
      );
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
      log.info(`🐞 Waiting for prompt to be ready...`);
      await idlePrompt.waitForReady();
    }
    log.info(
      `${idlePrompt?.pid}: 🌅 Idle prompt ready with window id:${idlePrompt?.window?.id}`,
    );
    return idlePrompt!;
  },

  /**
   * The currently focused prompt.
   */
  focused: null as KitPrompt | null,

  /**
   * Attaches the idle prompt to a process with the given PID.
   * @param pid The PID of the process to attach the prompt to.
   * @returns The attached prompt.
   */
  attachIdlePromptToProcess(pid: number): KitPrompt {
    const created = this.createPromptIfNoIdle();
    log.info(
      `🔗 Attaching idle prompt ${this.idle?.window?.id} to process ${pid}`,
    );
    const prompt = this.idle as KitPrompt;
    this.idle = null;
    prompt.bindToProcess(pid);
    prompt.window?.on('focus', () => {
      this.focused = prompt;
      log.info(`${pid}: Focusing on prompt ${prompt.id}`);
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
    if (!prompt) return;
    promptMap.delete(pid);
    if (prompt.isDestroyed()) return;
    if (this.focused === prompt) {
      this.focused = null;
    }
    prompt.window?.hide();
    log.info(`${pid}: 🥱 Closing prompt`);
    prompt.close();
    log.info(`${pid}: 🚮 Deleted prompt. ${promptMap.size} prompts remaining.`);
  },

  /**
   * Gets the prompt associated with the given PID.
   * @param pid The PID of the prompt to get.
   * @returns The prompt associated with the given PID, or undefined if no such prompt exists.
   */
  get: function (pid: number): KitPrompt | undefined {
    return promptMap.get(pid);
  },

  /**
   * Finds the first prompt that satisfies the given predicate.
   * @param predicate The predicate function to test each prompt against.
   * @returns The first prompt that satisfies the predicate, or null if no such prompt exists.
   */
  find: function (predicate: (prompt: KitPrompt) => boolean): KitPrompt | null {
    return Array.from(promptMap.values()).find(predicate) ?? null;
  },

  /**
   * Determines whether any prompt is currently visible.
   * @returns True if any prompt is visible, false otherwise.
   */
  isAnyPromptVisible: function (): boolean {
    return Array.from(promptMap.values()).some((prompt) => prompt.isVisible());
  },

  /**
   * Gets the number of currently visible prompts.
   * @returns The number of currently visible prompts.
   */
  getVisiblePromptCount: function (): number {
    return Array.from(promptMap.values()).filter((prompt) => prompt.isVisible())
      .length;
  },

  /**
   * Allows iteration over all prompts.
   */
  *[Symbol.iterator]() {
    yield* promptMap.values();
  },
};
