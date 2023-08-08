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
import { AppDb, UserDb } from '@johnlindquist/kit/cjs/db';
import { Channel, Mode, UI, PROMPT } from '@johnlindquist/kit/cjs/enum';
import Convert from 'ansi-to-html';
import {
  Choice,
  Script,
  PromptData,
  FlagsOptions,
  Shortcut,
  AppState,
  ProcessInfo,
} from '@johnlindquist/kit/types/core';

import { mainScriptPath, kitPath } from '@johnlindquist/kit/cjs/utils';
import {
  EditorConfig,
  TextareaConfig,
  EditorOptions,
  AppConfig,
  AppMessage,
} from '@johnlindquist/kit/types/kitapp';
import { editor } from 'monaco-editor';

import { debounce, drop as _drop, isEqual, throttle } from 'lodash';
import { ipcRenderer, Rectangle } from 'electron';
import { MessageType } from 'react-chat-elements';
import { AppChannel } from './enums';
import { ResizeData, ScoredChoice, Survey, TermConfig } from './types';
import { noChoice, noScript, SPLASH_PATH } from './defaults';
import { toHex } from './color-utils';
import { formatShortcut } from './components/formatters';
import { Action } from './components/actions';

let placeholderTimeoutId: NodeJS.Timeout;

export const pidAtom = atom(0);
const _shortcuts = atom<Shortcut[]>([]);
export const shortcutsAtom = atom(
  (g) => {
    return g(_shortcuts);
  },
  (g, s, a: Shortcut[]) => {
    s(_shortcuts, a);
  }
);

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

const createScoredChoice = (item: Choice): ScoredChoice => {
  return {
    item,
    score: 0,
    matches: {},
    _: '',
  };
};

function containsSpecialCharacters(str: string) {
  const regex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g;
  return regex.test(str);
}

export const filteredChoicesIdAtom = atom<number>(0);

let choicesPreloaded = false;
let wereChoicesPreloaded = false;
const choicesConfig = atom({ preload: false });
export const choicesConfigAtom = atom(
  (g) => g(choicesConfig),
  (g, s, a: { preload: boolean }) => {
    wereChoicesPreloaded = !a?.preload && choicesPreloaded;
    choicesPreloaded = a?.preload;
    s(directionAtom, 1);

    const promptData = g(promptDataAtom);
    if (!g(focusedChoiceAtom)?.hasPreview && !promptData?.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    const key = g(promptDataAtom)?.key as string;
    if (key) {
      // sort by the ids stored in the localstorage key
      const ids = JSON.parse(localStorage.getItem(key) || '[]') || [];

      // TODO: Reimplement recent
      // actualChoices = actualChoices.sort((choiceA, choiceB) => {
      //   const aIndex = ids.indexOf(choiceA.id);
      //   const bIndex = ids.indexOf(choiceB.id);
      //   if (aIndex === -1) return 1;
      //   if (bIndex === -1) return -1;
      //   return aIndex - bIndex;
      // });
    }

    s(loadingAtom, false);

    // const maybePreview = Boolean(
    //   cs.find((c) => c?.hasPreview) ||
    //     g(promptData)?.hasPreview ||
    //     g(isMainScriptAtom) ||
    //     g(isSplashAtom)
    // );

    // if (a?.[0]?.name.match(/(?<=\[)\.(?=\])/i)) {

    const nextIndex = g(scoredChoicesAtom).findIndex(
      (sc) => sc.item.id === g(defaultChoiceIdAtom)
    );

    s(indexAtom, nextIndex > 0 ? nextIndex : 0);
  }
);

export const prevChoicesConfig = atom({ preload: false });

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
    if (g(_panelHTML) === a) return;
    // if (a) s(scoredChoicesAtom, null);
    s(_panelHTML, a);
    if (!g(promptDataAtom)?.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    if (
      a === '' &&
      document.getElementById('panel') &&
      !document.getElementById('list')
    )
      s(mainHeightAtom, 0);
    if (a) s(loadingAtom, false);
  }
);

const _previewHTML = atom('');
export const closedDiv = `<div></div>`;

const throttleSetPreview = throttle(
  (g, s, a: string) => {
    s(_previewHTML, a);
  },
  25,
  {
    leading: true,
    trailing: true,
  }
);
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
    // g(logAtom)(`Setting previewHTML to ${a.slice(0, 24)}`);
    const prevPreview = g(_previewHTML);
    if (prevPreview === a) return;
    if (g(_previewHTML) !== a) {
      if (a === closedDiv) {
        s(_previewHTML, '');
      } else {
        throttleSetPreview(g, s, a);
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

export const editorOptions =
  atom<editor.IStandaloneEditorConstructionOptions>(defaultEditorOptions);

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

const _indexAtom = atom(0);

const choices = atom<ScoredChoice[]>([]);

export const prevIndexAtom = atom(0);
export const prevInputAtom = atom('');

export const defaultValueAtom = atom('');
export const defaultChoiceIdAtom = atom('');

export const flagsRequiresScrollAtom = atom(-1);
export const requiresScrollAtom = atom(-1);

export const directionAtom = atom<1 | -1>(1);

export const scrollToIndexAtom = atom((g) => {
  return (i: number) => {
    const list = g(listAtom);
    (list as any)?.scrollToItem(i);
  };
});

let prevChoiceIndexId = 'prevChoiceIndexId';

const flagsIndex = atom(0);

export const hasSkipAtom = atom(false);
export const allSkipAtom = atom(false);
export const flagsIndexAtom = atom(
  (g) => g(flagsIndex),
  (g, s, a: number) => {
    const flagValue = g(flagValueAtom);

    if (!flagValue) {
      s(focusedFlagValueAtom, '');
      return;
    }
    const prevIndex = g(flagsIndex);
    const cs = g(scoredFlagsAtom);
    // if a is > cs.length, set to 0, if a is < 0, set to cs.length - 1
    const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a; // Corrected clamping logic
    const list = g(flagsListAtom);
    const requiresScroll = g(flagsRequiresScrollAtom);

    // Check if going up/down by comparing the prevIndex to the clampedIndex
    let choice = cs?.[clampedIndex]?.item;
    let calcIndex = clampedIndex;
    const direction = g(directionAtom);

    if (choice?.skip) {
      // Find next choice that doesn't have "skip" set or 0 or length - 1
      while (choice?.skip) {
        calcIndex += direction;

        if (calcIndex <= 0) {
          calcIndex = cs.length - 1;
          while (cs[calcIndex]?.item?.skip) {
            calcIndex += direction;
            if (calcIndex === a) break;
          }
        } else if (calcIndex >= cs.length) {
          calcIndex = 0;

          while (cs[calcIndex]?.item?.skip) {
            calcIndex += direction;
            if (calcIndex === a) break;
          }
        }
        choice = cs?.[calcIndex]?.item;
        if (calcIndex === a) break;
      }
    }

    if (prevIndex !== calcIndex) {
      // g(logAtom)(`Setting to ${calcIndex}`);
      s(flagsIndex, calcIndex);
    }

    if (list && requiresScroll === -1) {
      (list as any)?.scrollToItem(calcIndex);
    }

    if (list && cs[0]?.item?.skip && calcIndex === 1) {
      (list as any)?.scrollToItem(0);
    }

    const focusedFlag = (choice as Choice)?.value;
    s(focusedFlagValueAtom, focusedFlag);
  }
);

export const indexAtom = atom(
  (g) => g(_indexAtom),
  (g, s, a: number) => {
    if (g(flagValueAtom)) return;
    const prevIndex = g(_indexAtom);
    const cs = g(choices);
    // if a is > cs.length, set to 0, if a is < 0, set to cs.length - 1
    const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a; // Corrected clamping logic
    const list = g(listAtom);
    const requiresScroll = g(requiresScrollAtom);

    // Check if going up/down by comparing the prevIndex to the clampedIndex
    let choice = cs?.[clampedIndex]?.item;
    if (choice?.id === prevChoiceIndexId) return;
    let calcIndex = clampedIndex;
    const direction = g(directionAtom);
    if (g(allSkipAtom)) {
      s(focusedChoiceAtom, noChoice);
    }
    if (choice?.skip) {
      // Find next choice that doesn't have "skip" set or 0 or length - 1
      while (choice?.skip) {
        calcIndex += direction;

        if (calcIndex <= 0) {
          calcIndex = cs.length - 1;
          while (cs[calcIndex]?.item?.skip) {
            calcIndex += direction;
            if (calcIndex === a) break;
          }
        } else if (calcIndex >= cs.length) {
          calcIndex = 0;

          while (cs[calcIndex]?.item?.skip) {
            calcIndex += direction;
            if (calcIndex === a) break;
          }
        }
        choice = cs?.[calcIndex]?.item;
        if (calcIndex === a) break;
      }
    }

    prevChoiceIndexId = choice?.id || 'prevChoiceIndexId';

    if (prevIndex !== calcIndex) {
      s(_indexAtom, calcIndex);
    }

    if (list && requiresScroll === -1) {
      (list as any)?.scrollToItem(calcIndex);
    }

    if (list && cs[0]?.item?.skip && calcIndex === 1) {
      (list as any)?.scrollToItem(0);
    }

    // const clampedIndex = clamp(a, 0, cs.length - 1);

    const id = choice?.id;
    // const prevId = g(prevChoiceId);

    // Not sure why I was preventing setting the focusedChoice when the id didn't match the prevId...
    // if (!selected && id && id !== prevId) {
    // g(logAtom)(`Focusing index: ${choice?.id}`);

    if (id) {
      s(focusedChoiceAtom, choice);
      if (typeof choice?.preview === 'string') {
        s(previewHTMLAtom, choice?.preview);
      }
      // console.log(
      //   `!selected && id && id !== prevId: Setting prevChoiceId to ${id}`
      // );
      // s(prevChoiceId, id);
    }
  }
);

const _flagged = atom<Choice | string>('');
const _focused = atom<Choice | null>(noChoice as Choice);

export const hasFocusedChoiceAtom = atom(
  (g) => g(_focused) && g(_focused)?.name !== noChoice.name
);

const throttleChoiceFocused = throttle(
  (g, s, choice: Choice) => {
    if (choice?.skip) return;
    if (choice?.id === prevFocusedChoiceId) return;
    prevFocusedChoiceId = choice?.id || 'prevFocusedChoiceId';
    if (g(submittedAtom)) return;
    // if (g(_focused)?.id === choice?.id) return;

    // g(logAtom)(`Focusing ${choice?.name} with ${choice?.id}`);
    s(_focused, choice || noChoice);

    // g(logAtom)(`Focusing ${choice?.id}`);
    if (choice?.id || choice?.name) {
      if (typeof choice?.preview === 'string') {
        s(previewHTMLAtom, choice?.preview);
      } else if (!choice?.hasPreview) {
        s(previewHTMLAtom, closedDiv);
      }

      if (choice?.name !== noChoice.name) {
        const channel = g(channelAtom);
        channel(Channel.CHOICE_FOCUSED);
      }

      // g(logAtom)(`CHOICE_FOCUSED ${choice?.name}`);
      // resize(g, s);
    }
  },
  25,
  { leading: true, trailing: true }
);

export const focusedChoiceAtom = atom(
  (g) => g(_focused),
  throttleChoiceFocused
);

export const hasPreviewAtom = atom<boolean>((g) => {
  if (g(allSkipAtom)) return false;

  return Boolean(g(_previewHTML) || g(promptData)?.preview || '');
});

let prevFocusedChoiceId = 'prevFocusedChoiceId';
export const scoredChoicesAtom = atom(
  (g) => g(choices),
  // Setting to `null` should only happen when using setPanel
  // This helps skip sending `onNoChoices`
  (g, s, a: ScoredChoice[]) => {
    s(loadingAtom, false);
    prevFocusedChoiceId = 'prevFocusedChoiceId';
    const cs = a;

    s(submittedAtom, false);

    // if the first cs has a `border-t-1`, remove it
    if (cs?.[0]?.item?.className) {
      cs[0].item.className = cs?.[0]?.item?.className.replace(`border-t-1`, '');
    }

    s(choices, cs || []);

    // a.forEach((newChoice, i) => {
    //   const prevChoice = prevChoices?.[i];

    //   if (!prevChoice || newChoice.item.id !== prevChoice?.item?.id) {
    //     g(logAtom)(
    //       `Mismatch: ${newChoice.item.name}: ${newChoice.item.id} vs. ${prevChoice?.item?.name}: ${prevChoice?.item?.id}`
    //     );
    //   }
    // });

    s(hasSkipAtom, cs?.some((c) => c?.item?.skip) || false);
    s(allSkipAtom, cs?.every((c) => c?.item?.skip) || false);
    s(indexAtom, 0);

    const isFilter =
      g(uiAtom) === UI.arg && g(promptData)?.mode === Mode.FILTER;

    const channel = g(channelAtom);

    if (cs?.length) {
      s(panelHTMLAtom, ``);

      const defaultValue: any = g(defaultValueAtom);
      const defaultChoiceId: string = g(defaultChoiceIdAtom);
      const prevIndex = g(prevIndexAtom);
      const input = g(inputAtom);
      if (cs?.length && (defaultValue || defaultChoiceId)) {
        const i = cs.findIndex(
          (c) =>
            c.item?.id === defaultChoiceId ||
            c.item?.value === defaultValue ||
            c.item?.name === defaultValue
        );

        if (i !== -1) {
          const foundChoice = cs[i].item;
          if (foundChoice?.id) {
            s(indexAtom, i);
            g(logAtom)(`🤔 Found choice: ${foundChoice?.id}`);
            s(focusedChoiceAtom, foundChoice);
            s(requiresScrollAtom, i);
          }
        }
        s(defaultValueAtom, '');
        s(defaultChoiceIdAtom, '');
      } else if (input.length > 0) {
        s(requiresScrollAtom, g(requiresScrollAtom) > 0 ? 0 : -1);
        s(indexAtom, 0);
      } else if (prevIndex && !g(selectedAtom)) {
        let adjustForGroup = prevIndex;
        if (cs?.[prevIndex - 1]?.item?.skip) {
          adjustForGroup -= 1;
        }
        s(requiresScrollAtom, wereChoicesPreloaded ? -1 : adjustForGroup);
      } else {
        s(requiresScrollAtom, wereChoicesPreloaded ? -1 : 0);
      }
    } else {
      s(focusedChoiceAtom, noChoice);
      if (isFilter && Boolean(cs)) {
        if (!g(promptReadyAtom)) return;
        channel(Channel.NO_CHOICES);
      }
    }
    let choicesHeight = 0;

    for (const {
      item: { height },
    } of a) {
      choicesHeight += height || g(itemHeightAtom);
      if (choicesHeight > 1920) break;
    }
    s(choicesHeightAtom, choicesHeight);
    s(mainHeightAtom, choicesHeight);
  }
);

const choicesHeightAtom = atom(0);

export const choicesAtom = atom((g) =>
  g(scoredChoicesAtom).map((result) => result.item)
);

export const _inputAtom = atom('');
export const appendInputAtom = atom(null, (g, s, a: string) => {
  const ui = g(uiAtom);
  if (ui === UI.editor) {
    s(editorAppendAtom, a);
  } else {
    const input = g(_inputAtom);
    s(_inputAtom, input + a);
  }
});

// const invokeSearch = (input: string) => {
//   ipcRenderer.send(AppChannel.INVOKE_SEARCH, { input });
// };

// const invokeFlagSearch = (input: string) => {
//   ipcRenderer.send(AppChannel.INVOKE_FLAG_SEARCH, { input });
// };

// const filterByInput = (g: Getter, s: Setter, input: string) => {
//   if (g(uiAtom) !== UI.arg) return;
//   if (g(flagValueAtom)) {
//     invokeFlagSearch(input);
//   } else {
//     invokeSearch(input);
//   }
// };

const _inputChangedAtom = atom(false);

export const changeAtom = atom((g) => (data: any) => {
  const channel = g(channelAtom);
  channel(Channel.CHANGE, { value: data });
});

export const modeAtom = atom((g) => g(promptData)?.mode || Mode.FILTER);

export const inputAtom = atom(
  (g) => g(_inputAtom),
  async (g, s, a: string) => {
    // g(logAtom)(`✉️ inputAtom: ${a}`);
    s(directionAtom, 1);
    const selected = g(showSelectedAtom);
    const prevInput = g(_inputAtom);
    if (prevInput && a === '') {
      s(selected ? flagsIndexAtom : indexAtom, 0);
    }

    if (a !== g(_inputAtom)) s(_inputChangedAtom, true);
    if (a === g(_inputAtom)) {
      s(tabChangedAtom, false);
      return;
    }

    s(_inputAtom, a);

    const flaggedValue = g(flagValueAtom);

    if (!g(submittedAtom)) {
      const channel = g(channelAtom);
      channel(Channel.INPUT);
    }

    s(mouseEnabledAtom, 0);

    if (selected) {
      s(selected ? flagsIndexAtom : indexAtom, 0);
    }

    // If the promptData isn't set, default to FILTER
    const mode = g(modeAtom);

    if (g(tabChangedAtom) && a && prevInput !== a) {
      s(tabChangedAtom, false);
      return;
    }

    // TODO: flaggedValue state? Or prevMode when flagged? Hmm...
    // if (mode === Mode.FILTER || flaggedValue) {
    //   filterByInput(g, s, a);
    // }

    if (mode === Mode.GENERATE && !flaggedValue) {
      s(loading, true);
      s(loadingAtom, true);
    }

    if (g(_inputChangedAtom) && a === '') {
      resize(g, s, 'INPUT_CLEARED');
    }
  }
);

const _flagsAtom = atom<FlagsOptions>({});
export const flagsAtom = atom(
  (g) => g(_flagsAtom),
  (g, s, a: FlagsOptions) => {
    // g(logAtom)(
    //   Object.entries(a).map(([k, v]) => {
    //     return {
    //       [k]: v?.hasAction ? 'hasAction' : 'noAction',
    //     };
    //   })
    // );
    s(_flagsAtom, a);
  }
);

export const tabChangedAtom = atom(false);
const _tabIndex = atom(0);

let sendTabChanged: () => void;

const getSendTabChanged = (g: Getter) =>
  debounce(
    () => {
      const channel = g(channelAtom);
      channel(Channel.TAB_CHANGED);
    },
    100,
    {
      leading: true,
      trailing: true,
    }
  );

export const tabIndexAtom = atom(
  (g) => g(_tabIndex),
  (g, s, a: number) => {
    s(_inputChangedAtom, false);
    s(submittedAtom, false);
    s(prevIndexAtom, 0);
    if (g(_tabIndex) !== a) {
      s(_tabIndex, a);
      s(flagsAtom, {});
      s(_flagged, '');

      sendTabChanged = sendTabChanged || getSendTabChanged(g);
      sendTabChanged();

      s(tabChangedAtom, true);
    }
  }
);

const selected = atom('');
export const selectedAtom = atom(
  (g) => g(selected),
  (g, s, a: string) => {
    s(selected, a);
    if (a === '') s(focusedFlagValueAtom, '');
  }
);

export const _history = atom<Script[]>([]);
// export const scriptHistoryAtom = atom(
//   (g) => g(scriptHistory),
//   (g, s, a: Script[]) => {
//     s(scriptHistory, a);
//   }
// );

const _script = atom<Script>(noScript);
const backToMainAtom = atom(false);

export const preloadedAtom = atom(false);

export const scriptAtom = atom(
  (g) => g(_script),
  (g, s, a: Script) => {
    s(isMainScriptAtom, a?.filePath === mainScriptPath);
    s(submittedAtom, false);
    const prevScript = g(_script);
    s(
      backToMainAtom,
      prevScript?.filePath !== mainScriptPath && a?.filePath === mainScriptPath
    );

    s(promptReadyAtom, false);
    if (a.filePath !== mainScriptPath) {
      s(choicesConfigAtom, { preload: false });
      const preloaded = g(preloadedAtom);

      if (!preloaded) {
        s(scoredChoicesAtom, []);
        s(focusedChoiceAtom, noChoice);
        s(_previewHTML, '');
      }
      //
    }

    s(preloadedAtom, false);

    const history = g(_history);
    s(_history, [...history, a]);
    if (a?.tabs) {
      s(tabsAtom, a?.tabs || []);
    }

    s(mouseEnabledAtom, 0);
    s(_script, a);
    s(processingAtom, false);

    s(loadingAtom, false);
    s(logoAtom, a?.logo || '');
    s(tempThemeAtom, g(themeAtom));
    // s(flagsAtom, {});

    // s(panelHTMLAtom, `<div/>`);

    // if (g(isMainScriptAtom) && !wereChoicesPreloaded) s(_inputAtom, ``);
  }
);

export const isKitScriptAtom = atom<boolean>((g) => {
  return (g(_script) as Script)?.filePath?.includes(kitPath());
});

export const isMainScriptAtom = atom(false);

export const isMainScriptInitialAtom = atom<boolean>((g) => {
  return g(isMainScriptAtom) && g(inputAtom) === '';
});

const _topHeight = atom(88);
const mainHeight = atom(0);
const prevMh = atom(0);
let prevTopHeight = 0;

export const domUpdatedAtom = atom(null, (g, s) => {
  return debounce((reason = '') => {
    // g(logAtom)(`domUpdated: ${reason}`);
    resize(g, s, reason);
  }, 25); // TODO: think about panel resizing debouncing
});

const sendResize = (data: ResizeData) =>
  ipcRenderer.send(AppChannel.RESIZE, data);
const debounceSendResize = debounce(sendResize, 100);

const resizeSettle = debounce((g: Getter, s: Setter) => {
  resize(g, s, 'SETTLE');
}, 250);

const resize = debounce(
  (g: Getter, s: Setter, reason = 'UNSET') => {
    if (reason !== 'SETTLE') resizeSettle(g, s);

    const active = g(promptActiveAtom);
    // g(logAtom)(`🌈 ${active ? 'active' : 'inactive'} resize: ${reason}`);

    if (!active) return;
    const promptBounds = g(promptBoundsAtom);

    const ui = g(uiAtom);

    const scoredChoicesLength = g(scoredChoicesAtom)?.length;
    // g(logAtom)(`resize: ${reason} - ${ui} length ${scoredChoicesLength}`);
    const hasPanel = g(_panelHTML) !== '';
    let mh = g(mainHeightAtom);

    // if (mh === 0 && [UI.form, UI.div].includes(ui)) return;

    const promptData = g(promptDataAtom);
    const placeholderOnly =
      promptData?.mode === Mode.FILTER &&
      scoredChoicesLength === 0 &&
      ui === UI.arg;

    const topHeight = document.getElementById('header')?.offsetHeight || 0;
    const footerHeight = document.getElementById('footer')?.offsetHeight || 0;
    const hasPreview = Boolean(g(hasPreviewAtom) || g(flagValueAtom));
    const totalChoices = scoredChoicesLength;

    const choicesHeight = g(choicesHeightAtom);
    // g(logAtom)({
    //   choicesHeight,
    // });

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
        ch = (document as any)?.getElementById(UI.form)?.offsetHeight;
        mh = ch;
      } else if (ui === UI.div) {
        ch = (document as any)?.getElementById('panel')?.offsetHeight;
        if (ch) {
          mh = promptData?.height || ch;
        } else {
          return;
        }
      } else if (ui === UI.arg && hasPanel) {
        // g(logAtom)(`Force resize: has panel`);
        ch = (document as any)?.getElementById('panel')?.offsetHeight;
        mh = ch;
        forceResize = true;
      } else if (
        ui === UI.arg &&
        !hasPanel &&
        !scoredChoicesLength &&
        !document.getElementById('list')
      ) {
        // g(logAtom)(`List and panel gone`);
        ch = 0;
        mh = 0;
        forceResize = true;
      } else if (ui !== UI.arg) {
        ch = (document as any)?.getElementById('main')?.offsetHeight;
      }

      if (ui === UI.arg) {
        forceResize = ch === 0 || Boolean(ch < choicesHeight) || hasPanel;
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
      const previewHeight =
        document.getElementById('preview')?.offsetHeight || 0;
      mh = Math.max(previewHeight, promptData?.height || PROMPT.HEIGHT.BASE);
      forceResize = true;
    }

    if (g(logVisibleAtom)) {
      const logHeight = document.getElementById('log')?.offsetHeight;
      // g(logAtom)(`logHeight: ${logHeight}`);
      mh += logHeight || 0;
    }

    const justOpened = g(justOpenedAtom);
    const samePrompt = promptBounds?.id === promptData?.id;

    const forceWidth = samePrompt ? promptBounds?.width : promptData?.width;
    let forceHeight;

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
    ) {
      forceHeight = samePrompt
        ? promptBounds?.height
        : promptData?.height || PROMPT.HEIGHT.BASE;
      forceResize = true;
    }

    if (ui === UI.div) {
      forceHeight = promptData?.height;
    }

    if (ui === UI.debugger) {
      forceHeight = 128;
    }

    const hasInput = Boolean(g(inputAtom)?.length);

    // g(logAtom)({
    //   forceHeight: forceHeight || 'no forced height',
    //   forceWidth: forceWidth || 'no forced width',
    // });

    // g(logAtom)({
    //   ui,
    //   ch,
    //   mh,
    //   prevMh: g(prevMh),
    //   hasPreview,
    //   footerHeight,
    //   topHeight,
    //   scoredChoicesLength,
    //   forceResize,
    //   promptHeight: promptData?.height || 'UNSET',
    // });

    // forceResize ||= hasChoices;

    // const hasPreview = g(previewCheckAtom);
    // g(logAtom)({
    //   hasPreview: hasPreview ? 'has preview' : 'no preview',
    // });

    const inputChanged = g(_inputChangedAtom);

    mh = Math.ceil(mh || -3) + 3;

    if (inputChanged) {
      if (mh === 0 && promptData?.preventCollapse) {
        g(logAtom)(`🍃 Prevent collapse to zero...`);
        return;
      }

      if (
        typeof (promptData?.resize === 'boolean') &&
        promptData?.resize === false
      ) {
        return;
      }
    }

    const data: ResizeData = {
      id: promptData?.id || 'missing',
      reason,
      scriptPath: g(_script)?.filePath,
      placeholderOnly,
      topHeight,
      ui,
      mainHeight: mh,
      footerHeight,
      mode: promptData?.mode || Mode.FILTER,
      hasPanel,
      hasInput,
      previewEnabled: g(previewEnabled),
      open: g(_open),
      tabIndex: g(_tabIndex),
      isSplash: g(isSplashAtom),
      hasPreview,
      inputChanged,
      justOpened,
      forceResize,
      forceHeight,
      forceWidth,
      totalChoices,
      isMainScript: g(isMainScriptAtom),
    };

    s(prevMh, mh);

    // console.log(`👋`, data);

    // g(logAtom)({
    //   justOpened: justOpened ? 'JUST OPENED' : 'NOT JUST OPENED',
    // });

    debounceSendResize.cancel();

    if (justOpened) {
      debounceSendResize(data);
    } else {
      sendResize(data);
    }
  },
  50,
  {
    leading: true,
    trailing: true,
  }
);

export const topHeightAtom = atom(
  (g) => g(_topHeight),
  (g, s) => {
    // const resizeComplete = g(resizeCompleteAtom);
    // if (!resizeComplete) {
    //   return;
    // }

    resize(g, s, 'TOP_HEIGHT');
  }
);

export const mainHeightAtom = atom(
  (g) => g(mainHeight),
  (g, s, a: number) => {
    const prevHeight = g(mainHeight);

    const nextMainHeight = a < 0 ? 0 : a;

    if (nextMainHeight === 0) {
      if (g(panelHTMLAtom) !== '') return;
      if (g(scoredChoicesAtom).length > 0) return;
    }

    s(mainHeight, nextMainHeight);
    if (a === prevHeight) return;

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
      ].includes(g(uiAtom))
    ) {
      return;
    }
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
        if (notFunction) {
          fileObject[key] = value;
        } else {
          delete file[key];
        }
      }

      return fileObject;
    });

    return files;
  }

  return checkValue;
};

export const footerAtom = atom('');

// Create an itemHeightAtom
export const itemHeightAtom = atom(PROMPT.ITEM.HEIGHT.SM);
export const inputHeightAtom = atom(PROMPT.INPUT.HEIGHT.SM);

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

    // g(logAtom)(`theme: ${JSON.stringify(newTheme)}`);

    s(_themeAtom, newTheme);
  }
);

export const headerHiddenAtom = atom(false);
export const footerHiddenAtom = atom(false);

const promptReadyAtom = atom(false);

let wasPromptDataPreloaded = false;
export const promptDataAtom = atom(
  (g) => g(promptData),
  (g, s, a: null | PromptData) => {
    // g(logAtom)(`👂 Prompt Data ${a?.id}, ${a?.ui}, ${a?.preview}`);
    s(isMainScriptAtom, a?.scriptPath === mainScriptPath);
    if (a?.ui !== UI.arg && !a?.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    s(isHiddenAtom, false);
    const prevPromptData = g(promptData);

    wasPromptDataPreloaded = Boolean(prevPromptData?.preload && !a?.preload);
    // g(logAtom)(
    //   `👀 Preloaded: ${a?.scriptPath} ${
    //     wasPromptDataPreloaded ? 'true' : 'false'
    //   } and keyword: ${a?.keyword}
    //   prevPromptData: ${prevPromptData?.preload ? 'yup' : 'nope'}
    //   currentPromptData: ${a?.preload ? 'yup' : 'nope'}
    //   `
    // );

    // was closed, now open
    if (!prevPromptData && a) {
      s(justOpenedAtom, true);
      setTimeout(() => {
        s(justOpenedAtom, false);
      }, 250);
    } else {
      s(justOpenedAtom, false);
    }

    if (prevPromptData?.ui === UI.editor && g(_inputChangedAtom)) {
      s(editorHistoryPush, g(closedInput));
    }

    s(_inputChangedAtom, false);

    if (a) {
      s(uiAtom, a.ui);
      if (a?.theme) s(tempThemeAtom, { ...g(themeAtom), ...(a?.theme || {}) });

      s(_open, true);
      // if (!wasPromptDataPreloaded) s(_inputAtom, a?.input || '');
      // s(_index, 0);
      // s(_tabIndex, 0);
      s(submittedAtom, false);
      // s(logHTMLAtom, '');
      if (a.ui === UI.term) {
        const b: any = a;
        const config = {
          promptId: a.id,
          command: b?.input || '',
          cwd: b?.cwd || '',
          env: b?.env || {},
          shell: b?.shell,
          args: b?.args || [],
          closeOnExit:
            typeof b?.closeOnExit !== 'undefined' ? b?.closeOnExit : true,
          pid: g(pidAtom),
        } as TermConfig;

        s(termConfigAtom, config);
      }

      // g(logAtom)({
      //   input: a?.input,
      //   keyword: a?.keyword,
      //   inputRegex: a?.inputRegex,
      //   isMainScriptAtom: g(isMainScriptAtom) ? 'true' : 'false',
      // });

      if (!a?.keyword && !g(isMainScriptAtom)) {
        g(logAtom)(`👍 Setting input to ${a?.input || '_'}`);
        s(_inputAtom, a?.input || '');
      }
      s(hintAtom, a.hint);
      s(placeholderAtom, a.placeholder);
      s(selectedAtom, a.selected);
      s(tabsAtom, a.tabs);

      s(filterInputAtom, ``);

      s(processingAtom, false);

      s(focusedFlagValueAtom, '');

      s(flagsAtom, a?.flags || {});

      s(headerHiddenAtom, !!a?.headerClassName?.includes('hidden'));
      s(footerHiddenAtom, !!a?.footerClassName?.includes('hidden'));

      const headerHidden = g(headerHiddenAtom);

      const script = g(scriptAtom);

      const promptDescription =
        a.description || (a?.name ? '' : script?.description || '');
      const promptName = a.name || script?.name || '';

      s(descriptionAtom, promptDescription || promptName);
      s(nameAtom, promptDescription ? promptName : promptDescription);

      if (!a?.keepPreview && a.preview) {
        g(logAtom)(`👍 Keeping preview`);
        s(previewHTMLAtom, a.preview);
      }

      if (a.panel) {
        s(panelHTMLAtom, a.panel);
      }

      if (typeof a?.footer === 'string') {
        s(footerAtom, a?.footer);
      }

      if (a.defaultChoiceId) {
        s(defaultChoiceIdAtom, a.defaultChoiceId);
      }

      if (a?.html) {
        // eslint-disable-next-line prefer-destructuring
        const parser = new DOMParser();
        const htmlDoc = parser.parseFromString(a.html, 'text/html');

        const inputs = htmlDoc.getElementsByTagName('input');
        const buttons = htmlDoc.getElementsByTagName('button');
        const hasSubmit =
          Array.from(inputs).some(
            (input) => input.type.toLowerCase() === 'submit'
          ) ||
          Array.from(buttons).some(
            (button) => button.type.toLowerCase() === 'submit'
          );

        if (!hasSubmit) {
          const hiddenSubmit = htmlDoc.createElement('input');
          hiddenSubmit.type = 'submit';
          hiddenSubmit.style.display = 'none';
          htmlDoc.body.appendChild(hiddenSubmit);
        }

        s(formHTMLAtom, htmlDoc.body.innerHTML);
      }

      if (a?.formData) {
        s(formDataAtom, a.formData);
      }

      s(itemHeightAtom, a?.itemHeight || PROMPT.ITEM.HEIGHT.SM);
      s(inputHeightAtom, a?.inputHeight || PROMPT.INPUT.HEIGHT.SM);

      s(defaultValueAtom, a?.defaultValue || '');
      s(defaultChoiceIdAtom, a?.defaultChoiceId || '');

      s(onInputSubmitAtom, a?.onInputSubmit || {});

      // This prevent a "flash" of shortcuts since the focused choice
      // changes which shortcuts are visible and it's different from
      // the preloaded shortcuts
      // TODO: Consider a "choicesControlShortcuts" prop on promptData or similar
      if (!g(isMainScriptAtom)) {
        s(shortcutsAtom, a?.shortcuts || []);
      }

      s(prevChoicesConfig, []);
      s(audioDotAtom, false);

      if (a?.choicesType === 'async') {
        s(loadingAtom, true);
      }

      if (typeof a?.enter === 'string') {
        s(enterAtom, a.enter);
      }

      s(promptData, a);

      const channel = g(channelAtom);
      channel(Channel.ON_INIT);

      ipcRenderer.send(Channel.SET_PROMPT_DATA);
      s(promptReadyAtom, true);

      s(promptActiveAtom, true);
      s(tabChangedAtom, false);
    }
  }
);

export const flagValueAtom = atom(
  (g) => g(_flagged),
  (g, s, a: any) => {
    s(promptActiveAtom, true);
    const flags = g(_flagsAtom);
    // g(logAtom)({ flagValue: a, flags });
    if (Object.entries(flags).length === 0) return;
    s(_flagged, a);

    if (a === '') {
      s(_inputAtom, g(prevInputAtom));

      s(selectedAtom, '');
      s(choicesConfigAtom, g(prevChoicesConfig));
      s(indexAtom, g(prevIndexAtom));
    } else {
      s(selectedAtom, typeof a === 'string' ? a : (a as Choice).name);

      s(prevIndexAtom, g(indexAtom));
      s(prevInputAtom, g(inputAtom));
      s(inputAtom, '');

      s(directionAtom, 1);
      s(flagsIndexAtom, 0);
    }

    const channel = g(channelAtom);
    channel(Channel.ON_MENU_TOGGLE);

    resize(g, s, 'FLAG_VALUE');
  }
);

const _focusedFlag = atom('');
export const focusedFlagValueAtom = atom(
  (g) => g(_focusedFlag),
  (g, s, a: string) => {
    // g(logAtom)(`👀 focusedFlagValueAtom: ${a}`);
    if (a !== g(_focusedFlag)) {
      s(_focusedFlag, a);

      const flags = g(flagsAtom);
      const flag = flags[a];

      s(focusedActionAtom, flag || {});
    }
  }
);

export const focusedActionAtom = atom({});

const _submitValue = atom('');
export const searchDebounceAtom = atom(true);
export const termFontAtom = atom('monospace');

export const appStateAtom = atom<AppState>((g: Getter) => {
  const state = {
    input: g(_inputAtom),
    inputChanged: g(_inputChangedAtom),
    flag: g(focusedFlagValueAtom),
    index: g(indexAtom),
    flaggedValue: g(_flagged) || '',
    focused: g(_focused),
    tab: g(tabsAtom)?.[g(_tabIndex)] || '',
    history: g(_history) || [],
    modifiers: g(_modifiers),
    count: g(choicesAtom).length || 0,
    name: g(nameAtom),
    description: g(descriptionAtom),
    script: g(_script),
    value: g(_submitValue),
    submitted: g(submittedAtom),
    cursor: g(editorCursorPosAtom),
    ui: g(uiAtom),
    tabIndex: g(tabIndexAtom),
    preview: g(previewHTMLAtom),
    keyword: '',
    mode: g(modeAtom),
    multiple: g(promptDataAtom)?.multiple || false,
    selected: g(selectedChoicesAtom).map((c) => c?.value),
    action: g(focusedActionAtom),
  };

  return state;
});

export const channelAtom = atom((g) => (channel: Channel, override?: any) => {
  const state = g(appStateAtom);
  const pid = g(pidAtom);
  const appMessage: AppMessage = {
    channel,
    pid: pid || 0,
    promptId: g(promptDataAtom)?.id as string,
    state: {
      ...state,
      ...override,
    },
  };

  // g(logAtom)({ channel, appMessage });
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

export const promptActiveAtom = atom(false);
export const submitValueAtom = atom(
  (g) => g(_submitValue),
  (g, s, a: any) => {
    const channel = g(channelAtom);

    const action = g(focusedActionAtom) as any;
    // g(logAtom)({
    //   action,
    // });
    if (action.hasAction) {
      channel(Channel.ACTION);
      return;
    }

    s(onInputSubmitAtom, {});
    // TODO: This was helping with resize flickers before. Not sure if still needed.
    s(promptActiveAtom, false);
    s(disableSubmitAtom, false);
    if (g(submittedAtom)) return;
    const focusedChoice = g(focusedChoiceAtom);

    const fid = focusedChoice?.id;
    if (fid) {
      // console.log(`focusedChoice.id: ${focusedChoice.id}`);
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

    const flag = g(focusedFlagValueAtom);
    const value = checkSubmitFormat(a);

    // g(logAtom)({
    //   submitValue: value,
    //   flag,
    // });

    // const fC = g(focusedChoiceAtom);

    // skip if UI.chat

    // if (g(uiAtom) !== UI.chat) {
    //   channel(Channel.ON_SUBMIT);
    // }

    // There are "while(true)" cases where you want input/panels to persist
    // s(_inputAtom, '');
    // s(panelHTMLAtom, ``);

    channel(Channel.VALUE_SUBMITTED, {
      value,
      flag,
    });

    // invokeSearch('');

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
    s(_flagged, ''); // clear after getting
    s(selectedChoicesAtom, []);

    // if (flag) {
    //   s(_indexAtom, 0);
    //   s(_focused, noChoice);
    //   s(_inputAtom, '');
    // }
    s(focusedFlagValueAtom, '');
    s(prevIndexAtom, 0);

    s(_submitValue, value);
    // s(_chatMessagesAtom, []);

    const stream = g(webcamStreamAtom);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      s(webcamStreamAtom, null);
      if (document.getElementById('webcam'))
        (document.getElementById('webcam') as HTMLVideoElement).srcObject =
          null;
    }
  }
);

export const closedInput = atom('');

const lastScriptClosed = atom('');

export const initialResizeAtom = atom<ResizeData | null>(null);
export const openAtom = atom(
  (g) => g(_open),
  (g, s, a: boolean) => {
    if (g(_open) === a) return;
    s(mouseEnabledAtom, 0);

    if (g(_open) && a === false) {
      s(resizeCompleteAtom, false);
      s(lastScriptClosed, g(_script).filePath);
      s(_open, a);

      // const cachedPreview = g(cachedMainPreview);
      // s(_previewHTML, ``);

      // s(choices, []);
      // s(tabIndex, 0);
      s(closedInput, g(_inputAtom));
      s(scoredChoicesAtom, []);
      s(inputAtom, '');
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
      s(requiresScrollAtom, -1);
      s(pidAtom, 0);
      s(_chatMessagesAtom, []);
      s(runningAtom, false);
      s(miniShortcutsHoveredAtom, false);
      s(logLinesAtom, []);
      s(audioDotAtom, false);
      s(disableSubmitAtom, false);
      g(scrollToIndexAtom)(0);
      s(filterInputAtom, '');
      // s(tabsAtom, []);

      const stream = g(webcamStreamAtom);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        s(webcamStreamAtom, null);
        if (document.getElementById('webcam'))
          (document.getElementById('webcam') as HTMLVideoElement).srcObject =
            null;
      }
    }
    s(_open, a);
  }
);

export const escapeAtom = atom<any>((g) => {
  const channel = g(channelAtom);
  return () => {
    const synth = window.speechSynthesis;
    if (synth.speaking) {
      synth.cancel();
    }

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
const inputFocus = atom<number>(Math.random());
export const inputFocusAtom = atom(
  (g) => g(inputFocus),
  (g, s, a: any) => {
    if (g(inputFocus) === a) return;
    ipcRenderer.send(AppChannel.FOCUS_PROMPT);
    s(inputFocus, a);
  }
);

const previewEnabled = atom<boolean>(true);
export const previewEnabledAtom = atom(
  (g) => g(previewEnabled) && !(g(uiAtom) === UI.splash),
  (g, s, a: boolean) => {
    s(previewEnabled, a);
    resize(g, s, 'PREVIEW_ENABLED');
  }
);

export const topRefAtom = atom<null | HTMLDivElement>(null);
export const descriptionAtom = atom<string>('');
export const logoAtom = atom<string>('');
export const nameAtom = atom<string>('');

const _enterAtom = atom<string>('');
export const enterAtom = atom(
  (g) => g(_enterAtom),
  (_g, s, a: string) => {
    s(_enterAtom, a);
  }
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

export const appConfigAtom = atom<AppConfig & { url: string }>({
  isWin: false,
  isMac: false,
  os: '',
  sep: '',
  assetPath: '',
  version: '',
  delimiter: '',
  url: '',
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

export const preventSubmitAtom = atom(null, (g, s, a: string) => {
  s(promptActiveAtom, true);
  if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
  s(submittedAtom, false);
  s(processingAtom, false);
  s(_inputChangedAtom, false);
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

  // if (script.filePath === a) {
  //   const channel = g(channelAtom);
  //   channel(Channel.ABANDON);
  // }

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
  const isArg = [UI.arg].includes(g(uiAtom));
  const hasTabs = g(tabsAtom)?.length > 0;
  const noFlagValue = !g(flagValueAtom);
  return (
    // g(isMainScriptAtom) ||
    isArg && hasTabs && noFlagValue
  );
});

export const showSelectedAtom = atom((g) => {
  return (
    [UI.arg, UI.hotkey].includes(g(uiAtom)) &&
    g(selectedAtom) &&
    g(tabsAtom)?.length > 0
  );
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
  s(focusedFlagValueAtom, '');
});

export const processesAtom = atom<ProcessInfo[]>([]);

export const setFocusedChoiceAtom = atom(null, (g, s, a: string) => {
  if (!a) return;
  const i = g(choices).findIndex(
    (c) => c?.item?.id === a || c?.item?.name === a
  );

  // console.log({ i });
  if (i > -1) {
    s(indexAtom, i);
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
  const disableSubmit = g(disableSubmitAtom);
  if (disableSubmit) return true;

  const enterButtonName = g(enterButtonNameAtom);
  if (enterButtonName === '') return true;

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
  s(choicesConfigAtom, Array.isArray(prev) ? [...prev, a] : [a]);
});

type Appearance = 'light' | 'dark';
export const appearanceAtom = atom<Appearance>('dark');

const _boundsAtom = atom<Rectangle>({ x: 0, y: 0, width: 0, height: 0 });
export const boundsAtom = atom(
  (g) => g(_boundsAtom),
  (g, s, a: Rectangle) => {
    s(resizeCompleteAtom, true);
    s(_boundsAtom, a);
    setTimeout(() => {
      resize(g, s, 'SETTLED');
    }, 100);
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
      // allow all file types
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
  promptCount: 0,
  noPreview: false,
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
export const editorValueAtom = atom<{
  text: string;
  date: string;
}>({
  text: '',
  date: '',
});
export const editorAppendAtom = atom(
  (g) => g(editorValueAtom),
  (g, s, a: string) => {
    s(editorValueAtom, {
      text: a,
      date: new Date().toISOString(),
    });
  }
);
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
  promptId: '',
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

export const termExitAtom = atom(
  null,
  debounce(
    (g, s, a: string) => {
      const ui = g(uiAtom);
      const submitted = g(submittedAtom);
      const open = g(openAtom);
      const currentTermConfig = g(termConfigAtom);
      const currentPromptData = g(promptDataAtom);

      if (
        ui === UI.term &&
        open &&
        !submitted &&
        currentTermConfig.promptId === currentPromptData.id
      ) {
        s(submitValueAtom, a);
      }
    },
    100,
    {
      leading: true,
    }
  )
);

export const scrollToAtom = atom<'top' | 'bottom' | 'center' | null>(null);

export const listAtom = atom(null);
export const flagsListAtom = atom(null);

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

export const buttonNameFontSizeAtom = atom((g) => {
  let fontSize = `text-base`;
  const itemHeight = g(itemHeightAtom);
  switch (itemHeight) {
    case PROMPT.ITEM.HEIGHT.XXS:
      fontSize = `text-xxs`;
      break;

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

export const buttonDescriptionFontSizeAtom = atom((g) => {
  const itemHeight = g(itemHeightAtom);
  let fontSize = `text-xs`;
  switch (itemHeight) {
    case PROMPT.ITEM.HEIGHT.XXS:
      fontSize = `text-xxs`;
      break;

    case PROMPT.ITEM.HEIGHT.XS:
      fontSize = `text-xxs`;
      break;

    case PROMPT.ITEM.HEIGHT.SM:
      fontSize = `text-xxs`;
      break;

    case PROMPT.ITEM.HEIGHT.BASE:
      fontSize = `text-xs`;
      break;

    case PROMPT.ITEM.HEIGHT.LG:
      fontSize = `text-sm`;
      break;

    case PROMPT.ITEM.HEIGHT.XL:
      fontSize = `text-base`;
      break;

    default:
      fontSize = `text-xs`;
      break;
  }

  return fontSize;
});

export const inputFontSizeAtom = atom((g) => {
  let fontSize = `text-2xl`;
  const inputHeight = g(inputHeightAtom);
  switch (inputHeight) {
    case PROMPT.INPUT.HEIGHT.XXS:
      fontSize = `text-sm`;
      break;

    case PROMPT.INPUT.HEIGHT.XS:
      fontSize = `text-base`;
      break;

    case PROMPT.INPUT.HEIGHT.SM:
      fontSize = `text-xl`;
      break;

    case PROMPT.INPUT.HEIGHT.BASE:
      fontSize = `text-2xl`;
      break;

    case PROMPT.INPUT.HEIGHT.LG:
      fontSize = `text-3xl`;
      break;

    case PROMPT.INPUT.HEIGHT.XL:
      fontSize = `text-4xl`;
      break;

    default:
      fontSize = `text-2xl`;
      break;
  }

  return fontSize;
});

export const signInActionAtom = atom((g) => {
  const shortcuts = g(shortcutsAtom);
  const action = shortcuts.find((s) => s?.flag === 'sign-in-to-script-kit');
  return action;
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
  const justOpened = g(justOpenedAtom);

  return (
    (!justOpened && ms.length > 0 && g(lastKeyDownWasModifierAtom)) ||
    g(miniShortcutsHoveredAtom)
  );
});

export const socialAtom = atom((g) => {
  if (g(scriptAtom)?.twitter) {
    const twitter = g(scriptAtom)?.twitter;
    const username = twitter.startsWith('@') ? twitter.slice(1) : twitter;

    return {
      username: twitter,
      url: `https://twitter.com/${username}`,
    };
  }

  if (g(scriptAtom)?.github) {
    const github = g(scriptAtom)?.github;

    return {
      username: github,
      url: `https://github.com/${github}`,
    };
  }

  if (g(scriptAtom)?.social) {
    return {
      username: g(scriptAtom)?.social || '',
      url: g(scriptAtom)?.social_url || '',
    };
  }

  return undefined;
});

export const justOpenedAtom = atom(false);
export const micConfigAtom = atom({
  timeSlice: 200,
  format: 'webm',
  stream: false,
});

export const disableSubmitAtom = atom(false);

export const appBoundsAtom = atom({
  width: PROMPT.WIDTH.BASE,
  height: PROMPT.HEIGHT.BASE,
});

/*
  --color-text: 255, 255, 255;
  --color-primary: 251, 191, 36;
  --color-secondary: lighten;
  --color-background: 6, 6, 6;
  --opacity: 0.50;
*/

export const lightenUIAtom = atom((g) => {
  const theme: any = g(themeAtom);
  const temporaryTheme: any = g(tempThemeAtom);

  const isLightened =
    theme['--color-secondary'] === 'lighten' ||
    temporaryTheme['--color-secondary'] === 'lighten';

  return isLightened;
});

export const promptBoundsAtom = atom({
  id: '',
  width: PROMPT.WIDTH.BASE,
  height: PROMPT.HEIGHT.BASE,
  x: 0,
  y: 0,
});

export const audioDotAtom = atom(false);

export const isScrollingAtom = atom(false);

const scoredFlags = atom([] as ScoredChoice[]);
export const scoredFlagsAtom = atom(
  (g) => {
    return g(scoredFlags);
  },
  (g, s, a: ScoredChoice[]) => {
    s(scoredFlags, a);
    s(flagsIndexAtom, 0);
  }
);

export const previewCheckAtom = atom((g) => {
  const appDb = g(appDbAtom);
  const previewHTML = g(previewHTMLAtom);
  const enabled = g(previewEnabledAtom);
  const hidden = g(isHiddenAtom);
  return Boolean(!appDb.mini && previewHTML && enabled && !hidden);
});

export const triggerKeywordAtom = atom(
  (g) => {},
  (
    g,
    s,
    {
      keyword,
      choice,
    }: {
      keyword: string;
      choice: Choice;
    }
  ) => {
    const channel = g(channelAtom);

    channel(Channel.KEYWORD_TRIGGERED, {
      keyword,
      focused: choice,
      value: choice?.value,
    });
  }
);

export const hasRightShortcutAtom = atom((g) => {
  return g(shortcutsAtom).find((s) => s?.key === 'right');
});

const typing = atom(false);
let typingId: any = null;
export const typingAtom = atom(
  (g) => g(typing),
  // if true, toggle to false after 20ms. Cancel the previous timeout if it exists
  (g, s, a: boolean) => {
    if (a) {
      if (typingId) clearTimeout(typingId);
      typingId = setTimeout(() => {
        s(typing, false);
      }, 50);
    }
    s(typing, a);
  }
);

export const selectedChoicesAtom = atom<Choice[]>([]);
export const toggleSelectedChoiceAtom = atom(null, (g, s, id: string) => {
  const selectedChoices = g(selectedChoicesAtom);
  const scoredChoice = g(choices).find((c) => c?.item?.id === id);
  const index = selectedChoices.findIndex((c) => c?.id === id);
  if (index > -1) {
    selectedChoices.splice(index, 1);
  } else {
    selectedChoices.push(scoredChoice?.item as Choice);
  }

  s(selectedChoicesAtom, [...selectedChoices]);

  const channel = g(channelAtom);
  channel(Channel.SELECTED);
});
export const toggleAllSelectedChoicesAtom = atom(null, (g, s) => {
  const selectedChoices = g(selectedChoicesAtom);
  const cs = g(choices).map((c) => c?.item as Choice);
  if (selectedChoices.length === cs.length) {
    s(selectedChoicesAtom, []);
  } else {
    s(selectedChoicesAtom, [...cs]);
  }

  const channel = g(channelAtom);
  channel(Channel.SELECTED);
});

export const shouldHighlightDescriptionAtom = atom((g) => {
  return g(promptDataAtom)?.searchKeys?.includes('description');
});
