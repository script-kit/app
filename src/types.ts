import { ChangeEvent, KeyboardEvent } from 'react';
import { editor } from 'monaco-editor';
import { Mode, Channel, ProcessType, UI } from './enums';

export interface PromptData {
  script: Script;
  ui: UI;
  placeholder: string;
  kitScript: string;
  choices: Choice[];
  tabs: string[];
  ignoreBlur: boolean;
  textarea?: boolean;
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
  input: string;
}
export interface Choice<Value = any> {
  name: string | JSX.Element[];
  value?: Value;
  description?: string;
  focused?: string;
  img?: string;
  html?: string;
  preview?: string;
  id?: string;
  shortcode?: string;
  uuid?: string;
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

export interface ChoiceButtonData {
  choices: Choice[];
  currentIndex: number;
  inputValue: string;
  mouseEnabled: boolean;
  onIndexChange: (index: number) => void;
  onIndexSubmit: (index: number) => void;
}
export interface ChoiceButtonProps {
  data: ChoiceButtonData;
  index: number;
  style: any;
}

export enum Secret {
  password = 'password',
  text = 'text',
}
export interface InputProps {
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  secret: Secret;
  value: any;
}
export interface HotkeyProps {
  submit(data: any): void;
  onEscape(): void;
}

export interface DropProps {
  placeholder: string;
  submit(data: any): void;
  onEscape(): void;
}

export interface ListProps {
  height: number;
  width: number;
  onListChoicesChanged: (listHeight: number) => void;
  index: number;
  choices: ChoiceButtonData['choices'];
  onIndexChange: ChoiceButtonData['onIndexChange'];
  onIndexSubmit: ChoiceButtonData['onIndexSubmit'];
  inputValue: string;
}

export interface EditorProps {
  options: EditorConfig;
  height: number;
  width: number;
}

export type EditorConfig = editor.IStandaloneEditorConstructionOptions & {
  language?: string;
  content?: string;
};

export type EditorRef = editor.IStandaloneCodeEditor;
