/* eslint-disable no-bitwise */
/* eslint-disable no-useless-escape */
/* eslint-disable no-plusplus */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
import { atom, Getter, Setter } from 'jotai';
import { QuickScore, Range, createConfig, quickScore } from 'quick-score';
import asap from 'asap';

import { Channel, Mode, ProcessType, UI } from '@johnlindquist/kit/cjs/enum';
import Convert from 'ansi-to-html';
import { Choice, Script, PromptData } from '@johnlindquist/kit/types/core';
import { mainScriptPath, kitPath } from '@johnlindquist/kit/cjs/utils';
import {
  EditorConfig,
  TextareaConfig,
  EditorOptions,
} from '@johnlindquist/kit/types/kitapp';

import { clamp, debounce, drop } from 'lodash';
import { ipcRenderer } from 'electron';
import { AppChannel } from './enums';
import { ResizeData, ScoredChoice } from './types';

let placeholderTimeoutId: NodeJS.Timeout;
let choicesTimeoutId: NodeJS.Timeout;

export const pidAtom = atom(0);
const rawOpen = atom(false);
export const submittedAtom = atom(false);
export const tabsAtom = atom<string[]>([]);
const cachedMainPreview = atom('');

const placeholder = atom('');
export const placeholderAtom = atom(
  (g) => g(placeholder),
  (g, s, a: string) => {
    s(placeholder, a);
    if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
  }
);

interface QuickScoreInterface {
  search: (query: string) => ScoredChoice[];
}
const search = (qs: QuickScoreInterface, term: string): ScoredChoice[] => {
  return qs?.search(term.replaceAll(' ', ''));
};

const createScoredChoice = (item: Choice): ScoredChoice => {
  return {
    item,
    score: 0,
    matches: {},
    _: '',
  };
};

export const quickScoreAtom = atom<QuickScoreInterface | null>(null);
const unfilteredChoices = atom<Choice[]>([]);

function containsSpecialCharacters(str: string) {
  const regex = /[ !@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g;
  return regex.test(str);
}

const precede = `(:?(^|\\W))`;
function scorer(string: string, query: string, matches: number[][]) {
  // avoid regex being passed in
  if (!containsSpecialCharacters(query)) {
    const r = new RegExp(`${precede}${query}`, 'i');
    const match = string.match(r);
    if (match) {
      const index = match?.index || 0;
      // const first = index === 0;
      const start = index ? index + 1 : index;
      const length = match[0]?.length - (index ? 1 : 0);
      const ms = [start, start + length];
      matches.push(ms);
      return 1 - start / 100;
    }
  }

  return quickScore(
    string,
    query,
    matches,
    undefined,
    undefined,
    createConfig({
      maxIterations: 2 ** 8,
    }),
    new Range(0, 150)
  );
}

const keys = [
  'name',
  'description',
  'kenv',
  'command',
  'friendlyShortcut',
  'tag',
].map((name) => ({ name, scorer }));

const unfilteredPreview = atom<boolean>(true);

export const ultraShortCodesAtom = atom<{ code: string; id: string }[]>([]);

export const unfilteredChoicesAtom = atom(
  (g) => g(unfilteredChoices),
  (g, s, a: Choice[]) => {
    s(panelHTML, ``);

    if (a?.length === 0 && g(unfilteredChoices)?.length === 0) return;
    s(unfilteredChoices, a);
    const maybePreview = Boolean(
      a.find((c) => c?.hasPreview) || g(promptData)?.hasPreview
    );

    s(unfilteredPreview, maybePreview);
    if (a?.[0]?.name.match(/(?<=\[)\w(?=\])/i)) {
      const codes = a.map((choice) => {
        const code = choice?.name.match(/(?<=\[)\w(?=\])/i)?.[0] || '';

        return {
          code: code?.toLowerCase(),
          id: code ? (choice.id as string) : '',
        };
      });

      s(ultraShortCodesAtom, codes);
    }

    const qs = new QuickScore(a, {
      keys,
      minimumScore: 0.3,
    });
    s(quickScoreAtom, qs);
    if (g(modeAtom) === Mode.GENERATE) {
      s(scoredChoices, []);
    }

    s(scoredChoices, (a || []).map(createScoredChoice));
    const prevCId = g(prevChoiceId);
    const prevIndex = a.findIndex((c) => c?.id === prevCId);

    s(indexAtom, prevIndex || 0);
  }
);

export const prevChoicesAtom = atom<Choice[]>([]);

export const uiAtom = atom<UI>(UI.arg);

const hint = atom('');
export const hintAtom = atom(
  (g) => g(hint),
  (g, s, a: string) => {
    s(hint, a);
    const hintCodes = a?.match(/(?<=\[)\w(?=\])/gi);
    if (hintCodes) {
      const codes = hintCodes.map((code) => {
        return {
          code,
          id: '',
        };
      });
      s(ultraShortCodesAtom, codes);
    }
  }
);

export const modeAtom = atom<Mode>(Mode.FILTER);

const panelHTML = atom<string>('');
export const panelHTMLAtom = atom(
  (g) => g(panelHTML),
  (g, s, a: string) => {
    s(unfilteredChoicesAtom, []);
    s(panelHTML, a);
  }
);

const previewHTML = atom('');
export const previewHTMLAtom = atom(
  (g) => g(previewHTML),
  (g, s, a: string) => {
    if (!a) return; // never unset preview to avoid flash of white/black
    const sc = g(script) as Script;
    const tI = g(tabIndex);
    const iA = g(inputAtom);

    if (sc.filePath === mainScriptPath && tI === 0 && iA === '') {
      s(cachedMainPreview, a);
    }
    if (g(previewHTML) !== a) {
      s(previewHTML, a);
    }
  }
);

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

const mouseEnabled = atom(0);
export const mouseEnabledAtom = atom(
  (g) => g(mouseEnabled) > 5,
  (g, s, a: number) => {
    s(mouseEnabled, a ? g(mouseEnabled) + a : a);
  }
);

const index = atom(0);

const choices = atom<ScoredChoice[]>([]);

export const prevIndexAtom = atom(0);
export const prevInputAtom = atom('');
export const indexAtom = atom(
  (g) => g(index),
  (g, s, a: number) => {
    const cs = g(choices);
    const clampedIndex = clamp(a, 0, cs.length - 1);

    if (g(index) !== clampedIndex) {
      s(index, clampedIndex);
    }

    const choice = cs?.[clampedIndex]?.item;

    const selected = g(selectedAtom);
    const id = choice?.id;

    if (!selected && id) {
      s(focusedChoiceAtom, choice);
      s(prevChoiceId, id);
    }
  }
);

function isScript(choice: Choice | Script): choice is Script {
  return (choice as Script)?.command !== undefined;
}

const flaggedValueAtom = atom<Choice | string>('');
const focusedChoice = atom<Choice | null>(null);
export const focusedChoiceAtom = atom(
  (g) => g(focusedChoice),
  (g, s, choice: Choice | null) => {
    // if (g(focusedChoice)?.id === choice?.id) return;
    if (isScript(choice as Choice)) {
      (choice as Script).hasPreview = true;
    }

    s(focusedChoice, choice);

    if (choice?.id && g(selectedAtom) === '') {
      const { id } = choice;

      if (typeof choice?.preview === 'string') {
        s(previewHTMLAtom, choice?.preview);
      }
      ipcRenderer.send(Channel.CHOICE_FOCUSED, {
        id,
        input: g(rawInputAtom),
        pid: g(pidAtom),
      });
    }
  }
);

export const hasPreviewAtom = atom<boolean>((g) => {
  return (
    Boolean(g(focusedChoice)?.hasPreview || g(promptData)?.hasPreview) ||
    (g(focusedChoiceAtom) === null && Boolean(g(previewHTMLAtom)?.length))
  );
});

const prevChoiceId = atom<string>('');

export const scoredChoices = atom(
  (g) => g(choices),
  (g, s, a: ScoredChoice[]) => {
    if (choicesTimeoutId) clearTimeout(choicesTimeoutId);
    s(submittedAtom, false);

    s(choices, a);
    const isFilter = g(uiAtom) === UI.arg && g(modeAtom) === Mode.FILTER;

    if (a?.length) {
      const selected = g(selectedAtom);

      if (!selected) {
        s(focusedChoiceAtom, a[0]?.item);
      }

      ipcRenderer.send(Channel.CHOICES, {
        input: g(inputAtom),
        pid: g(pidAtom),
      });
    } else {
      s(focusedChoiceAtom, null);
      if (isFilter) {
        ipcRenderer.send(Channel.NO_CHOICES, {
          input: g(inputAtom),
          pid: g(pidAtom),
        });
      }
    }
  }
);

export const choicesAtom = atom((g) =>
  g(scoredChoices).map((result) => result.item)
);

export const rawInputAtom = atom('');

const generateChoices = debounce((input, pid) => {
  ipcRenderer.send(Channel.GENERATE_CHOICES, {
    input,
    pid,
  });
}, 100);

const debounceSearch = debounce((qs: QuickScore, s: Setter, a: string) => {
  if (!a) return false;
  const result = search(qs, a);
  s(scoredChoices, result);
  return true;
}, 50);

export const inputAtom = atom(
  (g) => g(rawInputAtom),
  (g, s, a: string) => {
    s(mouseEnabledAtom, 0);
    s(submittedAtom, false);
    s(indexAtom, 0);
    s(rawInputAtom, a);

    const qs = g(quickScoreAtom);
    const mode = g(modeAtom);
    const un = g(unfilteredChoicesAtom);

    if (mode === Mode.FILTER) {
      if (qs && a) {
        if (un.length < 1000) {
          const result = search(qs, a);
          s(scoredChoices, result);
        } else {
          debounceSearch(qs, s, a);
        }
      } else if (un.length) {
        s(scoredChoices, un.map(createScoredChoice));
      }
    }

    if (mode === Mode.GENERATE) {
      generateChoices(a, g(pidAtom));
    }
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
  id: '',
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
    console.clear();
    s(tabsAtom, a?.tabs || []);
    s(mouseEnabledAtom, 0);
    s(script, a);
    s(rawInputAtom, '');
    // s(unfilteredChoicesAtom, []);
    s(ultraShortCodesAtom, []);
    // s(choices, []);
    s(logHTMLAtom, '');
    s(indexAtom, 0);
    s(tabIndex, 0);
    s(submittedAtom, false);
    s(flagsAtom, {});
    s(flaggedValueAtom, '');
    if (a.filePath === mainScriptPath) {
      s(previewHTMLAtom, g(cachedMainPreview));
    }
  }
);

export const isKitScriptAtom = atom<boolean>((g) => {
  return (g(script) as Script).filePath.includes(kitPath());
});

const topHeight = atom(88);
const mainHeight = atom(0);

const resizeData = atom({});

const resize = (g: Getter, s: Setter) => {
  const data: ResizeData = {
    topHeight: g(topHeight),
    ui: g(uiAtom),
    mainHeight: g(mainHeight),
    filePath: (g(script) as Script).filePath,
    mode: g(modeAtom),
    hasChoices: Boolean(g(choices)?.length),
    hasPanel: Boolean(g(panelHTMLAtom)?.length),
    hasInput: Boolean(g(inputAtom)?.length),
    isPreviewOpen: Boolean(
      g(unfilteredPreview) && g(previewEnabled) && g(uiAtom) === UI.arg
    ),
    previewEnabled: g(previewEnabled),
    open: g(rawOpen),
    tabIndex: g(tabIndex),
  };

  const prevData = g(resizeData);
  if (JSON.stringify(prevData) === JSON.stringify(data)) {
    return;
  }

  s(resizeData, data);

  ipcRenderer.send(AppChannel.RESIZE, data);
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
    const prevHeight = g(mainHeight);
    if (Math.abs(a - prevHeight) > 2) {
      s(mainHeight, a < 0 ? 0 : a);

      resize(g, s);
    }
  }
);

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
      s(tabsAtom, a?.tabs || []);
      s(rawOpen, true);
      s(rawInputAtom, '');
      s(submittedAtom, false);
      s(uiAtom, a.ui);
      // s(panelHTMLAtom, '');
      s(placeholderAtom, a.placeholder);
      s(selectedAtom, a?.selected || '');
    }
    s(promptData, a);
  }
);

export const flagValueAtom = atom(
  (g) => g(flaggedValueAtom),
  (g, s, a: any) => {
    if (a === '') {
      s(selectedAtom, '');
      s(unfilteredChoicesAtom, g(prevChoicesAtom));
      s(rawInputAtom, g(prevInputAtom));
      s(index, g(prevIndexAtom));
    } else {
      s(selectedAtom, typeof a === 'string' ? a : (a as Choice).name);
      s(prevIndexAtom, g(indexAtom));
      s(prevInputAtom, g(inputAtom));
      s(inputAtom, '');

      const flagChoices: Choice[] = Object.entries(g(flagsAtom)).map(
        ([key, value]: [key: string, value: any]) => {
          return {
            command: value?.name,
            filePath: value?.name,
            name: value?.name || key,
            shortcut: value?.shortcut || '',
            friendlyShortcut: value?.shortcut || '',
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
      (g(promptDataAtom) as PromptData)?.secret
    );
    if (choicesTimeoutId) clearTimeout(choicesTimeoutId);
    choicesTimeoutId = setTimeout(() => {
      // s(choices, []);
    }, 250);

    asap(() => {
      s(submittedAtom, true);
      // s(indexAtom, 0);
      // s(rawInputAtom, '');

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
      // s(choices, []);
      s(tabIndex, 0);
      s(rawInputAtom, '');
      // s(panelHTMLAtom, '');
      s(formHTMLAtom, '');
      s(promptDataAtom, null);
      s(hintAtom, '');
      s(logHTMLAtom, '');
      s(uiAtom, UI.arg);
      s(flagsAtom, {});
      s(flaggedValueAtom, '');
      ipcRenderer.send(Channel.ESCAPE_PRESSED, { pid: g(pidAtom) });
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

export const modifiers = [
  'Alt',
  'AltGraph',
  'CapsLock',
  'Control',
  'Fn',
  'FnLock',
  'Meta',
  'NumLock',
  'ScrollLock',
  'Shift',
  'Symbol',
  'SymbolLock',
];
export const modifiersAtom = atom<string[]>([]);
export const inputFocusAtom = atom<boolean>(true);

const previewEnabled = atom<boolean>(true);
export const previewEnabledAtom = atom(
  (g) => g(previewEnabled),
  (g, s, a: boolean) => {
    s(previewEnabled, a);
    resize(g, s);
  }
);
