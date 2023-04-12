/* eslint-disable no-bitwise */
/* eslint-disable no-useless-escape */
/* eslint-disable no-plusplus */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
import { atom, Getter, Setter } from 'jotai';
import DOMPurify from 'dompurify';
import { QuickScore, createConfig, quickScore } from 'quick-score';
import { AppDb, UserDb } from '@johnlindquist/kit/cjs/db';
import { Channel, Mode, UI, PROMPT } from '@johnlindquist/kit/cjs/enum';
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

import { debounce, drop as _drop, isEqual } from 'lodash';
import { ipcRenderer, Rectangle } from 'electron';
import { MessageType } from 'react-chat-elements';
import { AppChannel } from './enums';
import {
  ProcessInfo,
  ResizeData,
  ScoredChoice,
  Survey,
  TermConfig,
} from './types';
import {
  BUTTON_HEIGHT,
  DEFAULT_HEIGHT,
  noChoice,
  noScript,
  SPLASH_PATH,
} from './defaults';
import { toHex } from './color-utils';
import { formatShortcut } from './components/formatters';
import { Action } from './components/actions';

let placeholderTimeoutId: NodeJS.Timeout;

export const pidAtom = atom(0);
export const shortcutsAtom = atom<Shortcut[]>([]);

export const processingAtom = atom(false);
const _open = atom(false);
export const submittedAtom = atom(false);
const tabs = atom<string[]>([]);
export const tabsAtom = atom(
  (g) => {
    if (g(appDbAtom).mini) {
      return g(tabs).filter((t, i) => {
        return t === `Account__` || i < 2;
      });
    }
    return g(tabs);
  },
  (g, s, a: string[]) => {
    const prevTabs = g(tabs);
    if (isEqual(prevTabs, a)) return;
    s(tabs, a || []);
  }
);
// const cachedMainPreview = atom('');
const loading = atom<boolean>(false);
export const runningAtom = atom(false);

const placeholder = atom('');
export const placeholderAtom = atom(
  (g) => g(placeholder),
  (_g, s, a: string) => {
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
      maxIterations: 2 ** 4,
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

export const infoHeightAtom = atom(0);
const infoChoices = atom<Choice[]>([]);
export const infoChoicesAtom = atom(
  (g) => {
    const hasChoices = g(scoredChoices)?.length > 0;

    return g(infoChoices).filter(
      (c) => c?.info === 'always' || (c?.info === 'onNoChoices' && !hasChoices)
    );
  },
  (g, s, a: Choice[]) => {
    s(infoChoices, a);
    s(infoHeightAtom, a.length * g(itemHeightAtom));
  }
);

export const unfilteredChoicesAtom = atom(
  (g) => g(unfilteredChoices),
  (g, s, a: Choice[] | null) => {
    if (!g(promptDataAtom)?.preview && !a?.[0]?.hasPreview) {
      s(previewHTMLAtom, closedDiv);
    }

    s(nullChoicesAtom, a === null && g(uiAtom) === UI.arg);

    if (a === null) {
      s(quickScoreAtom, null);
    }

    if (a === null || a?.length === 0) {
      // console.log(`Resize no choices`);
      s(mainHeightAtom, 0);
    }

    const cs = a === null ? [] : a;

    s(choicesIdAtom, Math.random());

    let actualChoices = cs.filter((c) => !(c?.disableSubmit || c?.info));
    const key = g(promptDataAtom)?.key as string;
    if (key) {
      // sort by the ids stored in the localstorage key
      const ids = JSON.parse(localStorage.getItem(key) || '[]') || [];

      actualChoices = actualChoices.sort((choiceA, choiceB) => {
        const aIndex = ids.indexOf(choiceA.id);
        const bIndex = ids.indexOf(choiceB.id);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    }
    s(unfilteredChoices, actualChoices);
    s(
      infoChoicesAtom,
      cs.filter((c) => c?.info || c?.disableSubmit)
    );

    if (cs?.length === 0) {
      s(scoredChoices, []);
      s(quickScoreAtom, null);
    }

    s(loadingAtom, false);

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
        s(
          scoredChoices,
          cs
            .map(createScoredChoice)
            .filter((c) => !(c?.item?.info || c?.item?.disableSubmit))
        );
      }
      if (mode === Mode.FILTER || mode === Mode.CUSTOM || flaggedValue) {
        const input = g(inputAtom);
        filterByInput(g, s, input);
      }
      // }

      const prevCId = g(prevChoiceId);
      // console.log({ prevCId });

      // const prevIndex = g(isMainScriptAtom)
      //   ? 0
      //   : cs.findIndex((c) => c?.id === prevCId);

      // TODO: Figure out scenarios where
      // scoredChoices shouldn't check for the prevCId...

      const nextIndex = g(scoredChoices).findIndex(
        (sc) => sc.item.id === prevCId
      );

      // g(logAtom)({
      //   nextIndex,
      //   prevCId,
      // });

      s(_index, nextIndex > 0 ? nextIndex : 0);
    }
  }
);

export const appendChoicesAtom = atom(null, (g, s, a: Choice[]) => {
  const cs = g(unfilteredChoicesAtom);
  s(unfilteredChoicesAtom, [...cs, ...a]);
});

export const prevChoicesAtom = atom<Choice[]>([]);

const _ui = atom<UI>(UI.arg);
export const uiAtom = atom(
  (g) => g(_ui),
  (_g, s, a: UI) => {
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
  (g) =>
    DOMPurify.sanitize(g(_panelHTML), {
      // allow iframe
      ADD_TAGS: ['iframe'],
      ALLOW_UNKNOWN_PROTOCOLS: true,
    }),
  (g, s, a: string) => {
    if (g(_panelHTML) === a || g(_flagged)) return;
    if (a) s(scoredChoices, null);
    s(_panelHTML, a);
    if (a) s(loadingAtom, false);
  }
);

const _previewVisible = atom<boolean>(false);

const _previewHTML = atom('');
const closedDiv = `<div></div>`;
export const previewHTMLAtom = atom(
  (g) => {
    const html = DOMPurify.sanitize(
      g(_previewHTML) || g(promptData)?.preview || '',
      {
        // allow iframe
        ADD_TAGS: ['iframe'],
        ALLOW_UNKNOWN_PROTOCOLS: true,
      }
    );

    return html;
  },
  (g, s, a: string) => {
    const visible = Boolean(a !== '' && a !== closedDiv);
    s(_previewVisible, visible);
    // if (visible) s(loadingAtom, false);

    if (!a || !g(openAtom)) return; // never unset preview to avoid flash of white/black
    const tI = g(_tabIndex);
    const iA = g(inputAtom);
    const index = g(_index);

    // if (g(isMainScriptAtom) && tI === 0 && iA === '' && index === 0) {
    //   s(cachedMainPreview, a);
    // }

    if (g(_previewHTML) !== a) {
      if (a === closedDiv) {
        s(_previewHTML, '');
      } else {
        s(_previewHTML, a);
      }
    }
  }
);

const _logLinesAtom = atom<string[]>([]);
export const logLinesAtom = atom(
  (g) => g(_logLinesAtom),
  (g, s, a: string[]) => {
    // if (a.length === 0 || a.length === 1) {
    //   setTimeout(() => {
    //     resize(g, s, 'console.log');
    //   }, 100);
    // }
    return s(_logLinesAtom, a);
  }
);

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

export const darkAtom = atom((g) => {
  return g(appearanceAtom) === 'dark';
});

export const logHTMLAtom = atom(
  (g) => {
    const getConvert = g(convertAtom);
    return g(logLinesAtom)
      .map((line) => `<br/>${getConvert().toHtml(line)}`)
      .join(``);
  },

  (g, s, a: string) => {
    if (a === Channel.CONSOLE_CLEAR || a === '') {
      s(logLinesAtom, []);
    } else {
      const oldLog = g(logLinesAtom);
      s(logLinesAtom, _drop(oldLog, oldLog.length > 256 ? 256 : 0).concat([a]));
    }
  }
);

export const logHeightAtom = atom<number>(0);

export const logVisibleAtom = atom((g) => {
  return g(logHTMLAtom)?.length > 0 && g(scriptAtom)?.log !== 'false';
});

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
  wordWrap: 'on',
  wrappingStrategy: 'advanced',
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

    if (a?.suggestions) {
      s(editorSuggestionsAtom, a.suggestions || []);
    }

    s(editorAppendAtom, '');

    const channel = g(channelAtom);
    channel(Channel.INPUT, { input: a.value });

    s(loadingAtom, false);
  }
);

const textareaConfig = atom<TextareaConfig>({
  value: '',
  placeholder: '',
});

export const textareaValueAtom = atom<string>('');

export const textareaConfigAtom = atom(
  (g) => g(textareaConfig),
  (_g, s, a: TextareaConfig) => {
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

export const defaultValueAtom = atom('');

export const _index = atom(
  (g) => g(index),
  (g, s, a: number) => {
    const cs = g(choices);
    // if a is > cs.length, set to 0, if a is < 0, set to cs.length - 1
    const clampedIndex = a < 0 ? cs.length - 1 : a > cs.length - 1 ? 0 : a;
    const list = g(listAtom);
    if (list) {
      (list as any).scrollToItem(clampedIndex);
    }

    // const clampedIndex = clamp(a, 0, cs.length - 1);

    if (g(index) !== clampedIndex) {
      s(index, clampedIndex);
    }

    const choice = cs?.[clampedIndex]?.item;

    const selected = g(selectedAtom);
    const id = choice?.id;
    s(prevChoiceId, id || '');
    // const prevId = g(prevChoiceId);

    const defaultValue: any = g(defaultValueAtom);

    if (defaultValue) {
      const i = cs.findIndex(
        (c) => c.item?.name === defaultValue || c.item?.value === defaultValue
      );

      if (i !== -1) {
        const foundChoice = cs[i].item;
        if (foundChoice?.id) {
          s(index, i);
          s(focusedChoiceAtom, foundChoice);
          // console.log(`i!== -1: Setting prevChoiceId to ${foundChoice?.id}`);
          // s(prevChoiceId, foundChoice?.id);
        }
      }
      s(defaultValueAtom, '');
      return;
    }

    // Not sure why I was preventing setting the focusedChoice when the id didn't match the prevId...
    // if (!selected && id && id !== prevId) {
    if (!selected && id) {
      s(focusedChoiceAtom, choice);
      // console.log(
      //   `!selected && id && id !== prevId: Setting prevChoiceId to ${id}`
      // );
      // s(prevChoiceId, id);
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
      // (choice as Script).hasPreview = true;
    }

    s(_focused, choice || noChoice);

    if (choice?.id && g(selectedAtom) === '') {
      if (typeof choice?.preview === 'string') {
        s(previewHTMLAtom, choice?.preview);
      } else if (!choice?.hasPreview) {
        s(previewHTMLAtom, closedDiv);
      }

      const channel = g(channelAtom);
      channel(Channel.CHOICE_FOCUSED);
      // resize(g, s);
    }
  }
);

export const hasPreviewAtom = atom<boolean>((g) => {
  // const log = g(logAtom);
  const focusedHasPreview =
    g(_focused)?.hasPreview && g(_focused)?.preview !== closedDiv;

  const promptHasPreview = g(promptData)?.hasPreview;

  const isFocused = g(focusedChoiceAtom) === null;
  const previewVisible = g(_previewVisible);

  // log({ focusedHasPreview, promptHasPreview, isFocused, previewVisible });
  return focusedHasPreview || promptHasPreview || (isFocused && previewVisible);
});

const _prevChoiceId = atom<string>('');
const prevChoiceId = atom(
  (g) => g(_prevChoiceId),
  (_g, s, a: string) => {
    s(_prevChoiceId, a);
    // console.log(`Setting prevChoiceId to ${a}`);
  }
);

export const scoredChoices = atom(
  (g) => g(choices),
  // Setting to `null` should only happen when using setPanel
  // This helps skip sending `onNoChoices`
  (g, s, a: ScoredChoice[] | null) => {
    const cs = a?.filter((c) => !(c?.item?.info || c?.item.disabledSubmit));
    s(submittedAtom, false);
    if (g(isMainScriptAtom)) {
      // Check if the input matches the shortcode of one of the scripts
      const input = g(inputAtom);
      const shortcodeMatch = g(unfilteredChoices).find((c) => {
        return (c as Script).alias === input;
      });

      if (cs && shortcodeMatch) {
        // Find the index of the matched script
        const aliasMatch = cs.find((c) => {
          return (c.item as Script).alias === input;
        });

        // If the alias matches, move to front of the list
        if (aliasMatch) {
          const aliasIndex = cs.indexOf(aliasMatch);
          cs.splice(aliasIndex, 1);
          cs.unshift(aliasMatch);
        }
      }
    }
    s(choices, cs || []);
    const isFilter =
      g(uiAtom) === UI.arg && g(promptData)?.mode === Mode.FILTER;

    const channel = g(channelAtom);

    if (cs?.length) {
      const selected = g(selectedAtom);

      if (!selected && cs && !g(promptData)?.defaultChoiceId) {
        // console.log(
        //   `!selected && a: Setting prevChoiceId to ${a[0].item?.id || ''}`
        // );
        // s(prevChoiceId, (a[0].item?.id as string) || '');
        s(focusedChoiceAtom, cs[0]?.item);
      }

      // channel(Channel.CHOICES);
      s(panelHTMLAtom, ``);
      // resize(g, s, 'SCORED_CHOICES');
    } else {
      s(focusedChoiceAtom, null);
      if (isFilter && Boolean(cs) && !g(nullChoicesAtom)) {
        channel(Channel.NO_CHOICES);
      }
    }

    const itemHeight = g(itemHeightAtom);
    const height = (cs?.length || 0) * itemHeight + g(infoHeightAtom);
    s(mainHeightAtom, height);
  }
);

export const _choices = atom((g) =>
  g(scoredChoices).map((result) => result.item)
);

export const _input = atom('');
export const appendInputAtom = atom(null, (g, s, a: string) => {
  const ui = g(uiAtom);
  if (ui === UI.editor) {
    s(editorAppendAtom, a);
  } else {
    const input = g(_input);
    s(_input, input + a);
  }
});

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
    if (un.length > 1000 && g(appDbAtom).searchDebounce) {
      debounceSearch(qs, s, input);
    } else {
      const result = search(qs, input);
      s(scoredChoices, result);
    }
  } else if (un.length) {
    debounceSearch.cancel();
    s(scoredChoices, un.map(createScoredChoice));
  } else {
    debounceSearch.cancel();
    s(scoredChoices, []);
  }
};

const _inputChangedAtom = atom(false);

export const changeAtom = atom((g) => (data: any) => {
  const channel = g(channelAtom);
  channel(Channel.CHANGE, { value: data });
});

export const inputCommandChars = atom([]);

export const inputAtom = atom(
  (g) => g(_input),
  async (g, s, a: string) => {
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

    // If the promptData isn't set, default to FILTER
    const mode = g(promptData)?.mode || Mode.FILTER;

    // TODO: Investigate eliminating modes and bringing/generating over to kit + setChoices(). Probably would be too slow.

    if (g(_tabChangedAtom) && prevInput !== a) {
      s(_tabChangedAtom, false);
      return;
    }

    const commandChars = g(inputCommandChars) || [];
    for await (const ch of commandChars) {
      if (a.length < prevInput.length && prevInput.endsWith(ch)) return;
      if (a.endsWith(ch)) {
        // eslint-disable-next-line promise/param-names
        await new Promise((r) => setTimeout(r, 50));
      }
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
  (_g, s, a: FlagsOptions) => {
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

    // s(choices, []);
    s(processingAtom, false);
    s(_description, a?.description || '');
    s(nameAtom, a?.name || '');
    s(enterAtom, '');
    s(loadingAtom, false);
    s(logoAtom, a?.logo || '');
    s(tempThemeAtom, g(themeAtom));

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

const _topHeight = atom(88);
const mainHeight = atom(0);
const prevMh = atom(0);
let prevTopHeight = 0;

export const domUpdatedAtom = atom(null, (g, s) => {
  return (reason = '') => {
    g(logAtom)(`domUpdated: ${reason}`);
    resize(g, s, reason);
  };
});

const resize = (g: Getter, s: Setter, reason = 'UNSET') => {
  g(logAtom)(`resize: ${reason}`);
  if (g(submittedAtom)) return;

  const ui = g(uiAtom);

  if (
    [
      UI.term,
      UI.editor,
      UI.drop,
      UI.textarea,
      UI.emoji,
      UI.chat,
      UI.mic,
      UI.webcam,
    ].includes(ui)
  )
    return;

  const scoredChoicesLength = g(scoredChoices)?.length;
  const infoChoicesLength = g(infoChoicesAtom).length;
  const hasPanel = g(_panelHTML) !== '';
  const nullChoices = g(nullChoicesAtom);
  const noInfo = infoChoicesLength === 0;
  let mh = nullChoices && !hasPanel && noInfo ? 0 : g(mainHeight);

  // if (mh === 0 && [UI.form, UI.div].includes(ui)) return;

  const promptData = g(promptDataAtom);
  const placeholderOnly =
    promptData?.mode === Mode.FILTER &&
    g(scoredChoices).length === 0 &&
    noInfo &&
    ui === UI.arg;

  const topHeight = Math.floor(
    document.getElementById('header')?.offsetHeight || 0
  );
  const footerHeight = document.getElementById('footer')?.offsetHeight || 0;
  const hasPreview = Boolean(g(hasPreviewAtom));

  const itemHeight = g(itemHeightAtom);

  const choicesHeight = (scoredChoicesLength + infoChoicesLength) * itemHeight;
  if (ui === UI.arg && choicesHeight > PROMPT.HEIGHT.BASE) {
    mh =
      (promptData?.height && promptData?.height > PROMPT.HEIGHT.BASE
        ? promptData?.height
        : PROMPT.HEIGHT.BASE) -
      topHeight -
      footerHeight;
  } else {
    mh = choicesHeight;
  }

  if (mh === 0 && hasPanel) {
    mh = Math.max(g(itemHeightAtom), g(mainHeightAtom));
  }

  let forceResize = false;
  let ch = 0;

  try {
    if (ui === UI.form || ui === UI.fields) {
      ch = (document as any)?.getElementById('kit-form-id')?.offsetHeight;
      mh = ch;
    } else if (ui === UI.div) {
      ch = (document as any)?.getElementById('panel')?.offsetHeight;
      if (ch) {
        mh = promptData?.height || ch;
      } else {
        return;
      }
    } else {
      ch = (document as any)?.getElementById('main')?.offsetHeight;
    }

    if (ui === UI.arg) {
      forceResize = Boolean(
        ch < (scoredChoicesLength + infoChoicesLength) * itemHeight
      );
    } else if (ui === UI.div) {
      forceResize = true;
    } else {
      forceResize = Boolean(ch > g(prevMh));
    }
  } catch (error) {
    g(logAtom)(`Force resize error`);
  }

  if (topHeight !== prevTopHeight) {
    forceResize = true;
    prevTopHeight = topHeight;
  }

  if (hasPreview && mh < PROMPT.HEIGHT.BASE) {
    const previewHeight = document.getElementById('preview')?.offsetHeight || 0;
    mh = Math.max(previewHeight, promptData?.height || PROMPT.HEIGHT.BASE);
  }

  if (g(logVisibleAtom)) {
    const logHeight = document.getElementById('log')?.offsetHeight;
    // g(logAtom)(`logHeight: ${logHeight}`);
    mh += logHeight || 0;
  }

  g(logAtom)({
    ui,
    ch,
    mh,
    footerHeight,
    topHeight,
    itemHeight,
    scoredChoicesLength,
    infoChoicesLength,
    forceResize,
    promptHeight: promptData?.height || 'UNSET',
  });

  const data: ResizeData = {
    id: promptData?.id || 'missing',
    reason,
    scriptPath: g(_script)?.filePath,
    placeholderOnly,
    topHeight,
    ui,
    mainHeight: Math.floor(mh) + 2,
    footerHeight,
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
    forceResize,
  };

  s(prevMh, mh);

  // console.log(`👋`, data);

  ipcRenderer.send(AppChannel.RESIZE, data);
};

export const topHeightAtom = atom(
  (g) => g(_topHeight),
  (g, s) => {
    if (!g(isMainScriptAtom) && g(uiAtom) === UI.arg) {
      resize(g, s, 'TOP_HEIGHT');
    }
  }
);

export const mainHeightAtom = atom(
  (g) => g(mainHeight),
  (g, s, a: number) => {
    const prevHeight = g(mainHeight);

    const nextMainHeight = (a < 0 ? 0 : a) + g(infoHeightAtom);

    if (nextMainHeight === 0) {
      if (g(panelHTMLAtom) !== '') return;
      if (g(scoredChoices).length > 0) return;
    }

    s(mainHeight, nextMainHeight);
    if (a === prevHeight) return;
    resize(g, s, 'MAIN_HEIGHT');
  }
);

const checkSubmitFormat = (checkValue: any) => {
  // check for array buffer
  if (checkValue instanceof ArrayBuffer) {
    return checkValue;
  }
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

// Create an itemHeightAtom
export const itemHeightAtom = atom(BUTTON_HEIGHT);

const promptData = atom<null | PromptData>(null);

const _themeAtom = atom({});

export const themeAtom = atom(
  (g) => g(_themeAtom),
  (
    g,
    s,
    a: {
      [key: string]: string;
    }
  ) => {
    const prevTheme: any = g(_themeAtom);

    Object.entries(a).forEach(([key, value]) => {
      if (key === 'appearance') {
        s(appearanceAtom, value as Appearance);
      } else {
        document.documentElement.style.setProperty(key, value);
      }
    });

    const newTheme = { ...prevTheme, ...a };

    g(logAtom)(`theme: ${JSON.stringify(newTheme)}`);

    s(_themeAtom, newTheme);
  }
);

export const promptDataAtom = atom(
  (g) => g(promptData),
  (g, s, a: null | PromptData) => {
    const prevPromptData = g(promptData);

    if (prevPromptData?.ui === UI.editor && g(_inputChangedAtom)) {
      s(editorHistoryPush, g(closedInput));
    }

    s(_inputChangedAtom, false);

    if (a) {
      if (a?.theme) s(tempThemeAtom, { ...g(themeAtom), ...(a?.theme || {}) });

      s(_open, true);
      s(_input, '');
      // s(_index, 0);
      // s(_tabIndex, 0);
      s(submittedAtom, false);
      // s(logHTMLAtom, '');
      s(uiAtom, a.ui);
      s(ultraShortCodesAtom, []);
      s(hintAtom, a.hint);
      s(placeholderAtom, a.placeholder);
      s(selectedAtom, a.selected);
      s(tabsAtom, a.tabs);

      s(inputAtom, a.input);
      s(filterInputAtom, ``);

      s(processingAtom, false);
      s(inputCommandChars, a?.inputCommandChars || []);

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

      s(itemHeightAtom, a?.itemHeight || BUTTON_HEIGHT);

      s(defaultValueAtom, a?.defaultValue || '');

      s(onInputSubmitAtom, a?.onInputSubmit || {});
      s(shortcutsAtom, a?.shortcuts || []);
      s(prevChoicesAtom, []);

      if (
        a?.ui === UI.arg &&
        (a?.choicesType === 'null' ||
          a?.choicesType === 'function' ||
          a?.choicesType === 'async')
      ) {
        // s(unfilteredChoicesAtom, []);
        g(logAtom)(`null | function | async - skip clearing choices`);
      }

      if (a?.choicesType === 'async') {
        s(loadingAtom, true);
      }

      if (a?.ui !== UI.arg) {
        s(previewHTMLAtom, closedDiv);
      }

      if (typeof a?.enter === 'string') {
        s(enterAtom, a.enter);
      }

      s(promptData, a);
    }

    const channel = g(channelAtom);
    channel(Channel.ON_INIT);
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

      s(selectedAtom, '');
      s(unfilteredChoicesAtom, g(prevChoicesAtom));
      s(_index, g(prevIndexAtom));
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
export const searchDebounceAtom = atom(true);
export const termFontAtom = atom('monospace');

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
    cursor: g(editorCursorPosAtom),
    ui: g(uiAtom),
  };

  return state;
});

export const channelAtom = atom((g) => (channel: Channel, override?: any) => {
  const state = g(appStateAtom);
  const pid = g(pidAtom);
  const appMessage: AppMessage = {
    channel,
    pid: pid || 0,
    state: {
      ...state,
      ...override,
    },
  };

  // console.log({ appMessage });
  ipcRenderer.send(channel, appMessage);
});

export const onPasteAtom = atom((g) => (event: any) => {
  if (g(uiAtom) === UI.editor) event.preventDefault();
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
    if (g(enterButtonDisabledAtom)) return;
    const focusedChoice = g(scoredChoices)?.[g(_index)]?.item;
    const fid = focusedChoice?.id;
    if (fid) {
      // console.log(`focusedChoice.id: ${focusedChoice.id}`);
      s(prevChoiceId, fid);
      const key = g(promptDataAtom)?.key;
      if (key) {
        // Store the choice in the front of an array based on the prompt key

        const prevIds = localStorage.getItem(key) || '[]';
        const prevStorageIds = JSON.parse(prevIds);
        const prevIdAlready = prevStorageIds.find((id: string) => id === fid);
        if (prevIdAlready) {
          prevStorageIds.splice(prevStorageIds.indexOf(prevIdAlready), 1);
        }
        prevStorageIds.unshift(fid);

        localStorage.setItem(key, JSON.stringify(prevStorageIds));
      }
    }
    // let submitted = g(submittedAtom);
    // if (submitted) return;

    const fValue = g(_flagged);
    const f = g(_flag);
    const flag = fValue ? a : f || '';

    const value = checkSubmitFormat(fValue || a);
    // const fC = g(focusedChoiceAtom);

    // skip if UI.chat
    const channel = g(channelAtom);
    if (g(uiAtom) !== UI.chat) {
      channel(Channel.ON_SUBMIT);
    }

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
    s(_chatMessagesAtom, []);

    const stream = g(webcamStreamAtom);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      s(webcamStreamAtom, null);
      if (document.getElementById('webcam'))
        (document.getElementById(
          'webcam'
        ) as HTMLVideoElement).srcObject = null;
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
      s(editorConfigAtom, {});
      s(promptData, null);
      s(pidAtom, 0);
      s(_chatMessagesAtom, []);
      s(prevChoiceId, '');
      s(runningAtom, false);

      const stream = g(webcamStreamAtom);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        s(webcamStreamAtom, null);
        if (document.getElementById('webcam'))
          (document.getElementById(
            'webcam'
          ) as HTMLVideoElement).srcObject = null;
      }

      const audioRecorder = g(audioRecorderAtom);
      if (audioRecorder) {
        if (audioRecorder.state !== 'inactive') {
          audioRecorder.stop();
        }
        s(audioRecorderAtom, null);
      }
    }
    s(_open, a);
  }
);

export const escapeAtom = atom<any>((g) => {
  if (g(shortcutsAtom)?.find((s) => s.key === 'escape')) return () => {};
  const channel = g(channelAtom);

  return () => {
    const synth = window.speechSynthesis;
    if (synth.speaking) {
      synth.cancel();
    }
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

const tempTheme = atom({});
export const tempThemeAtom = atom(
  (g) => g(tempTheme),
  (_g, s, a: { [key: string]: string }) => {
    Object.entries(a).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });

    s(tempTheme, a);
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

const _enterAtom = atom<string>('');
export const enterAtom = atom(
  (g) => g(_enterAtom),
  debounce((_g, s, a: string) => {
    s(_enterAtom, a);
  }, 100)
);
export const loadingAtom = atom(
  (g) => g(loading) || g(runningAtom),
  (_g, s, a: boolean) => {
    s(loading, a);
  }
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

const _appDbAtom = atom<Partial<AppDb>>({});
export const appDbAtom = atom(
  (g) => g(_appDbAtom),
  (g, s, a: Partial<AppDb>) => {
    // assign properties from a into appDb
    s(_appDbAtom, { ...g(_appDbAtom), ...a });
  }
);

export const createAssetAtom = (...parts: string[]) =>
  atom(() => {
    return new Promise((resolve, reject) => {
      ipcRenderer.once(AppChannel.GET_ASSET, (_event, { assetPath }) => {
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
  (_g, s, a: boolean) => {
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

export const applyUpdateAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.APPLY_UPDATE);
});

export const valueInvalidAtom = atom(null, (g, s, a: string) => {
  if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
  s(processingAtom, false);
  s(inputAtom, '');
  s(_inputChangedAtom, false);
  if (typeof a === 'string') {
    const getConvert = g(convertAtom);
    s(hintAtom, getConvert(true).toHtml(a));
  }

  const channel = g(channelAtom);
  channel(Channel.ON_VALIDATION_FAILED);
});

export const isHiddenAtom = atom(false);

export const filterInputAtom = atom<string>(``);
export const blurAtom = atom(null, (g) => {
  const open = g(openAtom);
  if (open) {
    const channel = g(channelAtom);
    channel(Channel.BLUR);
  }
});

export const startAtom = atom(null, (g, s, a: string) => {
  // console.log(`🎬 Start ${a}`);
  const script = g(scriptAtom);

  if (script.filePath === a) {
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

export const submitSurveyAtom = atom(null, (_g, _s, a: Survey) => {
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
  g(logAtom)(`🎬 Send shortcut ${shortcut}`);

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

export const enterButtonNameAtom = atom<string>((g) => {
  const ui = g(uiAtom);
  if (ui === UI.splash) return '';
  if (ui === UI.term) return '';
  if (ui === UI.editor) return '';
  if (ui === UI.hotkey) return '';

  const focusedChoice = g(focusedChoiceAtom);
  if (focusedChoice?.enter) return focusedChoice.enter;
  return g(enterAtom);
});

export const enterButtonDisabledAtom = atom<boolean>((g) => {
  const ui = g(uiAtom);
  if ([UI.fields, UI.form, UI.div].includes(ui)) return false;

  const focusedChoice = g(focusedChoiceAtom);
  if (
    typeof focusedChoice?.disableSubmit === 'boolean' &&
    focusedChoice.disableSubmit
  ) {
    return true;
  }

  const p = g(panelHTMLAtom);
  if (p?.length > 0) return false;

  const pd = g(promptDataAtom);
  if (!pd?.strict) return false;

  if (focusedChoice?.name === noChoice.name) return true;

  return false;
});

export const logAtom = atom((_g) => {
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

type Appearance = 'light' | 'dark';
export const appearanceAtom = atom<Appearance>('dark');

const _boundsAtom = atom<Rectangle>({ x: 0, y: 0, width: 0, height: 0 });
export const boundsAtom = atom(
  (g) => g(_boundsAtom),
  (_g, s, a: Rectangle) => {
    s(resizeCompleteAtom, false);
    s(_boundsAtom, a);
  }
);

export const resizeCompleteAtom = atom(false);

export const resizingAtom = atom(false);

type AudioOptions = {
  filePath: string;
  playbackRate?: number;
};

export const _audioAtom = atom<AudioOptions | null>(null);

export const audioAtom = atom(
  (g) => g(_audioAtom),
  (g, s, a: AudioOptions | null) => {
    // console.log(`Audio options`, a);

    let audio: null | HTMLAudioElement = document.querySelector(
      '#audio'
    ) as HTMLAudioElement;

    // create audio element
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'audio';
      document.body.appendChild(audio);
    }
    if (a?.filePath) {
      s(_audioAtom, a);
      const { filePath, ...options } = a;
      audio.defaultPlaybackRate = options?.playbackRate || 1;
      audio.playbackRate = options?.playbackRate || 1;
      // allow all from cross origin
      audio.crossOrigin = 'anonymous';
      audio.setAttribute('src', filePath);
      audio.play();

      // listen for when the audio ends
      audio.addEventListener('ended', () => {
        s(_audioAtom, null);
        g(channelAtom)(Channel.PLAY_AUDIO);
      });
    } else {
      audio?.pause();
      if (audio) s(_audioAtom, null);
    }
  }
);

type SpeakOptions = {
  text: string;
  name?: string;
} & SpeechSynthesisUtterance;
export const _speechAtom = atom<SpeakOptions | null>(null);

export const speechAtom = atom(
  (g) => g(_speechAtom),
  (_g, _s, a: SpeakOptions) => {
    if (a) {
      // If SpeechSynthesis is playing, cancel
      const synth = window.speechSynthesis;
      if (synth.speaking) {
        synth.cancel();
      }

      const utterThis = new SpeechSynthesisUtterance(a?.text);
      utterThis.rate = a?.rate || 1.3;
      utterThis.pitch = a?.pitch || 1;
      utterThis.lang = a?.lang || 'en-US';
      const voices = synth.getVoices();
      utterThis.voice =
        voices.find((v) => v.name === a?.name) || synth.getVoices()[0];
      synth.speak(utterThis);
    }
  }
);

export const updateAvailableAtom = atom(false);

export const _kitStateAtom = atom({
  isSponsor: false,
  updateDownloaded: false,
});

export const kitStateAtom = atom(
  (g) => g(_kitStateAtom),
  (g, s, a: any) => {
    if (a?.escapePressed) {
      s(audioAtom, null);
    }
    s(_kitStateAtom, {
      ...g(_kitStateAtom),
      ...a,
    });
  }
);

export const loginAtom = atom((_g) => {
  return () => {
    ipcRenderer.send(AppChannel.LOGIN);
  };
});

export const userAtom = atom<UserDb>({});
export const editorLogModeAtom = atom(false);
export const lastLogLineAtom = atom<string>('');
export const logValueAtom = atom<string>('');

export const editorThemeAtom = atom<{ foreground: string; background: string }>(
  (g) => {
    const theme = g(themeAtom);

    const editorTheme = {
      foreground: toHex(theme['--color-text']),
      background: toHex(theme['--color-background']),
    };

    return editorTheme;
  }
);

export const isSponsorAtom = atom(false);
export const isDefaultTheme = atom(true);
export const editorSuggestionsAtom = atom<string[]>([]);
export const editorCursorPosAtom = atom<number>(0);
export const editorAppendAtom = atom<string>('');
export const colorAtom = atom((g) => {
  return async () => {
    // Create new EyeDropper
    try {
      const eyeDropper = new EyeDropper();
      const color = await eyeDropper.open();
      const channel = Channel.GET_COLOR;

      const pid = g(pidAtom);
      const appMessage = {
        channel,
        pid: pid || 0,
        value: color,
      };

      ipcRenderer.send(channel, appMessage);
      return color;
    } catch (error) {
      console.log(error);
    }
    return '';
  };
});

const _chatMessagesAtom = atom<Partial<MessageType>[]>([]);
export const chatMessagesAtom = atom(
  (g) => g(_chatMessagesAtom),
  (g, s, a: Partial<MessageType>[]) => {
    s(_chatMessagesAtom, a);

    const appMessage = {
      channel: Channel.CHAT_MESSAGES_CHANGE,
      value: a,
      pid: g(pidAtom),
    };
    ipcRenderer.send(Channel.CHAT_MESSAGES_CHANGE, appMessage);
  }
);

export const chatMessageSubmitAtom = atom(null, (g, _s, _a: string) => {
  const channel = g(channelAtom);
  channel(Channel.ON_SUBMIT);
});

export const addChatMessageAtom = atom(null, (g, s, a: MessageType) => {
  const prev = g(chatMessagesAtom);
  const updated = [...prev, a];
  s(chatMessagesAtom, updated);
});

export const chatPushTokenAtom = atom(null, (g, s, a: string) => {
  const prev = g(chatMessagesAtom);
  const messages = [...prev];
  // append the text from a to the text of the last message
  try {
    messages[messages.length - 1].text = (
      messages[messages.length - 1].text + a
    ).trim();

    s(chatMessagesAtom, messages);
  } catch (error) {
    console.log(error);
    s(chatMessagesAtom, []);
  }
});

export const setChatMessageAtom = atom(
  null,
  (g, s, a: { index: number; message: MessageType }) => {
    const prev = g(chatMessagesAtom);
    const messages = [...prev];
    // set message at index, allow for negative index
    const messageIndex = a.index < 0 ? messages.length + a.index : a.index;
    try {
      messages[messageIndex] = a.message;
      s(chatMessagesAtom, messages);
    } catch (error) {
      console.log(error);
    }
  }
);
export const termConfigDefaults: TermConfig = {
  command: '',
  cwd: '',
  env: {},
  shell: '',
};

const termConfig = atom<TermConfig>(termConfigDefaults);
export const termConfigAtom = atom(
  (g) => g(termConfig),
  (g, s, a: Partial<TermConfig> | null) => {
    s(termConfig, {
      ...termConfigDefaults,
      ...(a || {}),
    });
  }
);

export const zoomAtom = atom(0);
export const hasBorderAtom = atom((g) => {
  return g(zoomAtom) === 0;
});

export const termExitAtom = atom(null, (g, s, a: string) => {
  const ui = g(uiAtom);
  const submitted = g(submittedAtom);
  const open = g(openAtom);

  if (ui === UI.term && open && !submitted) {
    s(submitValueAtom, a);
  }
});

export const scrollToAtom = atom<'top' | 'bottom' | 'center' | null>(null);

export const listAtom = atom(null);

export const webcamStreamAtom = atom<MediaStream | null>(null);
export const deviceIdAtom = atom<string | null>(null);

const enterPressed = atom(false);
export const enterPressedAtom = atom(
  (g) => g(enterPressed),
  (g, s) => {
    s(enterPressed, true);
    setTimeout(() => {
      s(enterPressed, false);
    }, 100);
  }
);

export const micIdAtom = atom<string | null>(null);
export const webcamIdAtom = atom<string | null>(null);
export const audioRecorderAtom = atom<MediaRecorder | null>(null);

export const buttonNameFontSizeAtom = atom((g) => {
  let fontSize = `text-base`;
  const itemHeight = g(itemHeightAtom);
  switch (itemHeight) {
    case PROMPT.ITEM.HEIGHT.XS:
      fontSize = `text-xs`;
      break;

    case PROMPT.ITEM.HEIGHT.SM:
      fontSize = `text-sm`;
      break;

    case PROMPT.ITEM.HEIGHT.BASE:
      fontSize = `text-base`;
      break;

    case PROMPT.ITEM.HEIGHT.LG:
      fontSize = `text-lg`;
      break;

    case PROMPT.ITEM.HEIGHT.XL:
      fontSize = `text-xl`;
      break;

    default:
      fontSize = `text-base`;
      break;
  }

  return fontSize;
});

export const inputFontSizeAtom = atom((g) => {
  let fontSize = `text-2xl`;
  const inputHeight = g(promptDataAtom)?.inputHeight;
  switch (inputHeight) {
    case PROMPT.INPUT.HEIGHT.XS:
      fontSize = `text-sm`;
      break;

    case PROMPT.INPUT.HEIGHT.SM:
      fontSize = `text-base`;
      break;

    case PROMPT.INPUT.HEIGHT.BASE:
      fontSize = `text-lg`;
      break;

    case PROMPT.INPUT.HEIGHT.LG:
      fontSize = `text-xl`;
      break;

    case PROMPT.INPUT.HEIGHT.XL:
      fontSize = `text-2xl`;
      break;

    default:
      fontSize = `text-2xl`;
      break;
  }

  return fontSize;
});

export const actionsAtom = atom((g) => {
  const flags = g(flagsAtom);
  const shortcuts = g(shortcutsAtom);
  const disabled = g(flagValueAtom);
  return Object.entries(flags)
    .filter(([_, flag]) => {
      return flag?.bar && flag?.shortcut;
    })
    .map(([key, flag]) => {
      const action = {
        key,
        value: key,
        name: flag?.name,
        shortcut: formatShortcut(flag?.shortcut),
        position: flag.bar,
        arrow: (flag as Action)?.arrow,
        flag: key,
        disabled: Boolean(disabled),
      } as Action;

      return action;
    })
    .concat(
      shortcuts
        .filter((s) => s?.bar)
        .map(({ key, name, bar, flag }) => {
          return {
            key,
            name,
            value: key,
            shortcut: formatShortcut(key),
            position: bar,
            flag,
            disabled: Boolean(disabled),
          } as Action;
        })
    );
});

export const miniShortcutsHoveredAtom = atom(false);
export const lastKeyDownWasModifierAtom = atom(false);

export const miniShortcutsVisibleAtom = atom((g) => {
  const ms = g(_modifiers).filter((m) => !m.toLowerCase().includes('shift'));

  return (
    (ms.length > 0 && g(lastKeyDownWasModifierAtom)) ||
    g(miniShortcutsHoveredAtom)
  );
});
