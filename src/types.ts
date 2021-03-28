import { BasePromptOptions, ArrayPromptOptions } from './enquirer';

export interface KitPromptOptions extends BasePromptOptions {
  kitScript: string;
  choices: any;
  from: 'prompt' | 'show' | 'log' | 'choices';
  detail: string | null;
  scriptInfo: {
    menu: string;
  };
}
export interface KitArrayPromptOptions extends ArrayPromptOptions {
  kitScript: string;
  from: 'prompt' | 'show' | 'log' | 'choices';
  detail: string | null;
}
