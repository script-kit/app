import { BasePromptOptions } from './enquirer';

export interface SimplePromptOptions extends BasePromptOptions {
  from: 'prompt' | 'log' | 'show' | 'need';
}
