import { Choice } from 'kit-bridge/cjs/type';

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
export interface ListProps {
  height: number;
  width: number;
}
