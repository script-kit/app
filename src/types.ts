import { Mode, Channel, ProcessType } from './enums';

export interface PromptData {
  script: Script;
  placeholder: string;
  kitScript: string;
  choices: Choice[];
  tabs: string[];
}
export interface ChoiceData {
  name: string;
  value: string;
  preview: string | null;
  shortcode?: string;
}

export interface Script extends Choice {
  id: string;
  name: string;
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
  requiresPrompt: boolean;
  timeout?: number;
  tabs: string[];
  placeholder: string;
  input: InputType;
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
  shortcode?: string;
}

export interface MessageData extends PromptData {
  channel: Channel;
  pid: number;
  log?: string;
  warn?: string;
  path?: string;
  filePath?: string;
  name?: string;
  args?: string[];
  mode?: Mode;
  ignore?: boolean;
  text?: string;
  options?: any;
  image?: any;
  html?: string;
  info?: string;
  input?: string;
  scripts?: boolean;
  kenvPath?: string;
  hint?: string;
  tabIndex?: number;
}
