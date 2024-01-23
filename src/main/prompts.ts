import log from 'electron-log';
import { KitPrompt } from './prompt';

const promptMap = new Map<number, KitPrompt>();

export const prompts = {
  idle: null as KitPrompt | null,
  init: function () {
    this.idle = new KitPrompt();
  },
  focused: null as KitPrompt | null,
  attachIdlePromptToProcess(pid: number) {
    if (!this.idle) {
      this.init();
    }

    const prompt = this.idle as KitPrompt;
    prompt.bindToProcess(pid);
    this.idle = null;

    prompt.window?.on('focus', () => {
      this.focused = prompt;
      log.info(`${pid}: Focusing on prompt ${prompt.id}`);
    });

    prompt.window?.on('closed', () => {
      promptMap.delete(pid);
    });
    promptMap.set(pid, prompt);

    // Only set a new idle prompt if the current one has been used
    if (!this.idle) {
      setImmediate(() => {
        this.init();
      });
    }

    return prompt;
  },
  delete: function (pid: number) {
    const prompt = promptMap.get(pid);
    if (prompt && !prompt?.isDestroyed()) {
      prompt.window?.close();
      prompt.window?.destroy();
    }
    promptMap.delete(pid);
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
  // Implement iterator
  // Implement iterator
  [Symbol.iterator]: function* () {
    for (const prompt of promptMap.values()) {
      yield prompt;
    }
  },
};
