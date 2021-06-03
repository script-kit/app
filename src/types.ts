import { BasePromptOptions, ArrayPromptOptions } from './enquirer';
import { Channel, ProcessType } from './enums';

export interface KitPromptOptions extends BasePromptOptions {
  script: Script;
  placeholder: string;
  kitScript: string;
  choices: any;
  detail: string | null;
  tabs: string[];
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
  type: ProcessType;
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
  hasTabs: boolean;
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

export type MessageData = {
  channel: Channel;
  kitScript: string;
  pid: number;
  log?: string;
  warn?: string;
  path?: string;
  filePath?: string;
  name?: string;
  args?: string[];
  mode?: string;
  ignore?: boolean;
  text?: string;
  options?: any;
  image?: any;
  html?: string;
  choices?: any[];
  info?: any;
  scripts?: boolean;
  script?: Script;
  kenvPath?: string;
  tabs: string[];
};
