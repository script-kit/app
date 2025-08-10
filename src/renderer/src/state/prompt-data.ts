// =================================================================================================
// Core data driving the prompt UI and behavior (PromptData and related atoms).
// =================================================================================================

import { Channel, Mode, UI } from '@johnlindquist/kit/core/enum';
import type { PromptData, Shortcut } from '@johnlindquist/kit/types/core';
import type { TermConfig } from '../../../shared/types';
import { atom } from 'jotai';
import { isEqual } from 'lodash-es';
import { createLogger } from '../log-utils';
import { 
  pidAtom, 
  kitConfigAtom, 
  isHiddenAtom, 
  justOpenedAtom, 
  _open, 
  submittedAtom,
  processingAtom,
  loadingAtom,
  cachedMainPromptDataAtom,
} from './app-core';
import { scriptAtom } from './script-state';
import { isMainScriptAtom } from './shared-atoms';


const { ipcRenderer } = window.electron;
const log = createLogger('prompt-data.ts');

export const promptData = atom<null | Partial<PromptData>>({
  ui: UI.arg,
  input: '',
  footerClassName: 'hidden',
  headerClassName: 'hidden',
  containerClassName: '',
  placeholder: 'Script Kit',
});

export const promptReadyAtom = atom(false);
// isMainScriptAtom moved to shared-atoms.ts to avoid circular dependency
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

    // s(choicesReadyAtom, false);
    const pid = g(pidAtom);
    // s(gridReadyAtom, false);

    const isMainScript = a.scriptPath === g(kitConfigAtom).mainScriptPath;
    s(isMainScriptAtom, isMainScript);

    // Cache management for main script
    if (isMainScript && !a.preload && g(tabIndexAtom) === 0) {
      s(cachedMainPromptDataAtom, a);
    }

    // Preview management based on UI type
    if (a.ui !== UI.arg && !a.preview) {
      // s(previewHTMLAtom, closedDiv);
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
    if (prevPromptData?.ui === UI.editor) {
      // if (g(_inputChangedAtom)) {
      //   s(editorHistoryPush, g(closedInput));
      // }
    }

    // s(_inputChangedAtom, false);

    // UI and Focus updates
    if (a.ui !== UI.arg) {
      // s(focusedChoiceAtom, noChoice);
    }
    s(uiAtom, a.ui);
    s(_open, true);
    s(submittedAtom, false);

    // Terminal configuration
    if (a.ui === UI.term) {
      const b: any = a; // Using any for convenience as input/cwd/etc are on the prompt data
      // const config: TermConfig = {
      //   promptId: a.id,
      //   command: b?.input || '',
      //   cwd: b?.cwd || '',
      //   env: b?.env || {},
      //   shell: b?.shell,
      //   args: b?.args || [],
      //   closeOnExit: typeof b?.closeOnExit !== 'undefined' ? b.closeOnExit : true,
      //   pid: g(pidAtom),
      // };
      // s(termConfigAtom, config);
    }

    // Input handling based on keywords and script type
    if (!(a.keyword || (g(isMainScriptAtom) && a.ui === UI.arg))) {
      // const inputWhileSubmitted = g(inputWhileSubmittedAtom);
      // const forceInput = a.input || inputWhileSubmitted || '';
      log.info(`${pid}: 👂 Force input due to keyword or mainScript`);

      // const prevInput = g(_inputAtom);
      // const prevInputHasSlash = prevInput.includes('/') || prevInput.includes('\\');

      // Complex logic to determine if input should be updated (e.g., handling path inputs vs keyword triggers)
      // if (forceInput && (!prevInput.startsWith(forceInput) || prevInputHasSlash)) {
      //   s(_inputAtom, forceInput);
      // } else if (!forceInput) {
      //   s(_inputAtom, forceInput);
      // }
    }

    // Resetting various states
    // s(_inputWhileSubmittedAtom, '');
    // s(_flaggedValue, '');
    // s(hintAtom, a.hint);
    // s(placeholderAtom, a.placeholder);
    // s(selectedAtom, a.selected);
    // s(tabsAtom, a.tabs);
    s(processingAtom, false);
    // s(focusedFlagValueAtom, '');
    // s(flagsAtom, a.flags || {});
    // s(choiceInputsAtom, []);

    // UI Element visibility and styling
    // s(headerHiddenAtom, !!a.headerClassName?.includes('hidden'));
    // s(footerHiddenAtom, !!a.footerClassName?.includes('hidden'));
    // s(containerClassNameAtom, a.containerClassName || '');

    // Description and Name
    const script = g(scriptAtom);
    // const promptDescription = a.description || (a.name ? '' : script?.description || '');
    // const promptName = a.name || script?.name || '';
    // s(descriptionAtom, promptDescription || promptName);
    // s(nameAtom, promptDescription ? promptName : promptDescription);

    // Preview and Panel content
    if (!a.keepPreview && a.preview) {
      // s(previewHTMLAtom, a.preview);
    }
    if (a.panel) {
      // s(panelHTMLAtom, a.panel);
    }

    // Footer and Defaults
    if (typeof a.footer === 'string') {
      // s(footerAtom, a.footer);
    }
    // s(defaultChoiceIdAtom, a.defaultChoiceId || '');
    // s(defaultValueAtom, a.defaultValue || '');

    // Form data
    if (a.html) {
      // s(formHTMLAtom, domUtils.ensureFormHasSubmit(a.html));
    }
    if (a.formData) {
      // s(formDataAtom, a.formData);
    }

    // Heights
    // s(itemHeightAtom, a.itemHeight || PROMPT.ITEM.HEIGHT.SM);
    // s(inputHeightAtom, a.inputHeight || PROMPT.INPUT.HEIGHT.SM);

    // Shortcuts and Actions
    // s(onInputSubmitAtom, a.shortcodes || {});
    // s(shortcutsAtom, a.shortcuts || []);
    // s(actionsConfigAtom, a.actionsConfig || {});

    // s(prevChoicesConfig, []);
    // s(audioDotAtom, false);

    if (a.choicesType === 'async') {
      s(loadingAtom, true);
    }

    // Enter key behavior
    if (typeof a.enter === 'string') {
      s(enterAtom, a.enter);
    } else {
      s(enterAtom, 'Submit');
    }

    // if (!g(hasActionsAtom)) {
    //   s(flagsHeightAtom, 0);
    // }

    s(promptData, a);

    // Communication and finalization
    // const channel = g(channelAtom);
    // channel(Channel.ON_INIT);

    ipcRenderer.send(Channel.SET_PROMPT_DATA, {
      messageId: (a as any).messageId,
      ui: a.ui,
    });

    s(promptReadyAtom, true);
    // s(promptActiveAtom, true);
    s(tabChangedAtom, false);
    // s(actionsInputAtom, '');
    // s(_termOutputAtom, '');
  },
);

export const modeAtom = atom((g) => g(promptData)?.mode || Mode.FILTER);

// --- UI Elements derived from PromptData ---

const _ui = atom<UI>(UI.arg);
export const uiAtom = atom(
  (g) => g(_ui),
  (_g, s, a: UI) => {
    s(_ui, a);

    // Manage focus based on UI type
    if ([UI.arg, UI.textarea, UI.hotkey, UI.splash].includes(a)) {
      // s(inputFocusAtom, true);
    }

    // Clear 'Enter' label for certain UIs
    if ([UI.splash, UI.term, UI.editor, UI.hotkey].includes(a)) {
      s(enterAtom, '');
    }

    // Clear choices when switching away from the main argument UI
    // if (a !== UI.arg && g(scoredChoicesAtom)?.length > 0) {
    //   s(scoredChoicesAtom, []);
    // }

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
  (_g, s, a: string) => {
    const aHint = typeof a !== 'string' ? '' : a;
    // const getConvert = g(convertAtom);
    // Convert ANSI codes to HTML for the hint
    // s(hint, getConvert(true).toHtml(aHint));
    s(hint, aHint);
  },
);

let placeholderTimeoutId: NodeJS.Timeout | undefined;
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
export const _tabIndex = atom(0);
export const tabIndexAtom = atom(
  (g) => g(_tabIndex),
  (g, s, a: number) => {
    // s(_inputChangedAtom, false);
    // s(prevIndexAtom, 0);

    if (g(_tabIndex) !== a) {
      s(_tabIndex, a);
      // Reset flags when tab changes
      // s(flagsAtom, {});
      // s(_flaggedValue, '');

      // sendTabChanged = sendTabChanged || getSendTabChanged(g);
      // sendTabChanged();

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