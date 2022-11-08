import { Choice } from '@johnlindquist/kit/types/core';
import { ProcessType, Mode, UI } from '@johnlindquist/kit/cjs/enum';
import { ChildProcess } from 'child_process';

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
  currentIndex: number;
  inputValue: string;
  mouseEnabled: number;
  onIndexChange: (index: number) => void;
  onIndexSubmit: (index: number) => void;
}
export interface ChoiceButtonProps {
  data: ChoiceButtonData;
  index: number;
  style: any;
}
export interface ListProps {
  height: number;
  width: number;
}

export interface ResizeData {
  id: string;
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
  nullChoices: boolean;
}

export interface Survey {
  email: string;
  question: string;
  response: string;
  subscribe: boolean;
  contact: boolean;
}
