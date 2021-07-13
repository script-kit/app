import { atom } from 'jotai';
import { Mode, UI } from 'kit-bridge/cjs/enum';
import {
  Choice,
  EditorConfig,
  Script,
  TextareaConfig,
  PromptData,
} from 'kit-bridge/cjs/type';

const DEFAULT_MAX_HEIGHT = 480;

export const pidAtom = atom(0);
export const scriptAtom = atom<null | Script>(null);

export const indexAtom = atom(0);
export const inputAtom = atom('');
export const placeholderAtom = atom('');
export const promptDataAtom = atom<null | PromptData>(null);
export const submittedAtom = atom(false);

export const unfilteredChoicesAtom = atom<Choice[]>([]);
export const choicesAtom = atom<Choice[]>([]);

export const uiAtom = atom<UI>(UI.none);
export const hintAtom = atom('');
export const modeAtom = atom<Mode>(Mode.FILTER);

export const tabIndexAtom = atom(0);
export const tabsAtom = atom<string[]>([]);

export const panelHTMLAtom = atom('');
export const editorConfigAtom = atom<EditorConfig>({
  value: '',
  language: 'markdown',
});
export const textareaConfigAtom = atom<TextareaConfig>({
  value: '',
  placeholder: '',
});

export const topHeightAtom = atom(0);
export const mainHeightAtom = atom(0);
export const maxHeightAtom = atom(DEFAULT_MAX_HEIGHT);

export const formHTMLAtom = atom('');
export const formDataAtom = atom({});
