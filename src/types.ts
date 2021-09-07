import { Choice } from '@johnlindquist/kit/cjs/type';
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
  ui: UI;
  mode: Mode;
  topHeight: number;
  mainHeight: number;
  filePath: string;
  hasPanel: boolean;
  hasChoices: boolean;
  hasInput: boolean;
  open: boolean;
}
