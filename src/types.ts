import { Choice } from 'kit-bridge/cjs/type';
import { Mode, UI } from 'kit-bridge/cjs/enum';

export interface ChoiceButtonData {
  choices: Choice[];
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
