import { atom } from 'jotai';
import { Channel, Mode, UI } from 'kit-bridge/cjs/enum';
import Convert from 'ansi-to-html';
import {
  Choice,
  EditorConfig,
  Script,
  TextareaConfig,
  PromptData,
  EditorOptions,
} from 'kit-bridge/cjs/type';
import { debounce, drop } from 'lodash';

const convert = new Convert();

const DEFAULT_MAX_HEIGHT = 480;

export const pidAtom = atom(0);
export const scriptAtom = atom<null | Script>(null);

export const indexAtom = atom(0);
export const inputAtom = atom('');
const placeholder = atom('');
export const placeholderAtom = atom(
  (g) => g(placeholder),
  debounce((g, s, a) => s(placeholder, a), 10)
);
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

const log = atom<string[]>([]);
export const logHTMLAtom = atom(
  (g) =>
    g(log)
      .map((line) => `${convert.toHtml(line)}`)
      .join(`<br>`),
  (g, s, a: string) => {
    if (a === Channel.CONSOLE_CLEAR || a === '') {
      s(log, []);
    } else {
      const oldLog = g(log);
      s(log, drop(oldLog, oldLog.length > 256 ? 256 : 0).concat([a]));
    }
  }
);

export const logHeightAtom = atom(0);
export const editorConfigAtom = atom<EditorConfig>({
  value: '',
  language: 'markdown',
} as EditorOptions);
export const textareaConfigAtom = atom<TextareaConfig>({
  value: '',
  placeholder: '',
});

export const topHeightAtom = atom(88);

const mainHeight = atom(0);
export const mainHeightAtom = atom(
  (g) => g(mainHeight),
  (g, s, a: number) => {
    return s(mainHeight, a < 0 ? 0 : a);
  }
);

export const maxHeightAtom = atom(DEFAULT_MAX_HEIGHT);

export const formHTMLAtom = atom('');
export const formDataAtom = atom({});
