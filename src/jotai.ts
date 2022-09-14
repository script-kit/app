/* eslint-disable no-bitwise */
/* eslint-disable no-useless-escape */
/* eslint-disable no-plusplus */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
import { atom, Getter, Setter } from 'jotai';
import { QuickScore, createConfig, quickScore } from 'quick-score';

import { Channel, Mode, UI } from '@johnlindquist/kit/cjs/enum';
import Convert from 'ansi-to-html';
import {
  Choice,
  Script,
  PromptData,
  FlagsOptions,
  Shortcut,
} from '@johnlindquist/kit/types/core';
import { mainScriptPath, kitPath } from '@johnlindquist/kit/cjs/utils';
import {
  EditorConfig,
  TextareaConfig,
  EditorOptions,
  AppConfig,
  AppMessage,
  AppState,
} from '@johnlindquist/kit/types/kitapp';
import { editor } from 'monaco-editor';

import { clamp, debounce, drop as _drop, isEqual } from 'lodash';
import { ipcRenderer, Rectangle } from 'electron';
import { AppChannel } from './enums';
import { ProcessInfo, ResizeData, ScoredChoice, Survey } from './types';
import {
  BUTTON_HEIGHT,
  DEFAULT_HEIGHT,
  noChoice,
  noScript,
  SPLASH_PATH,
  TOP_HEIGHT,
} from './defaults';

let placeholderTimeoutId: NodeJS.Timeout;

export const pidAtom = atom(0);
export const shortcutsAtom = atom<Shortcut[]>([]);

export const processingAtom = atom(false);
const _open = atom(false);
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
  return qs?.search(term);
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
  const regex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g;
  return regex.test(str);
}

// const precede = `(:?(^|\\W))`;
function scorer(string: string, query: string, matches: number[][]) {
  // avoid regex being passed in
  // console.log(`scorer: ${string} ${query}`);
  // if (!containsSpecialCharacters(query)) {
  // try {
  //   const r = new RegExp(query, 'i');
  //   const match = string.match(r);

  //   if (match) {
  //     const index = match?.index || 0;
  //     // const first = index === 0;
  //     const start = index;
  //     const length = match[0]?.length;
  //     const ms = [start, start + length];
  //     matches.push(ms);
  //     return 1 - start / 100;
  //   }
  // } catch (error) {
  //   return [];
  // }

  // if (containsSpecialCharacters(query)) return [];

  return quickScore(
    string,
    query,
    matches as any,
    undefined,
    undefined,
    createConfig({
      maxIterations: 2 ** 6,
    })
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

export const ultraShortCodesAtom = atom<{ code: string; id: string }[]>([]);

export const choicesIdAtom = atom<number>(0);
export const filteredChoicesIdAtom = atom<number>(0);

const _nullChoices = atom(false);
export const nullChoicesAtom = atom(
  (g) => g(_nullChoices) && g(uiAtom) === UI.arg,
  (g, s, a: boolean) => {
    s(_nullChoices, a);
    if (a && g(uiAtom) === UI.arg) resize(g, s, 'NULL_CHOICES');
  }
);

export const unfilteredChoicesAtom = atom(
  (g) => g(unfilteredChoices),
  (g, s, a: Choice[] | null) => {
    if (!g(promptDataAtom)?.preview && !a?.[0]?.hasPreview) {
      s(previewHTMLAtom, closedDiv);
    }

    s(nullChoicesAtom, a === null);

    if (a === null) {
      s(quickScoreAtom, null);
    }

    if (a === null || a?.length === 0) {
      // console.log(`Resize no choices`);
      s(mainHeightAtom, 0);
    }

    const cs = a === null ? [] : a;

    s(choicesIdAtom, Math.random());

    s(unfilteredChoices, cs);

    if (cs?.length === 0) {
      s(scoredChoices, []);
      s(quickScoreAtom, null);
    }

    // const maybePreview = Boolean(
    //   cs.find((c) => c?.hasPreview) ||
    //     g(promptData)?.hasPreview ||
    //     g(isMainScriptAtom) ||
    //     g(isSplashAtom)
    // );

    // if (a?.[0]?.name.match(/(?<=\[)\.(?=\])/i)) {
    if (
      cs.length > 0 &&
      cs?.length < 256 &&
      g(ultraShortCodesAtom).length === 0
    ) {
      const codes = [];
      for (const choice of cs) {
        const code = choice?.name?.match(/(?<=\[).(?=\])/i)?.[0] || '';

        if (code) {
          codes.push({
            code: code?.toLowerCase(),
            id: code ? (choice.id as string) : '',
          });
        }
      }
      s(ultraShortCodesAtom, codes);
    }

    if (cs?.length) {
      const qs = new QuickScore(cs, {
        keys,
        minimumScore: 0.3,
      } as any);
      s(quickScoreAtom, qs as any);

      const mode = g(promptDataAtom)?.mode;
      const flaggedValue = g(_flagged);

      // if (!flaggedValue) {
      if (mode === Mode.GENERATE && !flaggedValue) {
        s(scoredChoices, cs.map(createScoredChoice));
      }
      if (mode === Mode.FILTER || mode === Mode.CUSTOM || flaggedValue) {
        const input = g(inputAtom);
        filterByInput(g, s, input);
      }
      // }

      const prevCId = g(prevChoiceId);
      const prevIndex = g(isMainScriptAtom)
        ? 0
        : cs.findIndex((c) => c?.id === prevCId);

      s(_index, prevIndex || 0);
    }
  }
);

export const prevChoicesAtom = atom<Choice[]>([]);

const _ui = atom<UI>(UI.arg);
export const uiAtom = atom(
  (g) => g(_ui),
  (g, s, a: UI) => {
    s(_ui, a);
    if (a & (UI.arg | UI.textarea | UI.hotkey | UI.splash)) {
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

const _panelHTML = atom<string>('');

export const panelHTMLAtom = atom(
  (g) => g(_panelHTML),
  (g, s, a: string) => {
    if (g(_panelHTML) === a || g(_flagged)) return;
    if (a) s(scoredChoices, null);
    s(_panelHTML, a);
    s(loadingAtom, false);

    // debouncedResize(g, s, 'PANEL_HTML');
  }
);

const _previewVisible = atom<boolean>(false);

const _previewHTML = atom('');
const closedDiv = `<div/>`;
export const previewHTMLAtom = atom(
  (g) => g(_previewHTML) || g(promptData)?.preview,
  (g, s, a: string) => {
    // console.log({ preview: '', a });
    const visible = Boolean(a !== '' && a !== closedDiv);
    s(_previewVisible, visible);
    if (visible) s(loadingAtom, false);

    if (!a || !g(openAtom)) return; // never unset preview to avoid flash of white/black
    const tI = g(_tabIndex);
    const iA = g(inputAtom);
    const index = g(_index);

    if (g(isMainScriptAtom) && tI === 0 && iA === '' && index === 0) {
      s(cachedMainPreview, a);
    }

    if (g(_previewHTML) !== a) {
      if (a === closedDiv) {
        s(_previewHTML, '');
      } else {
        s(_previewHTML, a);
      }
    }
  }
);

const log = atom<string[]>([]);

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

export const darkAtom = atom<boolean>(false);

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
      s(log, _drop(oldLog, oldLog.length > 256 ? 256 : 0).concat([a]));
    }
  }
);

export const logHeightAtom = atom(0);

const editorConfig = atom<EditorConfig | null>({
  value: '',
  language: 'markdown',
  extraLibs: [],
} as EditorOptions);

const defaultEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  fontFamily: 'JetBrains Mono',
  fontSize: 18,
  minimap: {
    enabled: false,
  },
  wordWrap: 'bounded',
  lineNumbers: 'off',
  glyphMargin: false,
  scrollBeyondLastLine: false,
  quickSuggestions: true,
  formatOnType: true,
  selectionHighlight: false,
  roundedSelection: false,
  renderWhitespace: 'none',
  trimAutoWhitespace: true,
};

export const editorOptions = atom<editor.IStandaloneEditorConstructionOptions>(
  defaultEditorOptions
);

export const editorConfigAtom = atom(
  (g) => g(editorConfig),
  (g, s, a: EditorOptions) => {
    s(editorConfig, a);

    // s(inputAtom, a.value);

    const {
      file,
      scrollTo,
      hint: h,
      onInput,
      onEscape,
      onAbandon,
      onBlur,
      ignoreBlur,
      extraLibs,
      ...options
    } = a;

    s(editorOptions, {
      ...defaultEditorOptions,
      ...(options as editor.IStandaloneEditorConstructionOptions),
    });

    if (typeof a?.value === 'undefined') return;

    const channel = g(channelAtom);
    channel(Channel.INPUT, { input: a.value });
  }
);

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
export const _index = atom(
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

const _flagged = atom<Choice | string>('');
const _focused = atom(noChoice as Choice);
export const focusedChoiceAtom = atom(
  (g) => g(_focused),
  (g, s, choice: Choice) => {
    if (g(submittedAtom)) return;
    // if (g(_focused)?.id === choice?.id) return;
    if (isScript(choice as Choice)) {
      (choice as Script).hasPreview = true;
    }

    s(_focused, choice || noChoice);

    if (choice?.id && g(selectedAtom) === '') {
      if (typeof choice?.preview === 'string') {
        s(previewHTMLAtom, choice?.preview);
      }

      const channel = g(channelAtom);
      channel(Channel.CHOICE_FOCUSED);
      // resize(g, s);
    }
  }
);

export const hasPreviewAtom = atom<boolean>((g) => {
  // const log = g(logAtom);
  const focusedHasPreview = g(_focused)?.hasPreview;

  const promptHasPreview = g(promptData)?.hasPreview;

  const isFocused = g(focusedChoiceAtom) === null;
  const previewVisible = g(_previewVisible);

  // log({ focusedHasPreview, promptHasPreview, isFocused, previewVisible });
  return focusedHasPreview || promptHasPreview || (isFocused && previewVisible);
});

const prevChoiceId = atom<string>('');

export const scoredChoices = atom(
  (g) => g(choices),
  // Setting to `null` should only happen when using setPanel
  // This helps skip sending `onNoChoices`
  (g, s, a: ScoredChoice[] | null) => {
    s(submittedAtom, false);
    s(loadingAtom, false);
    s(choices, a || []);
    const isFilter =
      g(uiAtom) === UI.arg && g(promptData)?.mode === Mode.FILTER;

    const channel = g(channelAtom);

    if (a?.length) {
      const selected = g(selectedAtom);

      if (!selected && a) {
        s(focusedChoiceAtom, a[0]?.item);
      }

      // channel(Channel.CHOICES);
      s(panelHTMLAtom, ``);
      // resize(g, s, 'SCORED_CHOICES');
    } else {
      s(focusedChoiceAtom, null);
      if (isFilter && Boolean(a) && !g(nullChoicesAtom)) {
        channel(Channel.NO_CHOICES);
      }
    }

    if (a && g(uiAtom) === UI.arg) {
      // console.log(`Resize Button height`);
      s(mainHeightAtom, a.length * BUTTON_HEIGHT);
    }
  }
);

export const _choices = atom((g) =>
  g(scoredChoices).map((result) => result.item)
);

export const _input = atom('');

const debounceSearch = debounce((qs: QuickScore, s: Setter, a: string) => {
  if (!a) return false;
  const result = search(qs, a);
  s(scoredChoices, result);
  return true;
}, 250); // TODO: too slow for emojis

const prevFilteredInputAtom = atom('');

const filterByInput = (g: Getter, s: Setter, a: string) => {
  let input = a;
  const qs = g(quickScoreAtom);
  const filterInput = g(filterInputAtom);
  const un = g(unfilteredChoicesAtom);
  const prevFilteredInput = g(prevFilteredInputAtom);

  s(prevFilteredInputAtom, a);
  if (filterInput) {
    // if (input.length > prevFilteredInput.length) return;
    input = input.match(new RegExp(filterInput, 'gi'))?.[0] || '';
    if (a.length > prevFilteredInput.length && !input) return;

    // if (input === a) input = '*';
    // if (a.endsWith('/')) return;

    // const filteredChoicesId = g(filteredChoicesIdAtom);
    // const choicesId = g(choicesIdAtom);
    // if (filteredChoicesId != choicesId) {
    //   s(filteredChoicesIdAtom, choicesId);
    // } else if (!input) {
    //   return;
    // }
  }

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

const _inputChangedAtom = atom(false);

export const inputAtom = atom(
  (g) => g(_input),
  (g, s, a: string) => {
    const prevInput = g(_input);

    if (a !== g(_input)) s(_inputChangedAtom, true);
    if (a === g(_input)) {
      s(_tabChangedAtom, false);
      return;
    }

    s(_input, a);

    const flaggedValue = g(flagValueAtom);

    if (!flaggedValue && !g(submittedAtom)) {
      const channel = g(channelAtom);
      channel(Channel.INPUT);
    }

    s(mouseEnabledAtom, 0);

    s(_index, 0);

    const mode = g(promptData)?.mode;

    // TODO: Investigate eliminating modes and bringing/generating over to kit + setChoices(). Probably would be too slow.

    if (g(_tabChangedAtom) && prevInput !== a) {
      s(_tabChangedAtom, false);
      return;
    }

    // TODO: flaggedValue state? Or prevMode when flagged? Hmm...
    if (mode === Mode.FILTER || flaggedValue) {
      filterByInput(g, s, a);
    }
    if (mode === Mode.GENERATE && !flaggedValue) {
      s(loading, true);
      s(loadingAtom, true);
      // generateChoices(a, pid);
    }
  }
);

const _flagsAtom = atom<FlagsOptions>({});
export const flagsAtom = atom(
  (g) => g(_flagsAtom),
  (g, s, a: FlagsOptions) => {
    s(_flagsAtom, a);
  }
);

export const _tabChangedAtom = atom(false);
const _tabIndex = atom(0);
export const tabIndexAtom = atom(
  (g) => g(_tabIndex),
  (g, s, a: number) => {
    s(submittedAtom, false);
    if (g(_tabIndex) !== a) {
      s(_tabIndex, a);
      s(flagsAtom, {});
      s(_flagged, '');

      const channel = g(channelAtom);
      channel(Channel.TAB_CHANGED);
      s(_tabChangedAtom, true);
    }
  }
);

export const selectedAtom = atom('');

export const _history = atom<Script[]>([]);
// export const scriptHistoryAtom = atom(
//   (g) => g(scriptHistory),
//   (g, s, a: Script[]) => {
//     s(scriptHistory, a);
//   }
// );

const _script = atom<Script>(noScript);
export const scriptAtom = atom(
  (g) => g(_script),
  (g, s, a: Script) => {
    const history = g(_history);
    s(_history, [...history, a]);
    // console.clear();
    if (a?.tabs) {
      s(tabsAtom, a?.tabs || []);
    }

    s(mouseEnabledAtom, 0);
    s(_script, a);

    // s(unfilteredChoicesAtom, []);
    s(ultraShortCodesAtom, []);
    // s(choices, []);
    s(logHTMLAtom, '');
    s(_index, 0);
    s(_tabIndex, 0);
    s(submittedAtom, false);
    s(processingAtom, false);
    s(_description, a?.description || '');
    s(nameAtom, a?.name || '');
    s(loadingAtom, false);
    s(loading, false);
    s(logoAtom, a?.logo || '');
    s(prevChoicesAtom, []);

    s(flagsAtom, {});
    s(_flagged, '');

    const theme = {
      '--color-primary-light': a?.['color-primary-light'] || '251, 191, 36',
      '--color-secondary-light': a?.['color-secondary-light'] || '232, 113, 39',
      '--color-background-light':
        a?.['color-background-light'] || '255, 255, 255',

      '--color-primary-dark': a?.['color-primary-dark'] || '79, 70, 229',
      '--color-secondary-dark': a?.['color-secondary-dark'] || '0, 0, 0',
      '--color-background-dark': a?.['color-background-dark'] || '0, 0, 0',
    };

    s(themeAtom, theme);

    // s(panelHTMLAtom, `<div/>`);

    if (g(isMainScriptAtom)) s(_input, ``);
  }
);

export const isKitScriptAtom = atom<boolean>((g) => {
  return (g(_script) as Script)?.filePath?.includes(kitPath());
});

export const isMainScriptAtom = atom<boolean>((g) => {
  return (g(_script) as Script).filePath === mainScriptPath;
});

export const isMainScriptInitialAtom = atom<boolean>((g) => {
  return g(isMainScriptAtom) && g(inputAtom) === '';
});

const topHeight = atom(88);
const mainHeight = atom(0);

const resizeData = atom({});

const resize = (g: Getter, s: Setter, reason = 'UNSET') => {
  // const log = g(logAtom);
  // log(`resize: ${reason}`);
  if (g(submittedAtom)) return;

  const ui = g(uiAtom);

  // console.log({ ui });
  if ([UI.term, UI.editor, UI.drop, UI.textarea, UI.emoji].includes(ui)) return;

  const hasPanel = g(_panelHTML) !== '';
  const nullChoices = g(nullChoicesAtom);

  let mh = nullChoices && !hasPanel ? 0 : g(mainHeight);

  // UI's where user can set the HTML
  if (mh === 0 && [UI.form, UI.div].includes(ui)) return;

  // if (!r) return;

  const promptData = g(promptDataAtom);

  const placeholderOnly =
    promptData?.mode === Mode.FILTER &&
    g(unfilteredChoices).length === 0 &&
    ui === UI.arg;

  let th = g(topRefAtom)?.clientHeight || 88;

  const hasPreview = Boolean(g(hasPreviewAtom));

  // console.log({
  //   mainHeight: g(mainHeight),
  //   panel: g(_panelHTML),
  //   mh,
  //   th,
  //   hasPreview,
  //   currentPromptHasPreviews,
  //   placeholderOnly,
  //   hasPanel,
  //   nullChoices,
  // });

  if (hasPreview && mh < DEFAULT_HEIGHT) {
    mh = DEFAULT_HEIGHT;
  }

  if (ui === UI.arg && th < TOP_HEIGHT) {
    th = TOP_HEIGHT;
  }

  if (
    ui === UI.arg &&
    g(scoredChoices)?.length * BUTTON_HEIGHT > DEFAULT_HEIGHT
  ) {
    mh = DEFAULT_HEIGHT;
  }

  const data: ResizeData = {
    id: promptData?.id || 'missing',
    reason,
    scriptPath: g(_script)?.filePath,
    placeholderOnly,
    topHeight: th,
    ui,
    mainHeight: mh,
    footerHeight: 40,
    mode: promptData?.mode || Mode.FILTER,
    hasPanel,
    hasInput: Boolean(g(inputAtom)?.length),
    previewEnabled: g(previewEnabled),
    open: g(_open),
    tabIndex: g(_tabIndex),
    isSplash: g(isSplashAtom),
    hasPreview,
    inputChanged: g(_inputChangedAtom),
    nullChoices,
  };

  // console.log(data);

  s(resizeData, data);

  ipcRenderer.send(AppChannel.RESIZE, data);
};

export const topHeightAtom = atom(
  (g) => g(topHeight),
  (g, s) => {
    if (!g(isMainScriptAtom) && g(uiAtom) === UI.arg) {
      // resize(g, s, 'TOP_HEIGHT');
    }
  }
);

let flickerGuard: any = null;
export const mainHeightAtom = atom(
  (g) => g(mainHeight),
  (g, s, a: number) => {
    if (flickerGuard) {
      clearTimeout(flickerGuard);
    }

    const prevHeight = g(mainHeight);
    if (a === prevHeight) return;

    // if (Math.abs(a - prevHeight) > 2) {

    const nextMainHeight = a < 0 ? 0 : a;

    if (nextMainHeight === 0) {
      flickerGuard = setTimeout(() => {
        // console.log(`flicker guard: ${a} ${nextMainHeight}`);
        if (nextMainHeight === 0 && g(_panelHTML) !== '') return;

        s(mainHeight, nextMainHeight);

        resize(g, s, 'MAIN_HEIGHT');
      }, 50);
    } else {
      // console.log(`resize: MAIN_HEIGHT`);
      s(mainHeight, nextMainHeight);

      resize(g, s, 'MAIN_HEIGHT');
    }
  }
  // }
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

export const footerAtom = atom('');

const promptData = atom<null | PromptData>(null);
export const promptDataAtom = atom(
  (g) => g(promptData),
  (g, s, a: null | PromptData) => {
    const prevPromptData = g(promptData);

    if (prevPromptData?.ui === UI.editor && g(_inputChangedAtom)) {
      s(editorHistoryPush, g(closedInput));
    }

    s(_inputChangedAtom, false);

    if (a) {
      s(_open, true);
      s(_input, '');
      s(submittedAtom, false);
      s(uiAtom, a.ui);
      s(hintAtom, a.hint);
      s(placeholderAtom, a.placeholder);
      s(selectedAtom, a.selected);
      s(tabsAtom, a.tabs);

      s(inputAtom, a.input);
      s(filterInputAtom, ``);

      s(processingAtom, false);

      if (Object.keys(a?.flags || []).length) {
        s(flagsAtom, a?.flags);
      }

      if (a.name) {
        s(nameAtom, a.name);
      }

      if (a.description) {
        s(_description, a.description || g(scriptAtom)?.description || '');
      }

      if (a.preview) {
        s(previewHTMLAtom, a.preview);
        s(_previewVisible, Boolean(a?.preview));
      }

      if (a.panel) {
        s(panelHTMLAtom, a.panel);
      }

      if (typeof a?.footer === 'string') {
        s(footerAtom, a?.footer);
      }

      if (a.defaultChoiceId) {
        s(prevChoiceId, a.defaultChoiceId);
      }

      if (a?.html) {
        s(formHTMLAtom, a.html);
      }

      if (a?.formData) {
        s(formDataAtom, a.formData);
      }

      if (a?.flags) {
        s(flagsAtom, a.flags);
      }

      s(onInputSubmitAtom, a?.onInputSubmit || {});
      s(shortcutsAtom, a?.shortcuts || []);

      if (
        a?.choicesType === 'null' ||
        a?.choicesType === 'function' ||
        a?.choicesType === 'async'
      ) {
        s(unfilteredChoicesAtom, []);
      }

      if (a?.choicesType === 'async') {
        s(loadingAtom, true);
      }

      if (a?.ui !== UI.arg) {
        s(previewHTMLAtom, closedDiv);
      }

      s(promptData, a);
    }
  }
);

export const flagValueAtom = atom(
  (g) => g(_flagged),
  (g, s, a: any) => {
    const flags = g(_flagsAtom);
    if (Object.entries(flags).length === 0) return;
    s(_flagged, a);

    if (a === '') {
      s(_input, g(prevInputAtom));
      s(_index, g(prevIndexAtom));
      s(selectedAtom, '');
      s(unfilteredChoicesAtom, g(prevChoicesAtom));
    } else {
      s(selectedAtom, typeof a === 'string' ? a : (a as Choice).name);
      s(prevIndexAtom, g(_index));
      s(prevInputAtom, g(inputAtom));
      s(inputAtom, '');

      const flagChoices: Choice[] = Object.entries(g(flagsAtom)).map(
        ([key, value]) => {
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
  }
);

export const _flag = atom('');
const _submitValue = atom('');

export const appStateAtom = atom<AppState>((g: Getter) => {
  const state = {
    input: g(_input),
    inputChanged: g(_inputChangedAtom),
    flag: g(_flag),
    index: g(_index),
    flaggedValue: g(_flagged),
    focused: g(_focused),
    tab: g(tabsAtom)?.[g(_tabIndex)] || '',
    history: g(_history) || [],
    modifiers: g(_modifiers),
    count: g(_choices).length || 0,
    name: g(nameAtom),
    description: g(_description),
    script: g(_script),
    value: g(_submitValue),
    submitted: g(submittedAtom),
  };

  return state;
});

export const channelAtom = atom((g) => (channel: Channel, override?: any) => {
  const state = g(appStateAtom);
  const pid = g(pidAtom);

  if (!pid) return;
  const appMessage: AppMessage = {
    channel,
    pid,
    state: {
      ...state,
      ...override,
    },
  };

  ipcRenderer.send(channel, appMessage);
});

export const onPasteAtom = atom((g) => (event: any) => {
  event.preventDefault();
  const channel = g(channelAtom);
  channel(Channel.ON_PASTE);
});

export const onDropAtom = atom((g) => (event: any) => {
  if (g(uiAtom) === UI.drop) return;
  event.preventDefault();

  let drop = '';
  const files = Array.from(event?.dataTransfer?.files);

  if (files.length > 0) {
    drop = files
      .map((file: any) => file.path)
      .join('\n')
      .trim();
  } else {
    drop =
      event?.dataTransfer?.getData('URL') ||
      event?.dataTransfer?.getData('Text') ||
      '';
  }

  const channel = g(channelAtom);
  channel(Channel.ON_DROP, { drop });
});

// export const onCopyAtom = atom((g) => {
//   const channel = g(channelAtom);
//   channel(Channel.ON_COPY);
// });

export const submitValueAtom = atom(
  (g) => g(_submitValue),
  (g, s, a: any) => {
    if (g(submittedAtom)) return;
    // let submitted = g(submittedAtom);
    // if (submitted) return;

    const fValue = g(_flagged);
    const f = g(_flag);
    const flag = fValue ? a : f || '';

    const value = checkIfSubmitIsDrop(fValue || a);
    // const fC = g(focusedChoiceAtom);

    const channel = g(channelAtom);

    channel(Channel.VALUE_SUBMITTED, {
      value,
      flag,
    });

    // ipcRenderer.send(Channel.VALUE_SUBMITTED, {
    //   input: g(inputAtom),
    //   value,
    //   flag,
    //   pid: g(pidAtom),
    //   id: fC?.id || -1,
    // });

    // s(rawInputAtom, '');
    s(loading, false);
    s(loadingAtom, false);

    if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
    placeholderTimeoutId = setTimeout(() => {
      s(loadingAtom, true);
      s(processingAtom, true);
    }, 500);

    s(submittedAtom, true);
    // s(indexAtom, 0);

    s(closedInput, g(inputAtom));
    if (fValue) s(inputAtom, '');
    s(_flagged, ''); // clear after getting
    s(_flag, '');
    s(_previewHTML, ``);
    s(panelHTMLAtom, ``);

    s(_submitValue, value);
    s(flagsAtom, {});

    if (g(webSocketAtom)) {
      g(webSocketAtom)?.close();
      s(webSocketOpenAtom, false);
      s(webSocketAtom, null);
    }
  }
);

export const closedInput = atom('');
export const openAtom = atom(
  (g) => g(_open),
  (g, s, a: boolean) => {
    s(mouseEnabledAtom, 0);

    if (g(_open) && a === false) {
      s(_open, a);

      // const cachedPreview = g(cachedMainPreview);
      s(_previewHTML, ``);

      // s(choices, []);
      // s(tabIndex, 0);
      s(closedInput, g(_input));
      s(_input, '');
      s(_panelHTML, '');

      s(formHTMLAtom, '');
      // s(hintAtom, '');
      s(logHTMLAtom, '');
      // s(uiAtom, UI.arg);
      s(flagsAtom, {});
      s(_flagged, '');
      s(loading, false);
      s(loadingAtom, false);
      s(resizeData, {});
      s(editorConfigAtom, {});
      s(promptData, null);

      ipcRenderer.send(AppChannel.END_PROCESS, {
        pid: g(pidAtom),
        script: g(scriptAtom),
      });

      s(pidAtom, 0);
    }
    s(_open, a);
  }
);

export const escapeAtom = atom<any>((g) => {
  if (g(shortcutsAtom)?.find((s) => s.key === 'escape')) return () => {};
  const channel = g(channelAtom);

  return () => {
    // const history = g(scriptHistoryAtom).slice();
    // s(scriptHistoryAtom, []);

    // if (
    //   history.find((prevScript) => prevScript.filePath === mainScriptPath) &&
    //   !g(inputChangedAtom) &&
    //   !g(isMainScriptAtom)
    // ) {
    //   ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
    // } else {

    channel(Channel.ESCAPE);
  };
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
export const _modifiers = atom<string[]>([]);
const inputFocus = atom<boolean>(true);
export const inputFocusAtom = atom(
  (g) => g(inputFocus),
  (g, s, a: boolean) => {
    if (g(inputFocus) === a) return;
    ipcRenderer.send(AppChannel.FOCUS_PROMPT);
    s(inputFocus, a);
  }
);

const previewEnabled = atom<boolean>(true);
export const previewEnabledAtom = atom(
  (g) => g(previewEnabled),
  (g, s, a: boolean) => {
    s(previewEnabled, a);
    resize(g, s, 'PREVIEW_ENABLED');
  }
);

export const topRefAtom = atom<null | HTMLDivElement>(null);
export const _description = atom<string>('');
export const logoAtom = atom<string>('');
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
  isMac: false,
  os: '',
  sep: '',
  assetPath: '',
  version: '',
  delimiter: '',
});

export const createAssetAtom = (...parts: string[]) =>
  atom((g) => {
    return new Promise((resolve, reject) => {
      ipcRenderer.once(AppChannel.GET_ASSET, (event, { assetPath }) => {
        resolve(assetPath);
      });

      ipcRenderer.send(AppChannel.GET_ASSET, {
        parts,
      });
    });
  });

const isReady = atom(false);
export const isReadyAtom = atom(
  (g) => {
    return g(isReady);
  },
  (g, s, a: boolean) => {
    s(isReady, a);
  }
);
export const cmdAtom = atom((g) => (g(appConfigAtom).isWin ? 'ctrl' : 'cmd'));

export const runMainScriptAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
});

export const runProcessesAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.RUN_PROCESSES_SCRIPT);
});

export const valueInvalidAtom = atom(null, (g, s, a: string) => {
  if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
  s(processingAtom, false);
  s(inputAtom, '');
  s(_inputChangedAtom, false);
  if (typeof a === 'string') {
    const getConvert = g(convertAtom);
    s(footerAtom, getConvert(true).toHtml(a));
  }
});

export const isHiddenAtom = atom(false);

export const filterInputAtom = atom<string>(``);
export const blurAtom = atom(null, (g) => {
  if (g(openAtom)) {
    const channel = g(channelAtom);
    channel(Channel.BLUR);
  }
});

export const startAtom = atom(null, (g, s, a: string) => {
  // console.log(`🎬 Start ${a}`);
  const history = g(_history);
  const script = g(scriptAtom);

  if (
    g(uiAtom) !== UI.splash &&
    (history.length > 0 || script.filePath === a) &&
    !script?.snippet
  ) {
    const channel = g(channelAtom);
    channel(Channel.ABANDON);
  }

  s(_history, []);
});

export const editorHistory = atom<{ content: string; timestamp: string }[]>([]);
export const editorHistoryPush = atom(null, (g, s, a: string) => {
  const history = g(editorHistory);
  const updatedHistory = [
    {
      content: a,
      timestamp: new Date().toISOString(),
    },
    ...history,
  ];
  if (updatedHistory.length > 30) updatedHistory.shift();
  s(editorHistory, updatedHistory);
});

export const getEditorHistoryAtom = atom((g) => () => {
  const channel = g(channelAtom);
  channel(Channel.GET_EDITOR_HISTORY, { editorHistory: g(editorHistory) });
});

export const submitSurveyAtom = atom(null, (g, s, a: Survey) => {
  ipcRenderer.send(AppChannel.FEEDBACK, a);
});

export const showTabsAtom = atom((g) => {
  return (
    [UI.arg].includes(g(uiAtom)) && g(tabsAtom)?.length > 0 && !g(flagValueAtom)
  );
});

export const showSelectedAtom = atom((g) => {
  return [UI.arg, UI.hotkey].includes(g(uiAtom)) && g(selectedAtom);
});

type OnInputSubmit = {
  [key: string]: any;
};

type OnShortcut = {
  [key: string]: any;
};

export const onInputSubmitAtom = atom<OnInputSubmit>({});
export const onShortcutAtom = atom<OnShortcut>({});

export const sendShortcutAtom = atom(null, (g, s, shortcut: string) => {
  const channel = g(channelAtom);
  // const log = g(logAtom);
  // log(`🎬 Send shortcut ${shortcut}`);
  channel(Channel.SHORTCUT, { shortcut });
  s(_flag, '');
});

export const processesAtom = atom<ProcessInfo[]>([]);

export const setFocusedChoiceAtom = atom(null, (g, s, a: string) => {
  if (!a) return;
  const i = g(choices).findIndex(
    (c) => c?.item?.id === a || c?.item?.name === a
  );

  // console.log({ i });
  if (i > -1) {
    s(_index, i);
  }
});

export const webSocketAtom = atom<WebSocket | null>(null);
export const webSocketOpenAtom = atom(false);

export const _socketURLAtom = atom<string>('');
export const socketURLAtom = atom(
  (g) => g(_socketURLAtom),
  (g, s, a: string) => {
    s(_socketURLAtom, a);

    if (a) {
      const ws = new WebSocket(`${a}/terminals/1`);
      ws.onopen = () => {
        s(webSocketOpenAtom, true);
      };
      s(webSocketAtom, ws);
    }
  }
);

export const heightChangedAtom = atom<number>(0);

export const enterButtonNameAtom = atom<string>((g) => {
  const ui = g(uiAtom);
  if (ui === UI.splash) return '';

  const focusedChoice = g(focusedChoiceAtom);
  if (focusedChoice?.enter) return focusedChoice.enter;
  const pd = g(promptDataAtom);

  return pd?.enter;
});

export const enterButtonDisabledAtom = atom<boolean>((g) => {
  const ui = g(uiAtom);
  if ([UI.fields, UI.form, UI.div].includes(ui)) return false;

  const p = g(panelHTMLAtom);
  if (p?.length > 0) return false;

  const pd = g(promptDataAtom);
  if (!pd?.strict) return false;

  const focusedChoice = g(focusedChoiceAtom);
  if (focusedChoice?.name === noChoice.name) return true;

  return false;
});

export const logAtom = atom((g) => {
  type levelType = 'debug' | 'info' | 'warn' | 'error' | 'silly';
  return (message: any, level: levelType = 'info') => {
    ipcRenderer.send(AppChannel.LOG, {
      message,
      level,
    });
  };
});

export const addChoiceAtom = atom(null, (g, s, a: Choice) => {
  const prev = g(unfilteredChoices);

  s(unfilteredChoicesAtom, Array.isArray(prev) ? [...prev, a] : [a]);
});

type Appearance = 'light' | 'dark' | 'auto';
export const appearanceAtom = atom<Appearance>('auto');

const _boundsAtom = atom<Rectangle>({ x: 0, y: 0, width: 0, height: 0 });
export const boundsAtom = atom(
  (g) => g(_boundsAtom),
  (g, s, a: Rectangle) => {
    s(resizeCompleteAtom, false);
    s(_boundsAtom, a);
  }
);

export const resizeCompleteAtom = atom(false);

export const resizingAtom = atom(false);
