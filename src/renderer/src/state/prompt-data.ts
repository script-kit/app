// =================================================================================================
// Core data driving the prompt UI and behavior (PromptData and related atoms).
// =================================================================================================

import { Mode, UI } from '@johnlindquist/kit/core/enum';
import type { PromptData, Shortcut } from '@johnlindquist/kit/types/core';
import { atom } from 'jotai';
import { isEqual } from 'lodash-es';
import { createLogger } from '../log-utils';


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

// promptDataAtom is currently defined in jotai.ts with the full working implementation
// TODO: Move the working version here once we complete the refactoring
// This file contains other prompt-related atoms that are properly separated

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
// Re-export shortcutsAtom from actions.ts to avoid duplication
export { shortcutsAtom } from './atoms/actions';

export const hasRightShortcutAtom = atom((g) => {
  return !!g(shortcutsAtom).find((s) => s?.key === 'right');
});