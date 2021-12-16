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

import { Channel, Mode, UI } from '@johnlindquist/kit/cjs/enum';
import Convert from 'ansi-to-html';
import {
  Choice,
  Script,
  PromptData,
  FlagsOptions,
} from '@johnlindquist/kit/types/core';
import { mainScriptPath, kitPath } from '@johnlindquist/kit/cjs/utils';
import {
  EditorConfig,
  TextareaConfig,
  EditorOptions,
  AppConfig,
} from '@johnlindquist/kit/types/kitapp';

import _, { clamp, debounce, drop, get, isEqual } from 'lodash';
import { ipcRenderer } from 'electron';
import { AppChannel } from './enums';
import { ResizeData, ScoredChoice } from './types';
import { noScript, SPLASH_PATH } from './defaults';

let placeholderTimeoutId: NodeJS.Timeout;
let choicesTimeoutId: NodeJS.Timeout;

const processId = atom(0);
export const pidAtom = atom(
  (g) => g(processId),
  (g, s, a: number) => {
    if (a && g(processId) !== a) {
      ipcRenderer.send(Channel.ESCAPE_PRESSED, {
        pid: g(processId),
        newPid: a,
      });
    }
    s(processId, a);
  }
);
export const processingAtom = atom(false);
const rawOpen = atom(false);
export const submittedAtom = atom(false);
const tabs = atom<string[]>([]);
export const tabsAtom = atom(
  (g) => g(tabs),
  (g, s, a: string[]) => {
    const prevTabs = g(tabs);
    if (isEqual(prevTabs, a)) return;
    s(tabs, a || []);
  }
);
const cachedMainPreview = atom('');
const loading = atom<boolean>(false);

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

    s(unfilteredChoices, a);
    const maybePreview = Boolean(
      a.find((c) => c?.hasPreview) ||
        g(promptData)?.hasPreview ||
        g(isMainScriptAtom) ||
        g(isSplashAtom)
    );

    s(unfilteredPreview, maybePreview);
    // if (a?.[0]?.name.match(/(?<=\[)\.(?=\])/i)) {
    if (
      a.length > 0 &&
      a?.length < 256 &&
      g(ultraShortCodesAtom).length === 0
    ) {
      const codes = [];
      for (const choice of a) {
        const code = choice?.name.match(/(?<=\[).(?=\])/i)?.[0] || '';

        if (code) {
          codes.push({
            code: code?.toLowerCase(),
            id: code ? (choice.id as string) : '',
          });
        }
      }
      s(ultraShortCodesAtom, codes);
    }

    const qs = new QuickScore(a, {
      keys,
      minimumScore: 0.3,
    });
    s(quickScoreAtom, qs);

    const input = g(inputAtom);
    const mode = g(modeAtom);
    const flaggedValue = g(flaggedValueAtom);

    // if (!flaggedValue) {
    if (mode === Mode.GENERATE && !flaggedValue) {
      s(scoredChoices, (a || []).map(createScoredChoice));
    }
    if (mode === Mode.FILTER) {
      filterByInput(g, s, qs, input);
    }
    // }

    const prevCId = g(prevChoiceId);
    const prevIndex = g(isMainScriptAtom)
      ? 0
      : a.findIndex((c) => c?.id === prevCId);

    s(indexAtom, prevIndex || 0);
  }
);

export const prevChoicesAtom = atom<Choice[]>([]);

const ui = atom<UI>(UI.arg);
export const uiAtom = atom(
  (g) => g(ui),
  (g, s, a: UI) => {
    s(ui, a);
    if (a & (UI.arg | UI.textarea | UI.hotkey)) {
      s(inputFocusAtom, true);
    }
    // s(previewHTMLAtom, g(cachedMainPreview));
  }
);

const hint = atom('');
export const hintAtom = atom(
  (g) => g(hint),
  (g, s, a: string) => {
    const aHint = typeof a !== 'string' ? '' : a;
    const getConvert = g(convertAtom);
    s(hint, getConvert(true).toHtml(aHint));
    const hintCodes = aHint?.match(/(?<=\[)\w(?=\])/gi);
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
  (g) => g(panelHTML) || g(promptData)?.panel,
  (g, s, a: string) => {
    if (a) s(unfilteredChoicesAtom, []);
    s(panelHTML, a);

    s(loadingAtom, false);
  }
);

const previewHTML = atom('');
export const previewHTMLAtom = atom(
  (g) => g(previewHTML) || g(promptData)?.preview,
  (g, s, a: string) => {
    if (!a || !g(openAtom)) return; // never unset preview to avoid flash of white/black
    const tI = g(tabIndex);
    const iA = g(inputAtom);
    const index = g(indexAtom);

    if (g(isMainScriptAtom) && tI === 0 && iA === '' && index === 0) {
      s(cachedMainPreview, a);
    }

    if (g(previewHTML) !== a) {
      s(previewHTML, a);
    }
  }
);

const log = atom<string[]>([]);

const darkInit = window.matchMedia('(prefers-color-scheme: dark)').matches;

const convertAtom = atom<(inverse?: boolean) => Convert>((g) => {
  return (inverse = false) => {
    const isDark = g(darkAtom);

    const bgMatch = isDark ? '#fff' : '#000';
    const fgMatch = isDark ? '#000' : '#fff';

    const bg = inverse ? fgMatch : bgMatch;
    const fg = inverse ? bgMatch : fgMatch;

    const convertOptions: ConstructorParameters<
      typeof import('ansi-to-html')
    >[0] = {
      bg,
      fg,
      newline: true,
    };

    return new Convert(convertOptions);
  };
});

const dark = atom(darkInit);
export const darkAtom = atom(
  (g) => g(dark),
  (g, s, a: boolean) => {
    s(dark, a);
  }
);

export const logHTMLAtom = atom(
  (g) => {
    const getConvert = g(convertAtom);
    return g(log)
      .map((line) => `<br/>${getConvert().toHtml(line)}`)
      .join(``);
  },

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

const textareaConfig = atom<TextareaConfig>({
  value: '',
  placeholder: '',
});

export const textareaValueAtom = atom<string>('');

export const textareaConfigAtom = atom(
  (g) => g(textareaConfig),
  (g, s, a: TextareaConfig) => {
    s(textareaConfig, a);
    s(textareaValueAtom, a?.value || '');
  }
);

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
    const prevId = g(prevChoiceId);

    if (!selected && id && id !== prevId) {
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
    (g(focusedChoiceAtom) === null && Boolean(g(previewHTMLAtom)))
  );
});

const prevChoiceId = atom<string>('');

export const scoredChoices = atom(
  (g) => g(choices),
  (g, s, a: ScoredChoice[]) => {
    if (choicesTimeoutId) clearTimeout(choicesTimeoutId);

    s(submittedAtom, false);
    s(loadingAtom, false);
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
}, 250);

const debounceSearch = debounce((qs: QuickScore, s: Setter, a: string) => {
  if (!a) return false;
  const result = search(qs, a);
  s(scoredChoices, result);
  return true;
}, 250);

const filterByInput = (
  g: Getter,
  s: Setter,
  qs: QuickScoreInterface,
  input: string
) => {
  const un = g(unfilteredChoicesAtom);

  if (qs && input) {
    if (un.length < 1000) {
      const result = search(qs, input);
      s(scoredChoices, result);
    } else {
      debounceSearch(qs, s, input);
    }
  } else if (un.length) {
    s(scoredChoices, un.map(createScoredChoice));
  } else {
    s(scoredChoices, []);
  }
};

const inputChangedAtom = atom(false);
export const inputAtom = atom(
  (g) => g(rawInputAtom),
  (g, s, a: string) => {
    if (a === g(rawInputAtom)) return;
    if (a) s(inputChangedAtom, true);

    s(mouseEnabledAtom, 0);
    s(submittedAtom, false);
    s(indexAtom, 0);
    s(rawInputAtom, a);

    const qs = g(quickScoreAtom) as QuickScoreInterface;
    const mode = g(modeAtom);
    const pid = g(pidAtom);
    if (mode === Mode.FILTER) {
      filterByInput(g, s, qs, a);
    }
    if (mode === Mode.GENERATE) {
      s(loading, true);
      s(loadingAtom, true);
      generateChoices(a, pid);
    }
  }
);

export const flagsAtom = atom<FlagsOptions>({});

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

export const selectedAtom = atom('');

export const scriptHistoryAtom = atom<Script[]>([]);

const script = atom<Script>(noScript);
export const scriptAtom = atom(
  (g) => g(script),
  (g, s, a: Script) => {
    s(inputChangedAtom, false);
    const history = g(scriptHistoryAtom);
    s(scriptHistoryAtom, [...history, a]);
    // console.clear();
    if (a?.tabs) {
      s(tabsAtom, a?.tabs || []);
    }

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
    s(processingAtom, false);
    s(descriptionAtom, a?.description || '');
    s(nameAtom, a?.name || '');
    s(loadingAtom, false);
    s(loading, false);

    s(flagsAtom, {});
    s(flaggedValueAtom, '');
    // s(panelHTMLAtom, `<div/>`);
  }
);

export const isKitScriptAtom = atom<boolean>((g) => {
  return (g(script) as Script)?.filePath?.includes(kitPath());
});

export const isMainScriptAtom = atom<boolean>((g) => {
  return (g(script) as Script).filePath === mainScriptPath;
});

const topHeight = atom(88);
const mainHeight = atom(0);

const resizeData = atom({});

const resize = (g: Getter, s: Setter) => {
  const currentScript = g(script);
  if (!currentScript.resize && !g(isMainScriptAtom)) return;
  const isPreviewOpen = Boolean(
    g(unfilteredPreview) &&
      g(previewEnabled) &&
      (g(uiAtom) === UI.arg || g(uiAtom) === UI.splash)
  );

  // console.log(`🚨`, {
  //   isPreviewOpen,
  //   unfilteredPreview: g(unfilteredPreawesomeview),
  //   previewEnabled: g(previewEnabled),
  //   uiAtom: g(uiAtom),
  // });

  const data: ResizeData = {
    topHeight: g(topHeight),
    ui: g(uiAtom),
    mainHeight: g(uiAtom) === UI.hotkey ? 0 : g(mainHeight),
    filePath: currentScript.filePath,
    mode: g(modeAtom),
    hasChoices: Boolean(g(choices)?.length),
    hasPanel: Boolean(g(panelHTMLAtom)?.length),
    hasInput: Boolean(g(inputAtom)?.length),
    isPreviewOpen,
    previewEnabled: g(previewEnabled),
    open: g(rawOpen),
    tabIndex: g(tabIndex),
    isSplash: g(isSplashAtom),
  };

  const prevData = g(resizeData);
  s(resizeData, data);

  if (JSON.stringify(prevData) === JSON.stringify(data)) {
    return;
  }

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
      const topClient = g(topRefAtom)?.clientHeight;
      if (topClient) s(topHeight, topClient);
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
      console.log(a);
      s(rawOpen, true);
      s(rawInputAtom, '');
      s(submittedAtom, false);
      s(uiAtom, a.ui);
      s(hintAtom, a.hint);
      s(modeAtom, a.mode);
      s(placeholderAtom, a.placeholder);
      s(selectedAtom, a.selected);
      s(tabsAtom, a.tabs);

      s(inputAtom, a.input);

      s(processingAtom, false);

      if (Object.keys(a?.flags || []).length) {
        s(flagsAtom, a.flags);
      }

      if (a.name) {
        s(nameAtom, a.name);
      }

      if (a.description) {
        s(descriptionAtom, a.description || g(scriptAtom)?.description || '');
      }

      if (a.preview) {
        s(previewHTMLAtom, a.preview);
      }

      if (a.panel) {
        s(panelHTMLAtom, a.panel);
      }
      // s(tabIndex, a.tabIndex);
      s(promptData, a);

      // ipcRenderer.send(Channel.SET_PROMPT_DATA, {
      //   value: a,
      //   pid: g(pidAtom),
      // });
    }
  }
);

export const flagValueAtom = atom(
  (g) => g(flaggedValueAtom),
  (g, s, a: any) => {
    if (a === '') {
      s(selectedAtom, '');
      s(unfilteredChoicesAtom, g(prevChoicesAtom));
      s(rawInputAtom, g(prevInputAtom));
      s(indexAtom, g(prevIndexAtom));
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
    // let submitted = g(submittedAtom);
    // if (submitted) return;

    const fValue = g(flaggedValueAtom);
    const f = g(flagAtom);
    const flag = fValue ? a : f || '';

    const value = checkIfSubmitIsDrop(fValue || a);
    const fC = g(focusedChoiceAtom);

    ipcRenderer.send(Channel.VALUE_SUBMITTED, {
      value,
      flag,
      pid: g(pidAtom),
      id: fC?.id || -1,
    });

    // s(rawInputAtom, '');
    s(loading, false);
    s(loadingAtom, false);

    if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
    placeholderTimeoutId = setTimeout(() => {
      s(loadingAtom, true);
      s(processingAtom, true);
    }, 500);
    if (choicesTimeoutId) clearTimeout(choicesTimeoutId);
    choicesTimeoutId = setTimeout(() => {
      s(panelHTMLAtom, ``);
    }, 250);

    s(submittedAtom, true);
    // s(indexAtom, 0);

    s(flaggedValueAtom, ''); // clear after getting
    s(flagAtom, '');
    s(previewHTML, ``);
    s(submitValue, value);
  }
);

export const openAtom = atom(
  (g) => g(rawOpen),
  (g, s, a: boolean) => {
    s(mouseEnabledAtom, 0);
    if (g(rawOpen) && a === false) {
      // const cachedPreview = g(cachedMainPreview);
      s(previewHTMLAtom, ``);

      // s(choices, []);
      // s(tabIndex, 0);
      s(rawInputAtom, '');
      // s(panelHTMLAtom, '');
      s(formHTMLAtom, '');
      // s(hintAtom, '');
      s(logHTMLAtom, '');
      // s(uiAtom, UI.arg);
      s(flagsAtom, {});
      s(flaggedValueAtom, '');
      s(loading, false);
      s(loadingAtom, false);
      s(resizeData, {});

      ipcRenderer.send(Channel.ESCAPE_PRESSED, { pid: g(pidAtom) });

      s(pidAtom, 0);
    }
    s(rawOpen, a);
  }
);

export const escapeAtom = atom(null, (g, s, a) => {
  const history = g(scriptHistoryAtom).slice();
  s(scriptHistoryAtom, []);

  if (
    history.find((prevScript) => prevScript.filePath === mainScriptPath) &&
    !g(inputChangedAtom) &&
    !g(isMainScriptAtom)
  ) {
    ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
  } else {
    s(openAtom, false);
  }
});

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

export const topRefAtom = atom<null | HTMLDivElement>(null);
export const descriptionAtom = atom<string>('');
export const nameAtom = atom<string>('');
export const loadingAtom = atom(
  (g) => g(loading),
  debounce((g, s, a: boolean) => {
    s(loading, a);
  }, 500)
);

export const exitAtom = atom(
  (g) => true || g(openAtom),
  (g, s, a: number) => {
    if (g(pidAtom) === a) {
      s(openAtom, false);
    }
  }
);

export const isSplashAtom = atom((g) => {
  return g(scriptAtom)?.filePath === SPLASH_PATH;
});

export const splashBodyAtom = atom('');
export const splashHeaderAtom = atom('');
export const splashProgressAtom = atom(0);

export const appConfigAtom = atom<AppConfig>({
  isWin: false,
  os: '',
  sep: '',
  assetPath: '',
  version: '',
  delimiter: '',
});

export const getAssetAtom = atom((g) => {
  const { sep, assetPath } = g(appConfigAtom);
  return (asset: string) => assetPath + sep + asset;
});

const isReady = atom(false);
export const isReadyAtom = atom(
  (g) => g(isReady) || g(uiAtom) !== UI.splash,
  (g, s, a: boolean) => {
    s(isReady, a);
  }
);
export const cmdAtom = atom((g) => (g(appConfigAtom).isWin ? 'ctrl' : 'cmd'));
export const resizeEnabledAtom = atom(
  (g) => g(scriptAtom)?.resize && !g(isMainScriptAtom)
);

export const runMainScriptAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
});

export const valueInvalidAtom = atom(null, (g, s, a: string) => {
  console.log({ a });
  if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
  s(processingAtom, false);
  s(inputAtom, '');
  if (typeof a === 'string') s(hintAtom, a);
});
