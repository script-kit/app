/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
import { atom } from 'jotai';
import { Channel, Mode, ProcessType, UI } from 'kit-bridge/cjs/enum';
import Convert from 'ansi-to-html';
import {
  Choice,
  EditorConfig,
  Script,
  TextareaConfig,
  PromptData,
  EditorOptions,
} from 'kit-bridge/cjs/type';
import { clamp, debounce, drop } from 'lodash';
import { ipcRenderer } from 'electron';

const convert = new Convert();

const DEFAULT_MAX_HEIGHT = 480;

export const pidAtom = atom(0);
const rawOpen = atom(false);
export const submittedAtom = atom(false);
export const tabsAtom = atom<string[]>([]);

const placeholder = atom('');
export const placeholderAtom = atom(
  (g) => g(placeholder),
  debounce((g, s, a) => s(placeholder, a), 10)
);

export const unfilteredChoicesAtom = atom<Choice[]>([]);
export const prevChoicesAtom = atom<Choice[]>([]);

export const uiAtom = atom<UI>(UI.none);
export const hintAtom = atom('');
export const modeAtom = atom<Mode>(Mode.FILTER);

export const panelHTMLAtom = atom('');

const log = atom<string[]>([]);
export const logHTMLAtom = atom(
  (g) =>
    g(log)
      .map((line) => `<br>${convert.toHtml(line)}`)
      .join(``),
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

const maxHeight = atom(DEFAULT_MAX_HEIGHT);
export const maxHeightAtom = atom(
  (g) => g(maxHeight),
  (g, s, a: number) => {
    s(maxHeight, a);
    s(mainHeightAtom, a - g(topHeightAtom));
  }
);

export const formHTMLAtom = atom('');
export const formDataAtom = atom({});

const mouseEnabled = atom(true);

let mouseEnabledId: any;
export const mouseEnabledAtom = atom(
  (g) => g(mouseEnabled),
  (g, s, a: boolean) => {
    s(mouseEnabled, a);

    if (a === false) {
      if (mouseEnabledId) clearTimeout(mouseEnabledId);
      mouseEnabledId = setTimeout(() => {
        s(mouseEnabled, true);
      }, 200);
    }
  }
);

const index = atom(0);

const choices = atom<Choice[]>([]);

export const prevIndexAtom = atom(0);
export const prevInputAtom = atom('');
export const indexAtom = atom(
  (g) => g(index),
  (g, s, a: number) => {
    const { length } = g(choices);
    s(index, clamp(a, 0, length - 1));
  }
);

const flaggedValueAtom = atom<Choice | string>('');

export const choicesAtom = atom(
  (g) => g(choices),
  (g, s, a: Choice[]) => {
    s(mouseEnabledAtom, false);
    s(submittedAtom, false);

    const prevChoices = g(choices);
    const prevIndex = g(index);
    const prevChoice = prevChoices[prevIndex]?.id;
    const nextChoice = a[prevIndex]?.id;
    if (prevChoice !== nextChoice && !g(flaggedValueAtom)) {
      // s(indexAtom, 0);
    }
    s(choices, a);
  }
);

export const rawInputAtom = atom('');
export const inputAtom = atom(
  (g) => g(rawInputAtom),
  (g, s, a: string) => {
    s(submittedAtom, false);
    s(indexAtom, 0);
    s(rawInputAtom, a);
  }
);

export const flagsAtom = atom<{
  [key: string]: {
    name?: string;
    description?: string;
    shortcut?: string;
  };
}>({});

const tabIndex = atom(0);
export const tabIndexAtom = atom(
  (g) => g(tabIndex),
  (g, s, a: number) => {
    s(submittedAtom, false);
    s(tabIndex, a);
    s(flagsAtom, {});
    s(flaggedValueAtom, '');
    ipcRenderer.send(Channel.TAB_CHANGED, {
      tab: g(tabsAtom)[a],
      input: g(rawInputAtom),
      pid: g(pidAtom),
    });
  }
);

const noScript: Script = {
  filePath: '',
  command: '',
  name: '',
  type: ProcessType.App,
  requiresPrompt: false,
  kenv: '',
};
const script = atom<Script>(noScript);
export const scriptAtom = atom(
  (g) => g(script),
  (g, s, a: Script) => {
    s(script, a);
    s(rawInputAtom, '');
    s(unfilteredChoicesAtom, []);
    s(logHTMLAtom, '');
    s(indexAtom, 0);
    s(tabIndex, 0);
    s(submittedAtom, false);
    s(tabsAtom, a?.tabs || []);
    s(flagsAtom, {});
  }
);

// export const indexAtom = atom(
//   (g) => g(index),
//   (g, s, a: number) => {
//     s(mouseEnabledAtom, false);
//     s(index, a);
//   }
// );

// export const submittedAtom = atom((g) => g(submitted));

const checkIfSubmitIsDrop = (checkValue: any) => {
  if (Array.isArray(checkValue)) {
    const files = checkValue.map((file) => {
      const fileObject: any = {};

      for (const key in file) {
        const value = file[key];
        const notFunction = typeof value !== 'function';
        if (notFunction) fileObject[key] = value;
      }

      return fileObject;
    });

    return files;
  }

  return checkValue;
};

const promptData = atom<null | PromptData>(null);
export const promptDataAtom = atom(
  (g) => g(promptData),
  (g, s, a: null | PromptData) => {
    if (a) {
      s(rawOpen, true);
      s(submittedAtom, false);
      s(uiAtom, a.ui);
      s(panelHTMLAtom, '');
      s(placeholderAtom, a.placeholder);
      s(tabsAtom, a?.tabs || []);
    }
    s(promptData, a);
  }
);

export const flagValueAtom = atom(
  (g) => g(flaggedValueAtom),
  (g, s, a: any) => {
    if (a === '') {
      s(unfilteredChoicesAtom, g(prevChoicesAtom));
      s(rawInputAtom, g(prevInputAtom));
      s(indexAtom, g(prevIndexAtom));
    } else {
      s(prevIndexAtom, g(indexAtom));
      s(prevInputAtom, g(inputAtom));
      s(inputAtom, '');

      const flagChoices = Object.entries(g(flagsAtom)).map(
        ([key, value]: [key: string, value: any]) => {
          return {
            name: value?.name || key,
            shortcut: value?.shortcut || '',
            description: value?.description || '',
            value: key,
          };
        }
      );

      s(prevChoicesAtom, g(unfilteredChoicesAtom));
      s(unfilteredChoicesAtom, flagChoices);
    }

    s(flaggedValueAtom, a);
  }
);

export const flagAtom = atom('');
const submitValue = atom('');
export const submitValueAtom = atom(
  (g) => g(submitValue),
  (g, s, a: any) => {
    s(submittedAtom, true);
    s(indexAtom, 0);
    s(rawInputAtom, '');
    s(choices, []);
    s(
      placeholder,
      a === 'string' && !g(promptDataAtom)?.secret
        ? `Processing ${a}...`
        : 'Processing...'
    );

    const fValue = g(flaggedValueAtom);
    s(flaggedValueAtom, ''); // clear after getting
    const f = g(flagAtom);
    const flag = fValue ? a : f || '';
    s(flagAtom, '');

    const value = checkIfSubmitIsDrop(fValue || a);
    s(submitValue, value);

    ipcRenderer.send(Channel.VALUE_SUBMITTED, {
      value,
      flag,
      pid: g(pidAtom),
    });
  }
);

export const openAtom = atom(
  (g) => g(rawOpen),
  (g, s, a: boolean) => {
    if (g(rawOpen) && a === false) {
      ipcRenderer.send(Channel.ESCAPE_PRESSED, { pid: g(pidAtom) });
      // setChoices([]);
      s(choices, []);
      s(tabIndex, 0);
      s(indexAtom, 0);
      s(rawInputAtom, '');
      s(panelHTMLAtom, '');
      s(formHTMLAtom, '');
      s(promptDataAtom, null);
      s(hintAtom, '');
      s(submittedAtom, false);
      s(logHTMLAtom, '');
      s(uiAtom, UI.none);
      s(flagsAtom, {});
      s(flaggedValueAtom, '');
    }
    s(rawOpen, a);
  }
);

export const selectionStartAtom = atom(0);
