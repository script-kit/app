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

export interface ChoiceData {
  name: string;
  value: string;
  preview: string | null;
  shortcode?: string;
}

export interface Script extends Choice {
  file: string;
  filePath: string;
  command: string;
  menu?: string;
  shortcut?: string;
  description?: string;
  shortcode?: string;
  alias?: string;
  author?: string;
  twitter?: string;
  exclude?: string;
  schedule?: string;
  system?: string;
  watch?: string;
  background?: string;
  isRunning?: boolean;
}
export interface Choice<Value = any> {
  name: string;
  value: Value;
  description?: string;
  focused?: string;
  img?: string;
  html?: string;
  preview?: string;
  id?: string;
}
