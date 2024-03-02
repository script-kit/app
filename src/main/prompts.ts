import log from 'electron-log';
import { KitPrompt } from './prompt';

const promptMap = new Map<number, KitPrompt>();

let hasIdlePrompt = false;
export const prompts = {
  idle: null as KitPrompt | null,
  createPromptIfNoIdle: function () {
    log.info(`hasIdlePrompt: ${hasIdlePrompt ? 'true' : 'false'}`);
    if (!hasIdlePrompt) {
      this.idle = new KitPrompt();
      hasIdlePrompt = true;
      log.info(
        `🌅 Initializing idle prompt with window id:${this.idle?.window?.id}`,
      );
      return true;
    }

    return false;
  },
  createDebuggedPrompt: async function () {
    this.createPromptIfNoIdle();
    if (!this.idle?.ready) {
      log.info(`🐞 Waiting for prompt to be ready...`);
      await this.idle?.waitForReady();
    }
    log.info(
      `${this?.idle?.pid}: 🌅 Idle prompt ready with window id:${this.idle?.window?.id}`,
    );
    return this.idle;
  },
  focused: null as KitPrompt | null,
  attachIdlePromptToProcess(pid: number) {
    const created = this.createPromptIfNoIdle();
    log.info(
      `🔗 Attaching idle prompt ${this?.idle?.window?.id} to process ${pid}`,
    );
    const prompt = this.idle as KitPrompt;
    hasIdlePrompt = false;

    prompt.bindToProcess(pid);

    prompt.window?.on('focus', () => {
      this.focused = prompt;
      log.info(`${pid}: Focusing on prompt ${prompt.id}`);
    });

    // prompt.window?.on('closed', () => {
    //   promptMap.delete(pid);
    // });
    promptMap.set(pid, prompt);

    // Only set a new idle prompt if the current one has been used

    setTimeout(() => {
      if (!created) {
        this.createPromptIfNoIdle();
      }
    }, 100);

    return prompt;
  },
  delete: function (pid: number) {
    const prompt = promptMap.get(pid);
    promptMap.delete(pid);
    if (prompt && !prompt?.isDestroyed()) {
      if (this.focused === prompt) {
        this.focused = null;
      }
      prompt?.window?.hide();
      log.info(`${pid}: 🥱 Closing prompt `);
      prompt?.close();
      // prompt?.window?.destroy();
      // prompt?.destroy();
      // setTimeout(() => {
      //   if (!prompt?.is()) {
      //     try {
      //       log.info(`${pid}: 🧨 Force closing prompt `);
      //       prompt?.destroy();
      //     } catch (e) {
      //       log.info(`${pid}: 🧨 Force closing prompt failed `);
      //     }
      //   }
      // }, 1000);
    }

    log.info(`${pid}: 🚮 Deleted prompt. ${promptMap.size} remaining...`);
  },
  get: function (pid: number) {
    return promptMap.get(pid);
  },
  find: function (predicate: (prompt: KitPrompt) => boolean) {
    for (const prompt of promptMap.values()) {
      if (predicate(prompt)) {
        return prompt;
      }
    }

    return null;
  },
  someVisible: function () {
    for (const prompt of this) {
      if (prompt.isVisible()) {
        return true;
      }
    }

    return false;
  },
  countVisible: function () {
    let count = 0;
    for (const prompt of this) {
      if (prompt.isVisible()) {
        count++;
      }
    }

    return count;
  },
  [Symbol.iterator]: function* () {
    for (const prompt of promptMap.values()) {
      yield prompt;
    }
  },
};
