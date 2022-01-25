import { Choice } from '@johnlindquist/kit/types/core';
import { Mode, UI } from '@johnlindquist/kit/cjs/enum';

export interface ScoredChoice {
  item: Choice;
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
  scriptPath: string;
  ui: UI;
  mode: Mode;
  topHeight: number;
  mainHeight: number;
  hasPanel: boolean;
  hasInput: boolean;
  open: boolean;
  previewEnabled: boolean;
  tabIndex: number;
  isSplash: boolean;
  hasPreview: boolean;
  promptId: number;
  inputChanged: boolean;
  placeholderOnly: boolean;
}

export interface Survey {
  email: string;
  question: string;
  response: string;
  subscribe: boolean;
  contact: boolean;
}
