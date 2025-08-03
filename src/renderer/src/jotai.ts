// =================================================================================================
// IMPORTS AND SETUP
// =================================================================================================

import type { AppDb, UserDb } from '@johnlindquist/kit/core/db';
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
import type {
  AppConfig,
  AppMessage,
  EditorConfig,
  EditorOptions,
  TextareaConfig,
} from '@johnlindquist/kit/types/kitapp';
import Convert from 'ansi-to-html';
import DOMPurify from 'dompurify';
import type { Rectangle } from 'electron';
import { type Atom, type Getter, type Setter, atom } from 'jotai';
import { drop as _drop, debounce, isEqual, throttle } from 'lodash-es';
import type { editor } from 'monaco-editor';
import type { MessageType } from 'react-chat-elements';
import { unstable_batchedUpdates } from 'react-dom';
import type { VariableSizeList } from 'react-window';

// Assuming these imports are correct based on the original file structure
import { findCssVar, toHex } from '../../shared/color-utils';
import { DEFAULT_HEIGHT, SPLASH_PATH, closedDiv, noChoice, noScript } from '../../shared/defaults';
import { AppChannel } from '../../shared/enums';
import type { ResizeData, ScoredChoice, Survey, TermConfig } from '../../shared/types';
import { formatShortcut } from './components/formatters';
import { createLogger } from './log-utils';
import { arraysEqual, colorUtils, dataUtils, domUtils, themeUtils } from './utils/state-utils';

const { ipcRenderer } = window.electron;
const log = createLogger('jotai.ts');

// =================================================================================================
// FILE: src/state/app-core.ts
// Description: Core application state, configuration, and process management.
// =================================================================================================

// --- Configuration and Environment ---

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

export const kitConfigAtom = atom({
  kitPath: '',
  mainScriptPath: '',
});

export const userAtom = atom<UserDb>({});

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
    s(_kitStateAtom, {
      ...g(_kitStateAtom),
      ...a,
    });
  },
);

export const isSponsorAtom = atom(false);
export const updateAvailableAtom = atom(false);
export const processesAtom = atom<ProcessInfo[]>([]);
export const cmdAtom = atom((g) => (g(appConfigAtom).isWin ? 'ctrl' : 'cmd'));

// --- Process and Execution State ---

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

export const processingAtom = atom(false);
export const runningAtom = atom(false);
export const submittedAtom = atom(false);

const loading = atom<boolean>(false);
export const loadingAtom = atom(
  (g) => g(loading) || g(runningAtom),
  (_g, s, a: boolean) => {
    s(loading, a);
  },
);

export const progressAtom = atom(0);

// --- Application Lifecycle and Visibility ---

const _open = atom(false);
export const openAtom = atom(
  (g) => g(_open),
  (g, s, a: boolean) => {
    if (g(_open) === a) return;

    s(mouseEnabledAtom, 0);

    // Handling closure side effects
    if (g(_open) && a === false) {
      s(resizeCompleteAtom, false);
      s(lastScriptClosed, g(_script).filePath);
      // s(_open, a); // Set state after cleanup if needed, but seems fine here.

      // Resetting various states on close
      s(closedInput, g(_inputAtom));
      s(_panelHTML, '');
      s(formHTMLAtom, '');
      s(logHTMLAtom, '');
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

      // Cleanup media streams
      const stream = g(webcamStreamAtom);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        s(webcamStreamAtom, null);
        const webcamEl = document.getElementById('webcam') as HTMLVideoElement;
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

export const isHiddenAtom = atom(false);
export const promptActiveAtom = atom(false);
export const justOpenedAtom = atom(false);
const isReady = atom(true); // Used primarily for the Splash screen
export const isReadyAtom = atom(
  (g) => g(isReady),
  (_g, s, a: boolean) => {
    s(isReady, a);
  },
);

// --- Caching ---

export const cachedAtom = atom(false);
// Note: Renamed cachedMainScoredChoices to adhere to naming convention (should start with export)
export const cachedMainScoredChoices = atom<ScoredChoice[]>([]);
export const cachedMainScoredChoicesAtom = atom(
  (g) => g(cachedMainScoredChoices),
  (_g, s, a: ScoredChoice[]) => {
    s(cachedMainScoredChoices, a);
  },
);

export const cachedMainPromptDataAtom = atom<Partial<PromptData>>({
  ui: UI.arg,
  input: '',
  footerClassName: 'hidden',
  headerClassName: 'hidden',
  containerClassName: '',
  placeholder: 'Script Kit',
  enter: 'Run',
});
export const cachedMainShortcutsAtom = atom<Shortcut[]>([]);
export const cachedMainPreviewAtom = atom<string>('');
export const cachedMainFlagsAtom = atom<FlagsObject>({});

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

// =================================================================================================
// FILE: src/state/script-state.ts
// Description: State related to the currently executing script.
// =================================================================================================

const _script = atom<Script>(noScript);
export const lastScriptClosed = atom('');
export const backToMainAtom = atom(false);
export const preloadedAtom = atom(false);

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
        // Clear preview if not preloaded and not the main script
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
    // Reset temporary theme when script changes
    s(_tempThemeAtom, g(themeAtom));
  },
);

export const isMainScriptAtom = atom(false);

export const isKitScriptAtom = atom<boolean>((g) => {
  return (g(_script) as Script)?.filePath?.includes(g(kitConfigAtom).kitPath);
});

export const isMainScriptInitialAtom = atom<boolean>((g) => {
  return g(isMainScriptAtom) && g(inputAtom) === '';
});

export const isSplashAtom = atom((g) => {
  return g(scriptAtom)?.filePath === SPLASH_PATH;
});

export const socialAtom = atom((g) => {
  const script = g(scriptAtom);
  if (script?.twitter) {
    const twitter = script.twitter;
    const username = twitter.startsWith('@') ? twitter.slice(1) : twitter;
    return {
      username: twitter,
      url: `https://twitter.com/${username}`,
    };
  }

  if (script?.github) {
    return {
      username: script.github,
      url: `https://github.com/${script.github}`,
    };
  }

  if (script?.social) {
    return {
      username: script.social || '',
      url: script.social_url || '',
    };
  }

  return undefined;
});

// =================================================================================================
// FILE: src/state/prompt-data.ts
// Description: Core data driving the prompt UI and behavior (PromptData and related atoms).
// =================================================================================================

const promptData = atom<null | Partial<PromptData>>({
  ui: UI.arg,
  input: '',
  footerClassName: 'hidden',
  headerClassName: 'hidden',
  containerClassName: '',
  placeholder: 'Script Kit',
});

// Renamed promptReadyAtom to be exported
export const promptReadyAtom = atom(false);
let wasPromptDataPreloaded = false;

// The main atom setter that processes incoming PromptData and updates numerous other atoms.
export const promptDataAtom = atom(
  (g) => g(promptData),
  (g, s, a: null | PromptData) => {
    // Handle null case (resetting)
    if (!a) {
      s(promptData, null);
      return;
    }

    s(choicesReadyAtom, false);
    const pid = g(pidAtom);
    s(gridReadyAtom, false);

    const isMainScript = a.scriptPath === g(kitConfigAtom).mainScriptPath;
    s(isMainScriptAtom, isMainScript);

    // Cache management for main script
    if (isMainScript && !a.preload && g(tabIndexAtom) === 0) {
      s(cachedMainPromptDataAtom, a);
    }

    // Preview management based on UI type
    if (a.ui !== UI.arg && !a.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    s(isHiddenAtom, false);
    const prevPromptData = g(promptData);

    // Preload status tracking
    wasPromptDataPreloaded = Boolean(prevPromptData?.preload && !a.preload);
    log.info(
      `${pid}: 👀 Preloaded: ${a.scriptPath} ${wasPromptDataPreloaded} Keyword: ${a.keyword}`,
    );

    // Handle open state transitions
    if (!prevPromptData && a) {
      s(justOpenedAtom, true);
      setTimeout(() => s(justOpenedAtom, false), 250);
    } else {
      s(justOpenedAtom, false);
    }

    // Editor history handling
    if (prevPromptData?.ui === UI.editor && g(_inputChangedAtom)) {
      s(editorHistoryPush, g(closedInput));
    }

    s(_inputChangedAtom, false);

    // UI and Focus updates
    if (a.ui !== UI.arg) {
      s(focusedChoiceAtom, noChoice);
    }
    s(uiAtom, a.ui);
    s(_open, true);
    s(submittedAtom, false);

    // Terminal configuration
    if (a.ui === UI.term) {
      const b: any = a; // Using any for convenience as input/cwd/etc are on the prompt data
      const config: TermConfig = {
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

    // Input handling based on keywords and script type
    if (!(a.keyword || (g(isMainScriptAtom) && a.ui === UI.arg))) {
      const inputWhileSubmitted = g(inputWhileSubmittedAtom);
      const forceInput = a.input || inputWhileSubmitted || '';
      log.info(`${pid}: 👂 Force input due to keyword or mainScript`);

      const prevInput = g(_inputAtom);
      const prevInputHasSlash = prevInput.includes('/') || prevInput.includes('\\');

      // Complex logic to determine if input should be updated (e.g., handling path inputs vs keyword triggers)
      if (forceInput && (!prevInput.startsWith(forceInput) || prevInputHasSlash)) {
        s(_inputAtom, forceInput);
      } else if (!forceInput) {
        s(_inputAtom, forceInput);
      }
    }

    // Resetting various states
    s(_inputWhileSubmittedAtom, '');
    s(_flaggedValue, '');
    s(hintAtom, a.hint);
    s(placeholderAtom, a.placeholder);
    s(selectedAtom, a.selected);
    s(tabsAtom, a.tabs);
    s(processingAtom, false);
    s(focusedFlagValueAtom, '');
    s(flagsAtom, a.flags || {});
    s(choiceInputsAtom, []);

    // UI Element visibility and styling
    s(headerHiddenAtom, !!a.headerClassName?.includes('hidden'));
    s(footerHiddenAtom, !!a.footerClassName?.includes('hidden'));
    s(containerClassNameAtom, a.containerClassName || '');

    // Description and Name
    const script = g(scriptAtom);
    const promptDescription = a.description || (a.name ? '' : script?.description || '');
    const promptName = a.name || script?.name || '';
    s(descriptionAtom, promptDescription || promptName);
    s(nameAtom, promptDescription ? promptName : promptDescription);

    // Preview and Panel content
    if (!a.keepPreview && a.preview) {
      s(previewHTMLAtom, a.preview);
    }
    if (a.panel) {
      s(panelHTMLAtom, a.panel);
    }

    // Footer and Defaults
    if (typeof a.footer === 'string') {
      s(footerAtom, a.footer);
    }
    s(defaultChoiceIdAtom, a.defaultChoiceId || '');
    s(defaultValueAtom, a.defaultValue || '');

    // Form data
    if (a.html) {
      s(formHTMLAtom, domUtils.ensureFormHasSubmit(a.html));
    }
    if (a.formData) {
      s(formDataAtom, a.formData);
    }

    // Heights
    s(itemHeightAtom, a.itemHeight || PROMPT.ITEM.HEIGHT.SM);
    s(inputHeightAtom, a.inputHeight || PROMPT.INPUT.HEIGHT.SM);

    // Shortcuts and Actions
    s(onInputSubmitAtom, a.shortcodes || {});
    s(shortcutsAtom, a.shortcuts || []);
    s(actionsConfigAtom, a.actionsConfig || {});

    s(prevChoicesConfig, []);
    s(audioDotAtom, false);

    if (a.choicesType === 'async') {
      s(loadingAtom, true);
    }

    // Enter key behavior
    if (typeof a.enter === 'string') {
      s(enterAtom, a.enter);
    } else {
      s(enterAtom, 'Submit');
    }

    if (!g(hasActionsAtom)) {
      s(flagsHeightAtom, 0);
    }

    s(promptData, a);

    // Communication and finalization
    const channel = g(channelAtom);
    channel(Channel.ON_INIT);

    ipcRenderer.send(Channel.SET_PROMPT_DATA, {
      messageId: a.messageId,
      ui: a.ui,
    });

    s(promptReadyAtom, true);
    s(promptActiveAtom, true);
    s(tabChangedAtom, false);
    s(actionsInputAtom, '');
    s(_termOutputAtom, '');
  },
);

export const modeAtom = atom((g) => g(promptData)?.mode || Mode.FILTER);

// --- UI Elements derived from PromptData ---

const _ui = atom<UI>(UI.arg);
export const uiAtom = atom(
  (g) => g(_ui),
  (g, s, a: UI) => {
    s(_ui, a);

    // Manage focus based on UI type
    if ([UI.arg, UI.textarea, UI.hotkey, UI.splash].includes(a)) {
      s(inputFocusAtom, true);
    }

    // Clear 'Enter' label for certain UIs
    if ([UI.splash, UI.term, UI.editor, UI.hotkey].includes(a)) {
      s(enterAtom, '');
    }

    // Clear choices when switching away from the main argument UI
    if (a !== UI.arg && g(scoredChoicesAtom)?.length > 0) {
      s(scoredChoicesAtom, []);
    }

    // Notify main process about UI change, ensuring the element exists first
    let id: string = a === UI.arg ? 'input' : a;
    const timeoutId = setTimeout(() => ipcRenderer.send(a), 250);

    let attempts = 0;
    const maxAttempts = 60; // ~1 second

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
  },
);

const hint = atom('');
export const hintAtom = atom(
  (g) => g(hint),
  (g, s, a: string) => {
    const aHint = typeof a !== 'string' ? '' : a;
    const getConvert = g(convertAtom);
    // Convert ANSI codes to HTML for the hint
    s(hint, getConvert(true).toHtml(aHint));
  },
);

let placeholderTimeoutId: NodeJS.Timeout;
const placeholder = atom('');
export const placeholderAtom = atom(
  (g) => g(placeholder),
  (_g, s, a: string) => {
    s(placeholder, a);
    if (placeholderTimeoutId) {
      clearTimeout(placeholderTimeoutId);
    }
  },
);

const _enterAtom = atom<string>('');
export const enterAtom = atom(
  (g) => g(_enterAtom),
  (_g, s, a: string) => {
    s(_enterAtom, a);
  },
);

export const logoAtom = atom<string>('');
export const descriptionAtom = atom<string>('');
export const nameAtom = atom<string>('');
export const footerAtom = atom('');
export const containerClassNameAtom = atom('');
export const cssAtom = atom('');

// --- Tabs ---

const tabs = atom<string[]>([]);
export const tabsAtom = atom(
  (g) => g(tabs),
  (g, s, a: string[]) => {
    const prevTabs = g(tabs);
    if (isEqual(prevTabs, a)) return;
    s(tabs, a || []);
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
    { leading: true, trailing: true },
  );

export const tabIndexAtom = atom(
  (g) => g(_tabIndex),
  (g, s, a: number) => {
    s(_inputChangedAtom, false);
    s(prevIndexAtom, 0);

    if (g(_tabIndex) !== a) {
      s(_tabIndex, a);
      // Reset flags when tab changes
      s(flagsAtom, {});
      s(_flaggedValue, '');

      sendTabChanged = sendTabChanged || getSendTabChanged(g);
      sendTabChanged();

      s(tabChangedAtom, true);
    }
  },
);

export const showTabsAtom = atom((g) => {
  const isArg = [UI.arg].includes(g(uiAtom));
  const hasTabs = g(tabsAtom)?.length > 0;
  return isArg && hasTabs;
});

// --- Shortcuts ---

const _shortcuts = atom<Shortcut[]>([]);
export const shortcutsAtom = atom(
  (g) => g(_shortcuts),
  (g, s, a: Shortcut[]) => {
    const prevShortcuts = g(_shortcuts);
    if (isEqual(prevShortcuts, a)) return;
    log.info(`🔥 Setting shortcuts to ${a.length}`, a);
    s(_shortcuts, a);
  },
);

export const hasRightShortcutAtom = atom((g) => {
  return !!g(shortcutsAtom).find((s) => s?.key === 'right');
});

// =================================================================================================
// FILE: src/state/input-state.ts
// Description: Manages user input, modifiers, and focus state.
// =================================================================================================

export const _inputAtom = atom('');
export const prevInputAtom = atom('');
export const closedInput = atom('');
export const _inputChangedAtom = atom(false);
export const typingAtom = atom<boolean>(false);
export const beforeInputAtom = atom(''); // Seems potentially unused, but kept for export compatibility.

export const inputAtom = atom(
  (g) => g(_inputAtom),
  async (g, s, a: string) => {
    s(directionAtom, 1);
    const selected = g(showSelectedAtom);
    const prevInput = g(_inputAtom);

    // Reset index when input is cleared
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

    // Notify backend of input change
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

    // Handle input change immediately following a tab change
    if (g(tabChangedAtom) && a && prevInput !== a) {
      s(tabChangedAtom, false);
      return;
    }

    // Trigger loading state for GENERATE mode
    if (mode === Mode.GENERATE && !flaggedValue) {
      s(loading, true);
      s(loadingAtom, true);
    }

    // Trigger resize if input was cleared
    if (g(_inputChangedAtom) && a === '') {
      resize(g, s, 'INPUT_CLEARED');
    }
  },
);

export const appendInputAtom = atom(null, (g, s, a: string) => {
  const ui = g(uiAtom);
  if (ui === UI.editor) {
    s(editorAppendAtom, a);
  } else {
    const input = g(_inputAtom);
    s(_inputAtom, input + a);
  }
});

const _inputWhileSubmittedAtom = atom('');
export const inputWhileSubmittedAtom = atom(
  (g) => g(_inputWhileSubmittedAtom),
  (_g, s, a: string) => {
    log.info(`🔥 Input while submitted: ${a}`);
    s(_inputWhileSubmittedAtom, a);
  },
);

// --- Modifiers and Key State ---

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
export const _lastKeyDownWasModifierAtom = atom(false);
export const lastKeyDownWasModifierAtom = atom(
  (g) => g(_lastKeyDownWasModifierAtom),
  (_g, s, a: boolean) => {
    s(_lastKeyDownWasModifierAtom, a);
  },
);

export const enterLastPressedAtom = atom<Date | null>(null);
const enterPressed = atom(false);
export const enterPressedAtom = atom(
  (g) => g(enterPressed),
  (_g, s) => {
    s(enterPressed, true);
    setTimeout(() => s(enterPressed, false), 100);
  },
);

// --- Focus and Interaction ---

export const inputFocusAtom = atom<number>(Math.random());
export const focusedElementAtom = atom<null | HTMLElement>(null);
export const selectionStartAtom = atom(0);
export const isMouseDownAtom = atom(false);

const mouseEnabled = atom(0);
// Requires a small amount of movement (5 units) before enabling mouse interaction
export const mouseEnabledAtom = atom(
  (g) => g(mouseEnabled) > 5,
  (g, s, a: number) => {
    s(mouseEnabled, a ? g(mouseEnabled) + a : a);
  },
);

// =================================================================================================
// FILE: src/state/choices-state.ts
// Description: Management of choices, filtering, indexing, and selection.
// =================================================================================================

const choices = atom<ScoredChoice[]>([]);
// Renamed choicesReadyAtom to be exported
export const choicesReadyAtom = atom(false);
export const filteredChoicesIdAtom = atom<number>(0);
const prevScoredChoicesIdsAtom = atom<string[]>([]);

// Configuration for how choices are loaded (e.g., preloading)
let choicesPreloaded = false;
let wereChoicesPreloaded = false;
const choicesConfig = atom({ preload: false });
export const prevChoicesConfig = atom({ preload: false });

export const choicesConfigAtom = atom(
  (g) => g(choicesConfig),
  (g, s, a: { preload: boolean }) => {
    wereChoicesPreloaded = !a?.preload && choicesPreloaded;
    choicesPreloaded = a?.preload;
    s(directionAtom, 1);

    const promptData = g(promptDataAtom);
    const focusedChoice = g(focusedChoiceAtom);

    // Reset preview if the focused choice doesn't have one and there's no default prompt preview
    if (focusedChoice?.name !== noChoice?.name && !focusedChoice?.hasPreview && !promptData?.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    s(loadingAtom, false);

    // Handle index setting after preloading
    const preloaded = g(preloadedAtom);
    if (preloaded) {
      const nextIndex = g(scoredChoicesAtom).findIndex((sc) => sc.item.id === g(defaultChoiceIdAtom));
      s(indexAtom, nextIndex > 0 ? nextIndex : 0);
    }
  },
);

// --- Core Choices Atom ---

export const scoredChoicesAtom = atom(
  (g) => g(choices),
  (g, s, cs: ScoredChoice[] = []) => {
    s(choicesReadyAtom, true);
    s(cachedAtom, false);
    s(loadingAtom, false);
    prevFocusedChoiceId = 'prevFocusedChoiceId';

    // Check if the list of choice IDs has actually changed
    const csIds = cs.map((c) => c.item.id) as string[];
    const prevIds = g(prevScoredChoicesIdsAtom);
    const changed = !arraysEqual(prevIds, csIds);
    s(prevScoredChoicesIdsAtom, csIds);

    // UI adjustment: remove top border from the first item if present
    if (cs[0]?.item?.className) {
      cs[0].item.className = cs[0]?.item?.className.replace('border-t-1', '');
    }

    s(choices, cs || []);
    s(currentChoiceHeightsAtom, cs || []);

    if (g(promptData)?.grid) {
      s(gridReadyAtom, true);
    }

    // Analyze choices for skip/info states
    let hasSkip = false;
    // Initialize allSkip/allInfo/allSkipOrInfo based on whether the list is empty or not.
    // If empty, they should be false (cannot be "all skipped" if there are none).
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

      // Optimization: break early if all conditions are determined
      if (hasSkip && !allSkip && !allInfo && !allSkipOrInfo) break;
    }

    s(hasSkipAtom, hasSkip);
    s(allSkipAtom, allSkip);

    if (changed) {
      s(indexAtom, 0);
    }

    const isFilter = g(uiAtom) === UI.arg && g(promptData)?.mode === Mode.FILTER;
    const channel = g(channelAtom);
    // A list has actionable choices if it's not empty and not all items are skipped or info.
    const hasActionableChoices = !allSkipOrInfo && cs.length > 0;

    if (hasActionableChoices) {
      s(panelHTMLAtom, '');

      // Determine the initial focused index
      const defaultValue: any = g(defaultValueAtom);
      const defaultChoiceId = g(defaultChoiceIdAtom);
      const prevIndex = g(prevIndexAtom);
      const input = g(inputAtom);

      if (defaultValue || defaultChoiceId) {
        // Case 1: Default value/ID provided
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
        // Clear defaults after use
        s(defaultValueAtom, '');
        s(defaultChoiceIdAtom, '');
      } else if (input.length > 0) {
        // Case 2: Input exists (filtering)
        s(requiresScrollAtom, g(requiresScrollAtom) > 0 ? 0 : -1);
        if (changed) {
          s(indexAtom, 0);
        }
      } else if (prevIndex && !g(selectedAtom)) {
        // Case 3: Restoring previous index (e.g., returning from actions menu)
        let adjustForGroup = prevIndex;
        // Adjust if the previous item was a group header (skipped)
        if (cs?.[prevIndex - 1]?.item?.skip) {
          adjustForGroup -= 1;
        }
        s(requiresScrollAtom, wereChoicesPreloaded ? -1 : adjustForGroup);
      } else {
        // Case 4: Default initialization
        s(requiresScrollAtom, wereChoicesPreloaded ? -1 : 0);
      }
    } else {
      // No actionable choices
      s(focusedChoiceAtom, noChoice);
      if (isFilter && Boolean(cs) && g(promptReadyAtom)) {
        channel(Channel.NO_CHOICES);
      }
    }

    // Calculate total height of choices
    let choicesHeight = 0;
    const itemHeight = g(itemHeightAtom);
    for (const { item: { height } } of cs) {
      choicesHeight += height || itemHeight;
      if (choicesHeight > 1920) break; // Limit calculation for very long lists
    }

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

export const choicesAtom = atom((g) => g(scoredChoicesAtom).map((result) => result.item));

// --- Choice Selection and Indexing ---

export const defaultValueAtom = atom('');
export const defaultChoiceIdAtom = atom('');
export const prevIndexAtom = atom(0);
const _indexAtom = atom(0);
export const directionAtom = atom<1 | -1>(1);

export const hasSkipAtom = atom(false);
export const allSkipAtom = atom(false);

let prevChoiceIndexId = 'prevChoiceIndexId';

export const indexAtom = atom(
  (g) => g(_indexAtom),
  (g, s, a: number) => {
    // Do not change index if actions menu is open or if submitted
    if (g(flaggedChoiceValueAtom) || g(submittedAtom)) return;

    const cs = g(choices);
    if (cs.length === 0) {
      s(_indexAtom, 0);
      return;
    }

    // Clamped index handling wrapping around
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
      return; // If all are skipped, don't proceed with indexing logic
    }

    // Handle skipped choices navigation
    if (choice?.skip) {
      let loopCount = 0;
      while (choice?.skip && loopCount < cs.length) {
        calcIndex = (calcIndex + direction + cs.length) % cs.length;
        log.info(`calcIndex: ${calcIndex}, direction: ${direction}, cs.length: ${cs.length}`);
        choice = cs[calcIndex]?.item;
        loopCount++;
      }

      // If all choices were skipped (safety check, though allSkipAtom should handle this)
      if (loopCount === cs.length) {
        calcIndex = clampedIndex; // Reset to original attempt
        choice = cs[calcIndex]?.item;
      }
    }

    prevChoiceIndexId = choice?.id || 'prevChoiceIndexId';

    if (g(_indexAtom) !== calcIndex) {
      s(_indexAtom, calcIndex);
    }

    // Handle scrolling in the list view
    const gridReady = g(gridReadyAtom);
    if (list && !gridReady) {
      // Edge case: scrolling when the first item is skipped
      if (cs[0]?.item?.skip && calcIndex === 1) {
        s(scrollToItemAtom, { index: 0, reason: 'indexAtom - skip adjustment' });
      } else if (requiresScroll === -1) {
        // Standard scroll triggered by keyboard navigation
        s(scrollToItemAtom, { index: calcIndex, reason: 'indexAtom - requiresScroll === -1' });
      }
    }

    // Update focused choice
    const id = choice?.id;
    if (id) {
      s(focusedChoiceAtom, choice);
      // Update preview if the choice defines one inline
      if (typeof choice?.preview === 'string') {
        s(previewHTMLAtom, choice?.preview);
      }
    }
  },
);

// --- Focused Choice ---

const _focused = atom<Choice | null>(noChoice as Choice);
let prevFocusedChoiceId = 'prevFocusedChoiceId';

// Throttled function to handle choice focus updates, reducing overhead during rapid navigation
const throttleChoiceFocused = throttle(
  (g, s, choice: Choice) => {
    s(choiceInputsAtom, []);
    if (choice?.skip) return;
    if (choice?.id === prevFocusedChoiceId) return;
    if (g(submittedAtom)) return;

    prevFocusedChoiceId = choice?.id || 'prevFocusedChoiceId';
    s(_focused, choice || noChoice);

    if (choice?.id || (choice?.name && choice?.name !== noChoice.name)) {
      // Update preview based on the focused choice
      if (typeof choice?.preview === 'string') {
        s(previewHTMLAtom, choice?.preview);
      } else if (!choice?.hasPreview) {
        // Close preview if the choice doesn't define one (and doesn't signal it has an async one)
        s(previewHTMLAtom, closedDiv);
      }

      // Notify the backend that the choice has changed
      if (choice?.name !== noChoice.name) {
        const channel = g(channelAtom);
        channel(Channel.CHOICE_FOCUSED);
      }
    }
  },
  25,
  { leading: true, trailing: true },
);

export const focusedChoiceAtom = atom((g) => g(_focused), throttleChoiceFocused);
export const hasFocusedChoiceAtom = atom((g) => g(_focused) && g(_focused)?.name !== noChoice.name);

export const setFocusedChoiceAtom = atom(null, (g, s, a: string) => {
  if (!a) return;
  const i = g(choices).findIndex((c) => c?.item?.id === a || c?.item?.name === a);
  if (i > -1) {
    s(indexAtom, i);
  }
});

// --- Multiple Selection ---

export const selectedChoicesAtom = atom<Choice[]>([]);

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
    s(selectedChoicesAtom, [...cs]);
  }
});

// --- Choice Inputs (for Scriptlets/Dynamic Inputs) ---

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

// --- Utilities ---

export const shouldHighlightDescriptionAtom = atom((g) => {
  return g(promptDataAtom)?.searchKeys?.includes('description');
});

// =================================================================================================
// FILE: src/state/actions-state.ts
// Description: State management for actions, flags, and the actions menu (Cmd+K/Ctrl+K).
// =================================================================================================

// --- Flags Configuration ---

const _flagsAtom = atom<FlagsObject>({});
export const flagsAtom = atom(
  (g) => {
    // Exclude internal properties when reading flags
    const { sortChoicesKey, order, ...flags } = g(_flagsAtom);
    return flags;
  },
  (g, s, a: FlagsObject) => {
    log.info(`👀 flagsAtom: ${Object.keys(a)}`);
    s(_flagsAtom, a);

    // Cache flags if it's the main script
    if (g(isMainScriptAtom)) {
      s(cachedMainFlagsAtom, a);
    }
  },
);

// --- Actions Menu State (Open/Close) ---

const _flaggedValue = atom<Choice | string>('');
// Controls whether the actions menu is open (value is the context, e.g., the choice it's open for)
export const flaggedChoiceValueAtom = atom(
  (g) => g(_flaggedValue),
  (g, s, a: any) => {
    const currentFlaggedValue = g(_flaggedValue);

    // Handle reopening the actions menu (a === 'action' is a specific signal)
    if (currentFlaggedValue && a === 'action') {
      log.info('👀 flaggedChoiceValueAtom: clearing actionsInputAtom because it was already open');
      s(actionsInputAtom, '');
      return;
    }

    s(promptActiveAtom, true);
    log.info({ flagValue: a });
    s(_flaggedValue, a);

    if (a === '') {
      // Closing actions menu: restore previous state
      s(selectedAtom, '');
      s(choicesConfigAtom, g(prevChoicesConfig));
      s(indexAtom, g(prevIndexAtom));
      s(actionsInputAtom, '');
    } else {
      // Opening actions menu: save current state and reset actions index
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

export const showSelectedAtom = atom((g) => {
  return [UI.arg, UI.hotkey].includes(g(uiAtom)) && g(selectedAtom) && g(tabsAtom)?.length > 0;
});

// --- Actions Input ---

const _actionsInputAtom = atom('');
export const actionsInputAtom = atom(
  (g) => g(_actionsInputAtom),
  (g, s, a: string) => {
    s(directionAtom, 1);
    s(_actionsInputAtom, a);

    if (!g(submittedAtom)) {
      const channel = g(channelAtom);
      // TODO: npm link issue fallback (Channel.ACTIONS_INPUT might not resolve correctly)
      channel(Channel.ACTIONS_INPUT || 'ACTIONS_INPUT');
    }

    s(mouseEnabledAtom, 0);
  },
);

const actionsInputFocus = atom<number>(0);
export const actionsInputFocusAtom = atom(
  (g) => g(actionsInputFocus),
  (g, s, a: any) => {
    if (g(actionsInputFocus) === a) return;
    s(actionsInputFocus, a);
  },
);

// --- Scored Flags/Actions (The list within the menu) ---

export const defaultActionsIdAtom = atom('');
export const scoredFlags = atom([] as ScoredChoice[]);

export const scoredFlagsAtom = atom(
  (g) => {
    if (!g(hasActionsAtom)) return [];
    return g(scoredFlags);
  },
  (g, s, a: ScoredChoice[]) => {
    // Batch updates for performance to prevent multiple re-renders
    unstable_batchedUpdates(() => {
      s(scoredFlags, a);
      s(flagsIndexAtom, 0);

      // UI adjustment
      if (a?.[0]?.item?.className) {
        a[0].item.className = a[0].item.className.replace('border-t-1', '');
      }

      // Handle default action selection
      const defaultActionId = g(defaultActionsIdAtom);
      if (defaultActionId) {
        const defaultActionIndex = a.findIndex((c) => c?.item?.id === defaultActionId);
        s(flagsIndexAtom, defaultActionIndex > -1 ? defaultActionIndex : 0);
      }

      // Calculate height asynchronously
      requestAnimationFrame(() => {
        let choicesHeight = 0;
        const itemHeight = g(actionsItemHeightAtom);

        for (const { item: { height } } of a) {
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

// --- Actions Indexing and Focus ---

const flagsIndex = atom(0);
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

    // Clamped index handling wrapping around
    const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a;

    const list = g(flagsListAtom);
    const requiresScroll = g(flagsRequiresScrollAtom);
    const direction = g(directionAtom);

    let calcIndex = clampedIndex;
    let choice = cs?.[calcIndex]?.item;

    // Handle skipped actions (similar logic to indexAtom, could potentially be abstracted)
    if (choice?.skip) {
      let loopCount = 0;
      // Keep track of the starting index to prevent infinite loops if all items are skipped
      const startIndex = calcIndex;
      while (choice?.skip && loopCount < cs.length) {
        calcIndex = (calcIndex + direction + cs.length) % cs.length;
        choice = cs[calcIndex]?.item;
        loopCount++;
        if (calcIndex === startIndex) break;
      }
    }

    if (g(flagsIndex) !== calcIndex) {
      s(flagsIndex, calcIndex);
    }

    // Handle scrolling
    if (list) {
      if (requiresScroll === -1) {
        list.scrollToItem(calcIndex);
      }
      // Specific case for scrolling past a skipped first item
      if (cs[0]?.item?.skip && calcIndex === 1) {
        list.scrollToItem(0);
      }
    }

    const focusedFlag = (choice as Choice)?.value;
    s(focusedFlagValueAtom, focusedFlag);
  },
);

const _focusedFlag = atom('');
export const focusedFlagValueAtom = atom(
  (g) => g(_focusedFlag),
  (g, s, a: string) => {
    if (a !== g(_focusedFlag)) {
      s(_focusedFlag, a);
      const flags = g(flagsAtom);
      const flag = flags[a];
      s(focusedActionAtom, flag || {});
    }
  },
);

export const focusedActionAtom = atom<Action>({} as Action);

// --- Derived Action States ---

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
  const disabled = g(flaggedChoiceValueAtom); // Disabled if the actions menu is already open? Seems odd, but matching original logic.

  const flagActions = Object.entries(flags).map(([key, flag]) => ({
    key: flag?.key || flag?.shortcut,
    value: key,
    name: flag?.name,
    shortcut: formatShortcut(flag?.shortcut),
    position: flag.bar,
    arrow: (flag as Action)?.arrow,
    flag: key,
    disabled: Boolean(disabled),
    visible: Boolean(flag?.visible),
  } as Action));

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
  // If the actions menu is open but no specific action is focused, prevent submission.
  return flaggedValue && Object.keys(focusedAction).length === 0;
});

const _actionsConfigAtom = atom<ActionsConfig>({});
export const actionsConfigAtom = atom(
  (g) => {
    const config = g(_actionsConfigAtom);
    return {
      name: config?.name || g(focusedChoiceAtom)?.name || '',
      placeholder: config?.placeholder || g(actionsPlaceholderAtom),
      active: config?.active || '',
    };
  },
  (g, s, a: ActionsConfig) => {
    s(_actionsConfigAtom, { ...g(_actionsConfigAtom), ...a });
  },
);

export const actionsPlaceholderAtom = atom((g) => {
  const hasActions = g(hasActionsAtom);
  return hasActions ? 'Actions' : 'No Actions Available';
});

// =================================================================================================
// FILE: src/state/ui-layout.ts
// Description: Atoms related to UI appearance, dimensions, resizing, and layout orchestration.
// =================================================================================================

// --- Appearance and Theme ---

type Appearance = 'light' | 'dark' | 'auto';
export const appearanceAtom = atom<Appearance>('dark');
export const darkAtom = atom((g) => g(appearanceAtom) === 'dark');

const _themeAtom = atom('');
// Renamed _tempThemeAtom to be exported
export const _tempThemeAtom = atom('');

export const themeAtom = atom(
  (g) => g(_themeAtom),
  (_g, s, theme: string) => {
    s(_themeAtom, theme);
    s(_tempThemeAtom, theme);
  },
);

export const tempThemeAtom = atom(
  (g) => g(_tempThemeAtom),
  (_g, s, theme: string) => {
    s(_tempThemeAtom, theme);
  },
);

export const isDefaultTheme = atom(true);

export const lightenUIAtom = atom((g) => {
  const theme: any = g(themeAtom);
  const temporaryTheme: any = g(tempThemeAtom);
  const isLightened = theme['--color-secondary'] === 'lighten' || temporaryTheme['--color-secondary'] === 'lighten';
  return isLightened;
});

// --- Dimensions and Heights ---

export const itemHeightAtom = atom(PROMPT.ITEM.HEIGHT.SM);
export const inputHeightAtom = atom(PROMPT.INPUT.HEIGHT.SM);
export const actionsItemHeightAtom = atom(PROMPT.ITEM.HEIGHT.SM);
export const actionsInputHeightAtom = atom(PROMPT.INPUT.HEIGHT.XS - 2);

// Renamed choicesHeightAtom to be exported
export const choicesHeightAtom = atom(0);
export const flagsHeightAtom = atom(0);

const _currentChoiceHeights = atom<number[]>([]);
export const currentChoiceHeightsAtom = atom(
  (g) => g(_currentChoiceHeights),
  (g, s, a: ScoredChoice[]) => {
    const previousChoiceHeights = g(_currentChoiceHeights);
    const itemHeight = g(itemHeightAtom);
    const currentChoiceHeights = a?.map((c) => c?.item?.height || itemHeight);

    if (isEqual(previousChoiceHeights, currentChoiceHeights)) return;
    s(_currentChoiceHeights, currentChoiceHeights);
  },
);

const _topHeight = atom(88);
const mainHeight = atom(0);
const prevMh = atom(0);
let prevTopHeight = 0;

export const topHeightAtom = atom(
  (g) => g(_topHeight),
  (g, s) => {
    const resizeComplete = g(resizeCompleteAtom);
    if (!resizeComplete) return;
    resize(g, s, 'TOP_HEIGHT');
  },
);

export const mainHeightAtom = atom(
  (g) => g(mainHeight),
  (g, s, a: number) => {
    const prevHeight = g(mainHeight);
    const nextMainHeight = a < 0 ? 0 : a;

    // Prevent setting height to 0 if content (panel or choices) exists
    if (nextMainHeight === 0) {
      if (g(panelHTMLAtom) !== '' || g(scoredChoicesAtom).length > 0) {
        return;
      }
    }

    s(mainHeight, nextMainHeight);
    if (a === prevHeight) return;

    // Skip resize trigger for specific UIs that manage their own dimensions
    const ui = g(uiAtom);
    if ([UI.term, UI.editor, UI.drop, UI.textarea, UI.emoji, UI.chat, UI.mic, UI.webcam].includes(ui)) {
      return;
    }
    resize(g, s, 'MAIN_HEIGHT');
  },
);

// --- Resizing Logic (The most complex part) ---

export const promptResizedByHumanAtom = atom(false);
export const resizingAtom = atom(false);
export const resizeCompleteAtom = atom(false);

const sendResize = (data: ResizeData) => ipcRenderer.send(AppChannel.RESIZE, data);
const debounceSendResize = debounce(sendResize, 100);

// Central resize function, debounced to prevent rapid firing during dynamic changes
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

    // Prevent resize if grid is active and main element already has height
    if (promptData?.grid && document.getElementById('main')?.clientHeight > 10) {
      return;
    }

    const placeholderOnly = promptData?.mode === Mode.FILTER && scoredChoicesLength === 0 && ui === UI.arg;
    const topHeight = document.getElementById('header')?.offsetHeight || 0;
    const footerHeight = document.getElementById('footer')?.offsetHeight || 0;
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
    let ch = 0; // calculated height from DOM

    // Determine height based on specific UI modes (Form, Div, Panel)
    try {
      if (ui === UI.form || ui === UI.fields) {
        ch = (document as any)?.getElementById(UI.form)?.offsetHeight;
        mh = ch;
      } else if (ui === UI.div) {
        ch = (document as any)?.getElementById('panel')?.offsetHeight;
        if (ch) {
          mh = promptData?.height || ch;
        } else {
          return; // Wait if the panel isn't rendered yet
        }
      } else if (ui === UI.arg && hasPanel) {
        ch = (document as any)?.getElementById('panel')?.offsetHeight;
        mh = ch;
        forceResize = true;
      } else if (ui === UI.arg && !hasPanel && !scoredChoicesLength && !document.getElementById('list')) {
        // Collapsed state
        ch = 0;
        mh = 0;
        forceResize = true;
      } else if (ui !== UI.arg) {
        ch = (document as any)?.getElementById('main')?.offsetHeight;
      }

      // Determine if a resize is forced based on discrepancies between expected and actual height
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

    // Adjust height if preview is present (ensure minimum height)
    if (hasPreview && mh < PROMPT.HEIGHT.BASE) {
      const previewHeight = document.getElementById('preview')?.offsetHeight || 0;
      mh = Math.max(g(flagsHeightAtom), choicesHeight, previewHeight, promptData?.height || PROMPT.HEIGHT.BASE);
      forceResize = true;
    }

    // Adjust height if log is visible
    if (g(logHTMLAtom)?.length > 0 && g(scriptAtom)?.log !== 'false') {
      const logHeight = document.getElementById('log')?.offsetHeight;
      mh += logHeight || 0;
    }

    // Handle forced dimensions (e.g., when actions menu is open)
    const promptBounds = g(promptBoundsAtom);
    // Note: Original logic for forceWidth seemed slightly ambiguous, simplifying based on apparent intent.
    // const samePrompt = promptBounds?.id === promptData?.id;
    // const forceWidth = samePrompt ? promptBounds?.width : promptData?.width;
    let forceHeight;

    const flaggedValue = g(_flaggedValue);

    // Specific height rules when actions (flaggedValue) are active
    if (ui !== UI.arg) {
      if (flaggedValue) {
        if (!promptData?.height || promptData.height < PROMPT.HEIGHT.BASE) {
          forceHeight = PROMPT.HEIGHT.BASE;
        } else {
          forceHeight = promptData.height;
        }
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

    if (mh === 0 && promptData?.preventCollapse) {
      log.info('🍃 Prevent collapse to zero...');
      return;
    }

    log.info(`🍃 mh: ${mh}`, `forceHeight: ${forceHeight}`);

    const data: ResizeData = {
      id: promptData?.id || 'missing',
      pid: window.pid,
      reason,
      scriptPath: g(_script)?.filePath,
      placeholderOnly,
      topHeight,
      ui,
      // Add buffer for window borders if applicable
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
      justOpened: g(justOpenedAtom),
      forceResize,
      forceHeight,
      forceWidth: promptData?.width, // Using promptData?.width directly as per original structure
      totalChoices: scoredChoicesLength,
      isMainScript: g(isMainScriptAtom),
    };

    s(prevMh, mh);

    debounceSendResize.cancel();
    // Slightly delay the resize command on initial open to batch rendering
    if (g(justOpenedAtom) && !promptData?.scriptlet) {
      debounceSendResize(data);
    } else {
      sendResize(data);
    }
  },
  50,
  { leading: true, trailing: true },
);

export const triggerResizeAtom = atom(null, (g, s, reason: string) => {
  resize(g, s, `TRIGGER_RESIZE: ${reason}`);
});

export const domUpdatedAtom = atom(null, (g, s) => {
  return debounce((reason = '') => {
    resize(g, s, reason);
  }, 25);
});

// --- Bounds and Position ---

const _boundsAtom = atom<Rectangle>({ x: 0, y: 0, width: 0, height: 0 });
export const boundsAtom = atom(
  (g) => g(_boundsAtom),
  (g, s, a: Rectangle) => {
    s(resizeCompleteAtom, true);
    s(_boundsAtom, a);
    // Allow UI to settle after bounds change before potentially triggering another resize calculation
    setTimeout(() => {
      resize(g, s, 'SETTLED');
    }, 100);
  },
);

const promptBoundsDefault = {
  id: '',
  width: 0,
  height: 0,
  x: 0,
  y: 0,
};

const _promptBoundsAtom = atom(promptBoundsDefault);
export const promptBoundsAtom = atom(
  (g) => g(_promptBoundsAtom),
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

export const appBoundsAtom = atom({
  width: PROMPT.WIDTH.BASE,
  height: PROMPT.HEIGHT.BASE,
});

// --- Scrolling ---

export const listAtom = atom<null | VariableSizeList>(null);
export const flagsListAtom = atom<null | VariableSizeList>(null);
export const requiresScrollAtom = atom(-1);
export const flagsRequiresScrollAtom = atom(-1);
export const isScrollingAtom = atom(false);
export const isFlagsScrollingAtom = atom(false);

const _scrollToItemAtom = atom(0);
export const scrollToItemAtom = atom(
  (g) => g(_scrollToItemAtom),
  (g, s, a: { index: number; reason?: string; align?: 'start' | 'end' | 'center' }) => {
    s(_scrollToItemAtom, a.index);
    const list = g(listAtom);
    if (list) {
      if (a.index === 0) {
        list.scrollToItem(a.index, 'start');
      } else {
        list.scrollToItem(a.index, a.align);
      }
    }
  },
);

export const scrollToIndexAtom = atom((g) => {
  return (i: number) => {
    const list = g(listAtom);
    const gridReady = g(gridReadyAtom);
    if (list && !gridReady) {
      list.scrollToItem(i);
    }
  };
});

// --- UI Visibility and Layout Helpers ---

export const headerHiddenAtom = atom(false);
const footerHidden = atom(false);
export const footerHiddenAtom = atom(
  (g) => g(footerHidden),
  (_g, s, a: boolean) => {
    s(footerHidden, a);
  },
);

export const zoomAtom = atom(0);
export const hasBorderAtom = atom((g) => g(zoomAtom) === 0);
export const isWindowAtom = atom<boolean>(false);
export const devToolsOpenAtom = atom<boolean>(false);
export const gridReadyAtom = atom(false);

// --- Font Sizes (Dynamic based on heights) ---

export const actionsButtonNameFontSizeAtom = atom('text-sm');
export const actionsButtonDescriptionFontSizeAtom = atom('text-xs');
export const actionsInputFontSizeAtom = atom('text-lg');

export const buttonNameFontSizeAtom = atom((g) => {
  const itemHeight = g(itemHeightAtom);
  switch (itemHeight) {
    case PROMPT.ITEM.HEIGHT.XXS: return 'text-xxs';
    case PROMPT.ITEM.HEIGHT.XS: return 'text-xs';
    case PROMPT.ITEM.HEIGHT.SM: return 'text-sm';
    case PROMPT.ITEM.HEIGHT.BASE: return 'text-base';
    case PROMPT.ITEM.HEIGHT.LG: return 'text-lg';
    case PROMPT.ITEM.HEIGHT.XL: return 'text-xl';
    default: return 'text-base';
  }
});

export const buttonDescriptionFontSizeAtom = atom((g) => {
  const itemHeight = g(itemHeightAtom);
  switch (itemHeight) {
    case PROMPT.ITEM.HEIGHT.XXS: return 'text-xxs';
    case PROMPT.ITEM.HEIGHT.XS: return 'text-xxs';
    case PROMPT.ITEM.HEIGHT.SM: return 'text-xs';
    case PROMPT.ITEM.HEIGHT.BASE: return 'text-xs';
    case PROMPT.ITEM.HEIGHT.LG: return 'text-sm';
    case PROMPT.ITEM.HEIGHT.XL: return 'text-base';
    default: return 'text-xs';
  }
});

export const inputFontSizeAtom = atom((g) => {
  const inputHeight = g(inputHeightAtom);
  switch (inputHeight) {
    case PROMPT.INPUT.HEIGHT.XXS: return 'text-sm';
    case PROMPT.INPUT.HEIGHT.XS: return 'text-base';
    case PROMPT.INPUT.HEIGHT.SM: return 'text-xl';
    case PROMPT.INPUT.HEIGHT.BASE: return 'text-2xl';
    case PROMPT.INPUT.HEIGHT.LG: return 'text-3xl';
    case PROMPT.INPUT.HEIGHT.XL: return 'text-4xl';
    default: return 'text-2xl';
  }
});

// =================================================================================================
// FILE: src/state/preview-state.ts
// Description: Manages preview panel content and visibility.
// =================================================================================================

const _previewHTML = atom('');
export const previewEnabledAtom = atom<boolean>(true);

// Throttled setter for preview HTML to improve performance during rapid updates
const throttleSetPreview = throttle((g, s, a: string) => {
  s(_previewHTML, a);
  resize(g, s, 'SET_PREVIEW');
}, 25);

export const previewHTMLAtom = atom(
  (g) => {
    const rawHTML = g(_previewHTML) || g(promptData)?.preview || '';
    // Sanitize HTML content, allowing iframes and unknown protocols
    return DOMPurify.sanitize(rawHTML, {
      ADD_TAGS: ['iframe'],
      ALLOW_UNKNOWN_PROTOCOLS: true,
    });
  },
  (g, s, a: string) => {
    const prevPreview = g(_previewHTML);
    if (prevPreview === a) return;

    if (a === closedDiv) {
      // If closing the preview, cancel any pending throttled updates and clear immediately
      throttleSetPreview.cancel();
      s(_previewHTML, '');
    } else {
      throttleSetPreview(g, s, a);
    }
  },
);

export const hasPreviewAtom = atom<boolean>((g) => {
  if (g(allSkipAtom)) return false;
  return Boolean(g(_previewHTML) || g(promptData)?.preview || '');
});

// Check if the preview should be visible (has content, enabled, and not hidden)
export const previewCheckAtom = atom((g) => {
  const previewHTML = g(previewHTMLAtom);
  const enabled = g(previewEnabledAtom);
  const hidden = g(isHiddenAtom);
  return Boolean(previewHTML && enabled && !hidden);
});

// --- Panel HTML (Separate from Preview, often used for UI.div or alongside UI.arg) ---

const _panelHTML = atom<string>('');

export const panelHTMLAtom = atom(
  (g) =>
    DOMPurify.sanitize(g(_panelHTML), {
      ADD_TAGS: ['iframe'],
      ALLOW_UNKNOWN_PROTOCOLS: true,
    }),
  (g, s, a: string) => {
    if (g(_panelHTML) === a) return;

    s(_panelHTML, a);

    // If panel is set, ensure preview is closed unless explicitly defined in prompt data
    if (!g(promptDataAtom)?.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    // Adjust main height if the panel is cleared and no list is present
    if (a === '' && document.getElementById('panel') && !document.getElementById('list')) {
      s(mainHeightAtom, 0);
    }

    if (a) {
      s(loadingAtom, false);
    }
  },
);

// =================================================================================================
// FILE: src/state/components/editor-state.ts
// Description: State specific to the Monaco editor component.
// =================================================================================================

const defaultEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  fontFamily: 'JetBrains Mono',
  fontSize: 15,
  minimap: { enabled: false },
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
  stickyScroll: { enabled: false },
};

export const editorOptions = atom<editor.IStandaloneEditorConstructionOptions>(defaultEditorOptions);

const editorConfig = atom<EditorConfig | null>({
  value: '',
  language: 'markdown',
  extraLibs: [],
} as EditorOptions);

export const editorConfigAtom = atom(
  (g) => g(editorConfig),
  (g, s, a: EditorOptions) => {
    s(editorConfig, a);

    // Destructure to separate options for Monaco from other configurations (like callbacks)
    const { file, scrollTo, hint: h, onInput, onEscape, onAbandon, onBlur, ignoreBlur, extraLibs, ...options } = a;

    s(editorOptions, {
      ...defaultEditorOptions,
      ...(options as editor.IStandaloneEditorConstructionOptions),
    });

    if (typeof a?.value === 'undefined') return;

    if (a?.suggestions) {
      s(editorSuggestionsAtom, a.suggestions || []);
    }

    s(editorAppendAtom, '');

    // Notify the backend of the initial input value
    const channel = g(channelAtom);
    channel(Channel.INPUT, { input: a.value });

    s(loadingAtom, false);
  },
);

export const editorSuggestionsAtom = atom<string[]>([]);
export const editorCursorPosAtom = atom<number>(0);
export const editorValueAtom = atom<{ text: string; date: string; }>({ text: '', date: '' });

// Atom specifically for triggering an append action in the editor component
export const editorAppendAtom = atom(
  (g) => g(editorValueAtom),
  (_g, s, a: string) => {
    s(editorValueAtom, {
      text: a,
      date: new Date().toISOString(),
    });
  },
);

// --- Editor History ---

export const editorHistory = atom<{ content: string; timestamp: string }[]>([]);
export const editorHistoryPush = atom(null, (g, s, a: string) => {
  const history = g(editorHistory);
  const updatedHistory = [
    { content: a, timestamp: new Date().toISOString() },
    ...history,
  ];

  // Keep the 30 most recent entries (Note: Original code used shift() which removes the first/newest, corrected to pop() or length limiting)
  if (updatedHistory.length > 30) {
    updatedHistory.length = 30; // Keep the first 30 elements
  }
  s(editorHistory, updatedHistory);
});

export const getEditorHistoryAtom = atom((g) => () => {
  const channel = g(channelAtom);
  channel(Channel.GET_EDITOR_HISTORY, { editorHistory: g(editorHistory) });
});

// --- Editor Theme ---

export const editorThemeAtom = atom<{ foreground: string; background: string }>((_g) => {
  return {
    foreground: findCssVar('--color-text'),
    background: findCssVar('--color-background'),
  };
});

// =================================================================================================
// FILE: src/state/components/terminal-state.ts
// Description: State specific to the terminal component.
// =================================================================================================

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

export const termFontAtom = atom('monospace');
export const termExitAtom = atom<string | null>(null);

const _termOutputAtom = atom('');
export const termOutputAtom = atom(
  (g) => g(_termOutputAtom),
  (g, s, a: string) => {
    // Append output
    s(_termOutputAtom, g(_termOutputAtom) + a);
  },
);

// =================================================================================================
// FILE: src/state/components/chat-state.ts
// Description: State specific to the chat component.
// =================================================================================================

type MessageTypeWithIndex = MessageType & { index: number };

const _chatMessagesAtom = atom<Partial<MessageType>[]>([]);
export const chatMessagesAtom = atom(
  (g) => g(_chatMessagesAtom),
  (g, s, a: Partial<MessageTypeWithIndex>[]) => {
    // Ensure indices are set
    for (let i = 0; i < a.length; i++) {
      a[i].index = i;
    }
    s(_chatMessagesAtom, a);
  },
);

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

  if (index < 0) {
    // Handle case where there are no messages yet if necessary.
    return;
  }

  try {
    const lastMessage = messages[index] as MessageTypeWithIndex;
    // Append token to the last message
    lastMessage.text = ((lastMessage.text || '') + a).trim();
    lastMessage.index = index;

    s(chatMessagesAtom, messages);
    ipcRenderer.send(Channel.CHAT_PUSH_TOKEN, {
      channel: Channel.CHAT_PUSH_TOKEN,
      value: lastMessage,
      pid: g(pidAtom),
    });
  } catch (error) {
    log.error("Error pushing chat token", error);
    // Reset if something goes fundamentally wrong with the structure
    s(chatMessagesAtom, []);
  }
});

export const setChatMessageAtom = atom(null, (g, s, a: { index: number; message: MessageType }) => {
  const prev = g(chatMessagesAtom);
  const messages = [...prev];
  // Handle negative indexing (e.g., -1 is the last message)
  const messageIndex = a.index < 0 ? messages.length + a.index : a.index;

  try {
    if (messageIndex >= 0 && messageIndex < messages.length) {
      messages[messageIndex] = a.message;
      (a.message as MessageTypeWithIndex).index = messageIndex;
      s(chatMessagesAtom, messages);

      ipcRenderer.send(Channel.CHAT_SET_MESSAGE, {
        channel: Channel.CHAT_SET_MESSAGE,
        value: a.message,
        pid: g(pidAtom),
      });
    }
  } catch (error) {
    log.error("Error setting chat message", error);
  }
});

export const chatMessageSubmitAtom = atom(null, (g, _s, a: { text: string; index: number }) => {
  const channel = g(channelAtom);
  channel(Channel.ON_SUBMIT, { text: a.text, index: a.index });
});

export const preventChatScrollAtom = atom(false);

// =================================================================================================
// FILE: src/state/components/media-state.ts
// Description: State for audio, speech, microphone, and webcam.
// =================================================================================================

// --- Audio Playback ---

type AudioOptions = {
  filePath: string;
  playbackRate?: number;
};

export const _audioAtom = atom<AudioOptions | null>(null);
export const audioAtom = atom(
  (g) => g(_audioAtom),
  (_g, s, a: AudioOptions | null) => {
    // Pure assignment; side-effects are typically handled in useEffects listening to this atom.
    s(_audioAtom, a);
  },
);
export const audioDotAtom = atom(false);

// --- Speech Synthesis ---

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

// --- Microphone ---

const _micIdAtom = atom<string | null>(null);
export const micIdAtom = atom(
  (g) => g(_micIdAtom),
  (_g, s, a: string | null) => {
    log.info('🎙 micIdAtom', { a });
    s(_micIdAtom, a);
  },
);

export const micConfigAtom = atom({
  timeSlice: 200,
  format: 'webm',
  filePath: '',
});

const _micStreamEnabledAtom = atom(false);
export const micStreamEnabledAtom = atom(
  (g) => g(_micStreamEnabledAtom),
  (_g, s, a: boolean) => {
    s(_micStreamEnabledAtom, a);
  },
);

export const micMediaRecorderAtom = atom<MediaRecorder | null>(null);
export const micStateAtom = atom<'idle' | 'recording' | 'stopped'>('idle');

// --- Webcam ---

export const webcamStreamAtom = atom<MediaStream | null>(null);
export const webcamIdAtom = atom<string | null>(null);
export const deviceIdAtom = atom<string | null>(null); // General device ID? Seems related to media.

// =================================================================================================
// FILE: src/state/components/other-components.ts
// Description: State for miscellaneous UI components (Textarea, Form, Splash).
// =================================================================================================

// --- Textarea ---

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

// --- Form ---

export const formHTMLAtom = atom('');
export const formDataAtom = atom({});

// --- Splash Screen ---

export const splashBodyAtom = atom('');
export const splashHeaderAtom = atom('');
export const splashProgressAtom = atom(0);

// =================================================================================================
// FILE: src/state/log-state.ts
// Description: Manages application logs and console output display.
// =================================================================================================

const _logLinesAtom = atom<string[]>([]);
export const logLinesAtom = atom(
  (g) => g(_logLinesAtom),
  (_g, s, a: string[]) => {
    return s(_logLinesAtom, a);
  },
);

export const logHTMLAtom = atom<string>('');
export const logHeightAtom = atom<number>(0);
export const editorLogModeAtom = atom(false);
export const lastLogLineAtom = atom<string>('');
export const logValueAtom = atom<string>('');

// Helper atom to generate an ANSI-to-HTML converter based on the current theme
export const convertAtom = atom<(inverse?: boolean) => Convert>((g) => {
  return (inverse = false) => {
    const isDark = g(darkAtom);

    // Define colors based on theme and inversion status
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

export const appendToLogHTMLAtom = atom(null, (g, s, a: string) => {
  if (a === Channel.CONSOLE_CLEAR || a === '') {
    s(logLinesAtom, []);
    s(logHTMLAtom, '');
    return;
  }
  const oldLog = g(logLinesAtom);
  // Keep a maximum of 256 log lines, dropping the oldest if necessary
  const updatedLog = _drop(oldLog, oldLog.length > 256 ? oldLog.length - 256 : 0).concat([a]);
  s(logLinesAtom, updatedLog);
});

// =================================================================================================
// FILE: src/state/ipc.ts
// Description: Handles Inter-Process Communication (IPC) and application state synchronization with the backend.
// =================================================================================================

// Renamed pauseChannelAtom to be exported
export const pauseChannelAtom = atom(false);

// --- Application State Snapshot ---

// Central atom that aggregates the entire application state for IPC communication
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
    keyword: '', // Seems to be missing its source atom? Assuming it comes from promptData later if needed.
    mode: g(modeAtom),
    multiple: g(promptDataAtom)?.multiple,
    selected: g(selectedChoicesAtom).map((c) => c?.value),
    action: g(focusedActionAtom),
  } as AppState;

  return state;
});

// --- Channel Communication ---

// The primary atom for sending messages to the main process
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

// --- Submission Logic ---

const _submitValue = atom('');
export const disableSubmitAtom = atom(false);

// Helper function to format data for submission, handling specific types like ArrayBuffer and File arrays
const checkSubmitFormat = (g: Getter, checkValue: any) => {
  if (checkValue instanceof ArrayBuffer) {
    return checkValue;
  }
  if (Array.isArray(checkValue)) {
    if (g(choiceInputsAtom).length > 0) {
      return checkValue;
    }

    // Clean up File objects for serialization (remove functions)
    const files = checkValue.map((file) => {
      const fileObject: any = {};
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

export const submitValueAtom = atom(
  (g) => g(_submitValue),
  (g, s, a: any) => {
    const ui = g(uiAtom);
    const flaggedValue = g(flaggedChoiceValueAtom);
    const flag = g(focusedFlagValueAtom);
    const action = g(focusedActionAtom);
    const enter = g(enterAtom);

    // 1. Check for empty submission prevention
    const allowEmptyEnterUIs = [UI.term, UI.drop, UI.hotkey];
    const isInAllowedEmptyUI = allowEmptyEnterUIs.includes(ui);

    if (enter === '' && !isInAllowedEmptyUI && !flaggedValue && !action) {
      log.warn('👀 Preventing submit because enterAtom is empty');
      return;
    }

    // 2. Check for scriptlet input requirements
    if (!(flaggedValue || flag) && a?.scriptlet && a?.inputs?.length > 0) {
      log.info('Scriptlet requires inputs', a.inputs);
      return;
    }

    // 3. Check if an action is required but not selected
    const preventSubmitWithoutAction = g(preventSubmitWithoutActionAtom);
    if (preventSubmitWithoutAction) {
      log.info('👀 preventSubmitWithoutActionAtom');
      return;
    }

    const channel = g(channelAtom);

    // 4. Handle action execution (if it's a flag with an associated action)
    if ((action as FlagsWithKeys).hasAction) {
      channel(Channel.ACTION);
      if (action?.close && g(flaggedChoiceValueAtom)) {
        log.info('👋 Closing actions');
        s(flaggedChoiceValueAtom, '');
      }
      return;
    }

    // 5. Prepare for submission
    s(onInputSubmitAtom, {});
    s(promptActiveAtom, false);
    s(disableSubmitAtom, false);

    if (g(submittedAtom)) return;

    const focusedChoice = g(focusedChoiceAtom);

    // 6. Store selection history (if applicable)
    const fid = focusedChoice?.id;
    if (fid) {
      const key = g(promptDataAtom)?.key;
      if (key) {
        try {
          const prevIds = JSON.parse(localStorage.getItem(key) || '[]');
          // Move the selected ID to the front of the history array
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

    // 7. Determine the value to submit
    let value = ui === UI.term ? g(termOutputAtom) : checkSubmitFormat(g, a);

    // Handle empty submissions in arg mode
    const focusedChoiceIsNoChoice = focusedChoice === noChoice;
    const inputIsEmpty = g(inputAtom) === '';
    const choicesAreEmpty = g(choicesAtom).length === 0;
    if (focusedChoiceIsNoChoice && inputIsEmpty && choicesAreEmpty && ui === UI.arg) {
      value = '';
    }

    // 8. Send the submission
    const valueSubmitted = { value, flag };
    channel(Channel.VALUE_SUBMITTED, valueSubmitted);

    // 9. Update state post-submission
    s(loadingAtom, false);
    if (placeholderTimeoutId) clearTimeout(placeholderTimeoutId);

    // Set a timeout to show loading/processing indicators if the response takes time
    placeholderTimeoutId = setTimeout(() => {
      s(loadingAtom, true);
      s(processingAtom, true);
    }, 500);

    s(submittedAtom, true);
    s(closedInput, g(inputAtom));
    s(_flaggedValue, '');
    s(selectedChoicesAtom, []);
    s(focusedFlagValueAtom, '');
    s(prevIndexAtom, 0);
    s(_submitValue, value);

    // 10. Cleanup media streams
    const stream = g(webcamStreamAtom);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
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

// --- IPC Event Handlers/Triggers ---

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

export const changeAtom = atom((g) => (data: any) => {
  const channel = g(channelAtom);
  channel(Channel.CHANGE, { value: data });
});

// --- Direct IPC Calls (App Management) ---

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

export const loginAtom = atom((_g) => {
  return () => {
    ipcRenderer.send(AppChannel.LOGIN);
  };
});

export const submitSurveyAtom = atom(null, (_g, _s, a: Survey) => {
  ipcRenderer.send(AppChannel.FEEDBACK, a);
});

export const logAtom = atom((_g) => {
  type levelType = 'debug' | 'info' | 'warn' | 'error' | 'silly';
  return (message: any, level: levelType = 'info') => {
    ipcRenderer.send(AppChannel.LOG, { message, level });
  };
});

// =================================================================================================
// FILE: src/state/utils.ts
// Description: Utility atoms, helpers, and derived states.
// =================================================================================================

// --- Initialization ---

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

// --- Derived UI/Behavioral States ---

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

export const shortcutStringsAtom: Atom<
  Set<{
    type: 'shortcut' | 'action' | 'flag';
    value: string;
  }>
> = atom((g) => {
  const shortcuts = g(shortcutsAtom);
  const actions = g(actionsAtom);
  const flags = g(flagsAtom);

  // Filter out actions that are already defined as shortcuts to avoid duplication
  const actionsThatArentShortcuts = actions.filter((a) => !shortcuts.find((s) => s.key === a.key));

  const shortcutKeys = dataUtils.transformKeys(shortcuts, 'key', 'shortcut');
  const actionKeys = dataUtils.transformKeys(actionsThatArentShortcuts, 'key', 'action');
  const flagKeys = dataUtils.transformKeys(Object.values(flags), 'shortcut', 'flag');

  return new Set([...shortcutKeys, ...actionKeys, ...flagKeys]);
});

// --- Event Handlers (Paste, Drop) ---

export const onPasteAtom = atom((g) => (event: any) => {
  if (g(uiAtom) === UI.editor) {
    event.preventDefault(); // Assuming we want to handle paste manually or let Monaco handle it, but the original had this.
  }
  const channel = g(channelAtom);
  channel(Channel.ON_PASTE);
});

export const onDropAtom = atom((g) => (event: any) => {
  if (g(uiAtom) === UI.drop) return; // UI.drop likely has its own specific handler

  event.preventDefault();
  let drop = '';
  const files = Array.from(event?.dataTransfer?.files || []);

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

// --- Other Utilities ---

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

export const createAssetAtom = (...parts: string[]) =>
  atom(() => {
    return new Promise((resolve, _reject) => {
      ipcRenderer.once(AppChannel.GET_ASSET, (_event, { assetPath }) => {
        resolve(assetPath);
      });

      ipcRenderer.send(AppChannel.GET_ASSET, { parts });
    });
  });

// Note: Several atoms were defined but seemingly unused or placeholders in the original file.
// They are kept here to maintain export compatibility but might be candidates for removal if confirmed unnecessary.

export const searchDebounceAtom = atom(true);
export const topRefAtom = atom<null | HTMLDivElement>(null);
export const resetIdAtom = atom(Math.random());
export const mainElementIdAtom = atom<string>('');
export const scrollToAtom = atom<'top' | 'bottom' | 'center' | null>(null);

// Deprecated/Unclear usage but kept for export compatibility:
// Renamed OnInputSubmit type locally as it wasn't exported from core types
type OnInputSubmit = { [key: string]: any; };
export const onInputSubmitAtom = atom<OnInputSubmit>({});
// Renamed OnShortcut type locally as it wasn't exported from core types and seemed unused
type OnShortcut = { [key: string]: any; };
export const onShortcutAtom = atom<OnShortcut>({});

export const shortcodesAtom = atom<string[]>([]);

// These seem related to specific features (mini shortcuts UI) that might be deprecated or experimental
export const miniShortcutsHoveredAtom = atom(false);
export const miniShortcutsVisibleAtom = atom((g) => {
  // This feature was explicitly disabled in the original code (`return false;`)
  return false;
  /*
  const ms = g(_modifiers).filter((m) => !m.toLowerCase().includes('shift'));
  const justOpened = g(justOpenedAtom);
  const flagValue = g(flaggedChoiceValueAtom);
  return (!justOpened && ms.length > 0 && g(lastKeyDownWasModifierAtom) && !flagValue) || g(miniShortcutsHoveredAtom);
  */
});

// These seem unused or highly specific, kept for export compatibility
interface FilePathBounds {
  bounds: { x: number; y: number; width: number; height: number; };
  filePath: string;
}
const emptyFilePathBounds: FilePathBounds = { bounds: { x: 0, y: 0, width: 0, height: 0 }, filePath: '' };
export const filePathBoundsAtom = atom<FilePathBounds>(emptyFilePathBounds);
export const initialResizeAtom = atom<ResizeData | null>(null);

// Actions derived from shortcuts/flags for specific functionalities (e.g., Process List, Sign In)
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
  // Note: flagValue was read here but unused in the original code.
  // const flagValue = g(flaggedChoiceValueAtom);

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

// Helper atom action to set a flag based on its defined shortcut string
export const setFlagByShortcutAtom = atom(null, (g, s, a: string) => {
  const flags = g(flagsAtom);
  const flagKey = Object.keys(flags).find((key) => flags[key]?.shortcut === a);
  log.info(`🏴‍☠️ Setting flag by shortcut: ${flagKey}`);
  if (flagKey) {
    s(flaggedChoiceValueAtom, flagKey);
    s(focusedFlagValueAtom, flagKey);
  }
});
