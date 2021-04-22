import { BasePromptOptions, ArrayPromptOptions } from './enquirer';

export interface KitPromptOptions extends BasePromptOptions {
  placeholder: string;
  kitScript: string;
  choices: any;
  detail: string | null;
  scriptInfo: {
    menu?: string;
    description?: string;
    twitter?: string;
  };
}
export interface KitArrayPromptOptions extends ArrayPromptOptions {
  kitScript: string;
  detail: string | null;
}
