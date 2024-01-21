import log from 'electron-log';
import { KitPrompt } from './prompt';

const promptMap = new Map<number, KitPrompt>();
export const prompts = {
  next: null as KitPrompt | null,
  focused: null as KitPrompt | null,
  delete: function (pid: number) {
    promptMap.delete(pid);
  },
  get: function (pid: number) {
    return promptMap.get(pid);
  },
  set: function (pid: number, prompt: KitPrompt) {
    this.next = prompt;
    promptMap.set(pid, prompt);

    prompt.window?.on('focus', () => {
      this.focused = prompt;
      log.info(`${pid}: Focusing on prompt ${prompt.id}`);
    });

    // prompt.window?.on('blur', () => {
    //   this.focused = null;
    // });

    // Remove listener when window is closed or destroyed
    // prompt.window?.on('closed', () => {
    //   promptMap.delete(pid);
    // });
  },
  find: function (predicate: (prompt: KitPrompt) => boolean) {
    for (const prompt of promptMap.values()) {
      if (predicate(prompt)) {
        return prompt;
      }
    }

    return null;
  },
  // Implement iterator
  [Symbol.iterator]: function () {
    let index = 0;
    const values = Array.from(promptMap.values());

    return {
      next: () => {
        if (index < values.length) {
          return { value: values[index++], done: false };
        } else {
          return { value: null, done: true };
        }
      },
    };
  },
};
