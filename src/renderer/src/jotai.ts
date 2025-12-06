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
import type { Action, AppState, Choice, FlagsWithKeys, PromptData } from '@johnlindquist/kit/types/core';
import type { AppMessage } from '@johnlindquist/kit/types/kitapp';
import { atom, type Getter, type Setter } from 'jotai';
import { debounce, throttle } from 'lodash-es';
import { unstable_batchedUpdates } from 'react-dom';
import type { ScriptState } from './state/atoms/script-state';

// Import all modularized atoms
export * from './state/atoms';

// Import specific atoms we need to wire
import {
  _actionsInputAtom,
  _chatMessagesAtom,
  _flaggedValue,
  _focused,
  _indexAtom,
  _inputAtom,
  _inputChangedAtom,
  _lastKeyDownWasModifierAtom,
  _mainHeight,
  _miniShortcutsHoveredAtom,
  _modifiers,
  _open,
  _panelHTML,
  _previewHTML,
  _script,
  _submitValue,
  _tabIndex,
  _termOutputAtom,
  _ui,
  actionsConfigAtom,
  actionsInputAtom,
  actionsItemHeightAtom,
  // Actions overlay clarity atoms
  actionsOverlayOpenAtom,
  actionsOverlaySourceAtom,
  allSkipAtom,
  audioDotAtom,
  backToMainAtom,
  cachedAtom,
  cachedMainFlagsAtom,
  cachedMainPreviewAtom,
  cachedMainPromptDataAtom,
  cachedMainScoredChoicesAtom,
  cachedMainShortcutsAtom,
  choiceInputsAtom,
  choices,
  choicesAtom,
  choicesConfig,
  choicesHeightAtom,
  choicesReadyAtom,
  closeActionsOverlayAtom,
  closedInput,
  containerClassNameAtom,
  currentChoiceHeightsAtom,
  defaultActionsIdAtom,
  defaultChoiceIdAtom,
  defaultValueAtom,
  descriptionAtom,
  directionAtom,
  disableSubmitAtom,
  editorAppendAtom,
  editorConfigAtom,
  editorCursorPosAtom,
  editorHistory,
  editorHistoryPush,
  enterAtom,
  enterLastPressedAtom,
  flagsAtom,
  flagsHeightAtom,
  flagsIndex,
  flagsListAtom,
  focusedActionAtom,
  focusedFlagMetaAtom,
  focusedFlagValueAtom,
  footerAtom,
  footerHiddenAtom,
  formDataAtom,
  formHTMLAtom,
  gridReadyAtom,
  hasRightShortcutAtom,
  hasSkipAtom,
  headerHiddenAtom,
  hintAtom,
  inputFocusAtom,
  inputHeightAtom,
  inputWhileSubmittedAtom,
  isHiddenAtom,
  isMainScriptAtom,
  isSplashAtom,
  isWindowAtom,
  itemHeightAtom,
  justOpenedAtom,
  kitConfigAtom,
  lastConsumedFlagMetaAtom,
  lastKeyDownWasModifierAtom,
  lastScriptClosed,
  listAtom,
  loadingAtom,
  logHTMLAtom,
  logLinesAtom,
  logoAtom,
  markFlagConsumedAtom,
  modeAtom,
  mouseEnabledAtom,
  nameAtom,
  onInputSubmitAtom,
  openActionsOverlayAtom,
  panelHTMLAtom,
  pauseChannelAtom,
  pendingFlagAtom,
  pidAtom,
  placeholderAtom,
  preloadedAtom,
  prevChoicesConfig,
  prevIndexAtom,
  previewCheckAtom,
  previewEnabledAtom,
  previewHTMLAtom,
  prevMh,
  prevScoredChoicesIdsAtom,
  processingAtom,
  progressAtom,
  promptActiveAtom,
  promptBoundsAtom,
  promptData,
  promptReadyAtom,
  promptResizedByHumanAtom,
  resetActionsOverlayStateAtom,
  resizeCompleteAtom,
  resizeTickAtom,
  runningAtom,
  scoredFlags,
  scrollToIndexAtom,
  selectedAtom,
  selectedChoicesAtom,
  shortcutsAtom,
  submittedAtom,
  tabChangedAtom,
  tabsAtom,
  tempThemeAtom,
  termConfigAtom,
  termOutputAtom,
  themeAtom,
  webcamStreamAtom,
} from './state/atoms';
// Needed locally for derived atoms that read platform flags
import { appConfigAtom } from './state/atoms/app-core';
// Import unified scroll service
import { scrollRequestAtom } from './state/scroll';
import { pushIpcMessageAtom } from './state/selectors/ipcOutbound';
import { sendAppMessage, sendChannel } from './state/services/ipc';
import { cancelSpeech, pickColor } from './state/services/platform';
import { appendChoiceIdToHistory } from './state/services/storage';
import { hasFreshFlag } from './state/submit/flagFreshness';
// Keep all atoms sourced from './state/atoms' to avoid circular re-exports

// Shared imports
import { closedDiv, DEFAULT_HEIGHT, noChoice } from '../../shared/defaults';
import { AppChannel } from '../../shared/enums';
import type { ResizeData, ScoredChoice, TermConfig as SharedTermConfig } from '../../shared/types';
import { formatShortcut } from './components/formatters';
import { createLogger } from './log-utils';
import {
  JUST_OPENED_MS,
  MAX_TABCHECK_ATTEMPTS,
  MAX_VLIST_HEIGHT,
  PREVIEW_THROTTLE_MS,
  PROCESSING_SPINNER_DELAY_MS,
  RESIZE_DEBOUNCE_MS,
  SCROLL_THROTTLE_MS,
  SEND_RESIZE_DEBOUNCE_MS,
} from './state/constants';
import { ID_FOOTER, ID_HEADER, ID_LIST, ID_LOG, ID_MAIN, ID_PANEL } from './state/dom-ids';
import { computeResize } from './state/resize/compute';
import { advanceIndexSkipping } from './state/skip-nav';
import { decideSubmit } from './state/submit/dispatcher';
import { calcVirtualListHeight, removeTopBorderOnFirstItem } from './state/utils';
import { arraysEqual, colorUtils, dataUtils, domUtils } from './utils/state-utils';

const log = createLogger('jotai.ts');

const isDebugResizeEnabled = (): boolean => {
  try {
    return Boolean((window as any).DEBUG_RESIZE);
  } catch {
    return false;
  }
};

// =================================================================================================
// COMPLEX WIRING LOGIC
// This section contains the complex atom wiring that couldn't be easily extracted
// =================================================================================================

const choicesPreloadedAtom = atom(false);
const wereChoicesPreloadedAtom = atom(false);
const domUpdatedDebouncedAtom = atom<((reason?: string) => void) | null>(null);
const spinnerTimeoutIdAtom = atom<NodeJS.Timeout | null>(null);

export const spinnerControlAtom = atom(null, (g, s, action: 'start' | 'stop') => {
  const existing = g(spinnerTimeoutIdAtom);
  if (existing) {
    clearTimeout(existing);
    s(spinnerTimeoutIdAtom, null);
  }

  if (action === 'stop') {
    s(loadingAtom, false);
    s(processingAtom, false);
    return;
  }

  const id = setTimeout(() => {
    s(loadingAtom, true);
    s(processingAtom, true);
    s(spinnerTimeoutIdAtom, null);
  }, PROCESSING_SPINNER_DELAY_MS);

  s(spinnerTimeoutIdAtom, id);
});

const resetPromptOnClose = (g: Getter, s: Setter) => {
  s(resizeCompleteAtom, false);
  s(lastScriptClosed, g(_script).script?.filePath || '');
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
  s(pidAtom, 0);
  s(_chatMessagesAtom, []);
  s(runningAtom, false);
  s(_miniShortcutsHoveredAtom, false);
  s(logLinesAtom, []);
  s(audioDotAtom, false);
  s(disableSubmitAtom, false);
  g(scrollToIndexAtom)(0);
  s(termConfigAtom, {});
  s(spinnerControlAtom, 'stop');

  const stream = g(webcamStreamAtom);
  if (stream) {
    s(webcamStreamAtom, null);
  }
};

// --- Open/Close Lifecycle with Reset ---
export const openAtom = atom(
  (g) => g(_open),
  (g, s, a: boolean) => {
    if (g(_open) === a) return;

    s(mouseEnabledAtom, 0);

    if (g(_open) && a === false) {
      resetPromptOnClose(g, s);
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
  (g, s, update: ScriptState | Partial<ScriptState> | ((prev: ScriptState) => ScriptState)) => {
    const prev = g(_script);
    const next =
      typeof update === 'function' ? (update as (prev: ScriptState) => ScriptState)(prev) : { ...prev, ...update };
    const scriptChanged = next.script !== prev.script;

    if (scriptChanged) {
      s(lastKeyDownWasModifierAtom, false);

      const mainScriptPath = g(kitConfigAtom).mainScriptPath;
      const isMainScript = next.script?.filePath === mainScriptPath;
      const prevWasMain = prev.script?.filePath === mainScriptPath;

      s(isMainScriptAtom, isMainScript);
      s(backToMainAtom, !prevWasMain && isMainScript);
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
      if (next.script?.tabs) {
        s(tabsAtom, next.script?.tabs || []);
      }

      s(mouseEnabledAtom, 0);
      s(processingAtom, false);
      s(loadingAtom, false);
      s(progressAtom, 0);
      s(logoAtom, next.script?.logo || '');
      s(tempThemeAtom, g(themeAtom));
    }

    s(_script, next);
  },
);

// --- PromptData Atom with Complex State Management ---
export const promptDataAtom = atom(
  (g) => g(promptData),
  (g, s, a: null | PromptData) => {
    const pid = g(pidAtom);
    log.info(
      `${pid}: 📝📝📝 promptDataAtom SETTER: id="${a?.id}", scriptPath="${a?.scriptPath}", preload=${a?.preload}`,
    );
    if (!a) {
      log.info(`${pid}: 📝 promptDataAtom: Setting to null`);
      s(promptData, null);
      return;
    }

    s(choicesReadyAtom, false);
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

    const wasPromptDataPreloaded = Boolean(prevPromptData?.preload && !a.preload);
    log.info(`${pid}: 👀 Preloaded: ${a.scriptPath} ${wasPromptDataPreloaded} Keyword: ${a.keyword}`);

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
    s(spinnerControlAtom, 'stop');

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

    const scriptState = g(scriptAtom);
    const promptDescription = a.description || (a.name ? '' : scriptState?.script?.description || '');
    const promptName = a.name || scriptState?.script?.name || '';
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
    try {
      s(scheduleResizeAtom, ResizeReason.UI);
    } catch {}

    s(pushIpcMessageAtom, { channel: Channel.ON_INIT, state: {} });

    s(pushIpcMessageAtom, {
      channel: Channel.SET_PROMPT_DATA,
      args: [
        {
          messageId: (a as any).messageId,
          ui: a.ui,
        },
      ],
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
      s(pushIpcMessageAtom, { channel: Channel.INPUT, state: {} });
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
    const wasPreloaded = g(choicesPreloadedAtom);
    s(wereChoicesPreloadedAtom, !a?.preload && wasPreloaded);
    s(choicesPreloadedAtom, !!a?.preload);
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
const getSendTabChanged = (_g: Getter, s: Setter) =>
  debounce(
    () => {
      s(pushIpcMessageAtom, { channel: Channel.TAB_CHANGED, state: {} });
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
      s(focusedFlagValueAtom, '');
      s(focusedActionAtom, {} as any);

      sendTabChanged = sendTabChanged || getSendTabChanged(g, s);
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
    const currentPromptData = g(promptData);
    log.info(
      `🎯🎯🎯 scoredChoicesAtom SETTER: count=${cs?.length}, first="${cs?.[0]?.item?.name}", currentPromptData.id="${currentPromptData?.id}", currentPromptData.scriptPath="${currentPromptData?.scriptPath}"`,
    );
    s(choicesReadyAtom, true);
    s(cachedAtom, false);
    s(loadingAtom, false);

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
      const selected = g(selectedAtom);
      const prevIndex = g(prevIndexAtom);
      const input = g(inputAtom);
      const gridReady = g(gridReadyAtom);
      const scrollContext = gridReady ? 'choices-grid' : 'choices-list';

      if (defaultValue || defaultChoiceId || selected) {
        const i = cs.findIndex(
          (c) =>
            c.item?.id === defaultChoiceId ||
            c.item?.value === defaultValue ||
            c.item?.name === defaultValue ||
            (selected && (c.item?.value === selected || c.item?.name === selected)),
        );

        if (i !== -1) {
          const foundChoice = cs[i].item;
          if (foundChoice?.id) {
            s(indexAtom, i);
            s(focusedChoiceAtom, foundChoice);
            s(scrollRequestAtom, {
              context: scrollContext,
              target: i,
              reason: 'default-value',
            });
          }
        }
        s(defaultValueAtom, '');
        s(defaultChoiceIdAtom, '');
        // We don't clear selectedAtom here because it might be needed for other logic
        // or it might be cleared when prompt data changes
      } else if (input.length > 0) {
        // When user types, scroll to top
        s(scrollRequestAtom, {
          context: scrollContext,
          target: 0,
          align: 'start',
          reason: 'choices-updated',
        });
        if (changed) {
          s(indexAtom, 0);
        }
      } else if (prevIndex && !g(selectedAtom)) {
        // Restore previous position unless choices were preloaded
        if (!g(wereChoicesPreloadedAtom)) {
          let adjustForGroup = prevIndex;
          if (cs?.[prevIndex - 1]?.item?.skip) {
            adjustForGroup -= 1;
          }
          s(scrollRequestAtom, {
            context: scrollContext,
            target: adjustForGroup,
            reason: 'restore',
          });
        }
      } else if (!g(wereChoicesPreloadedAtom)) {
        // Scroll to top for new choices
        s(scrollRequestAtom, {
          context: scrollContext,
          target: 0,
          align: 'start',
          reason: 'choices-updated',
        });
      }
    } else {
      s(focusedChoiceAtom, noChoice);
      if (isFilter && Boolean(cs) && g(promptReadyAtom)) {
        s(pushIpcMessageAtom, { channel: Channel.NO_CHOICES, state: {} });
      }
    }

    const itemHeight = g(itemHeightAtom);
    const prevVirtualHeight = g(choicesHeightAtom);
    const choicesHeight = calcVirtualListHeight(cs as any, itemHeight, MAX_VLIST_HEIGHT);

    if (isDebugResizeEnabled()) {
      try {
        log.info('jotai: calcVirtualListHeight', {
          prevVirtualHeight,
          nextVirtualHeight: choicesHeight,
          itemHeight,
          choicesLength: cs.length,
          promptId: g(promptDataAtom)?.id,
          ui: g(uiAtom),
        });
      } catch {}
    }

    s(choicesHeightAtom, choicesHeight);
    try {
      // Nudge the resize scheduler explicitly when choices height changes so the controller runs,
      // even if _mainHeight hasn't changed yet.
      s(scheduleResizeAtom, 'CHOICES_HEIGHT');
      if (isDebugResizeEnabled()) {
        try {
          log.info('jotai: scheduleResize after choices height set', {
            prevVirtualHeight,
            nextVirtualHeight: choicesHeight,
            choicesLength: cs.length,
          });
        } catch {}
      }
    } catch {}

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
    // When the actions overlay is open, freeze the choices index
    if (g(actionsOverlayOpenAtom) || g(submittedAtom)) return;

    const cs = g(choices);
    if (cs.length === 0) {
      s(_indexAtom, 0);
      return;
    }

    const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a;

    const list = g(listAtom);
    const direction = g(directionAtom);

    let calcIndex = clampedIndex;
    let choice = cs?.[calcIndex]?.item;

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

    if (g(_indexAtom) !== calcIndex) {
      s(_indexAtom, calcIndex);
    }

    const gridReady = g(gridReadyAtom);
    if (list || gridReady) {
      // Determine context based on grid mode
      const scrollContext = gridReady ? 'choices-grid' : 'choices-list';

      // Always scroll to keep focused item visible, matching old requiresScroll === -1 behavior
      if (cs[0]?.item?.skip && calcIndex === 1) {
        s(scrollRequestAtom, {
          context: scrollContext,
          target: 0,
          align: 'start',
          reason: 'skip-adjustment',
        });
      } else {
        // Always scroll on navigation to keep focused item in view
        s(scrollRequestAtom, {
          context: scrollContext,
          target: calcIndex,
          reason: 'navigation',
        });
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

export const focusedChoiceAtom = atom(
  (g) => g(_focused),
  (_g, s, choice: Choice) => {
    // Simple setter - side effects handled by ChoicesController
    s(_focused, choice || noChoice);
  },
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
      s(resetActionsOverlayStateAtom as any, null);
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

    s(pushIpcMessageAtom, { channel: Channel.ON_MENU_TOGGLE, state: {} });
    resize(g, s, 'FLAG_VALUE');
  },
);

// Helper function to find match positions for highlighting
const findMatchPositions = (text: string, query: string): [number, number][] => {
  const positions: [number, number][] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let index = lowerText.indexOf(lowerQuery);

  while (index !== -1) {
    positions.push([index, index + query.length]);
    index = lowerText.indexOf(lowerQuery, index + 1);
  }

  return positions;
};

// --- Scored Flags ---
export const scoredFlagsAtom = atom(
  (g) => {
    if (!g(hasActionsAtom)) return [];
    const input = (g(actionsInputAtom) || '').toLowerCase().trim();
    const base = g(scoredFlags);
    if (!input) return base;

    // Client-side filter with match position calculation for highlighting
    return base
      .filter((sc) => {
        const it: any = sc?.item || {};
        const name = (it.name || '').toLowerCase();
        const desc = (it.description || '').toLowerCase();
        const id = (it.id || '').toLowerCase();
        const val = (typeof it.value === 'string' ? it.value : '').toLowerCase();
        return name.includes(input) || desc.includes(input) || id.includes(input) || val.includes(input);
      })
      .map((sc) => {
        // Calculate match positions for highlighting
        const it: any = sc?.item || {};
        const matches: any = {};

        // Check name field for matches
        if (it.name) {
          const nameMatches = findMatchPositions(it.name, input);
          if (nameMatches.length > 0) {
            matches.slicedName = nameMatches;
          }
        }

        // Check tag field for matches
        if (it.tag) {
          const tagMatches = findMatchPositions(it.tag, input);
          if (tagMatches.length > 0) {
            matches.tag = tagMatches;
          }
        }

        // Check description field for matches
        if (it.description) {
          const descMatches = findMatchPositions(it.description, input);
          if (descMatches.length > 0) {
            matches.description = descMatches;
          }
        }

        return {
          ...sc,
          matches,
        };
      });
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
    // Only respond to index changes while the actions overlay is open
    const overlayOpen = g(actionsOverlayOpenAtom);
    if (!overlayOpen) {
      s(focusedFlagValueAtom, '');
      // When the actions menu is not open, ensure no focused action remains
      s(focusedActionAtom, {} as any);
      return;
    }

    const cs = g(scoredFlagsAtom);
    if (cs.length === 0) {
      s(flagsIndex, 0);
      return;
    }

    // Defensive: if no actionable items exist, clear focused flag/action and avoid focusing headers
    const anyActionable = cs.some((c) => !c?.item?.skip);
    if (!anyActionable) {
      // Keep index stable but ensure no focused value/action
      s(focusedFlagValueAtom, '');
      s(focusedActionAtom, {} as any);
      s(flagsIndex, a < 0 ? 0 : a >= cs.length ? 0 : a);
      return;
    }

    const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a;

    const list = g(flagsListAtom);
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

    // Scroll directly on the list ref - bypassing scrollRequestAtom to avoid race conditions
    // The flags overlay mounts/unmounts, so the scroll service's async dispatch often misses
    if (list?.scrollToItem) {
      if (cs[0]?.item?.skip && calcIndex === 1) {
        list.scrollToItem(0, 'auto');
      } else {
        list.scrollToItem(calcIndex, 'auto');
      }
    }

    const focusedFlag = (choice as Choice)?.value;
    s(focusedFlagValueAtom, focusedFlag);

    // If the selected flag represents an action (hasAction), set focusedAction so submits trigger ACTION
    try {
      const flags = g(flagsAtom);
      const flagData: any = flags?.[focusedFlag as keyof typeof flags];
      if (flagData?.hasAction) {
        const action = {
          name: flagData?.name ?? (focusedFlag as string),
          flag: focusedFlag,
          value: focusedFlag,
          hasAction: true,
          shortcut: flagData?.shortcut,
        } as any;
        s(focusedActionAtom, action);
      } else {
        // Clear focusedAction if current selection is not an action
        s(focusedActionAtom, {} as any);
      }
    } catch (e) {
      // Be resilient; never throw from state setter
      console.error('Error setting focusedAction from flagsIndexAtom', e);
      s(focusedActionAtom, {} as any);
    }
  },
);

// --- Resize Logic (delegated to ResizeController) ---
// Keep the same API so existing call sites keep compiling,
// but the only action is to request the controller to recompute.
export const resize = debounce(
  (_g: Getter, s: Setter, reason = 'UNSET') => {
    console.log(`jotai.resize: incrementing resizeTickAtom, reason: ${reason}`);
    s(resizeTickAtom, (v) => v + 1);
  },
  RESIZE_DEBOUNCE_MS,
  { leading: true, trailing: true },
);

import { ResizeReason } from './state/resize/reasons';
// Route all external triggers through the scheduler for reason coalescing
import { scheduleResizeAtom } from './state/resize/scheduler';
export const triggerResizeAtom = atom(null, (_g, s, reason: string) => {
  s(scheduleResizeAtom, reason || 'UNKNOWN');
});

export const domUpdatedAtom = atom(null, (g, s, reason = '') => {
  let debounced = g(domUpdatedDebouncedAtom);
  if (!debounced) {
    debounced = debounce(
      (r = '') => {
        s(scheduleResizeAtom, r || 'DOM');
      },
      PREVIEW_THROTTLE_MS,
      { leading: true, trailing: true },
    );
    s(domUpdatedDebouncedAtom, debounced);
  }

  debounced(reason);
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
    // Controller will run on _mainHeight change; no explicit call required here.
  },
);

// --- Channel Communication ---
export const channelAtom = atom((g) => {
  if (g(pauseChannelAtom)) {
    return () => {};
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

    sendAppMessage(channel, appMessage);
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
    script: g(_script).script,
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
  // When the actions overlay is open, the Enter button remains enabled to run the selected action/flag
  if (g(actionsOverlayOpenAtom)) return false;
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
    const flagMeta = g(focusedFlagMetaAtom);
    const lastConsumedFlagMeta = g(lastConsumedFlagMetaAtom);
    const overlayOpen = g(actionsOverlayOpenAtom);

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

    // Decide submission path using dispatcher (ACTION vs VALUE_SUBMITTED)
    const flagIsFresh = hasFreshFlag({
      flag,
      overlayOpen,
      flagMeta,
      lastConsumed: lastConsumedFlagMeta,
    });

    const effectiveFlag = flagIsFresh ? flag : undefined;

    const decisionCtx = {
      hasAction: Boolean((action as FlagsWithKeys)?.hasAction),
      action,
      overlayOpen,
      flag: effectiveFlag,
    };

    s(onInputSubmitAtom, {});
    s(promptActiveAtom, false);
    s(disableSubmitAtom, false);

    if (g(submittedAtom)) return;

    const focusedChoice = g(focusedChoiceAtom);

    const fid = focusedChoice?.id;
    if (fid) {
      const key = g(promptDataAtom)?.key;
      if (key) {
        appendChoiceIdToHistory(key, fid);
      }
    }

    let value = ui === UI.term ? g(termOutputAtom) : checkSubmitFormat(g, a);

    const focusedChoiceIsNoChoice = focusedChoice === noChoice;
    const inputIsEmpty = g(inputAtom) === '';
    const choicesAreEmpty = g(choicesAtom).length === 0;
    if (focusedChoiceIsNoChoice && inputIsEmpty && choicesAreEmpty && ui === UI.arg) {
      value = '';
    }

    const { channel, override } = decideSubmit(decisionCtx as any, value);
    s(pushIpcMessageAtom, { channel, state: override });

    if (effectiveFlag) {
      s(markFlagConsumedAtom as any, null as any);
    }

    // Clear state for action submissions
    if (channel === Channel.ACTION) {
      // Keep focusedActionAtom intact so repeated Enter from overlay retriggers ACTION.
      if ((action as any)?.close && g(actionsOverlayOpenAtom)) {
        s(closeActionsOverlayAtom as any, null as any);
      }
      // Don't mark as submitted for ACTION; allow repeated triggers
      return;
    }

    s(loadingAtom, false);
    s(spinnerControlAtom, 'start');

    s(submittedAtom, true);
    s(closedInput, g(inputAtom));
    s(_flaggedValue, '');
    s(selectedChoicesAtom, []);
    s(focusedFlagValueAtom, '');
    s(prevIndexAtom, 0);
    s(_submitValue, value);

    s(webcamStreamAtom, null);
  },
);

export const submitInputAtom = atom(null, (g, s) => {
  const input = g(inputAtom);
  s(submitValueAtom, input);
});

// Helper atom action to set a flag based on its defined shortcut string
export const setFlagByShortcutAtom = atom(null, (g, s, a: string) => {
  const flags = g(flagsAtom);
  const flagKey = Object.keys(flags).find((key) => flags[key]?.shortcut === a);
  log.info(`🏴‍☠️ Setting flag by shortcut: ${flagKey}`);
  if (flagKey) {
    const flagData = flags[flagKey];
    // Check if this is an action with onAction handler
    if ((flagData as any)?.hasAction) {
      // Set the focused action for actions with onAction handlers
      const action = {
        name: flagData?.name ?? flagKey,
        flag: flagKey,
        value: flagKey,
        hasAction: true,
        shortcut: flagData?.shortcut,
      };
      console.log('[setFlagByShortcutAtom] Action with onAction detected:', action);
      s(focusedActionAtom, action as any);
    } else {
      // Normal flag behavior
      s(focusedActionAtom, {} as any);
      s(flaggedChoiceValueAtom, flagKey);
      s(focusedFlagValueAtom, flagKey);
    }
  }
});

export const escapeAtom = atom((g) => {
  return () => {
    cancelSpeech();

    log.info('👋 Sending Channel.ESCAPE');
    // Use channelAtom directly for this special case (like onPasteAtom/onDropAtom)
    const channel = g(channelAtom);
    channel(Channel.ESCAPE);
  };
});

export const blurAtom = atom(null, (g, s) => {
  if (g(openAtom)) {
    s(pushIpcMessageAtom, { channel: Channel.BLUR, state: {} });
  }
});

// This atom returns a function for compatibility with form.tsx
export const changeAtom = atom((g) => (data: any) => {
  const channel = g(channelAtom);
  channel(Channel.CHANGE, { value: data });
});

// This atom returns a function for compatibility with icon.tsx
export const runMainScriptAtom = atom(() => () => {
  sendChannel(AppChannel.RUN_MAIN_SCRIPT);
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

// Re-export atoms that were moved to other files
export {
  getEditorHistoryAtom,
  sendActionAtom,
  sendShortcutAtom,
  triggerKeywordAtom,
} from './state/atoms/actions-utils';
export { preventSubmitAtom, valueInvalidAtom } from './state/atoms/utilities';

// This atom returns a function for compatibility with useMessages.ts
export const colorAtom = atom((g) => {
  return async () => {
    const sRGBHex = await pickColor();
    if (!sRGBHex) return '';

    const color = colorUtils.convertColor(sRGBHex);
    const channel = Channel.GET_COLOR;
    const pid = g(pidAtom);

    const appMessage = {
      channel,
      pid: pid || 0,
      value: color,
    };

    sendChannel(channel, appMessage);
    return color;
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

// Removed - now in utilities.ts

// Removed - now in utilities.ts

// Removed - now in actions-utils.ts

// Removed - now in actions-utils.ts

// Removed - now in actions-utils.ts

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
  const disabled = g(actionsOverlayOpenAtom); // Disabled if the actions menu is already open

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
    .map(
      ({ key, name, bar, flag, visible }) =>
        ({
          key,
          name,
          value: key,
          shortcut: formatShortcut(key),
          position: bar,
          flag,
          disabled: Boolean(disabled),
          visible: Boolean(visible),
        }) as Action,
    );

  return flagActions.concat(shortcutActions);
});

export const preventSubmitWithoutActionAtom = atom((g) => {
  const overlayOpen = g(actionsOverlayOpenAtom);
  const focusedAction = g(focusedActionAtom);
  const hasFlagSelected = !!g(focusedFlagValueAtom);
  // Allow submit if a flag is selected (legacy flow) OR an action object exists
  // Only prevent when actions menu is open AND neither is present.
  return overlayOpen && !hasFlagSelected && Object.keys(focusedAction || {}).length === 0;
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
  log.info(`${window.pid}: 🚀🚀🚀 INIT_PROMPT RECEIVED - initPromptAtom triggered`);
  const currentPromptData = g(promptDataAtom);
  log.info(
    `${window.pid}: Current promptData.id: "${currentPromptData?.id}", scriptPath: "${currentPromptData?.scriptPath}"`,
  );
  if (currentPromptData?.id) {
    log.info(`🚪 Init prompt skipped. Already initialized as ${currentPromptData?.id}`);
    return;
  }
  // Restore state from cache atomically to prevent flicker
  const promptData = g(cachedMainPromptDataAtom) as PromptData;
  const scoredChoices = g(cachedMainScoredChoicesAtom);
  log.info(
    `${window.pid}: 🚀 RESTORING FROM CACHE: promptData.id="${promptData?.id}", scoredChoices.length=${scoredChoices?.length}`,
  );
  s(promptDataAtom, promptData);
  s(scoredChoicesAtom, scoredChoices);
  s(previewHTMLAtom, g(cachedMainPreviewAtom));
  s(shortcutsAtom, g(cachedMainShortcutsAtom));
  s(flagsAtom, g(cachedMainFlagsAtom));
  log.info(`${window.pid}: 🚀 Cache restore complete`);
});

const promptBoundsDefault = {
  id: '',
  width: 0,
  height: 0,
  x: 0,
  y: 0,
};

export const clearCacheAtom = atom(null, (_g, s) => {
  s(cachedMainPromptDataAtom, null as any);
  s(cachedMainScoredChoicesAtom, []);
  s(cachedMainPreviewAtom, '');
  s(cachedMainShortcutsAtom, []);
  s(cachedMainFlagsAtom, {});
  s(promptDataAtom, null);
  s(scoredChoicesAtom, []);
  s(promptBoundsAtom, promptBoundsDefault);
});

const _topHeight = atom(88);
export const topHeightAtom = atom(
  (g) => g(_topHeight),
  (g, s, newHeight: number) => {
    s(_topHeight, newHeight);
    if (g(resizeCompleteAtom)) {
      resize(g, s, 'TOP_HEIGHT');
    }
  },
);

// These atoms need to return functions for backward compatibility with App.tsx
export const onPasteAtom = atom((g) => {
  // Create a closure that captures the setter via a writable atom
  const setter = atom(null, (_g, s, _event: ClipboardEvent) => {
    const currentUI = g(uiAtom);
    console.log(
      JSON.stringify({
        source: 'onPasteAtom_setter',
        currentUI,
        action: currentUI !== UI.editor ? 'sending_ON_PASTE' : 'letting_Monaco_handle',
      }),
    );

    // Don't prevent paste in editor - let Monaco handle it naturally
    if (currentUI !== UI.editor) {
      // Only send ON_PASTE for non-editor UIs
      s(pushIpcMessageAtom, { channel: Channel.ON_PASTE, state: {} });
    }
  });

  // Return a function that can be called with the event
  return (event: ClipboardEvent) => {
    const currentUI = g(uiAtom);
    console.log(
      JSON.stringify({
        source: 'onPasteAtom',
        eventType: event.type,
        currentUI,
        action: currentUI !== UI.editor ? 'sending_ON_PASTE' : 'NOT_preventing_default',
      }),
    );

    // Don't prevent paste in editor - let Monaco handle it naturally
    if (currentUI !== UI.editor) {
      // Only send ON_PASTE for non-editor UIs
      const channel = g(channelAtom);
      channel(Channel.ON_PASTE);
    }
    // For editor, do nothing - let the default paste behavior work
  };
});

export const onDropAtom = atom((g) => {
  // Return a function that can be called with the event
  return (event: DragEvent) => {
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
    // This is a limitation - we can't directly call setter from here
    // Let's use the channelAtom as before for these special cases
    const channel = g(channelAtom);
    channel(Channel.ON_DROP, { drop });
  };
});
