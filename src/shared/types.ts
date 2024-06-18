import type { Mode, UI } from '@johnlindquist/kit/core/enum';
import type { Choice } from '@johnlindquist/kit/types/core';

export interface ScoredChoice {
  item: Choice<{ id: string; name: string; value: any }>;
  score: number;
  matches: {
    [key: string]: [number, number][];
  };
  _: string;
}

export interface ChoiceButtonData {
  choices: ScoredChoice[];
}
export interface ChoiceButtonProps {
  data: ChoiceButtonData;
  index: number;
  style: any;
}
export interface ListProps {
  height: number;
}

export interface ResizeData {
  id: string;
  pid: number;
  reason: string;
  scriptPath: string;
  ui: UI;
  mode: Mode;
  topHeight: number;
  mainHeight: number;
  footerHeight: number;
  hasPanel: boolean;
  hasInput: boolean;
  open: boolean;
  previewEnabled: boolean;
  tabIndex: number;
  isSplash: boolean;
  hasPreview: boolean;
  inputChanged: boolean;
  placeholderOnly: boolean;
  forceResize: boolean;
  forceHeight?: number;
  forceWidth?: number;
  justOpened: boolean;
  totalChoices: number;
  isMainScript: boolean;
}

export interface Survey {
  email: string;
  question: string;
  response: string;
  subscribe: boolean;
  contact: boolean;
}

export type TermConfig = {
  promptId: string;
  command: string;
  cwd: string;
  env: { [key: string]: string };
  shell: string | boolean;
  args?: string[];
  closeOnExit?: boolean;
  pid?: number;
  cleanPath?: boolean;
};
