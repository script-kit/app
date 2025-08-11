/// <reference path="./env.d.ts" />

/**
 * Central Jotai state management file.
 * This file now imports modularized atoms and provides complex wiring logic.
 * Goal: Keep this file under 1000 lines by delegating to modular atoms.
 */

// =================================================================================================
// IMPORTS
// =================================================================================================

import { Channel, Mode, PROMPT, UI } from '@johnlindquist/kit/core/enum';
import type {
  Action,
  AppState,
  Choice,
  FlagsWithKeys,
  PromptData,
  Script,
} from '@johnlindquist/kit/types/core';
import type {
  AppMessage,
} from '@johnlindquist/kit/types/kitapp';
import { type Getter, type Setter, atom } from 'jotai';
import { debounce, throttle } from 'lodash-es';
import { unstable_batchedUpdates } from 'react-dom';

// Import all modularized atoms
export * from './state/atoms';

// Import specific atoms we need to wire
import {
  _open,
  _script,
  _inputAtom,
  _inputChangedAtom,
  _flaggedValue,
  _panelHTML,
  _previewHTML,
  _tabIndex,
  _focused,
  _modifiers,
  _lastKeyDownWasModifierAtom,
  _actionsInputAtom,
  _termOutputAtom,
  _chatMessagesAtom,
  _miniShortcutsHoveredAtom,
  _submitValue,
  _indexAtom,
  cachedMainScoredChoicesAtom,
  cachedMainPromptDataAtom,
  cachedMainPreviewAtom,
  cachedMainShortcutsAtom,
  cachedMainFlagsAtom,
  promptData,
  promptReadyAtom,
  choicesReadyAtom,
  choicesConfig,
  prevChoicesConfig,
  choices,
  prevScoredChoicesIdsAtom,
  choicesAtom,
  selectedChoicesAtom,
  flagsAtom,
  scoredFlags,
  flagsIndex,
  focusedFlagValueAtom,
  focusedActionAtom,
  shortcutsAtom,
  _ui,
  modeAtom,
  enterAtom,
  nameAtom,
  descriptionAtom,
  tabsAtom,
  previewHTMLAtom,
  panelHTMLAtom,
  formHTMLAtom,
  logHTMLAtom,
  logLinesAtom,
  termConfigAtom,
  editorConfigAtom,
  editorCursorPosAtom,
  editorHistory,
  webcamStreamAtom,
  pidAtom,
  processingAtom,
  runningAtom,
  submittedAtom,
  loadingAtom,
  progressAtom,
  isHiddenAtom,
  promptActiveAtom,
  mouseEnabledAtom,
  resizeCompleteAtom,
  audioDotAtom,
  disableSubmitAtom,
  pauseChannelAtom,
  kitConfigAtom,
  appConfigAtom,
  themeAtom,
  tempThemeAtom,
  itemHeightAtom,
  inputHeightAtom,
  _mainHeight,
  choicesHeightAtom,
  flagsHeightAtom,
  actionsItemHeightAtom,
  gridReadyAtom,
  listAtom,
  flagsListAtom,
  scrollToIndexAtom,
  requiresScrollAtom,
  promptBoundsAtom,
  isWindowAtom,
  justOpenedAtom,
  isSplashAtom,
  isMainScriptAtom,
  defaultChoiceIdAtom,
  defaultValueAtom,
  prevIndexAtom,
  directionAtom,
  hasSkipAtom,
  allSkipAtom,
  actionsInputAtom,
  inputFocusAtom,
  hintAtom,
  placeholderAtom,
  selectedAtom,
  tabChangedAtom,
  inputWhileSubmittedAtom,
  lastKeyDownWasModifierAtom,
  enterLastPressedAtom,
  closedInput,
  lastScriptClosed,
  logoAtom,
  preloadedAtom,
  backToMainAtom,
  choiceInputsAtom,
  editorAppendAtom,
  editorHistoryPush,
  termOutputAtom,
  formDataAtom,
  footerAtom,
  containerClassNameAtom,
  headerHiddenAtom,
  footerHiddenAtom,
  actionsConfigAtom,
  onInputSubmitAtom,
  defaultActionsIdAtom,
  hasRightShortcutAtom,
  previewEnabledAtom,
  previewCheckAtom,
  promptResizedByHumanAtom,
  scrollToItemAtom,
  flagsRequiresScrollAtom,
  currentChoiceHeightsAtom,
  prevMh,
  cachedAtom,
} from './state/atoms';


// Shared imports
import { DEFAULT_HEIGHT, closedDiv, noChoice } from '../../shared/defaults';
import { AppChannel } from '../../shared/enums';
import type { ResizeData, ScoredChoice, TermConfig as SharedTermConfig } from '../../shared/types';
import { formatShortcut } from './components/formatters';
import { createLogger } from './log-utils';
import { arraysEqual, colorUtils, dataUtils, domUtils } from './utils/state-utils';
import { removeTopBorderOnFirstItem, calcVirtualListHeight } from './state/utils';
import { advanceIndexSkipping } from './state/skip-nav';
import { computeResize } from './state/resize/compute';
import {
  SCROLL_THROTTLE_MS,
  PREVIEW_THROTTLE_MS,
  RESIZE_DEBOUNCE_MS,
  SEND_RESIZE_DEBOUNCE_MS,
  JUST_OPENED_MS,
  PROCESSING_SPINNER_DELAY_MS,
  MAX_VLIST_HEIGHT,
  MAX_TABCHECK_ATTEMPTS,
} from './state/constants';
import {
  ID_HEADER,
  ID_FOOTER,
  ID_MAIN,
  ID_LIST,
  ID_PANEL,
  ID_WEBCAM,
  ID_LOG,
} from './state/dom-ids';

const { ipcRenderer } = window.electron;
const log = createLogger('jotai.ts');

// =================================================================================================
// COMPLEX WIRING LOGIC
// This section contains the complex atom wiring that couldn't be easily extracted
// =================================================================================================

let placeholderTimeoutId: NodeJS.Timeout;
let choicesPreloaded = false;
let wereChoicesPreloaded = false;
let wasPromptDataPreloaded = false;
let prevFocusedChoiceId = 'prevFocusedChoiceId';
let prevChoiceIndexId = 'prevChoiceIndexId';
let prevTopHeight = 0;

// --- Open/Close Lifecycle with Reset ---
export const openAtom = atom(
  (g) => g(_open),
  (g, s, a: boolean) => {
    if (g(_open) === a) return;

    s(mouseEnabledAtom, 0);

    if (g(_open) && a === false) {
      // Reset prompt state on close
      s(resizeCompleteAtom, false);
      s(lastScriptClosed, g(_script).filePath);
      s(closedInput, g(_inputAtom));
      s(_panelHTML, '');
      s(formHTMLAtom, '');
      s(logHTMLAtom, '');
      s(flagsAtom, {});
      s(_flaggedValue, '');
      s(loadingAtom, false);
      s(progressAtom, 0);
      s(editorConfigAtom, {});
      s(promptDataAtom, null);
      s(requiresScrollAtom, -1);
      s(pidAtom, 0);
      s(_chatMessagesAtom, []);
      s(runningAtom, false);
      s(_miniShortcutsHoveredAtom, false);
      s(logLinesAtom, []);
      s(audioDotAtom, false);
      s(disableSubmitAtom, false);
      g(scrollToIndexAtom)(0);
      s(termConfigAtom, {});

      // Cleanup media streams
      const stream = g(webcamStreamAtom);
      if (stream && 'getTracks' in stream) {
        (stream as MediaStream).getTracks().forEach((track) => track.stop());
        s(webcamStreamAtom, null);
        const webcamEl = document.getElementById(ID_WEBCAM) as HTMLVideoElement;
        if (webcamEl) {
          webcamEl.srcObject = null;
        }
      }
    }
    s(_open, a);
  },
);

export const exitAtom = atom(
  (g) => g(openAtom),
  (g, s, pid: number) => {
    if (g(pidAtom) === pid) {
      s(openAtom, false);
    }
  },
);

// --- Script Atom with Complex Logic ---
export const scriptAtom = atom(
  (g) => g(_script),
  (g, s, a: Script) => {
    s(lastKeyDownWasModifierAtom, false);

    const mainScriptPath = g(kitConfigAtom).mainScriptPath;
    const isMainScript = a?.filePath === mainScriptPath;
    const prevScript = g(_script);

    s(isMainScriptAtom, isMainScript);
    s(backToMainAtom, prevScript?.filePath !== mainScriptPath && isMainScript);
    s(promptReadyAtom, false);

    if (!isMainScript) {
      s(choicesConfigAtom, { preload: false });
      const preloaded = g(preloadedAtom);
      log.info(`${g(pidAtom)}: Preloaded? ${preloaded ? 'YES' : 'NO'}`);

      if (!preloaded) {
        s(_previewHTML, '');
      }
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
    s(tempThemeAtom, g(themeAtom));
  },
);

// --- PromptData Atom with Complex State Management ---
export const promptDataAtom = atom(
  (g) => g(promptData),
  (g, s, a: null | PromptData) => {
    if (!a) {
      s(promptData, null);
      return;
    }

    s(choicesReadyAtom, false);
    const pid = g(pidAtom);
    s(gridReadyAtom, false);

    const isMainScript = a.scriptPath === g(kitConfigAtom).mainScriptPath;
    s(isMainScriptAtom, isMainScript);

    if (isMainScript && !a.preload && g(tabIndexAtom) === 0) {
      s(cachedMainPromptDataAtom, a);
    }

    if (a.ui !== UI.arg && !a.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    s(isHiddenAtom, false);
    const prevPromptData = g(promptData);

    wasPromptDataPreloaded = Boolean(prevPromptData?.preload && !a.preload);
    log.info(
      `${pid}: 👀 Preloaded: ${a.scriptPath} ${wasPromptDataPreloaded} Keyword: ${a.keyword}`,
    );

    if (!prevPromptData && a) {
      s(justOpenedAtom, true);
      setTimeout(() => s(justOpenedAtom, false), JUST_OPENED_MS);
    } else {
      s(justOpenedAtom, false);
    }

    if (prevPromptData?.ui === UI.editor && g(_inputChangedAtom)) {
      s(editorHistoryPush, g(closedInput));
    }

    s(_inputChangedAtom, false);

    if (a.ui !== UI.arg) {
      s(focusedChoiceAtom, noChoice);
    }
    s(uiAtom, a.ui);
    s(_open, true);
    s(submittedAtom, false);

    // Clear loading timeout when new prompt opens
    if (placeholderTimeoutId) {
      clearTimeout(placeholderTimeoutId);
      s(loadingAtom, false);
      s(processingAtom, false);
    }

    if (a.ui === UI.term) {
      const b: any = a;
      const config: SharedTermConfig = {
        promptId: a.id,
        command: b?.input || '',
        cwd: b?.cwd || '',
        env: b?.env || {},
        shell: b?.shell,
        args: b?.args || [],
        closeOnExit: typeof b?.closeOnExit !== 'undefined' ? b.closeOnExit : true,
        pid: g(pidAtom),
      };
      s(termConfigAtom, config);
    }

    if (!(a.keyword || (g(isMainScriptAtom) && a.ui === UI.arg))) {
      const inputWhileSubmitted = g(inputWhileSubmittedAtom);
      const forceInput = a.input || inputWhileSubmitted || '';
      log.info(`${pid}: 👂 Force input due to keyword or mainScript`);

      const prevInput = g(_inputAtom);
      const prevInputHasSlash = prevInput.includes('/') || prevInput.includes('\\');

      if (forceInput && (!prevInput.startsWith(forceInput) || prevInputHasSlash)) {
        s(_inputAtom, forceInput);
      } else if (!forceInput) {
        s(_inputAtom, forceInput);
      }
    }

    s(inputWhileSubmittedAtom, '');
    s(_flaggedValue, '');
    s(hintAtom, a.hint);
    s(placeholderAtom, a.placeholder);
    s(selectedAtom, a.selected);
    s(tabsAtom, a.tabs);
    s(processingAtom, false);
    s(focusedFlagValueAtom, '');
    s(flagsAtom, a.flags || {});
    s(choiceInputsAtom, []);

    s(headerHiddenAtom, !!a.headerClassName?.includes('hidden'));
    s(footerHiddenAtom, !!a.footerClassName?.includes('hidden'));
    s(containerClassNameAtom, a.containerClassName || '');

    const script = g(scriptAtom);
    const promptDescription = a.description || (a.name ? '' : script?.description || '');
    const promptName = a.name || script?.name || '';
    s(descriptionAtom, promptDescription || promptName);
    s(nameAtom, promptDescription ? promptName : promptDescription);

    if (!a.keepPreview && a.preview) {
      s(previewHTMLAtom, a.preview);
    }

    // Match main branch behavior exactly - only set panel if a.panel exists
    if (a.panel) {
      s(panelHTMLAtom, a.panel);
    }

    if (typeof a.footer === 'string') {
      s(footerAtom, a.footer);
    }
    s(defaultChoiceIdAtom, a.defaultChoiceId || '');
    s(defaultValueAtom, a.defaultValue || '');

    if (a.html) {
      s(formHTMLAtom, domUtils.ensureFormHasSubmit(a.html));
    }
    if (a.formData) {
      s(formDataAtom, a.formData);
    }

    s(itemHeightAtom, a.itemHeight || PROMPT.ITEM.HEIGHT.SM);
    s(inputHeightAtom, a.inputHeight || PROMPT.INPUT.HEIGHT.SM);

    s(onInputSubmitAtom, a.shortcodes || {});
    s(shortcutsAtom, a.shortcuts || []);
    s(actionsConfigAtom, a.actionsConfig || {});

    s(prevChoicesConfig, { preload: false });
    s(audioDotAtom, false);

    if (a.choicesType === 'async') {
      s(loadingAtom, true);
    }

    if (typeof a.enter === 'string') {
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
      messageId: (a as any).messageId,
      ui: a.ui,
    });

    s(promptReadyAtom, true);
    s(promptActiveAtom, true);
    s(tabChangedAtom, false);
    s(actionsInputAtom, '');
    s(_termOutputAtom, '');
  },
);

// --- Input Atom with Complex Logic ---
export const inputAtom = atom(
  (g) => g(_inputAtom),
  async (g, s, a: string) => {
    s(directionAtom, 1);
    const selected = g(showSelectedAtom);
    const prevInput = g(_inputAtom);

    if (prevInput && a === '') {
      s(selected ? flagsIndexAtom : indexAtom, 0);
    }

    if (a !== prevInput) {
      s(_inputChangedAtom, true);
    } else {
      s(tabChangedAtom, false);
      return;
    }

    s(_inputAtom, a);

    if (!g(submittedAtom)) {
      const channel = g(channelAtom);
      channel(Channel.INPUT);
    }

    s(mouseEnabledAtom, 0);

    if (selected) {
      s(selected ? flagsIndexAtom : indexAtom, 0);
    }

    const mode = g(modeAtom);
    const flaggedValue = g(flaggedChoiceValueAtom);

    if (g(tabChangedAtom) && a && prevInput !== a) {
      s(tabChangedAtom, false);
      return;
    }

    if (mode === Mode.GENERATE && !flaggedValue) {
      s(loadingAtom, true);
    }

    if (g(_inputChangedAtom) && a === '') {
      resize(g, s, 'INPUT_CLEARED');
    }
  },
);

// --- Choices Configuration ---
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
      s(indexAtom, nextIndex > 0 ? nextIndex : 0);
    }
  },
);

// --- Tab Index ---
let sendTabChanged: () => void;
const getSendTabChanged = (g: Getter) =>
  debounce(
    () => {
      const channel = g(channelAtom);
      channel(Channel.TAB_CHANGED);
    },
    100,
    { leading: true, trailing: true },
  );

export const tabIndexAtom = atom(
  (g) => g(_tabIndex),
  (g, s, a: number) => {
    s(_inputChangedAtom, false);
    s(prevIndexAtom, 0);

    if (g(_tabIndex) !== a) {
      s(_tabIndex, a);
      s(flagsAtom, {});
      s(_flaggedValue, '');

      sendTabChanged = sendTabChanged || getSendTabChanged(g);
      sendTabChanged();

      s(tabChangedAtom, true);
    }
  },
);

// --- UI Atom ---
export const uiAtom = atom(
  (g) => g(_ui),
  (g, s, a: UI) => {
    s(_ui, a);

    if ([UI.arg, UI.textarea, UI.hotkey, UI.splash].includes(a)) {
      s(inputFocusAtom, Math.random());
    }

    if ([UI.splash, UI.term, UI.editor, UI.hotkey].includes(a)) {
      s(enterAtom, '');
    }

    if (a !== UI.arg && g(scoredChoicesAtom)?.length > 0) {
      s(scoredChoicesAtom, []);
    }

    // Side effects moved to UIController
    // The UIController now handles:
    // - Checking for DOM element availability  
    // - Sending IPC messages when UI changes
  },
);

// --- Scored Choices with Complex Logic ---
export const scoredChoicesAtom = atom(
  (g) => g(choices),
  (g, s, cs: ScoredChoice[] = []) => {
    s(choicesReadyAtom, true);
    s(cachedAtom, false);
    s(loadingAtom, false);
    prevFocusedChoiceId = 'prevFocusedChoiceId';

    const csIds = cs.map((c) => c.item.id) as string[];
    const prevIds = g(prevScoredChoicesIdsAtom);
    const changed = !arraysEqual(prevIds, csIds);
    s(prevScoredChoicesIdsAtom, csIds);

    removeTopBorderOnFirstItem(cs);

    s(choices, cs || []);
    s(currentChoiceHeightsAtom, cs || []);

    if (g(promptData)?.grid) {
      s(gridReadyAtom, true);
    }

    let hasSkip = false;
    let allSkip = cs.length > 0;
    let allInfo = cs.length > 0;
    let allSkipOrInfo = cs.length > 0;

    for (const c of cs) {
      const isSkipped = c?.item?.skip;
      const isInfo = c?.item?.info;
      if (isSkipped) hasSkip = true;
      if (!isSkipped) allSkip = false;
      if (!isInfo) allInfo = false;
      if (!(isSkipped || isInfo)) allSkipOrInfo = false;

      if (hasSkip && !allSkip && !allInfo && !allSkipOrInfo) break;
    }

    s(hasSkipAtom, hasSkip);
    s(allSkipAtom, allSkip);

    if (changed) {
      s(indexAtom, 0);
    }

    const isFilter = g(uiAtom) === UI.arg && g(promptData)?.mode === Mode.FILTER;
    const channel = g(channelAtom);
    const hasActionableChoices = !allSkipOrInfo && cs.length > 0;

    if (hasActionableChoices) {
      s(panelHTMLAtom, '');

      const defaultValue: any = g(defaultValueAtom);
      const defaultChoiceId = g(defaultChoiceIdAtom);
      const prevIndex = g(prevIndexAtom);
      const input = g(inputAtom);

      if (defaultValue || defaultChoiceId) {
        const i = cs.findIndex(
          (c) => c.item?.id === defaultChoiceId || c.item?.value === defaultValue || c.item?.name === defaultValue,
        );

        if (i !== -1) {
          const foundChoice = cs[i].item;
          if (foundChoice?.id) {
            s(indexAtom, i);
            s(focusedChoiceAtom, foundChoice);
            s(requiresScrollAtom, i);
          }
        }
        s(defaultValueAtom, '');
        s(defaultChoiceIdAtom, '');
      } else if (input.length > 0) {
        s(requiresScrollAtom, g(requiresScrollAtom) > 0 ? 0 : -1);
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
      if (isFilter && Boolean(cs) && g(promptReadyAtom)) {
        channel(Channel.NO_CHOICES);
      }
    }

    const itemHeight = g(itemHeightAtom);
    const choicesHeight = calcVirtualListHeight(cs as any, itemHeight, MAX_VLIST_HEIGHT);

    s(choicesHeightAtom, choicesHeight);

    // Adjust main height based on UI mode
    const ui = g(uiAtom);
    if (ui === UI.arg) {
      s(mainHeightAtom, choicesHeight);
    } else {
      s(mainHeightAtom, DEFAULT_HEIGHT);
    }
  },
);

// --- Index Atom with Skip Logic ---
export const indexAtom = atom(
  (g) => g(_indexAtom),
  (g, s, a: number) => {
    if (g(flaggedChoiceValueAtom) || g(submittedAtom)) return;

    const cs = g(choices);
    if (cs.length === 0) {
      s(_indexAtom, 0);
      return;
    }

    const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a;

    const list = g(listAtom);
    const requiresScroll = g(requiresScrollAtom);
    const direction = g(directionAtom);

    let calcIndex = clampedIndex;
    let choice = cs?.[calcIndex]?.item;

    if (choice?.id === prevChoiceIndexId) return;

    if (g(allSkipAtom)) {
      s(focusedChoiceAtom, noChoice);
      if (!g(promptDataAtom)?.preview) {
        s(previewHTMLAtom, closedDiv);
      }
      return;
    }

    if (choice?.skip) {
      calcIndex = advanceIndexSkipping(clampedIndex, direction, cs as any);
      choice = cs[calcIndex]?.item;
    }

    prevChoiceIndexId = choice?.id || 'prevChoiceIndexId';

    if (g(_indexAtom) !== calcIndex) {
      s(_indexAtom, calcIndex);
    }

    const gridReady = g(gridReadyAtom);
    if (list && !gridReady) {
      if (cs[0]?.item?.skip && calcIndex === 1) {
        s(scrollToItemAtom, { index: 0, reason: 'indexAtom - skip adjustment' });
      } else if (requiresScroll === -1) {
        s(scrollToItemAtom, { index: calcIndex, reason: 'indexAtom - requiresScroll === -1' });
      }
    }

    const id = choice?.id;
    if (id) {
      s(focusedChoiceAtom, choice);
      if (typeof choice?.preview === 'string') {
        s(previewHTMLAtom, choice?.preview);
      }
    }
  },
);

// --- Focused Choice with Throttling ---
// Throttled focus logic moved to ChoicesController
// The controller handles:
// - Throttling focus changes
// - Updating preview HTML
// - Sending IPC messages
// - Managing prevFocusedChoiceId

export const focusedChoiceAtom = atom(
  (g) => g(_focused),
  (g, s, choice: Choice) => {
    // Simple setter - side effects handled by ChoicesController
    s(_focused, choice || noChoice);
  }
);

// --- Flagged Choice Value ---
export const flaggedChoiceValueAtom = atom(
  (g) => g(_flaggedValue),
  (g, s, a: any) => {
    const currentFlaggedValue = g(_flaggedValue);

    if (currentFlaggedValue && a === 'action') {
      log.info('👀 flaggedChoiceValueAtom: clearing actionsInputAtom because it was already open');
      s(actionsInputAtom, '');
      return;
    }

    s(promptActiveAtom, true);
    log.info({ flagValue: a });
    s(_flaggedValue, a);

    if (a === '') {
      s(selectedAtom, '');
      s(choicesConfigAtom, g(prevChoicesConfig));
      s(indexAtom, g(prevIndexAtom));
      s(actionsInputAtom, '');
    } else {
      s(selectedAtom, typeof a === 'string' ? a : (a as Choice)?.name);
      s(prevIndexAtom, g(indexAtom));
      s(directionAtom, 1);
      s(flagsIndexAtom, 0);
    }

    const channel = g(channelAtom);
    channel(Channel.ON_MENU_TOGGLE);
    resize(g, s, 'FLAG_VALUE');
  },
);

// --- Scored Flags ---
export const scoredFlagsAtom = atom(
  (g) => {
    if (!g(hasActionsAtom)) return [];
    return g(scoredFlags);
  },
  (g, s, a: ScoredChoice[]) => {
    unstable_batchedUpdates(() => {
      s(scoredFlags, a);
      s(flagsIndexAtom, 0);

      removeTopBorderOnFirstItem(a);

      const defaultActionId = g(defaultActionsIdAtom);
      if (defaultActionId) {
        const defaultActionIndex = a.findIndex((c) => c?.item?.id === defaultActionId);
        s(flagsIndexAtom, defaultActionIndex > -1 ? defaultActionIndex : 0);
      }

      requestAnimationFrame(() => {
        const itemHeight = g(actionsItemHeightAtom);
        const height = calcVirtualListHeight(a as any, itemHeight, MAX_VLIST_HEIGHT);
        s(flagsHeightAtom, height);
      });
    });
  },
);

// --- Flags Index ---
export const flagsIndexAtom = atom(
  (g) => g(flagsIndex),
  (g, s, a: number) => {
    const flagValue = g(flaggedChoiceValueAtom);
    if (!flagValue) {
      s(focusedFlagValueAtom, '');
      return;
    }

    const cs = g(scoredFlagsAtom);
    if (cs.length === 0) {
      s(flagsIndex, 0);
      return;
    }

    const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a;

    const list = g(flagsListAtom);
    const requiresScroll = g(flagsRequiresScrollAtom);
    const direction = g(directionAtom);

    let calcIndex = clampedIndex;
    let choice = cs?.[calcIndex]?.item;

    if (choice?.skip) {
      calcIndex = advanceIndexSkipping(clampedIndex, direction, cs as any);
      choice = cs[calcIndex]?.item;
    }

    if (g(flagsIndex) !== calcIndex) {
      s(flagsIndex, calcIndex);
    }

    if (list) {
      if (requiresScroll === -1) {
        list.scrollToItem(calcIndex);
      }
      if (cs[0]?.item?.skip && calcIndex === 1) {
        list.scrollToItem(0);
      }
    }

    const focusedFlag = (choice as Choice)?.value;
    s(focusedFlagValueAtom, focusedFlag);
  },
);

// --- Resize Logic ---
const sendResize = (data: ResizeData) => ipcRenderer.send(AppChannel.RESIZE, data);
const debounceSendResize = debounce(sendResize, SEND_RESIZE_DEBOUNCE_MS);

export const resize = debounce(
  (g: Getter, s: Setter, reason = 'UNSET') => {
    const human = g(promptResizedByHumanAtom);
    if (human) {
      g(channelAtom)(Channel.SET_BOUNDS, g(promptBoundsAtom));
      return;
    }

    const active = g(promptActiveAtom);
    if (!active) return;

    const promptData = g(promptDataAtom);
    if (!promptData?.scriptPath) return;

    const ui = g(uiAtom);
    const scoredChoicesLength = g(scoredChoicesAtom)?.length;
    const hasPanel = g(_panelHTML) !== '';
    let mh = g(mainHeightAtom);

    if (promptData?.grid && document.getElementById(ID_MAIN)?.clientHeight > 10) {
      return;
    }

    const placeholderOnly = promptData?.mode === Mode.FILTER && scoredChoicesLength === 0 && ui === UI.arg;
    const topHeight = document.getElementById(ID_HEADER)?.offsetHeight || 0;
    const footerHeight = document.getElementById(ID_FOOTER)?.offsetHeight || 0;
    const hasPreview = g(previewCheckAtom);
    const choicesHeight = g(choicesHeightAtom);

    // Calculate Main Height (mh) based on UI state
    if (ui === UI.arg) {
      if (!g(choicesReadyAtom)) return;

      if (choicesHeight > PROMPT.HEIGHT.BASE) {
        log.info(`🍃 choicesHeight: ${choicesHeight} > PROMPT.HEIGHT.BASE: ${PROMPT.HEIGHT.BASE}`);
        const baseHeight = (promptData?.height && promptData.height > PROMPT.HEIGHT.BASE) ? promptData.height : PROMPT.HEIGHT.BASE;
        mh = baseHeight - topHeight - footerHeight;
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
        ch = (document as any)?.getElementById(ID_PANEL)?.offsetHeight;
        if (ch) {
          mh = promptData?.height || ch;
        } else {
          return;
        }
      } else if (ui === UI.arg && hasPanel) {
        ch = (document as any)?.getElementById(ID_PANEL)?.offsetHeight;
        mh = ch;
        forceResize = true;
      } else if (ui === UI.arg && !hasPanel && !scoredChoicesLength && !document.getElementById(ID_LIST)) {
        ch = 0;
        mh = 0;
        forceResize = true;
      } else if (ui !== UI.arg) {
        ch = (document as any)?.getElementById(ID_MAIN)?.offsetHeight;
      }

      if (ui === UI.arg) {
        forceResize = ch === 0 || Boolean(ch < choicesHeight) || hasPanel;
      } else if (ui === UI.div) {
        forceResize = true;
      } else {
        forceResize = Boolean(ch > g(prevMh));
      }
    } catch (error) {
      // Handle potential DOM errors gracefully
    }

    if (topHeight !== prevTopHeight) {
      forceResize = true;
      prevTopHeight = topHeight;
    }

    const logVisible = g(logHTMLAtom)?.length > 0 && g(scriptAtom)?.log !== false;
    const logHeight = document.getElementById(ID_LOG)?.offsetHeight || 0;

    const computeOut = computeResize({
      ui,
      scoredChoicesLength: scoredChoicesLength || 0,
      choicesHeight,
      hasPanel,
      hasPreview,
      promptData: { height: promptData?.height, baseHeight: PROMPT.HEIGHT.BASE },
      topHeight,
      footerHeight,
      isWindow: g(isWindowAtom),
      justOpened: Boolean(g(justOpenedAtom)),
      flaggedValue: g(_flaggedValue),
      mainHeightCurrent: mh,
      itemHeight: g(itemHeightAtom),
      logVisible,
      logHeight,
      gridActive: g(gridReadyAtom),
      prevMainHeight: g(prevMh),
      placeholderOnly,
    });

    mh = computeOut.mainHeight;
    let forceHeight = computeOut.forceHeight;

    if (ui === UI.debugger) {
      forceHeight = 128;
    }

    if (mh === 0 && promptData?.preventCollapse) {
      log.info('🍃 Prevent collapse to zero...');
      return;
    }

    log.info(`🍃 mh: ${mh}`, `forceHeight: ${forceHeight}`);

    const data: ResizeData = {
      id: promptData?.id || 'missing',
      pid: window.pid || 0,
      reason,
      scriptPath: g(_script)?.filePath,
      placeholderOnly,
      topHeight,
      ui,
      mainHeight: mh + (g(isWindowAtom) ? 24 : 0) + 1,
      footerHeight,
      mode: promptData?.mode || Mode.FILTER,
      hasPanel,
      hasInput: g(inputAtom)?.length > 0,
      previewEnabled: g(previewEnabledAtom),
      open: g(_open),
      tabIndex: g(_tabIndex),
      isSplash: g(isSplashAtom),
      hasPreview,
      inputChanged: g(_inputChangedAtom),
      forceResize,
      forceHeight,
      isWindow: g(isWindowAtom),
      justOpened: g(justOpenedAtom) as any,
      forceWidth: promptData?.width as any,
      totalChoices: scoredChoicesLength as any,
      isMainScript: g(isMainScriptAtom) as any,
    } as ResizeData;

    s(prevMh, mh);

    debounceSendResize.cancel();
    if (g(justOpenedAtom) && !promptData?.scriptlet) {
      debounceSendResize(data);
    } else {
      sendResize(data);
    }
  },
  RESIZE_DEBOUNCE_MS,
  { leading: true, trailing: true },
);

export const triggerResizeAtom = atom(null, (g, s, reason: string) => {
  resize(g, s, `TRIGGER_RESIZE: ${reason}`);
});

export const domUpdatedAtom = atom(null, (g, s) => {
  return debounce((reason = '') => {
    resize(g, s, reason);
  }, PREVIEW_THROTTLE_MS);
});

// Override mainHeightAtom with complex setter that triggers resize
export const mainHeightAtom = atom(
  (g) => g(_mainHeight),
  (g, s, a: number) => {
    const prevHeight = g(_mainHeight);
    const nextMainHeight = a < 0 ? 0 : a;

    // Prevent setting height to 0 if content (panel or choices) exists
    if (nextMainHeight === 0) {
      if (g(panelHTMLAtom) !== '' || g(scoredChoicesAtom).length > 0) {
        return;
      }
    }

    s(_mainHeight, nextMainHeight);
    if (a === prevHeight) return;

    // Skip resize trigger for specific UIs that manage their own dimensions
    const ui = g(uiAtom);
    if ([UI.drop, UI.editor, UI.textarea].includes(ui)) return;

    resize(g, s, 'MAIN_HEIGHT');
  },
);

// --- Channel Communication ---
export const channelAtom = atom((g) => {
  if (g(pauseChannelAtom)) {
    return () => { };
  }

  return (channel: Channel, override?: any) => {
    const state = g(appStateAtom);
    const pid = g(pidAtom);
    const promptId = g(promptDataAtom)?.id as string;

    const appMessage: AppMessage = {
      channel,
      pid: pid || 0,
      promptId: promptId,
      state: {
        ...state,
        ...override,
      },
    };

    ipcRenderer.send(channel, appMessage);
  };
});

// --- App State Aggregation ---
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

// --- Submit Value ---
const checkSubmitFormat = (g: Getter, checkValue: unknown): unknown => {
  if (checkValue instanceof ArrayBuffer) {
    return checkValue;
  }
  if (Array.isArray(checkValue)) {
    if (g(choiceInputsAtom).length > 0) {
      return checkValue;
    }

    const files = checkValue.map((file) => {
      const fileObject: Record<string, unknown> = {};
      for (const key in file) {
        if (typeof file[key] !== 'function') {
          fileObject[key] = file[key];
        }
      }
      return fileObject;
    });
    return files;
  }
  return checkValue;
};

export const enterButtonNameAtom = atom<string>((g) => {
  if (g(uiAtom) === UI.splash) return '';
  const focusedChoice = g(focusedChoiceAtom);
  // Use the choice-specific 'enter' label or the global one
  return focusedChoice?.enter || g(enterAtom);
});

export const enterButtonDisabledAtom = atom<boolean>((g) => {
  if (g(uiAtom) === UI.splash || g(submittedAtom)) return true;
  if (g(flaggedChoiceValueAtom)) return false; // Usually enabled when actions menu is open
  if (g(disableSubmitAtom)) return true;
  const enterButtonName = g(enterButtonNameAtom);
  if (enterButtonName === '') return true;

  const ui = g(uiAtom);
  if ([UI.fields, UI.form, UI.div].includes(ui)) return false;

  const focusedChoice = g(focusedChoiceAtom);
  if (focusedChoice?.disableSubmit) return true;

  if (g(panelHTMLAtom)?.length > 0) return false;

  const pd = g(promptDataAtom);
  if (!pd?.strict) return false;

  // If strict mode is on, disable if no choice is focused
  return focusedChoice?.name === noChoice.name;
});

export const shortcutStringsAtom = atom((g) => {
  const shortcuts = g(shortcutsAtom);
  const actions = g(actionsAtom);
  const flags = g(flagsAtom);

  // Filter out actions that are already defined as shortcuts to avoid duplication
  const actionsThatArentShortcuts = actions.filter((a: any) => !shortcuts.find((s) => s.key === a.key));

  const shortcutKeys = dataUtils.transformKeys(shortcuts, 'key', 'shortcut');
  const actionKeys = dataUtils.transformKeys(actionsThatArentShortcuts as any[], 'key', 'action');
  const flagKeys = dataUtils.transformKeys(Object.values(flags) as any[], 'shortcut', 'flag');

  return new Set([...shortcutKeys, ...actionKeys, ...flagKeys]);
});

// Moved to state/atoms/actions-utils.ts:
// - sendShortcutAtom
// - sendActionAtom

export const submitValueAtom = atom(
  (g) => g(_submitValue),
  (g, s, a: any) => {
    const ui = g(uiAtom);
    const flaggedValue = g(flaggedChoiceValueAtom);
    const flag = g(focusedFlagValueAtom);
    const action = g(focusedActionAtom);
    const enter = g(enterAtom);

    const allowEmptyEnterUIs = [UI.term, UI.drop, UI.hotkey];
    const isInAllowedEmptyUI = allowEmptyEnterUIs.includes(ui);

    if (enter === '' && !isInAllowedEmptyUI && !flaggedValue && !action) {
      log.warn('👀 Preventing submit because enterAtom is empty');
      return;
    }

    if (!(flaggedValue || flag) && a?.scriptlet && a?.inputs?.length > 0) {
      log.info('Scriptlet requires inputs', a.inputs);
      return;
    }

    const preventSubmitWithoutAction = g(preventSubmitWithoutActionAtom);
    if (preventSubmitWithoutAction) {
      log.info('👀 preventSubmitWithoutActionAtom');
      return;
    }

    const channel = g(channelAtom);

    if ((action as FlagsWithKeys).hasAction) {
      channel(Channel.ACTION);
      if (action?.close && g(flaggedChoiceValueAtom)) {
        log.info('👋 Closing actions');
        s(flaggedChoiceValueAtom, '');
      }
      return;
    }

    s(onInputSubmitAtom, {});
    s(promptActiveAtom, false);
    s(disableSubmitAtom, false);

    if (g(submittedAtom)) return;

    const focusedChoice = g(focusedChoiceAtom);

    const fid = focusedChoice?.id;
    if (fid) {
      const key = g(promptDataAtom)?.key;
      if (key) {
        try {
          const prevIds = JSON.parse(localStorage.getItem(key) || '[]');
          const index = prevIds.indexOf(fid);
          if (index > -1) {
            prevIds.splice(index, 1);
          }
          prevIds.unshift(fid);
          localStorage.setItem(key, JSON.stringify(prevIds));
        } catch (e) {
          log.error("Failed to update localStorage history", e);
        }
      }
    }

    let value = ui === UI.term ? g(termOutputAtom) : checkSubmitFormat(g, a);

    const focusedChoiceIsNoChoice = focusedChoice === noChoice;
    const inputIsEmpty = g(inputAtom) === '';
    const choicesAreEmpty = g(choicesAtom).length === 0;
    if (focusedChoiceIsNoChoice && inputIsEmpty && choicesAreEmpty && ui === UI.arg) {
      value = '';
    }

    const valueSubmitted = { value, flag };
    channel(Channel.VALUE_SUBMITTED, valueSubmitted);

    s(loadingAtom, false);
    if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);

    placeholderTimeoutId = setTimeout(() => {
      s(loadingAtom, true);
      s(processingAtom, true);
    }, PROCESSING_SPINNER_DELAY_MS);

    s(submittedAtom, true);
    s(closedInput, g(inputAtom));
    s(_flaggedValue, '');
    s(selectedChoicesAtom, []);
    s(focusedFlagValueAtom, '');
    s(prevIndexAtom, 0);
    s(_submitValue, value);

    const stream = g(webcamStreamAtom);
    if (stream && 'getTracks' in stream) {
      (stream as MediaStream).getTracks().forEach((track) => track.stop());
      s(webcamStreamAtom, null);
      const webcamEl = document.getElementById('webcam') as HTMLVideoElement;
      if (webcamEl) {
        webcamEl.srcObject = null;
      }
    }
  },
);

export const submitInputAtom = atom(null, (g, s) => {
  const input = g(inputAtom);
  s(submitValueAtom, input);
});

export const escapeAtom = atom<any>((g) => {
  const channel = g(channelAtom);
  return () => {
    // Stop any ongoing speech synthesis
    const synth = window.speechSynthesis;
    if (synth.speaking) {
      synth.cancel();
    }

    log.info('👋 Sending Channel.ESCAPE');
    channel(Channel.ESCAPE);
  };
});

export const blurAtom = atom(null, (g) => {
  if (g(openAtom)) {
    const channel = g(channelAtom);
    channel(Channel.BLUR);
  }
});

export const changeAtom = atom((g) => (data: any) => {
  const channel = g(channelAtom);
  channel(Channel.CHANGE, { value: data });
});

export const runMainScriptAtom = atom(() => () => {
  ipcRenderer.send(AppChannel.RUN_MAIN_SCRIPT);
});

export const toggleSelectedChoiceAtom = atom(null, (g, s, id: string) => {
  const selectedChoices = [...g(selectedChoicesAtom)];
  const scoredChoice = g(choices).find((c) => c?.item?.id === id);
  const index = selectedChoices.findIndex((c) => c?.id === id);

  if (index > -1) {
    selectedChoices.splice(index, 1);
  } else if (scoredChoice?.item) {
    selectedChoices.push(scoredChoice.item as Choice);
  }

  s(selectedChoicesAtom, selectedChoices);
});

export const toggleAllSelectedChoicesAtom = atom(null, (g, s) => {
  const selectedChoices = g(selectedChoicesAtom);
  const cs = g(choices).map((c) => c?.item as Choice);

  if (selectedChoices.length === cs.length) {
    s(selectedChoicesAtom, []);
  } else {
    s(selectedChoicesAtom, cs);
  }
});

export const getEditorHistoryAtom = atom((g) => () => {
  const channel = g(channelAtom);
  channel(Channel.GET_EDITOR_HISTORY, { editorHistory: g(editorHistory) });
});

export const colorAtom = atom((g) => {
  return async () => {
    try {
      // @ts-ignore -- EyeDropper API might not be in standard TS types yet
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
    } catch (error) {
      // User cancelled or EyeDropper failed
      return '';
    }
  };
});

export const appendInputAtom = atom(null, (g, s, a: string) => {
  const ui = g(uiAtom);
  if (ui === UI.editor) {
    s(editorAppendAtom, a);
  } else {
    const input = g(_inputAtom);
    s(_inputAtom, input + a);
  }
});

export const valueInvalidAtom = atom(null, (g, s, a: string) => {
  if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);

  s(processingAtom, false);
  s(inputAtom, '');
  s(_inputChangedAtom, false);

  if (typeof a === 'string') {
    // hintAtom setter handles the ANSI conversion
    s(hintAtom, a);
  }

  const channel = g(channelAtom);
  channel(Channel.ON_VALIDATION_FAILED);
});

export const preventSubmitAtom = atom(null, (_g, s, _a: string) => {
  s(promptActiveAtom, true);
  if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);
  s(submittedAtom, false);
  s(processingAtom, false);
  s(_inputChangedAtom, false);
});

export const triggerKeywordAtom = atom(
  (_g) => { },
  (
    g,
    _s,
    { keyword, choice }: { keyword: string; choice: Choice },
  ) => {
    const channel = g(channelAtom);
    channel(Channel.KEYWORD_TRIGGERED, {
      keyword,
      focused: choice,
      value: choice?.value,
    });
  },
);

export const sendShortcutAtom = atom(null, (g, s, shortcut: string) => {
  const channel = g(channelAtom);
  const hasEnterShortcut = g(shortcutsAtom).find((s) => s.key === 'enter');
  log.info('🎬 Send shortcut', { shortcut, hasEnterShortcut });

  // If 'enter' is pressed and not defined as a specific shortcut, treat it as a submission trigger (tracked via time)
  if (shortcut === 'enter' && !hasEnterShortcut) {
    s(enterLastPressedAtom, new Date());
  } else {
    // Otherwise, send it as a shortcut event.
    channel(Channel.SHORTCUT, { shortcut });
  }
});

export const sendActionAtom = atom(null, (g, _s, action: Action) => {
  const channel = g(channelAtom);
  log.info(`👉 Sending action: ${action.name}`);
  channel(Channel.ACTION, { action });
});

// =================================================================================================
// DERIVED ATOMS
// These atoms depend on the wired state and must be defined here.
// =================================================================================================

// --- UI State ---

export const isMainScriptInitialAtom = atom<boolean>((g) => {
  return g(isMainScriptAtom) && g(inputAtom) === '';
});

export const showTabsAtom = atom((g) => {
  const isArg = [UI.arg].includes(g(uiAtom));
  const hasTabs = g(tabsAtom)?.length > 0;
  return isArg && hasTabs;
});

export const showSelectedAtom = atom((g) => {
  return [UI.arg, UI.hotkey].includes(g(uiAtom)) && g(selectedAtom) && g(tabsAtom)?.length > 0;
});

// --- Actions State ---

export const hasActionsAtom = atom((g) => {
  const flags = g(flagsAtom);
  const focusedChoice = g(focusedChoiceAtom);
  // Actions exist if there are global flags or the focused choice has specific actions
  return Object.entries(flags).length > 0 || !!focusedChoice?.actions;
});

// Merges flags and shortcuts into a unified list of actions for display
export const actionsAtom = atom((g) => {
  const flags = g(flagsAtom);
  const shortcuts = g(shortcutsAtom);
  const disabled = g(flaggedChoiceValueAtom); // Disabled if the actions menu is already open

  const flagActions = Object.entries(flags).map(([key, flag]) => {
    const f = flag as any;
    return {
      key: f?.key || f?.shortcut,
      value: key,
      name: f?.name,
      shortcut: formatShortcut(f?.shortcut),
      position: f?.bar,
      arrow: f?.arrow,
      flag: key,
      disabled: Boolean(disabled),
      visible: Boolean(f?.visible),
    } as Action;
  });

  const shortcutActions = shortcuts
    .filter((s) => s?.bar)
    .map(({ key, name, bar, flag, visible }) => ({
      key,
      name,
      value: key,
      shortcut: formatShortcut(key),
      position: bar,
      flag,
      disabled: Boolean(disabled),
      visible: Boolean(visible),
    } as Action));

  return flagActions.concat(shortcutActions);
});

export const preventSubmitWithoutActionAtom = atom((g) => {
  const flaggedValue = g(flaggedChoiceValueAtom);
  const focusedAction = g(focusedActionAtom);
  // Submit should be prevented when actions menu is open without a selected action
  return flaggedValue && Object.keys(focusedAction).length === 0;
});

export const actionsPlaceholderAtom = atom((g) => {
  const hasActions = g(hasActionsAtom);
  return hasActions ? 'Actions' : 'No Actions Available';
});

// --- Utility Actions ---

export const listProcessesActionAtom = atom((g) => {
  const shortcuts = g(shortcutsAtom);
  return shortcuts.find((s) => s?.key?.endsWith('p'));
});

export const signInActionAtom = atom((g) => {
  const actions = g(actionsAtom);
  return actions.find((s) => s?.flag === 'sign-in-to-script-kit');
});

export const actionsButtonActionAtom = atom<Action>((g) => {
  const isMac = g(appConfigAtom).isMac;

  return {
    name: 'Actions',
    value: isMac ? 'cmd+k' : 'ctrl+k',
    shortcut: isMac ? '⌘+K' : '⌃+K',
    position: 'right',
    disabled: false,
  } as Action;
});

export const shouldActionButtonShowOnInputAtom = atom((g) => {
  const hasFlags = Object.keys(g(flagsAtom)).length > 0;
  const hasRightShortcut = g(hasRightShortcutAtom);
  return hasFlags && !hasRightShortcut;
});

// --- Missing atoms that are referenced but not defined ---
export const initPromptAtom = atom(null, (g, s) => {
  log.info(`${window.pid}: 🚀 Init prompt`);
  const currentPromptData = g(promptDataAtom);
  if (currentPromptData?.id) {
    log.info(`🚪 Init prompt skipped. Already initialized as ${currentPromptData?.id}`);
    return;
  }
  // Restore state from cache atomically to prevent flicker
  const promptData = g(cachedMainPromptDataAtom) as PromptData;
  const scoredChoices = g(cachedMainScoredChoicesAtom);
  s(promptDataAtom, promptData);
  s(scoredChoicesAtom, scoredChoices);
  s(previewHTMLAtom, g(cachedMainPreviewAtom));
  s(shortcutsAtom, g(cachedMainShortcutsAtom));
  s(flagsAtom, g(cachedMainFlagsAtom));
});

const promptBoundsDefault = {
  id: '',
  width: 0,
  height: 0,
  x: 0,
  y: 0,
};

export const clearCacheAtom = atom(null, (_g, s) => {
  s(cachedMainPromptDataAtom, {});
  s(cachedMainScoredChoicesAtom, []);
  s(cachedMainPreviewAtom, '');
  s(cachedMainShortcutsAtom, []);
  s(cachedMainFlagsAtom, {});
  s(promptDataAtom, {} as PromptData);
  s(scoredChoicesAtom, []);
  s(promptBoundsAtom, promptBoundsDefault);
});

const _topHeight = atom(88);
export const topHeightAtom = atom(
  (g) => g(_topHeight),
  (g, s) => {
    const resizeComplete = g(resizeCompleteAtom);
    if (!resizeComplete) return;
    resize(g, s, 'TOP_HEIGHT');
  },
);

export const onPasteAtom = atom((g) => (event: ClipboardEvent) => {
  if (g(uiAtom) === UI.editor) {
    event.preventDefault(); // Assuming we want to handle paste manually or let Monaco handle it
  }
  const channel = g(channelAtom);
  channel(Channel.ON_PASTE);
});

export const onDropAtom = atom((g) => (event: DragEvent) => {
  if (g(uiAtom) === UI.drop) return; // UI.drop likely has its own specific handler
  event.preventDefault();
  let drop = '';
  const files = Array.from(event?.dataTransfer?.files || []);
  if (files.length > 0) {
    drop = files
      .map((file: File) => (file as any).path)
      .join('\n')
      .trim();
  } else {
    drop = event?.dataTransfer?.getData('URL') || event?.dataTransfer?.getData('Text') || '';
  }
  const channel = g(channelAtom);
  channel(Channel.ON_DROP, { drop });
});

// Export remaining helper functions and constants for compatibility
export { placeholderTimeoutId };
