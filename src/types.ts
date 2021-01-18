import { BasePromptOptions, ArrayPromptOptions } from './enquirer';

export interface SimplePromptOptions extends BasePromptOptions {
  choices: any;
  from: 'prompt' | 'show' | 'log' | 'choices';
  detail: string | null;
}
export interface SimpleArrayPromptOptions extends ArrayPromptOptions {
  from: 'prompt' | 'show' | 'log' | 'choices';
  detail: string | null;
}
