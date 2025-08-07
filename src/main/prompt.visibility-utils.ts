import type { KitPrompt } from './prompt';
import { visibilityController } from './visibility';

export function handleBlurVisibility(prompt: KitPrompt) {
  visibilityController.handleBlur(prompt as any);
}


