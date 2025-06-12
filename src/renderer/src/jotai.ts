import { AppDb, type UserDb } from '@johnlindquist/kit/core/db';
import { Channel, Mode, PROMPT, UI } from '@johnlindquist/kit/core/enum';
import type {
  Action,
  ActionsConfig,
  AppState,
  Choice,
  FlagsObject,
  FlagsWithKeys,
  ProcessInfo,
  PromptData,
  Script,
  Shortcut,
} from '@johnlindquist/kit/types/core';
import Convert from 'ansi-to-html';
import DOMPurify from 'dompurify';
import { type Atom, type Getter, type Setter, atom } from 'jotai';
import { createLogger } from './log-utils';
import { arraysEqual, colorUtils, dataUtils, domUtils, themeUtils } from './utils/state-utils';

import type {
  AppConfig,
  AppMessage,
  EditorConfig,
  EditorOptions,
  TextareaConfig,
} from '@johnlindquist/kit/types/kitapp';
import type { editor } from 'monaco-editor';

import { drop as _drop, debounce, isEqual, throttle } from 'lodash-es';
const { ipcRenderer } = window.electron;
import type { Rectangle } from 'electron';
import type { MessageType } from 'react-chat-elements';
import { unstable_batchedUpdates } from 'react-dom';
import type { VariableSizeList } from 'react-window';
import { findCssVar, toHex } from '../../shared/color-utils';
import { DEFAULT_HEIGHT, SPLASH_PATH, closedDiv, noChoice, noScript } from '../../shared/defaults';
import { AppChannel } from '../../shared/enums';
import type { ResizeData, ScoredChoice, Survey, TermConfig } from '../../shared/types';
import { formatShortcut } from './components/formatters';

const log = createLogger('jotai.ts');

let placeholderTimeoutId: NodeJS.Timeout;

let currentPid = 0;
export const getPid = () => currentPid;
const _pidAtom = atom(0);
export const pidAtom = atom(
  (g) => g(_pidAtom),
  (_g, s, a: number) => {
    window.pid = a;
    s(_pidAtom, a);
    currentPid = a;
  },
);
const _shortcuts = atom<Shortcut[]>([]);
export const shortcutsAtom = atom(
  (g) => {
    return g(_shortcuts);
  },
  (g, s, a: Shortcut[]) => {
    const prevShortcuts = g(_shortcuts);
    if (isEqual(prevShortcuts, a)) {
      return;
    }
    log.info(`🔥 Setting shortcuts to ${a.length}`, a);
    s(_shortcuts, a);
  },
);

export const processingAtom = atom(false);
const _open = atom(false);
export const submittedAtom = atom(false);
const tabs = atom<string[]>([]);
export const tabsAtom = atom(
  (g) => {
    return g(tabs);
  },
  (g, s, a: string[]) => {
    const prevTabs = g(tabs);
    if (isEqual(prevTabs, a)) {
      return;
    }
    s(tabs, a || []);
  },
);
// const cachedMainPreview = atom('');
const loading = atom<boolean>(false);
export const runningAtom = atom(false);

const placeholder = atom('');

export const hasActionsAtom = atom((g) => {
  const flags = g(flagsAtom);
  const focusedChoice = g(focusedChoiceAtom);
  if (Object.entries(flags).length === 0 && !focusedChoice?.actions) {
    return false;
  }
  return true;
});

export const placeholderAtom = atom(
  (g) => g(placeholder),
  (_g, s, a: string) => {
    s(placeholder, a);
    if (placeholderTimeoutId) {
      clearTimeout(placeholderTimeoutId);
    }
  },
);

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
    const focusedChoice = g(focusedChoiceAtom);
    if (focusedChoice?.name !== noChoice?.name && !focusedChoice?.hasPreview && !promptData?.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    s(loadingAtom, false);
    const preloaded = g(preloadedAtom);
    if (preloaded) {
      const nextIndex = g(scoredChoicesAtom).findIndex((sc) => sc.item.id === g(defaultChoiceIdAtom));
      // This was flashing the preview to the 0 choice, then back to the default choice
      s(indexAtom, nextIndex > 0 ? nextIndex : 0);
    }

    // const maybePreview = Boolean(
    //   cs.find((c) => c?.hasPreview) ||
    //     g(promptData)?.hasPreview ||
    //     g(isMainScriptAtom) ||
    //     g(isSplashAtom)
    // );

    // if (a?.[0]?.name.match(/(?<=\[)\.(?=\])/i)) {
  },
);

export const prevChoicesConfig = atom({ preload: false });

const _ui = atom<UI>(UI.arg);
export const uiAtom = atom(
  (g) => g(_ui),
  (g, s, a: UI) => {
    s(_ui, a);
    if ([UI.arg, UI.textarea, UI.hotkey, UI.splash].includes(a)) {
      s(inputFocusAtom, true);
    }

    if ([UI.splash, UI.term, UI.editor, UI.hotkey].includes(a)) {
      s(enterAtom, '');
    }

    if (a !== UI.arg && g(scoredChoicesAtom)?.length > 0) {
      s(scoredChoicesAtom, []);
    }

    let id: string = a;
    if (a === UI.arg) {
      id = 'input';
    }
    const timeoutId = setTimeout(() => {
      ipcRenderer.send(a);
    }, 250);

    let attempts = 0;
    const maxAttempts = 60; // roughly one second at 60fps

    requestAnimationFrame(function checkElement() {
      attempts++;
      if (document.getElementById(id)) {
        clearTimeout(timeoutId);
        ipcRenderer.send(a);
      } else if (attempts < maxAttempts) {
        requestAnimationFrame(checkElement);
      } else {
        clearTimeout(timeoutId);
      }
    });
    // s(previewHTMLAtom, g(cachedMainPreview));
  },
);

const hint = atom('');
export const hintAtom = atom(
  (g) => g(hint),
  (g, s, a: string) => {
    const aHint = typeof a !== 'string' ? '' : a;
    const getConvert = g(convertAtom);
    s(hint, getConvert(true).toHtml(aHint));
  },
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
    if (g(_panelHTML) === a) {
      return;
    }
    // if (a) s(scoredChoicesAtom, null);
    s(_panelHTML, a);
    if (!g(promptDataAtom)?.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    if (a === '' && document.getElementById('panel') && !document.getElementById('list')) {
      s(mainHeightAtom, 0);
    }
    if (a) {
      s(loadingAtom, false);
    }
  },
);

const _previewHTML = atom('');

const throttleSetPreview = throttle((g, s, a: string) => {
  // log.info(`${window.pid} 👀👀 throttleSetPreview ->> ${a.slice(0, 24)}`);
  s(_previewHTML, a);
  resize(g, s, 'SET_PREVIEW');
}, 25);

export const previewHTMLAtom = atom(
  (g) => {
    const html = DOMPurify.sanitize(g(_previewHTML) || g(promptData)?.preview || '', {
      // allow iframe
      ADD_TAGS: ['iframe'],
      ALLOW_UNKNOWN_PROTOCOLS: true,
    });

    return html;
  },

  (g, s, a: string) => {
    // log.info(`${window.pid} 👀 previewHTMLAtom ->> ${a.slice(0, 24)}`);
    const prevPreview = g(_previewHTML);
    if (prevPreview === a) {
      return;
    }
    if (g(_previewHTML) !== a) {
      if (a === closedDiv) {
        throttleSetPreview.cancel();
        s(_previewHTML, '');
      } else {
        throttleSetPreview(g, s, a);
      }
    }
  },
);

const _logLinesAtom = atom<string[]>([]);
export const logLinesAtom = atom(
  (g) => g(_logLinesAtom),
  (_g, s, a: string[]) => {
    // if (a.length === 0 || a.length === 1) {
    //   setTimeout(() => {
    //     resize(g, s, 'console.log');
    //   }, 100);
    // }
    return s(_logLinesAtom, a);
  },
);

export const convertAtom = atom<(inverse?: boolean) => Convert>((g) => {
  return (inverse = false) => {
    const isDark = g(darkAtom);

    const bgMatch = isDark ? '#fff' : '#000';
    const fgMatch = isDark ? '#000' : '#fff';

    const bg = inverse ? fgMatch : bgMatch;
    const fg = inverse ? bgMatch : fgMatch;

    const convertOptions: ConstructorParameters<typeof import('ansi-to-html')>[0] = {
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

export const logHTMLAtom = atom<string>('');

export const appendToLogHTMLAtom = atom(null, (g, s, a: string) => {
  if (a === Channel.CONSOLE_CLEAR || a === '') {
    s(logLinesAtom, []);
    s(logHTMLAtom, '');
    return;
  }
  const oldLog = g(logLinesAtom);
  s(logLinesAtom, _drop(oldLog, oldLog.length > 256 ? 256 : 0).concat([a]));
});

export const logHeightAtom = atom<number>(0);

const editorConfig = atom<EditorConfig | null>({
  value: '',
  language: 'markdown',
  extraLibs: [],
} as EditorOptions);

const defaultEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  fontFamily: 'JetBrains Mono',
  fontSize: 15,
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
  renderLineHighlight: 'none',
  stickyScroll: false,
};

export const editorOptions = atom<editor.IStandaloneEditorConstructionOptions>(defaultEditorOptions);

export const editorConfigAtom = atom(
  (g) => g(editorConfig),
  (g, s, a: EditorOptions) => {
    s(editorConfig, a);

    // s(inputAtom, a.value);

    const { file, scrollTo, hint: h, onInput, onEscape, onAbandon, onBlur, ignoreBlur, extraLibs, ...options } = a;

    s(editorOptions, {
      ...defaultEditorOptions,
      ...(options as editor.IStandaloneEditorConstructionOptions),
    });

    if (typeof a?.value === 'undefined') {
      return;
    }

    if (a?.suggestions) {
      s(editorSuggestionsAtom, a.suggestions || []);
    }

    s(editorAppendAtom, '');

    const channel = g(channelAtom);
    channel(Channel.INPUT, { input: a.value });

    s(loadingAtom, false);
  },
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
  },
);

export const formHTMLAtom = atom('');
export const formDataAtom = atom({});

const mouseEnabled = atom(0);
export const mouseEnabledAtom = atom(
  (g) => g(mouseEnabled) > 5,
  (g, s, a: number) => {
    s(mouseEnabled, a ? g(mouseEnabled) + a : a);
  },
);

const _indexAtom = atom(0);

const choices = atom<ScoredChoice[]>([]);

export const prevIndexAtom = atom(0);
export const prevInputAtom = atom('');

export const defaultValueAtom = atom('');
export const defaultChoiceIdAtom = atom('');

export const defaultActionsIdAtom = atom('');

export const flagsRequiresScrollAtom = atom(-1);
export const requiresScrollAtom = atom(-1);

export const directionAtom = atom<1 | -1>(1);
const _scrollToItemAtom = atom(0);
export const scrollToItemAtom = atom(
  (g) => g(_scrollToItemAtom),
  (g, s, a: { index: number; reason?: string; align?: 'start' | 'end' | 'center' }) => {
    s(_scrollToItemAtom, a.index);
    const list = g(listAtom);
    if (a.index === 0) {
      list?.scrollToItem(a.index, 'start');
    } else {
      list?.scrollToItem(a.index);
    }
  },
);

export const scrollToIndexAtom = atom((g) => {
  return (i: number) => {
    const list = g(listAtom);
    const gridReady = g(gridReadyAtom);
    if (list && !gridReady) {
      list?.scrollToItem(i);
    }
  };
});

let prevChoiceIndexId = 'prevChoiceIndexId';

const flagsIndex = atom(0);

export const hasSkipAtom = atom(false);
export const allSkipAtom = atom(false);
export const flagsIndexAtom = atom(
  (g) => g(flagsIndex),
  (g, s, a: number) => {
    const flagValue = g(flaggedChoiceValueAtom);

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
            if (calcIndex === a) {
              break;
            }
          }
        } else if (calcIndex >= cs.length) {
          calcIndex = 0;

          while (cs[calcIndex]?.item?.skip) {
            calcIndex += direction;
            if (calcIndex === a) {
              break;
            }
          }
        }
        choice = cs?.[calcIndex]?.item;
        if (calcIndex === a) {
          break;
        }
      }
    }

    if (prevIndex !== calcIndex) {
      // log.info(`Setting to ${calcIndex}`);
      s(flagsIndex, calcIndex);
    }

    if (list && requiresScroll === -1) {
      list?.scrollToItem(calcIndex);
    }

    if (list && cs[0]?.item?.skip && calcIndex === 1) {
      list?.scrollToItem(0);
    }

    const focusedFlag = (choice as Choice)?.value;
    s(focusedFlagValueAtom, focusedFlag);
  },
);

export const indexAtom = atom(
  (g) => g(_indexAtom),
  (g, s, a: number) => {
    if (g(flaggedChoiceValueAtom)) {
      return;
    }
    if (g(submittedAtom)) {
      return;
    }
    const prevIndex = g(_indexAtom);
    const cs = g(choices);
    // if a is > cs.length, set to 0, if a is < 0, set to cs.length - 1
    const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a; // Corrected clamping logic
    const list = g(listAtom);
    const requiresScroll = g(requiresScrollAtom);

    // Check if going up/down by comparing the prevIndex to the clampedIndex
    let choice = cs?.[clampedIndex]?.item;

    // info .id vs. prevChoiceIndexId
    if (choice?.id === prevChoiceIndexId) {
      return;
    }
    let calcIndex = clampedIndex;
    const direction = g(directionAtom);
    if (g(allSkipAtom)) {
      s(focusedChoiceAtom, noChoice);
      // log.info(`⏩ All choices skipped, no focus`);
      if (!g(promptDataAtom)?.preview) {
        s(previewHTMLAtom, closedDiv);
      }
    }
    if (choice?.skip) {
      // Find next choice that doesn't have "skip" set
      let loopCount = 0;
      while (choice?.skip && loopCount < cs.length) {
        calcIndex = (calcIndex + direction + cs.length) % cs.length;
        log.info(`calcIndex: ${calcIndex}, direction: ${direction}, cs.length: ${cs.length}`);
        choice = cs[calcIndex]?.item;
        loopCount++;
      }

      // If we've looped through all choices and they're all skipped
      if (loopCount === cs.length) {
        calcIndex = a; // Reset to original index
        choice = cs[calcIndex]?.item;
      }
    }

    prevChoiceIndexId = choice?.id || 'prevChoiceIndexId';

    if (prevIndex !== calcIndex) {
      s(_indexAtom, calcIndex);
    }

    const gridReady = g(gridReadyAtom);

    if (list && cs[0]?.item?.skip && calcIndex === 1 && !gridReady) {
      s(scrollToItemAtom, {
        index: 0,
        reason: 'indexAtom - cs[0]?.item?.skip && calcIndex === 1',
      });
    } else if (list && requiresScroll === -1 && !gridReady) {
      s(scrollToItemAtom, {
        index: calcIndex,
        reason: 'indexAtom - requiresScroll === -1',
      });
    }

    // const clampedIndex = clamp(a, 0, cs.length - 1);

    const id = choice?.id;
    // const prevId = g(prevChoiceId);

    // Not sure why I was preventing setting the focusedChoice when the id didn't match the prevId...
    // if (!selected && id && id !== prevId) {
    // log.info(`Focusing index: ${choice?.id}`);

    if (id) {
      s(focusedChoiceAtom, choice);
      if (typeof choice?.preview === 'string') {
        s(previewHTMLAtom, choice?.preview);
      }
      // console.info(
      //   `!selected && id && id !== prevId: Setting prevChoiceId to ${id}`
      // );
      // s(prevChoiceId, id);
    }
  },
);

const _flaggedValue = atom<Choice | string>('');
const _focused = atom<Choice | null>(noChoice as Choice);

export const hasFocusedChoiceAtom = atom((g) => g(_focused) && g(_focused)?.name !== noChoice.name);

const throttleChoiceFocused = throttle(
  (g, s, choice: Choice) => {
    s(choiceInputsAtom, []);
    if (choice?.skip) {
      return;
    }
    if (choice?.id === prevFocusedChoiceId) {
      return;
    }
    prevFocusedChoiceId = choice?.id || 'prevFocusedChoiceId';
    if (g(submittedAtom)) {
      return;
    }
    // if (g(_focused)?.id === choice?.id) return;

    // log.info(`Focusing ${choice?.name} with ${choice?.id}`);
    s(_focused, choice || noChoice);

    // log.info(`Focusing id:${choice?.id}, name:${choice?.name}`);
    if (choice?.id || (choice?.name && choice?.name !== noChoice.name)) {
      if (typeof choice?.preview === 'string') {
        s(previewHTMLAtom, choice?.preview);
      } else if (!choice?.hasPreview) {
        s(previewHTMLAtom, closedDiv);
      }

      if (choice?.name !== noChoice.name) {
        const channel = g(channelAtom);
        channel(Channel.CHOICE_FOCUSED);
      }

      // log.info(`CHOICE_FOCUSED ${choice?.name}`);
      // resize(g, s);
    }
  },
  25,
  { leading: true, trailing: true },
);

export const focusedChoiceAtom = atom((g) => g(_focused), throttleChoiceFocused);

export const hasPreviewAtom = atom<boolean>((g) => {
  if (g(allSkipAtom)) {
    return false;
  }

  return Boolean(g(_previewHTML) || g(promptData)?.preview || '');
});

let prevFocusedChoiceId = 'prevFocusedChoiceId';

const prevScoredChoicesIdsAtom = atom<string[]>([]);

const choicesReadyAtom = atom(false);
export const scoredChoicesAtom = atom(
  (g) => g(choices),
  // Setting to `null` should only happen when using setPanel
  // This helps skip sending `onNoChoices`
  (g, s, cs: ScoredChoice[] = []) => {
    s(choicesReadyAtom, true);
    s(cachedAtom, false);
    s(loadingAtom, false);
    prevFocusedChoiceId = 'prevFocusedChoiceId';

    const csIds = cs.map((c) => c.item.id) as string[];
    const prevIds = g(prevScoredChoicesIdsAtom);
    const changed = !arraysEqual(prevIds, csIds);
    // log.info({
    //   csIds,
    //   prevIds,
    //   changed,
    // });
    s(prevScoredChoicesIdsAtom, csIds);

    // log.info(`⚽️ Scored choices length: ${a?.length}`);

    // s(submittedAtom, false);

    // if the first cs has a `border-t-1`, remove it
    if (cs[0]?.item?.className) {
      cs[0].item.className = cs[0]?.item?.className.replace('border-t-1', '');
    }

    // log.info(`⚽️ Scored choices length: ${cs?.length}`);
    s(choices, cs || []);
    s(currentChoiceHeightsAtom, cs || []);

    if (g(promptData)?.grid) {
      s(gridReadyAtom, true);
    }

    // a.forEach((newChoice, i) => {
    //   const prevChoice = prevChoices?.[i];

    //   if (!prevChoice || newChoice.item.id !== prevChoice?.item?.id) {
    //     log.info(
    //       `Mismatch: ${newChoice.item.name}: ${newChoice.item.id} vs. ${prevChoice?.item?.name}: ${prevChoice?.item?.id}`
    //     );
    //   }
    // });

    let hasSkip = false;
    let allSkip = true;
    let allInfo = true;
    let allSkipOrInfo = true;

    for (const c of cs ?? []) {
      const isSkipped = c?.item?.skip;
      const isInfo = c?.item?.info;
      hasSkip = hasSkip || isSkipped;
      allSkip = allSkip && isSkipped;
      allInfo = allInfo && isInfo;
      allSkipOrInfo = allSkipOrInfo && (isSkipped || isInfo);

      // Early exit if we've found all conditions
      if (hasSkip && !allSkip && !allInfo && !allSkipOrInfo) {
        break;
      }
    }

    s(hasSkipAtom, hasSkip);
    s(allSkipAtom, allSkip);
    if (changed) {
      s(indexAtom, 0);
    }

    const isFilter = g(uiAtom) === UI.arg && g(promptData)?.mode === Mode.FILTER;

    const channel = g(channelAtom);

    const hasActionableChoices = !allSkipOrInfo;
    if (hasActionableChoices) {
      s(panelHTMLAtom, '');

      const defaultValue: any = g(defaultValueAtom);
      const defaultChoiceId = g(defaultChoiceIdAtom);
      const prevIndex = g(prevIndexAtom);
      const input = g(inputAtom);
      if (cs.length > 0 && (defaultValue || defaultChoiceId)) {
        const i = cs.findIndex(
          (c) => c.item?.id === defaultChoiceId || c.item?.value === defaultValue || c.item?.name === defaultValue,
        );

        if (i !== -1) {
          const foundChoice = cs[i].item;
          if (foundChoice?.id) {
            s(indexAtom, i);
            // log.info(`🤔 Found choice: ${foundChoice?.id}`);
            s(focusedChoiceAtom, foundChoice);
            s(requiresScrollAtom, i);
          }
        }
        s(defaultValueAtom, '');
        s(defaultChoiceIdAtom, '');
      } else if (input.length > 0) {
        s(requiresScrollAtom, g(requiresScrollAtom) > 0 ? 0 : -1);

        // const keyword = g(promptDataAtom)?.keyword;
        // log.info({ keyword, inputLength: input.length });
        if (changed) {
          s(indexAtom, 0);
        }
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
        if (g(promptReadyAtom)) {
          channel(Channel.NO_CHOICES);
        }
      }
    }
    let choicesHeight = 0;

    for (const {
      item: { height },
    } of cs) {
      choicesHeight += height || g(itemHeightAtom);
      if (choicesHeight > 1920) {
        break;
      }
    }

    s(choicesHeightAtom, choicesHeight);
    // log.info({ choicesHeight, here: '🤷‍♂️', count: a?.length, pid: window.pid });
    const ui = g(uiAtom);
    if (ui === UI.arg) {
      s(mainHeightAtom, choicesHeight);
    } else {
      s(mainHeightAtom, DEFAULT_HEIGHT);
    }
  },
);

const choicesHeightAtom = atom(0);
export const flagsHeightAtom = atom(0);

export const choicesAtom = atom((g) => g(scoredChoicesAtom).map((result) => result.item));

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

const _actionsInputAtom = atom('');
export const actionsInputAtom = atom(
  (g) => g(_actionsInputAtom),
  (g, s, a: string) => {
    // log.info(`✉️ inputAtom: ${a}`);
    s(directionAtom, 1);

    s(_actionsInputAtom, a);

    if (!g(submittedAtom)) {
      const channel = g(channelAtom);
      // TODO: npm link isn't working in the renderer code for some reason
      channel(Channel.ACTIONS_INPUT || 'ACTIONS_INPUT');
    }

    s(mouseEnabledAtom, 0);
  },
);

export const inputAtom = atom(
  (g) => g(_inputAtom),
  async (g, s, a: string) => {
    // log.info(`✉️ inputAtom: ${a}`);
    s(directionAtom, 1);
    const selected = g(showSelectedAtom);
    const prevInput = g(_inputAtom);
    if (prevInput && a === '') {
      s(selectedAtom ? flagsIndexAtom : indexAtom, 0);
    }

    if (a !== prevInput) {
      s(_inputChangedAtom, true);
    }
    if (a === prevInput) {
      s(tabChangedAtom, false);
      return;
    }

    s(_inputAtom, a);

    const flaggedValue = g(flaggedChoiceValueAtom);

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
  },
);

const _flagsAtom = atom<FlagsObject>({});
export const flagsAtom = atom(
  (g) => {
    const { sortChoicesKey, order, ...flags } = g(_flagsAtom);
    return flags;
  },
  (g, s, a: FlagsObject) => {
    log.info(`👀 flagsAtom: ${Object.keys(a)}`);
    // log.info(
    //   Object.entries(a).map(([k, v]) => {
    //     return {
    //       [k]: v?.hasAction ? 'hasAction' : 'noAction',
    //     };
    //   })
    // );
    s(_flagsAtom, a);

    if (g(isMainScriptAtom)) {
      s(cachedMainFlagsAtom, a);
    }
  },
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
    },
  );

export const tabIndexAtom = atom(
  (g) => g(_tabIndex),
  (g, s, a: number) => {
    s(_inputChangedAtom, false);
    // s(submittedAtom, false);
    s(prevIndexAtom, 0);
    if (g(_tabIndex) !== a) {
      s(_tabIndex, a);
      // log.info(`tabIndexAtom clearing flagsAtom`);
      s(flagsAtom, {});
      s(_flaggedValue, '');

      sendTabChanged = sendTabChanged || getSendTabChanged(g);
      sendTabChanged();

      s(tabChangedAtom, true);
    }
  },
);

const selected = atom('');
export const selectedAtom = atom(
  (g) => g(selected),
  (_g, s, a: string) => {
    s(selected, a);
    if (a === '') {
      s(focusedFlagValueAtom, '');
    }
  },
);

const _script = atom<Script>(noScript);
const backToMainAtom = atom(false);

export const preloadedAtom = atom(false);

export const scriptAtom = atom(
  (g) => g(_script),
  (g, s, a: Script) => {
    s(lastKeyDownWasModifierAtom, false);

    const isMainScript = a?.filePath === g(kitConfigAtom).mainScriptPath;

    // log.info(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

    // ${isMainScript ? 'MAIN SCRIPT' : 'NOT MAIN SCRIPT'}

    // <<<<<<<<<<<<<<<<<<<<<<`);

    s(isMainScriptAtom, isMainScript);
    const prevScript = g(_script);
    s(
      backToMainAtom,
      prevScript?.filePath !== g(kitConfigAtom).mainScriptPath && a?.filePath === g(kitConfigAtom).mainScriptPath,
    );

    s(promptReadyAtom, false);
    if (!isMainScript) {
      s(choicesConfigAtom, { preload: false });
      const preloaded = g(preloadedAtom);
      log.info(`${g(pidAtom)}: Preloaded? ${preloaded ? 'YES' : 'NO'}`);

      if (!preloaded) {
        // Removed: Caused a flash of white from no choices
        // s(scoredChoicesAtom, []);
        // s(focusedChoiceAtom, noChoice);
        // log.info(`>>>>>>>>>>>>>>>>>>>>>>>>> NOT MAIN SCRIPT< CLEARING`);
        s(_previewHTML, '');
      }
      //
    }

    s(preloadedAtom, false);
    if (a?.tabs) {
      s(tabsAtom, a?.tabs || []);
    }

    s(mouseEnabledAtom, 0);
    s(_script, a);
    s(processingAtom, false);

    s(loadingAtom, false);
    s(progressAtom, 0);
    s(logoAtom, a?.logo || '');
    s(_tempThemeAtom, g(themeAtom));
    // s(flagsAtom, {});

    // s(panelHTMLAtom, `<div/>`);

    // if (g(isMainScriptAtom) && !wereChoicesPreloaded) s(_inputAtom, ``);
  },
);

export const isKitScriptAtom = atom<boolean>((g) => {
  return (g(_script) as Script)?.filePath?.includes(g(kitConfigAtom).kitPath);
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
    // log.info(`domUpdated: ${reason}`);
    resize(g, s, reason);
  }, 25); // TODO: think about panel resizing debouncing
});

const sendResize = (data: ResizeData) => ipcRenderer.send(AppChannel.RESIZE, data);
const debounceSendResize = debounce(sendResize, 100);

const resizeSettle = debounce((g: Getter, s: Setter) => {
  resize(g, s, 'SETTLE');
}, 250);

export const promptResizedByHumanAtom = atom(false);

export const resize = debounce(
  (g: Getter, s: Setter, reason = 'UNSET') => {
    const human = g(promptResizedByHumanAtom);
    if (human) {
      g(channelAtom)(Channel.SET_BOUNDS, g(promptBoundsAtom));
      return;
    }
    // log.info(`${g(pidAtom)}: ${g(scriptAtom)?.filePath}: 🌈 resize: ${reason}`);
    if (reason !== 'SETTLE') {
      // resizeSettle(g, s);
    }

    const active = g(promptActiveAtom);
    // log.info(`🌈 ${active ? 'active' : 'inactive'} resize: ${reason}`);

    if (!active) {
      return;
    }
    const promptBounds = g(promptBoundsAtom);

    const ui = g(uiAtom);

    const scoredChoicesLength = g(scoredChoicesAtom)?.length;
    // log.info(`resize: ${reason} - ${ui} length ${scoredChoicesLength}`);
    const hasPanel = g(_panelHTML) !== '';
    const promptData = g(promptDataAtom);
    if (!promptData?.scriptPath) {
      return;
    }

    let mh = g(mainHeightAtom);

    if (promptData?.grid && document.getElementById('main').clientHeight > 10) {
      return;
    }

    // if (mh === 0 && [UI.form, UI.div].includes(ui)) return;

    const placeholderOnly = promptData?.mode === Mode.FILTER && scoredChoicesLength === 0 && ui === UI.arg;

    const topHeight = document.getElementById('header')?.offsetHeight || 0;
    const footerHeight = document.getElementById('footer')?.offsetHeight || 0;

    const hasPreview = g(previewCheckAtom);

    // log.info({
    //   pid: window.pid,
    //   html: g(previewHTMLAtom).slice(0, 24),
    // });

    const totalChoices = scoredChoicesLength;

    const choicesHeight = g(choicesHeightAtom);

    // log.info(
    //   `1: 🥺 ${window.pid}: mh: ${mh} topHeight: ${topHeight} footerHeight: ${footerHeight} `,
    // );

    if (ui === UI.arg) {
      const choicesReady = g(choicesReadyAtom);
      if (!choicesReady) {
        return;
      }
      if (choicesHeight > PROMPT.HEIGHT.BASE) {
        log.info(`🍃 choicesHeight: ${choicesHeight} > PROMPT.HEIGHT.BASE: ${PROMPT.HEIGHT.BASE}`);
        mh =
          (promptData?.height && promptData?.height > PROMPT.HEIGHT.BASE ? promptData?.height : PROMPT.HEIGHT.BASE) -
          topHeight -
          footerHeight;
      } else {
        log.info(`🍃 choicesHeight: ${choicesHeight} <= PROMPT.HEIGHT.BASE: ${PROMPT.HEIGHT.BASE}`);
        mh = choicesHeight;
      }
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
        // log.info(`Force resize: has panel`);
        ch = (document as any)?.getElementById('panel')?.offsetHeight;
        mh = ch;
        forceResize = true;
      } else if (ui === UI.arg && !hasPanel && !scoredChoicesLength && !document.getElementById('list')) {
        // log.info(`List and panel gone`);
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
      // log.info(`Force resize error`);
    }

    if (topHeight !== prevTopHeight) {
      forceResize = true;
      prevTopHeight = topHeight;
    }

    if (hasPreview && mh < PROMPT.HEIGHT.BASE) {
      const previewHeight = document.getElementById('preview')?.offsetHeight || 0;
      mh = Math.max(g(flagsHeightAtom), choicesHeight, previewHeight, promptData?.height || PROMPT.HEIGHT.BASE);
      forceResize = true;

      // log.info(`hasPreview: ${PROMPT.HEIGHT.BASE} mh ${mh}`);
    }

    if (g(logHTMLAtom)?.length > 0 && g(scriptAtom)?.log !== 'false') {
      const logHeight = document.getElementById('log')?.offsetHeight;
      // log.info(`logHeight: ${logHeight}`);
      mh += logHeight || 0;
    }

    const justOpened = g(justOpenedAtom);
    const samePrompt = promptBounds?.id === promptData?.id;

    const forceWidth = samePrompt ? promptBounds?.width : promptData?.width;
    let forceHeight;

    // if (
    //   [
    //     UI.term,
    //     UI.editor,
    //     UI.drop,
    //     UI.textarea,
    //     UI.emoji,
    //     UI.chat,
    //     UI.mic,
    //     UI.webcam,
    //   ].includes(ui)
    // ) {
    //   forceHeight = samePrompt
    //     ? promptBounds?.height
    //     : promptData?.height || PROMPT.HEIGHT.BASE;
    //   forceResize = true;
    // }

    const flaggedValue = g(_flaggedValue);

    if (ui !== UI.arg) {
      if (flaggedValue && promptData?.height && promptData?.height < PROMPT.HEIGHT.BASE) {
        forceHeight = PROMPT.HEIGHT.BASE;
      } else if (flaggedValue && !promptData?.height) {
        forceHeight = PROMPT.HEIGHT.BASE;
      } else {
        forceHeight = promptData?.height;
      }
    }

    if (ui === UI.arg && flaggedValue) {
      log.info(`🍃 flaggedValue: ${flaggedValue} forceHeight: ${forceHeight}`);
      forceHeight = PROMPT.HEIGHT.BASE;
    }

    if (ui === UI.debugger) {
      forceHeight = 128;
    }

    const hasInput = g(inputAtom)?.length > 0;

    // log.info({
    //   forceHeight: forceHeight || 'no forced height',
    //   forceWidth: forceWidth || 'no forced width',
    // });

    // log.info({
    //   reason,
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
    // log.info({
    //   hasPreview: hasPreview ? 'has preview' : 'no preview',
    // });

    const inputChanged = g(_inputChangedAtom);

    // This hack doesn't seem necessary anymore... but why?
    // mh = Math.ceil(mh || -3) + 3;

    if (mh === 0 && promptData?.preventCollapse) {
      log.info('🍃 Prevent collapse to zero...');
      return;
    }

    // if (promptData?.scriptlet) {
    //   mh = 0;
    //   forceResize = true;
    //   hasPanel = false;
    //   forceHeight = false;
    //   totalChoices = 0;
    // }

    // if (window.pid) {
    //   log.info(
    //     `Jotai PID: ${window.pid}: ${promptData?.scriptPath}: ${choicesHeight}\n` +
    //       `+----------------+----------------+----------------+----------------+\n` +
    //       `|                | Prompt Bounds  | Prompt Data    | Computed Values|\n` +
    //       `+----------------+----------------+----------------+----------------+\n` +
    //       `| Width          | ${promptBounds?.width.toString().padEnd(14)} | ${promptData?.width?.toString().padEnd(14)} |                |\n` +
    //       `| Height         | ${promptBounds?.height.toString().padEnd(14)} | ${promptData?.height?.toString().padEnd(14) || ''.padEnd(14)} |                |\n` +
    //       `+----------------+----------------+----------------+----------------+\n` +
    //       `| Same Prompt    | ${samePrompt ? 'Yes'.padEnd(14) : 'No'.padEnd(14)} |                |                |\n` +
    //       `| Force Width    | ${forceWidth ? 'Yes'.padEnd(14) : 'No'.padEnd(14)} |                |                |\n` +
    //       `| Force Height   | ${forceHeight ? forceHeight.toString().padEnd(14) : 'No'.padEnd(14)} |                |                |\n` +
    //       `| Main Height    |                |                | ${mh.toString().padEnd(14)} |\n` +
    //       `| Scriptlet      | ${promptData?.scriptlet ? 'Yes'.padEnd(14) : 'No'.padEnd(14)} |                |                |\n` +
    //       `+----------------+----------------+----------------+----------------+`,
    //   );
    // }

    log.info(`🍃 mh: ${mh}`, `forceHeight: ${forceHeight}`);
    const data: ResizeData = {
      id: promptData?.id || 'missing',
      pid: window.pid,
      reason,
      scriptPath: g(_script)?.filePath,
      placeholderOnly,
      topHeight,
      ui,
      mainHeight: mh + (g(isWindowAtom) ? 24 : 0) + 1,
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
      forceWidth: promptData?.width,
      totalChoices,
      isMainScript: g(isMainScriptAtom),
    };

    s(prevMh, mh);

    // console.info(`👋`, data);

    // log.info({
    //   justOpened: justOpened ? 'JUST OPENED' : 'NOT JUST OPENED',
    // });

    debounceSendResize.cancel();

    if (justOpened && !promptData?.scriptlet) {
      debounceSendResize(data);
    } else {
      sendResize(data);
    }
  },
  50,
  {
    leading: true,
    trailing: true,
  },
);

export const topHeightAtom = atom(
  (g) => g(_topHeight),
  (g, s) => {
    const resizeComplete = g(resizeCompleteAtom);
    if (!resizeComplete) {
      return;
    }
    // TODO: TOP HEIGHT NECESSARY?
    resize(g, s, 'TOP_HEIGHT');
  },
);

export const triggerResizeAtom = atom(null, (g, s, reason: string) => {
  resize(g, s, `TRIGGER_RESIZE: ${reason}`);
});

export const mainHeightAtom = atom(
  (g) => g(mainHeight),
  (g, s, a: number) => {
    const prevHeight = g(mainHeight);

    const nextMainHeight = a < 0 ? 0 : a;

    if (nextMainHeight === 0) {
      if (g(panelHTMLAtom) !== '') {
        return;
      }
      if (g(scoredChoicesAtom).length > 0) {
        return;
      }
    }

    s(mainHeight, nextMainHeight);
    if (a === prevHeight) {
      return;
    }

    if ([UI.term, UI.editor, UI.drop, UI.textarea, UI.emoji, UI.chat, UI.mic, UI.webcam].includes(g(uiAtom))) {
      return;
    }
    resize(g, s, 'MAIN_HEIGHT');
  },
);

const checkSubmitFormat = (g: Getter, checkValue: any) => {
  // check for array buffer
  if (checkValue instanceof ArrayBuffer) {
    return checkValue;
  }
  if (Array.isArray(checkValue)) {
    // TODO: I don't like all this checkValue nonsense
    if (g(choiceInputsAtom).length > 0) {
      return checkValue;
    }

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
export const actionsItemHeightAtom = atom(PROMPT.ITEM.HEIGHT.SM);
export const actionsInputHeightAtom = atom(PROMPT.INPUT.HEIGHT.XS - 2);
export const itemHeightAtom = atom(PROMPT.ITEM.HEIGHT.SM);
export const inputHeightAtom = atom(PROMPT.INPUT.HEIGHT.SM);

const promptData = atom<null | Partial<PromptData>>({
  ui: UI.arg,
  input: '',
  footerClassName: 'hidden',
  headerClassName: 'hidden',
  placeholder: 'Script Kit',
});

const _themeAtom = atom('');

export const themeAtom = atom(
  (g) => g(_themeAtom),
  (_g, s, theme: string) => {
    s(_themeAtom, theme);
    s(_tempThemeAtom, theme);
  },
);

export const headerHiddenAtom = atom(false);
const footerHidden = atom(false);
export const footerHiddenAtom = atom(
  (g) => g(footerHidden),
  (_g, s, a: boolean) => {
    s(footerHidden, a);
  },
);

const promptReadyAtom = atom(false);

let wasPromptDataPreloaded = false;

export const promptDataAtom = atom(
  (g) => g(promptData),
  (g, s, a: null | PromptData) => {
    s(choicesReadyAtom, false);
    const pid = g(pidAtom);
    // s(appendToLogHTMLAtom, a?.id || 'id missing');

    s(gridReadyAtom, false);

    const isMainScript = a?.scriptPath === g(kitConfigAtom).mainScriptPath;
    s(isMainScriptAtom, isMainScript);
    if (isMainScript && !a?.preload && g(tabIndexAtom) === 0) {
      s(cachedMainPromptDataAtom, a);
    }
    if (a?.ui !== UI.arg && !a?.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    s(isHiddenAtom, false);
    const prevPromptData = g(promptData);

    wasPromptDataPreloaded = Boolean(prevPromptData?.preload && !a?.preload);
    log.info(
      `${g(pidAtom)}: 👀 Preloaded: ${a?.scriptPath} ${
        wasPromptDataPreloaded ? 'true' : 'false'
      } and keyword: ${a?.keyword}
      prevPromptData: ${prevPromptData?.preload ? 'yup' : 'nope'}
      currentPromptData: ${a?.preload ? 'yup' : 'nope'}
      `,
    );

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
      // log.info(`Setting uiAtom to ${a?.ui}`);
      if (a?.ui !== UI.arg) {
        s(focusedChoiceAtom, noChoice);
      }
      if (isMainScript && !a?.input) {
        // s(inputAtom, '');
      }
      s(uiAtom, a.ui);
      // if (a?.theme) {
      //   s(tempThemeAtom, { ...g(themeAtom), ...(a?.theme || {}) });
      // }

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
          closeOnExit: typeof b?.closeOnExit !== 'undefined' ? b?.closeOnExit : true,
          pid: g(pidAtom),
        } as TermConfig;

        s(termConfigAtom, config);
      }

      // log.info({
      //   input: a?.input,
      //   keyword: a?.keyword,
      //   inputRegex: a?.inputRegex,
      //   isMainScriptAtom: g(isMainScriptAtom) ? 'true' : 'false',
      // });

      if (!(a?.keyword || (g(isMainScriptAtom) && a?.ui === UI.arg))) {
        // log.info(`👍 Setting input to ${a?.input || '_'}`);
        const inputWhileSubmitted = g(inputWhileSubmittedAtom);
        const forceInput = a?.input || inputWhileSubmitted || '';
        log.info(`${pid}: 👂 Force input due to keyword or mainScript`);

        const prevInput = g(_inputAtom);
        const prevInputHasSlash = prevInput.includes('/') || prevInput.includes('\\');
        // This is one of those weird edges cases where triggers/keywords affect input, so you don't want to override it,
        // but also the "await path" selected value has a slash in it so we have to check for that
        if (forceInput && (!prevInput.startsWith(forceInput) || prevInputHasSlash)) {
          s(_inputAtom, forceInput);
        } else if (!forceInput) {
          s(_inputAtom, forceInput);
        }
      }

      s(_inputWhileSubmittedAtom, '');
      s(_flaggedValue, '');
      s(hintAtom, a.hint);
      s(placeholderAtom, a.placeholder);
      s(selectedAtom, a.selected);
      s(tabsAtom, a.tabs);

      s(processingAtom, false);

      s(focusedFlagValueAtom, '');

      s(flagsAtom, a?.flags || {});
      s(choiceInputsAtom, []);

      s(headerHiddenAtom, !!a?.headerClassName?.includes('hidden'));
      s(footerHiddenAtom, !!a?.footerClassName?.includes('hidden'));

      const headerHidden = g(headerHiddenAtom);

      const script = g(scriptAtom);

      const promptDescription = a.description || (a?.name ? '' : script?.description || '');
      const promptName = a.name || script?.name || '';

      s(descriptionAtom, promptDescription || promptName);
      s(nameAtom, promptDescription ? promptName : promptDescription);

      if (!a?.keepPreview && a.preview) {
        // log.info(`👍 Keeping preview`);
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
        s(formHTMLAtom, domUtils.ensureFormHasSubmit(a.html));
      }

      if (a?.formData) {
        s(formDataAtom, a.formData);
      }

      s(itemHeightAtom, a?.itemHeight || PROMPT.ITEM.HEIGHT.SM);
      s(inputHeightAtom, a?.inputHeight || PROMPT.INPUT.HEIGHT.SM);

      s(defaultValueAtom, a?.defaultValue || '');
      s(defaultChoiceIdAtom, a?.defaultChoiceId || '');

      s(onInputSubmitAtom, a?.shortcodes || {});
      s(shortcutsAtom, a?.shortcuts || []);

      s(prevChoicesConfig, []);
      s(audioDotAtom, false);

      if (a?.choicesType === 'async') {
        s(loadingAtom, true);
      }

      if (typeof a?.enter === 'string') {
        s(enterAtom, a.enter);
      } else {
        s(enterAtom, 'Submit');
      }

      if (!g(hasActionsAtom)) {
        s(flagsHeightAtom, 0);
      }

      s(promptData, a);

      const channel = g(channelAtom);
      channel(Channel.ON_INIT);

      ipcRenderer.send(Channel.SET_PROMPT_DATA, {
        messageId: a?.messageId,
        ui: a?.ui,
      });
      s(promptReadyAtom, true);

      s(promptActiveAtom, true);
      s(tabChangedAtom, false);
      s(actionsInputAtom, '');
      // log.info({ actionsConfig: a?.actionsConfig });
      s(actionsConfigAtom, a?.actionsConfig || {});
      s(_termOutputAtom, '');
    }
  },
);

export const flaggedChoiceValueAtom = atom(
  (g) => g(_flaggedValue),
  (g, s, a: any) => {
    const currentFlaggedValue = g(_flaggedValue);
    // log.info(`👀 flaggedChoiceValueAtom: current: ${currentFlaggedValue} new: ${a}`);
    // TODO: OPEN_ACTIONS send 'action' as a hack here to force the menu open...
    if (currentFlaggedValue && a === 'action') {
      // If it's already open and receives another OPEN_ACTIONS, then clear the input... Is this safe?
      log.info('👀 flaggedChoiceValueAtom: clearing actionsInputAtom because it was already open');
      s(actionsInputAtom, '');
      return;
    }
    s(promptActiveAtom, true);
    log.info({ flagValue: a });
    // if (Object.entries(flags).length === 0 && !g(focusedChoiceAtom)?.actions) {
    //   return;
    // }
    // log.info({ actions: a?.actions });
    s(_flaggedValue, a);

    if (a === '') {
      // s(_inputAtom, g(prevInputAtom));

      s(selectedAtom, '');
      s(choicesConfigAtom, g(prevChoicesConfig));
      s(indexAtom, g(prevIndexAtom));
      s(actionsInputAtom, '');
    } else {
      s(selectedAtom, typeof a === 'string' ? a : (a as Choice)?.name);

      s(prevIndexAtom, g(indexAtom));
      // s(prevInputAtom, g(inputAtom));
      // s(inputAtom, '');

      s(directionAtom, 1);
      s(flagsIndexAtom, 0);
    }

    const channel = g(channelAtom);
    channel(Channel.ON_MENU_TOGGLE);

    resize(g, s, 'FLAG_VALUE');
  },
);

const _focusedFlag = atom('');
export const focusedFlagValueAtom = atom(
  (g) => g(_focusedFlag),
  (g, s, a: string) => {
    // log.info(`👀 focusedFlagValueAtom: ${a}`);
    if (a !== g(_focusedFlag)) {
      s(_focusedFlag, a);

      const flags = g(flagsAtom);
      const flag = flags[a];

      s(focusedActionAtom, flag || {});
    }
  },
);

export const focusedActionAtom = atom<Action>({} as Action);

export const preventSubmitWithoutActionAtom = atom((g) => {
  const flaggedValue = g(flaggedChoiceValueAtom);
  const focusedAction = g(focusedActionAtom);
  return flaggedValue && Object.keys(focusedAction).length === 0;
});

const _submitValue = atom('');
export const searchDebounceAtom = atom(true);
export const termFontAtom = atom('monospace');

export const appStateAtom = atom<AppState>((g: Getter) => {
  const state = {
    input: g(_inputAtom),
    actionsInput: g(_actionsInputAtom),
    inputChanged: g(_inputChangedAtom),
    flag: g(focusedFlagValueAtom),
    index: g(indexAtom),
    flaggedValue: g(_flaggedValue) || '',
    focused: g(_focused),
    tab: g(tabsAtom)?.[g(_tabIndex)] || '',
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
    multiple: g(promptDataAtom)?.multiple,
    selected: g(selectedChoicesAtom).map((c) => c?.value),
    action: g(focusedActionAtom),
  } as AppState;

  return state;
});

export const channelAtom = atom((g) => {
  if (g(pauseChannelAtom)) {
    return () => {};
  }
  return (channel: Channel, override?: any) => {
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

    // log.info(`${pid}: 📤 ${channel}`, appMessage.state.value);

    ipcRenderer.send(channel, appMessage);
  };
});

export const onPasteAtom = atom((g) => (event: any) => {
  if (g(uiAtom) === UI.editor) {
    event.preventDefault();
  }
  const channel = g(channelAtom);
  channel(Channel.ON_PASTE);
});

export const onDropAtom = atom((g) => (event: any) => {
  if (g(uiAtom) === UI.drop) {
    return;
  }
  event.preventDefault();

  let drop = '';
  const files = Array.from(event?.dataTransfer?.files);

  if (files.length > 0) {
    drop = files
      .map((file: any) => file.path)
      .join('\n')
      .trim();
  } else {
    drop = event?.dataTransfer?.getData('URL') || event?.dataTransfer?.getData('Text') || '';
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
    const ui = g(uiAtom);
    const allowEmptyEnterUIs = [UI.term, UI.drop, UI.hotkey];
    const flaggedValue = g(flaggedChoiceValueAtom);
    const flag = g(focusedFlagValueAtom);
    const action = g(focusedActionAtom);
    const enter = g(enterAtom);

    const preventSubmitDueToUI = allowEmptyEnterUIs.includes(ui);

    if (enter === '' && !preventSubmitDueToUI && !flaggedValue && !action) {
      log.warn('👀 Preventing submit because enterAtom is empty');
      return;
    }
    // log.info(
    //   `
    // 👉    👉  👉

    //     submitValueAtom`,
    //   JSON.stringify(a),
    // );

    // log.info('submitValue', a);
    // log.info(`scriptlet?`, a?.scriptlet);

    /*
     * TODO: Make a list of all the states that impact submission.
     * For example, this is:
     * 1 - Actions Prompt Closed (flaggedValue === '')
     * 2 - Not a shortcut (flag === '')
     * 3 - Scriptlet Focused (a?.scriptlet && a?.inputs?.length)
     * 4 - Scriptlet Requires Inputs
     * Others include drag and drop arrays, forms, terminal, etc
     */

    if (!(flaggedValue || flag) && a?.scriptlet && a?.inputs?.length > 0) {
      log.info('Scriptlet requires inputs', a.inputs);

      return;
    }
    const channel = g(channelAtom);

    const preventSubmitWithoutAction = g(preventSubmitWithoutActionAtom);
    if (preventSubmitWithoutAction) {
      log.info('👀 preventSubmitWithoutActionAtom');
      return;
    }

    if ((action as FlagsWithKeys).hasAction) {
      channel(Channel.ACTION);
      if (action?.close && g(flaggedChoiceValueAtom)) {
        log.info('👋 Closing actions');
        s(flaggedChoiceValueAtom, '');
      }
      return;
    }

    s(onInputSubmitAtom, {});
    // TODO: This was helping with resize flickers before. Not sure if still needed.
    s(promptActiveAtom, false);
    s(disableSubmitAtom, false);
    if (g(submittedAtom)) {
      return;
    }
    const focusedChoice = g(focusedChoiceAtom);

    const fid = focusedChoice?.id;
    if (fid) {
      // console.log.info(`focusedChoice.id: ${focusedChoice.id}`);
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

    let value = ui === UI.term ? g(termOutputAtom) : checkSubmitFormat(g, a);
    const focusedChoiceIsNoChoice = focusedChoice === noChoice;
    const inputIsEmpty = g(inputAtom) === '';
    const choicesAreEmpty = g(choicesAtom).length === 0;
    if (focusedChoiceIsNoChoice && inputIsEmpty && choicesAreEmpty && ui === UI.arg) {
      value = '';
    }

    const valueSubmitted = {
      value,
      flag,
    };

    // log.info('👀 valueSubmitted', valueSubmitted);
    channel(Channel.VALUE_SUBMITTED, valueSubmitted);

    s(loadingAtom, false);

    if (placeholderTimeoutId) {
      clearTimeout(placeholderTimeoutId);
    }
    placeholderTimeoutId = setTimeout(() => {
      s(loadingAtom, true);
      s(processingAtom, true);
    }, 500);

    s(submittedAtom, true);
    // s(indexAtom, 0);

    s(closedInput, g(inputAtom));
    s(_flaggedValue, ''); // clear after getting
    // s(_focused, noChoice);
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
      if (document.getElementById('webcam')) {
        (document.getElementById('webcam') as HTMLVideoElement).srcObject = null;
      }
    }
  },
);

export const closedInput = atom('');

const lastScriptClosed = atom('');

export const initialResizeAtom = atom<ResizeData | null>(null);
export const openAtom = atom(
  (g) => g(_open),
  (g, s, a: boolean) => {
    if (g(_open) === a) {
      return;
    }
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
      // s(scoredChoicesAtom, []);
      // s(inputAtom, '');
      s(_panelHTML, '');

      s(formHTMLAtom, '');
      // s(hintAtom, '');
      s(logHTMLAtom, '');
      // s(uiAtom, UI.arg);
      s(flagsAtom, {});
      s(_flaggedValue, '');
      s(loading, false);
      s(loadingAtom, false);
      s(progressAtom, 0);
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
      s(termConfigAtom, {});
      // s(tabsAtom, []);

      const stream = g(webcamStreamAtom);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        s(webcamStreamAtom, null);
        if (document.getElementById('webcam')) {
          (document.getElementById('webcam') as HTMLVideoElement).srcObject = null;
        }
      }

      // s(resetPromptAtom);
    }
    s(_open, a);
  },
);

export const escapeAtom = atom<any>((g) => {
  const channel = g(channelAtom);
  return () => {
    const synth = window.speechSynthesis;
    if (synth.speaking) {
      synth.cancel();
    }

    log.info('👋 Sending Channel.ESCAPE');
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

const setAppearance = () => {};

const _tempThemeAtom = atom('');
export const tempThemeAtom = atom(
  (g) => g(_tempThemeAtom),
  (_g, s, theme: string) => {
    s(_tempThemeAtom, theme);
  },
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
export const inputFocusAtom = atom<number>(Math.random());

const actionsInputFocus = atom<number>(0);
export const actionsInputFocusAtom = atom(
  (g) => g(actionsInputFocus),
  (g, s, a: any) => {
    if (g(actionsInputFocus) === a) {
      return;
    }
    s(actionsInputFocus, a);
  },
);

const previewEnabled = atom<boolean>(true);
export const previewEnabledAtom = atom(
  (g) => g(previewEnabled) && !(g(uiAtom) === UI.splash),
  (g, s, a: boolean) => {
    s(previewEnabled, a);
    resize(g, s, 'PREVIEW_ENABLED');
  },
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
  },
);
export const loadingAtom = atom(
  (g) => g(loading) || g(runningAtom),
  (_g, s, a: boolean) => {
    s(loading, a);
  },
);

export const exitAtom = atom(
  (g) => g(openAtom),
  (g, s, a: number) => {
    if (g(pidAtom) === a) {
      // log.info(`👋 Exit, so setting open to false`);
      s(openAtom, false);
    }
  },
);

export const isSplashAtom = atom((g) => {
  return g(scriptAtom)?.filePath === SPLASH_PATH;
});

export const splashBodyAtom = atom('');
export const splashHeaderAtom = atom('');
export const splashProgressAtom = atom(0);

export const appConfigAtom = atom({
  isWin: false,
  isMac: false,
  isLinux: false,
  os: '',
  sep: '',
  assetPath: '',
  version: '',
  delimiter: '',
  url: '',
} as const);

export const actionsButtonActionAtom = atom<Action>((g) => {
  const isMac = g(appConfigAtom).isMac;
  const flagValue = g(flaggedChoiceValueAtom);

  return {
    name: 'Actions',
    value: isMac ? 'cmd+k' : 'ctrl+k',
    shortcut: isMac ? '⌘+K' : '⌃+K',
    position: 'right',
    disabled: false,
  } as Action;
});

export const createAssetAtom = (...parts: string[]) =>
  atom(() => {
    return new Promise((resolve, _reject) => {
      ipcRenderer.once(AppChannel.GET_ASSET, (_event, { assetPath }) => {
        resolve(assetPath);
      });

      ipcRenderer.send(AppChannel.GET_ASSET, {
        parts,
      });
    });
  });

// This is only used on the Splash screen so "escape" will trigger the main menu
// Are there other scenarios where we need to set this to false?
const isReady = atom(true);
export const isReadyAtom = atom(
  (g) => {
    return g(isReady);
  },
  (_g, s, a: boolean) => {
    s(isReady, a);
  },
);
export const cmdAtom = atom((g) => (g(appConfigAtom).isWin ? 'ctrl' : 'cmd'));

export const runMainScriptAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
});

export const runKenvTrustScriptAtom = atom(() => (kenv: string) => {
  log.info(`🔑 Running kenv-trust script for ${kenv}`);
  ipcRenderer.send(AppChannel.RUN_KENV_TRUST_SCRIPT, { kenv });
});

export const runProcessesAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.RUN_PROCESSES_SCRIPT);
});

export const applyUpdateAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.APPLY_UPDATE);
});

export const valueInvalidAtom = atom(null, (g, s, a: string) => {
  if (placeholderTimeoutId) {
    clearTimeout(placeholderTimeoutId);
  }
  s(processingAtom, false);
  // log.info(`Setting input due to invalid: ${a}`);
  s(inputAtom, '');
  s(_inputChangedAtom, false);
  if (typeof a === 'string') {
    const getConvert = g(convertAtom);
    s(hintAtom, getConvert(true).toHtml(a));
  }

  const channel = g(channelAtom);
  channel(Channel.ON_VALIDATION_FAILED);
});

export const preventSubmitAtom = atom(null, (_g, s, _a: string) => {
  s(promptActiveAtom, true);
  if (placeholderTimeoutId) {
    clearTimeout(placeholderTimeoutId);
  }
  s(submittedAtom, false);
  s(processingAtom, false);
  s(_inputChangedAtom, false);
});

export const isHiddenAtom = atom(false);

export const blurAtom = atom(null, (g) => {
  const open = g(openAtom);
  if (open) {
    const channel = g(channelAtom);
    channel(Channel.BLUR);
  }
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
  if (updatedHistory.length > 30) {
    updatedHistory.shift();
  }
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
  return (
    // g(isMainScriptAtom) ||
    isArg && hasTabs
  );
});

export const showSelectedAtom = atom((g) => {
  return [UI.arg, UI.hotkey].includes(g(uiAtom)) && g(selectedAtom) && g(tabsAtom)?.length > 0;
});

type OnInputSubmit = {
  [key: string]: any;
};

type OnShortcut = {
  [key: string]: any;
};

export const onInputSubmitAtom = atom<OnInputSubmit>({});
export const onShortcutAtom = atom<OnShortcut>({});
export const enterLastPressedAtom = atom<Date | null>(null);

export const sendShortcutAtom = atom(null, (g, s, shortcut: string) => {
  const channel = g(channelAtom);
  // const log = log;
  const hasEnterShortcut = g(shortcutsAtom).find((s) => s.key === 'enter');
  log.info('🎬 Send shortcut', {
    shortcut,
    hasEnterShortcut,
  });
  if (shortcut === 'enter' && !hasEnterShortcut) {
    s(enterLastPressedAtom, new Date());
  } else {
    channel(Channel.SHORTCUT, { shortcut });
  }
});

export const processesAtom = atom<ProcessInfo[]>([]);

export const setFocusedChoiceAtom = atom(null, (g, s, a: string) => {
  if (!a) {
    return;
  }
  const i = g(choices).findIndex((c) => c?.item?.id === a || c?.item?.name === a);

  // console.log.info({ i });
  if (i > -1) {
    s(indexAtom, i);
  }
});

export const enterButtonNameAtom = atom<string>((g) => {
  if (g(uiAtom) === UI.splash) {
    return '';
  }
  const focusedChoice = g(focusedChoiceAtom);
  const enter = focusedChoice?.enter || g(enterAtom);
  return enter;
});

export const enterButtonDisabledAtom = atom<boolean>((g) => {
  if (g(uiAtom) === UI.splash) {
    return true;
  }
  if (g(submittedAtom)) {
    return true;
  }
  if (g(flaggedChoiceValueAtom)) {
    return false;
  }

  const disableSubmit = g(disableSubmitAtom);
  if (disableSubmit) {
    return true;
  }

  const enterButtonName = g(enterButtonNameAtom);
  if (enterButtonName === '') {
    return true;
  }

  const ui = g(uiAtom);
  if ([UI.fields, UI.form, UI.div].includes(ui)) {
    return false;
  }

  const focusedChoice = g(focusedChoiceAtom);
  if (typeof focusedChoice?.disableSubmit === 'boolean' && focusedChoice.disableSubmit) {
    return true;
  }

  const p = g(panelHTMLAtom);
  if (p?.length > 0) {
    return false;
  }

  const pd = g(promptDataAtom);
  if (!pd?.strict) {
    return false;
  }

  if (focusedChoice?.name === noChoice.name) {
    return true;
  }

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

type Appearance = 'light' | 'dark' | 'auto';
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
  },
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
  (_g, s, a: AudioOptions | null) => {
    // Pure assignment only. Side-effects handled by audioPlaybackEffect.
    s(_audioAtom, a);
  },
);

type SpeakOptions = {
  text: string;
  name?: string;
} & SpeechSynthesisUtterance;
export const _speechAtom = atom<SpeakOptions | null>(null);

export const speechAtom = atom(
  (g) => g(_speechAtom),
  (_g, s, a: SpeakOptions | null) => {
    s(_speechAtom, a);
  },
);

export const updateAvailableAtom = atom(false);

export const _kitStateAtom = atom({
  isSponsor: false,
  updateDownloaded: false,
  promptCount: 0,
  noPreview: false,
  isMac: false,
});

export const kitStateAtom = atom(
  (g) => g(_kitStateAtom),
  (g, s, a: any) => {
    // log.info({
    //   type: 'kitStateAtom',
    //   a,
    // });
    if (a?.escapePressed) {
      const audio = g(audioAtom);
      if (audio) {
        log.info(`${window?.pid}: Escape pressed. Nulling audio`);
        s(audioAtom, null);
      }
    }
    s(_kitStateAtom, {
      ...g(_kitStateAtom),
      ...a,
    });
  },
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

export const editorThemeAtom = atom<{ foreground: string; background: string }>((_g) => {
  const editorTheme = {
    foreground: findCssVar('--color-text'),
    background: findCssVar('--color-background'),
  };

  return editorTheme;
});

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
  (_g, s, a: string) => {
    s(editorValueAtom, {
      text: a,
      date: new Date().toISOString(),
    });
  },
);
export const colorAtom = atom((g) => {
  return async () => {
    // Create new EyeDropper
    try {
      // @ts-ignore -- EyeDropper is not in the types
      const eyeDropper = new EyeDropper();
      const { sRGBHex } = await eyeDropper.open();

      const color = colorUtils.convertColor(sRGBHex);
      const channel = Channel.GET_COLOR;

      const pid = g(pidAtom);
      const appMessage = {
        channel,
        pid: pid || 0,
        value: color,
      };

      ipcRenderer.send(channel, appMessage);
      return color;
    } catch (error) {}
    return '';
  };
});

const _chatMessagesAtom = atom<Partial<MessageType>[]>([]);
export const chatMessagesAtom = atom(
  (g) => g(_chatMessagesAtom),
  (g, s, a: Partial<MessageTypeWithIndex>[]) => {
    for (let i = 0; i < a.length; i++) {
      a[i].index = i;
    }

    s(_chatMessagesAtom, a);

    // Broadcast now handled by jotai-effect in chat/effect.
  },
);

export const chatMessageSubmitAtom = atom(null, (g, _s, a: { text: string; index: number }) => {
  const channel = g(channelAtom);
  channel(Channel.ON_SUBMIT, { text: a.text, index: a.index });
});

type MessageTypeWithIndex = MessageType & { index: number };

export const addChatMessageAtom = atom(null, (g, s, a: MessageType) => {
  const prev = g(chatMessagesAtom);
  const updated = [...prev, a];
  const index = updated.length - 1;
  (a as MessageTypeWithIndex).index = index;
  s(chatMessagesAtom, updated);
  ipcRenderer.send(Channel.CHAT_ADD_MESSAGE, { channel: Channel.CHAT_ADD_MESSAGE, value: a, pid: g(pidAtom) });
});

export const chatPushTokenAtom = atom(null, (g, s, a: string) => {
  const prev = g(chatMessagesAtom);
  const messages = [...prev];
  const index = messages.length - 1;
  // append the text from a to the text of the last message
  try {
    const lastMessage = messages[index] as MessageTypeWithIndex;
    lastMessage.text = (lastMessage.text + a).trim();
    lastMessage.index = index;

    s(chatMessagesAtom, messages);
    ipcRenderer.send(Channel.CHAT_PUSH_TOKEN, {
      channel: Channel.CHAT_PUSH_TOKEN,
      value: lastMessage,
      pid: g(pidAtom),
    });
  } catch (error) {
    s(chatMessagesAtom, []);
  }
});

export const setChatMessageAtom = atom(null, (g, s, a: { index: number; message: MessageType }) => {
  const prev = g(chatMessagesAtom);
  const messages = [...prev];
  // set message at index, allow for negative index
  const messageIndex = a.index < 0 ? messages.length + a.index : a.index;
  try {
    messages[messageIndex] = a.message;
    s(chatMessagesAtom, messages);

    (a.message as MessageTypeWithIndex).index = messageIndex;
    ipcRenderer.send(Channel.CHAT_SET_MESSAGE, {
      channel: Channel.CHAT_SET_MESSAGE,
      value: a.message,
      pid: g(pidAtom),
    });
  } catch (error) {}
});
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
  (_g, s, a: Partial<TermConfig> | null) => {
    const config = {
      ...termConfigDefaults,
      ...(a || {}),
    };
    s(termConfig, config);
  },
);

export const zoomAtom = atom(0);
export const hasBorderAtom = atom((g) => {
  return g(zoomAtom) === 0;
});

export const termExitAtom = atom(
  null,
  debounce(
    (g, s, a: string) => {
      log.info('🐲 Term exit from prompt', { a });
      const ui = g(uiAtom);
      const submitted = g(submittedAtom);
      const currentTermConfig = g(termConfigAtom);
      const currentPromptData = g(promptDataAtom);

      if (ui === UI.term && !submitted && currentTermConfig.promptId === currentPromptData.id) {
        log.info('🐲 Term exit and submit');
        s(submitValueAtom, g(termOutputAtom));
      }
    },
    100,
    {
      leading: true,
    },
  ),
);

export const scrollToAtom = atom<'top' | 'bottom' | 'center' | null>(null);

export const listAtom = atom<null | VariableSizeList>(null);

export const flagsListAtom = atom<null | VariableSizeList>(null);

export const webcamStreamAtom = atom<MediaStream | null>(null);
export const deviceIdAtom = atom<string | null>(null);

const enterPressed = atom(false);
export const enterPressedAtom = atom(
  (g) => g(enterPressed),
  (_g, s) => {
    s(enterPressed, true);
    setTimeout(() => {
      s(enterPressed, false);
    }, 100);
  },
);

const _micIdAtom = atom<string | null>(null);
export const micIdAtom = atom(
  (g) => g(_micIdAtom),
  (_g, s, a: string | null) => {
    log.info('🎙 micIdAtom', { a });
    s(_micIdAtom, a);
  },
);
export const webcamIdAtom = atom<string | null>(null);

export const actionsButtonNameFontSizeAtom = atom('text-sm');

export const buttonNameFontSizeAtom = atom((g) => {
  let fontSize = 'text-base';
  const itemHeight = g(itemHeightAtom);
  switch (itemHeight) {
    case PROMPT.ITEM.HEIGHT.XXS:
      fontSize = 'text-xxs';
      break;

    case PROMPT.ITEM.HEIGHT.XS:
      fontSize = 'text-xs';
      break;

    case PROMPT.ITEM.HEIGHT.SM:
      fontSize = 'text-sm';
      break;

    case PROMPT.ITEM.HEIGHT.BASE:
      fontSize = 'text-base';
      break;

    case PROMPT.ITEM.HEIGHT.LG:
      fontSize = 'text-lg';
      break;

    case PROMPT.ITEM.HEIGHT.XL:
      fontSize = 'text-xl';
      break;

    default:
      fontSize = 'text-base';
      break;
  }

  return fontSize;
});

export const actionsButtonDescriptionFontSizeAtom = atom('text-xs');

export const buttonDescriptionFontSizeAtom = atom((g) => {
  const itemHeight = g(itemHeightAtom);
  let fontSize = 'text-xs';
  switch (itemHeight) {
    case PROMPT.ITEM.HEIGHT.XXS:
      fontSize = 'text-xxs';
      break;

    case PROMPT.ITEM.HEIGHT.XS:
      fontSize = 'text-xxs';
      break;

    case PROMPT.ITEM.HEIGHT.SM:
      fontSize = 'text-xs';
      break;

    case PROMPT.ITEM.HEIGHT.BASE:
      fontSize = 'text-xs';
      break;

    case PROMPT.ITEM.HEIGHT.LG:
      fontSize = 'text-sm';
      break;

    case PROMPT.ITEM.HEIGHT.XL:
      fontSize = 'text-base';
      break;

    default:
      fontSize = 'text-xs';
      break;
  }

  return fontSize;
});

export const actionsInputFontSizeAtom = atom('text-lg');

export const inputFontSizeAtom = atom((g) => {
  let fontSize = 'text-2xl';
  const inputHeight = g(inputHeightAtom);
  switch (inputHeight) {
    case PROMPT.INPUT.HEIGHT.XXS:
      fontSize = 'text-sm';
      break;

    case PROMPT.INPUT.HEIGHT.XS:
      fontSize = 'text-base';
      break;

    case PROMPT.INPUT.HEIGHT.SM:
      fontSize = 'text-xl';
      break;

    case PROMPT.INPUT.HEIGHT.BASE:
      fontSize = 'text-2xl';
      break;

    case PROMPT.INPUT.HEIGHT.LG:
      fontSize = 'text-3xl';
      break;

    case PROMPT.INPUT.HEIGHT.XL:
      fontSize = 'text-4xl';
      break;

    default:
      fontSize = 'text-2xl';
      break;
  }

  return fontSize;
});

export const listProcessesActionAtom = atom((g) => {
  const shortcuts = g(shortcutsAtom);
  const action = shortcuts.find((s) => s?.key?.endsWith('p'));
  return action;
});

export const signInActionAtom = atom((g) => {
  const actions = g(actionsAtom);
  const flags = g(flagsAtom);
  const shortcuts = g(shortcutsAtom);
  // log.info(`actions`, { actions });
  const action = actions.find((s) => s?.flag === 'sign-in-to-script-kit');
  return action;
});

export const actionsAtom = atom((g) => {
  const flags = g(flagsAtom);
  const shortcuts = g(shortcutsAtom);
  const disabled = g(flaggedChoiceValueAtom);
  return Object.entries(flags)
    .map(([key, flag]) => {
      const action = {
        key: flag?.key || flag?.shortcut,
        value: key,
        name: flag?.name,
        shortcut: formatShortcut(flag?.shortcut),
        position: flag.bar,
        arrow: (flag as Action)?.arrow,
        flag: key,
        disabled: Boolean(disabled),
        visible: Boolean(flag?.visible),
      } as Action;

      return action;
    })
    .concat(
      shortcuts
        .filter((s) => s?.bar)
        .map(({ key, name, bar, flag, visible }) => {
          return {
            key,
            name,
            value: key,
            shortcut: formatShortcut(key),
            position: bar,
            flag,
            disabled: Boolean(disabled),
            visible: Boolean(visible),
          } as Action;
        }),
    );
});

export const miniShortcutsHoveredAtom = atom(false);
export const _lastKeyDownWasModifierAtom = atom(false);
export const lastKeyDownWasModifierAtom = atom(
  (g) => g(_lastKeyDownWasModifierAtom),
  (_g, s, a: boolean) => {
    // log.info(`🔑 Last key down was modifier: ${a}`);
    s(_lastKeyDownWasModifierAtom, a);
  },
);

export const miniShortcutsVisibleAtom = atom((g) => {
  return false;
  const ms = g(_modifiers).filter((m) => !m.toLowerCase().includes('shift'));
  const justOpened = g(justOpenedAtom);
  const flagValue = g(flaggedChoiceValueAtom);

  return (!justOpened && ms.length > 0 && g(lastKeyDownWasModifierAtom) && !flagValue) || g(miniShortcutsHoveredAtom);
});

export const socialAtom = atom((g) => {
  if (g(scriptAtom)?.twitter) {
    const twitter = g(scriptAtom)?.twitter;
    const username = twitter?.startsWith('@') ? twitter.slice(1) : twitter;

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
  filePath: '',
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

  const isLightened = theme['--color-secondary'] === 'lighten' || temporaryTheme['--color-secondary'] === 'lighten';

  return isLightened;
});

const promptBoundsDefault = {
  id: '',
  width: 0,
  height: 0,
  x: 0,
  y: 0,
};

const _promptBoundsAtom = atom(promptBoundsDefault);
export const promptBoundsAtom = atom(
  (g) => {
    const bounds = g(_promptBoundsAtom);
    return bounds;
  },
  (
    _g,
    s,
    a: {
      id: string;
      width: number;
      height: number;
      x: number;
      y: number;
      human?: boolean;
    },
  ) => {
    if (a?.human) {
      log.info(`😙 Prompt resized by human: ${a.width}x${a.height}`);
      s(promptResizedByHumanAtom, true);
    }
    s(_promptBoundsAtom, a);
  },
);

export const audioDotAtom = atom(false);

export const isScrollingAtom = atom(false);
export const isFlagsScrollingAtom = atom(false);

export const scoredFlags = atom([] as ScoredChoice[]);
export const scoredFlagsAtom = atom(
  (g) => {
    if (!g(hasActionsAtom)) {
      return [];
    }
    return g(scoredFlags);
  },
  (g, s, a: ScoredChoice[]) => {
    // log.info(`🇺🇸 Setting scored flags: ${Object.keys(a?.map((c) => c?.item?.name))}`);

    // Batch all atom updates to prevent multiple re-renders
    unstable_batchedUpdates(() => {
      s(scoredFlags, a);
      s(flagsIndexAtom, 0);

      // if the first cs has a `border-t-1`, remove it
      if (a?.[0]?.item?.className) {
        a[0].item.className = a?.[0]?.item?.className.replace('border-t-1', '');
      }

      const defaultActionId = g(defaultActionsIdAtom);
      if (defaultActionId) {
        const defaultActionIndex = a.findIndex((c) => c?.item?.id === defaultActionId);
        s(flagsIndexAtom, defaultActionIndex || 0);
      }

      // Defer height calculation to avoid blocking the UI
      requestAnimationFrame(() => {
        let choicesHeight = 0;
        const itemHeight = g(actionsItemHeightAtom);

        for (const {
          item: { height },
        } of a) {
          choicesHeight += height || itemHeight;
          if (choicesHeight > 1920) {
            choicesHeight = 1920;
            break;
          }
        }

        s(flagsHeightAtom, choicesHeight);
      });
    });
  },
);

export const previewCheckAtom = atom((g) => {
  const previewHTML = g(previewHTMLAtom);
  const enabled = g(previewEnabledAtom);
  const hidden = g(isHiddenAtom);
  return Boolean(previewHTML && enabled && !hidden);
});

export const shortcodesAtom = atom<string[]>([]);

export const triggerKeywordAtom = atom(
  (_g) => {},
  (
    g,
    _s,
    {
      keyword,
      choice,
    }: {
      keyword: string;
      choice: Choice;
    },
  ) => {
    const channel = g(channelAtom);

    channel(Channel.KEYWORD_TRIGGERED, {
      keyword,
      focused: choice,
      value: choice?.value,
    });
  },
);

export const hasRightShortcutAtom = atom((g) => {
  const hasRight = g(shortcutsAtom).find((s) => s?.key === 'right');
  return hasRight;
});

export const typingAtom = atom<boolean>(false);

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

const _currentChoiceHeights = atom<number[]>([]);
export const currentChoiceHeightsAtom = atom(
  (g) => g(_currentChoiceHeights),
  (g, s, a: ScoredChoice[]) => {
    // compare heights of each choice to previous heights
    const previousChoiceHeights = g(_currentChoiceHeights);
    const itemHeight = g(itemHeightAtom);
    const currentChoiceHeights = a?.map((c) => c?.item?.height || itemHeight);

    if (isEqual(previousChoiceHeights, currentChoiceHeights)) {
      return;
    }
    s(_currentChoiceHeights, currentChoiceHeights);
  },
);

const pauseChannelAtom = atom(false);

export const cachedAtom = atom(false);

export const resetIdAtom = atom(Math.random());

const cachedMainScoredChoices = atom<ScoredChoice[]>([]);
export const cachedMainScoredChoicesAtom = atom(
  (g) => g(cachedMainScoredChoices),
  (_g, s, a: ScoredChoice[]) => {
    // log.info(
    //   `>>>>>>>>>>>>>>>>>>>>>>>> 📦 Cache main scored choices: ${a?.length}`
    // );
    s(cachedMainScoredChoices, a);
  },
);

export const cachedMainPromptDataAtom = atom<Partial<PromptData>>({
  ui: UI.arg,
  input: '',
  footerClassName: 'hidden',
  headerClassName: 'hidden',
  placeholder: 'Script Kit',
  enter: 'Run',
});
export const cachedMainShortcutsAtom = atom<Shortcut[]>([]);
export const cachedMainPreviewAtom = atom<string>('');
export const cachedMainFlagsAtom = atom<FlagsObject>({});

export const shouldActionButtonShowOnInputAtom = atom((g) => {
  const hasFlags = Object.keys(g(flagsAtom)).length > 0;
  const hasRightShortcut = g(hasRightShortcutAtom);

  return hasFlags && !hasRightShortcut;
});

const _micStreamEnabledAtom = atom(false);
export const micStreamEnabledAtom = atom(
  (g) => g(_micStreamEnabledAtom),
  (_g, s, a: boolean) => {
    s(_micStreamEnabledAtom, a);
  },
);

export const progressAtom = atom(0);
export const beforeInputAtom = atom('');
export const cssAtom = atom('');

export const initPromptAtom = atom(null, (g, s) => {
  log.info(`${window.pid}: 🚀 Init prompt`);
  const promptData = g(cachedMainPromptDataAtom) as PromptData;
  // log.info({ promptData });
  const currentPromptData = g(promptDataAtom);
  if (currentPromptData?.id) {
    log.info(`🚪 Init prompt skipped. Already initialized as ${currentPromptData?.id}`);
    return;
  }
  s(promptDataAtom, promptData);
  const scoredChoices = g(cachedMainScoredChoicesAtom);
  log.info(
    `${window.pid}: scoredChoices`,
    scoredChoices.slice(0, 2).map((c) => c.item.name),
  );
  s(scoredChoicesAtom, scoredChoices);

  s(previewHTMLAtom, g(cachedMainPreviewAtom));
  s(shortcutsAtom, g(cachedMainShortcutsAtom));
  s(flagsAtom, g(cachedMainFlagsAtom));
});

export const clearCacheAtom = atom(null, (_g, s) => {
  // log.info(
  //   `${window.pid}--> 📦 CLEARING renderer cache for ${g(scriptAtom).filePath}`
  // );
  s(cachedMainPromptDataAtom, {});
  s(cachedMainScoredChoicesAtom, []);
  s(cachedMainPreviewAtom, '');
  s(cachedMainShortcutsAtom, []);
  s(cachedMainFlagsAtom, {});
  s(promptDataAtom, {} as PromptData);
  s(scoredChoicesAtom, []);
  s(promptBoundsAtom, promptBoundsDefault);
});

export const mainElementIdAtom = atom<string>('');
export const kitConfigAtom = atom({
  kitPath: '',
  mainScriptPath: '',
});

export const focusedElementAtom = atom<null | HTMLElement>(null);

export const preventChatScrollAtom = atom(false);

const _inputWhileSubmittedAtom = atom('');
export const inputWhileSubmittedAtom = atom(
  (g) => g(_inputWhileSubmittedAtom),
  (_g, s, a: string) => {
    log.info(`🔥 Input while submitted: ${a}`);
    s(_inputWhileSubmittedAtom, a);
  },
);

export const micMediaRecorderAtom = atom<MediaRecorder | null>(null);
export const micStateAtom = atom<'idle' | 'recording' | 'stopped'>('idle');

export const shortcutStringsAtom: Atom<
  Set<{
    type: 'shortcut' | 'action' | 'flag';
    value: string;
  }>
> = atom((g) => {
  const shortcuts = g(shortcutsAtom);
  const actions = g(actionsAtom);
  const flags = g(flagsAtom);

  const actionsThatArentShortcuts = actions.filter((a) => !shortcuts.find((s) => s.key === a.key));

  const shortcutKeys = dataUtils.transformKeys(shortcuts, 'key', 'shortcut');
  const actionKeys = dataUtils.transformKeys(actionsThatArentShortcuts, 'key', 'action');
  const flagKeys = dataUtils.transformKeys(Object.values(flags), 'shortcut', 'flag');

  // log.info('shortcutStringsAtom', {
  //   shortcuts: shortcutKeys,
  //   actions: actionKeys,
  //   flags: flagKeys,
  // });
  const shortcutStrings = new Set([...shortcutKeys, ...actionKeys, ...flagKeys]);
  // log.info(`🔥 Shortcut strings: `, Array.from(shortcutStrings));
  return shortcutStrings;
});

export const submitInputAtom = atom(null, (g, s) => {
  const input = g(inputAtom);
  s(submitValueAtom, input);
});

export const setFlagByShortcutAtom = atom(null, (g, s, a: string) => {
  const flags = g(flagsAtom);
  const flag = Object.keys(flags).find((key) => flags[key]?.shortcut === a);
  log.info(`🏴‍☠️ Setting flag by shortcut: ${flag}`);
  if (flag) {
    s(flaggedChoiceValueAtom, flag);
    s(focusedFlagValueAtom, flag);
  }
});

const _choiceInputsAtom = atom<string[]>([]);
export const choiceInputsAtom = atom(
  (g) => g(_choiceInputsAtom),
  (_g, s, a: string[]) => {
    s(_choiceInputsAtom, a);
  },
);

const _invalidateChoiceInputsAtom = atom(false);
export const invalidateChoiceInputsAtom = atom(
  (g) => g(_invalidateChoiceInputsAtom),
  (_g, s, a: boolean) => {
    log.info(`🔄 Invalidate choice inputs: ${a ? 'true' : 'false'}`);
    s(_invalidateChoiceInputsAtom, a);
  },
);

export const sendActionAtom = atom(null, (g, _s, action: Action) => {
  const channel = g(channelAtom);
  log.info(`👉 Sending action: ${action.name}`);
  channel(Channel.ACTION, {
    action,
  });
});

export const actionsPlaceholderAtom = atom((g) => {
  const hasActions = g(hasActionsAtom);
  return hasActions ? 'Actions' : 'No Actions Available';
});

const _actionsConfigAtom = atom<ActionsConfig>({});
export const actionsConfigAtom = atom(
  (g) => {
    return {
      name: g(_actionsConfigAtom)?.name || g(focusedChoiceAtom)?.name || '',
      placeholder: g(_actionsConfigAtom)?.placeholder || g(actionsPlaceholderAtom),
      active: g(_actionsConfigAtom)?.active || '',
    };
  },
  (g, s, a: ActionsConfig) => {
    s(_actionsConfigAtom, { ...g(_actionsConfigAtom), ...a });
  },
);

const _termOutputAtom = atom('');
export const termOutputAtom = atom(
  (g) => g(_termOutputAtom),
  (g, s, a: string) => {
    s(_termOutputAtom, g(_termOutputAtom) + a);
  },
);

export const gridReadyAtom = atom(false);

const _isWindowAtom = atom(false);
export const isWindowAtom = atom(
  (g) => g(_isWindowAtom),
  (g, s, a: boolean) => {
    if (a) {
      // TODO: Extract to App.tsx with constant windowPadding. Was having issues resizing with this in place.
      const body = document.body;
      body.style.paddingTop = '24px';
      resize(g, s, 'window');
    } else {
      document.body.style.paddingTop = '';
    }
    s(_isWindowAtom, a);
  },
);
