/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
import { Atom, atom, Getter, Setter } from 'jotai';
import asap from 'asap';
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
import { AppChannel } from './enums';
import { ResizeData } from './types';

let placeholderTimeoutId: NodeJS.Timeout;
let choicesTimeoutId: NodeJS.Timeout;

export const pidAtom = atom(0);
const rawOpen = atom(false);
export const submittedAtom = atom(false);
export const tabsAtom = atom<string[]>([]);

const placeholder = atom('');
export const placeholderAtom = atom(
  (g) => g(placeholder),
  (g, s, a: string) => {
    s(placeholder, a);
    if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
  }
);

export const unfilteredChoicesAtom = atom<Choice[]>([]);
export const prevChoicesAtom = atom<Choice[]>([]);

export const uiAtom = atom<UI>(UI.arg);
export const hintAtom = atom('');
export const modeAtom = atom<Mode>(Mode.FILTER);

export const panelHTMLAtom = atom('');

const log = atom<string[]>([]);

const darkInit = window.matchMedia('(prefers-color-scheme: dark)').matches;

const createConvertOptions = (
  dark: boolean
): ConstructorParameters<typeof import('ansi-to-html')>[0] => {
  return {
    bg: dark ? '#FFF' : '#000',
    fg: dark ? '#000' : '#FFF  ',
    newline: true,
  };
};

let convert = new Convert(createConvertOptions(darkInit));

const dark = atom(darkInit);
export const darkAtom = atom(
  (g) => g(dark),
  (g, s, a: boolean) => {
    s(dark, a);

    convert = new Convert(createConvertOptions(a));
  }
);

export const logHTMLAtom = atom(
  (g) =>
    convert
      ? g(log)
          .map((line) => `<br/>${convert.toHtml(line)}`)
          .join(``)
      : '',
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

export const formHTMLAtom = atom('');
export const formDataAtom = atom({});

export const mouseEnabledAtom = atom(0);

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
    if (choicesTimeoutId) clearTimeout(choicesTimeoutId);
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
    s(mouseEnabledAtom, 0);
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

export const selectedAtom = atom('');

const script = atom<Script>(noScript);
export const scriptAtom = atom(
  (g) => g(script),
  (g, s, a: Script) => {
    s(mouseEnabledAtom, 0);
    s(script, a);
    s(rawInputAtom, '');
    s(unfilteredChoicesAtom, []);
    s(logHTMLAtom, '');
    s(indexAtom, 0);
    s(tabIndex, 0);
    s(submittedAtom, false);
    s(tabsAtom, a?.tabs || []);
    s(flagsAtom, {});
    s(flaggedValueAtom, '');
  }
);

const topHeight = atom(88);
const mainHeight = atom(0);

const resize = (g: Getter, s: Setter) => {
  asap(() => {
    const data: ResizeData = {
      topHeight: g(topHeight),
      ui: g(uiAtom),
      mainHeight: g(mainHeight),
      filePath: g(script).filePath,
      mode: g(modeAtom),
      hasChoices: Boolean(g(choices)?.length),
      hasPanel: Boolean(g(panelHTMLAtom)?.length),
      hasInput: Boolean(g(inputAtom)?.length),
      open: g(rawOpen),
    };
    ipcRenderer.send(AppChannel.RESIZE, data);
  });
};

export const topHeightAtom = atom(
  (g) => g(topHeight),
  (g, s, a: number) => {
    s(topHeight, a);
    resize(g, s);
  }
);

export const mainHeightAtom = atom(
  (g) => g(mainHeight),
  (g, s, a: number) => {
    s(mainHeight, a < 0 ? 0 : a);
    resize(g, s);
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
      s(selectedAtom, a?.selected || '');
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
      s(index, g(prevIndexAtom));
      s(selectedAtom, '');
    } else {
      s(prevIndexAtom, g(indexAtom));
      s(prevInputAtom, g(inputAtom));
      s(inputAtom, '');
      s(selectedAtom, typeof a === 'string' ? a : (a as Choice).name);

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
    const fValue = g(flaggedValueAtom);
    const f = g(flagAtom);
    const flag = fValue ? a : f || '';

    const value = checkIfSubmitIsDrop(fValue || a);

    ipcRenderer.send(Channel.VALUE_SUBMITTED, {
      value,
      flag,
      pid: g(pidAtom),
    });

    if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
    placeholderTimeoutId = setTimeout(
      (placehold, secret) => {
        s(
          placeholderAtom,
          typeof placehold === 'string' && !secret
            ? `Processing "${placehold}"...`
            : 'Processing...'
        );
      },
      500,
      a,
      g(promptDataAtom)?.secret
    );
    if (choicesTimeoutId) clearTimeout(choicesTimeoutId);
    choicesTimeoutId = setTimeout(() => {
      s(choices, []);
    }, 250);

    asap(() => {
      s(submittedAtom, true);
      s(indexAtom, 0);
      s(rawInputAtom, '');

      s(flaggedValueAtom, ''); // clear after getting
      s(flagAtom, '');
      s(submitValue, value);
    });
  }
);

export const openAtom = atom(
  (g) => g(rawOpen),
  (g, s, a: boolean) => {
    s(mouseEnabledAtom, 0);
    if (g(rawOpen) && a === false) {
      ipcRenderer.send(Channel.ESCAPE_PRESSED, { pid: g(pidAtom) });
      // setChoices([]);
      // s(choices, []);
      s(tabIndex, 0);
      s(indexAtom, 0);
      s(rawInputAtom, '');
      s(panelHTMLAtom, '');
      s(formHTMLAtom, '');
      s(promptDataAtom, null);
      s(hintAtom, '');
      s(submittedAtom, false);
      s(logHTMLAtom, '');
      s(uiAtom, UI.arg);
      s(flagsAtom, {});
      s(flaggedValueAtom, '');
    }
    s(rawOpen, a);
  }
);

export const selectionStartAtom = atom(0);
export const isMouseDownAtom = atom(false);

interface FilePathBounds {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  filePath: string;
}

const emptyFilePathBounds: FilePathBounds = {
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  filePath: '',
};
export const filePathBoundsAtom = atom<FilePathBounds>(emptyFilePathBounds);

const theme = atom({});
export const themeAtom = atom(
  (g) => g(theme),
  (g, s, a: { [key: string]: string }) => {
    Object.entries(a).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });

    s(theme, a);
  }
);
