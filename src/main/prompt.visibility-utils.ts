import type { KitPrompt } from './prompt';
import type { IPromptContext } from './prompt.types';
import { visibilityController } from './visibility';

export function handleBlurVisibility(prompt: KitPrompt) {
  // The visibility controller expects KitPrompt but accepts IPromptContext-compatible objects
  visibilityController.handleBlur(prompt as KitPrompt);
}
