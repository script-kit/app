import { BasePromptOptions, ArrayPromptOptions } from './enquirer';

export interface KitPromptOptions extends BasePromptOptions {
  choices: any;
  from: 'prompt' | 'show' | 'log' | 'choices';
  detail: string | null;
}
export interface KitArrayPromptOptions extends ArrayPromptOptions {
  from: 'prompt' | 'show' | 'log' | 'choices';
  detail: string | null;
}
