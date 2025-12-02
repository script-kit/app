import type { AppState, Choice } from '@johnlindquist/kit/types/core';
import { atom } from 'jotai';
import { noChoice } from '../../../../shared/defaults';
// Import from facade for gradual migration
import {
  focusedActionAtom,
  focusedFlagValueAtom,
  indexAtom,
  modeAtom,
  previewHTMLAtom,
  promptDataAtom,
  uiAtom,
} from '../../jotai';
import { _actionsInputAtom, _flaggedValue } from '../atoms/actions';
import { submittedAtom } from '../atoms/app-core';
import { _focused, choicesAtom, selectedChoicesAtom } from '../atoms/choices';
import { editorCursorPosAtom } from '../atoms/editor';
import { _inputAtom, _inputChangedAtom, _modifiers } from '../atoms/input';
import { _submitValue } from '../atoms/ipc';
import { _script } from '../atoms/script-state';
import { _tabIndex, tabsAtom } from '../atoms/tabs';
import { descriptionAtom, nameAtom } from '../atoms/ui-elements';

// --- START FIX: Initialization Safety ---

// Define a hardcoded fallback structure locally.
const FALLBACK_NO_CHOICE: Choice = {
  id: 'fallback-no-choice',
  name: 'Loading...',
  value: null,
  description: 'Fallback choice during initialization.',
  hasPreview: false,
};

// Verify the import and select the safe fallback at module initialization time.
let safeNoChoice = noChoice;
if (!safeNoChoice || typeof safeNoChoice !== 'object' || safeNoChoice.id === undefined) {
  console.error('CRITICAL: noChoice import failed or is invalid in appState.ts. Using hardcoded fallback.', {
    importedValue: noChoice,
  });
  safeNoChoice = FALLBACK_NO_CHOICE;
}

// --- END FIX ---

/**
 * Lightweight app state selector for IPC communication.
 * Only includes the fields the main process actually needs.
 */
export const appStateLiteAtom = atom<AppState>((g) => {
  try {
    const focusedValue = g(_focused);
    if (!focusedValue) {
      console.warn('_focused atom returned undefined, using noChoice');
    }

    return {
      input: g(_inputAtom),
      actionsInput: g(_actionsInputAtom),
      inputChanged: g(_inputChangedAtom),
      flag: g(focusedFlagValueAtom),
      index: g(indexAtom),
      flaggedValue: g(_flaggedValue) || '',
      focused: focusedValue || safeNoChoice,
      tab: g(tabsAtom)?.[g(_tabIndex)] || '',
      modifiers: g(_modifiers),
      count: g(choicesAtom)?.length || 0,
      name: g(nameAtom),
      description: g(descriptionAtom),
      script: g(_script).script,
      value: g(_submitValue),
      submitted: g(submittedAtom),
      cursor: g(editorCursorPosAtom),
      ui: g(uiAtom),
      tabIndex: g(_tabIndex),
      preview: g(previewHTMLAtom),
      keyword: '',
      mode: g(modeAtom),
      multiple: g(promptDataAtom)?.multiple,
      selected: g(selectedChoicesAtom)?.map((c) => c?.value) || [],
      action: g(focusedActionAtom),
    } as AppState;
  } catch (error) {
    console.error('Error in appStateLiteAtom:', error);
    // Return minimal state on error
    return {
      input: '',
      actionsInput: '',
      inputChanged: false,
      flag: '',
      index: 0,
      flaggedValue: '',
      focused: safeNoChoice,
      tab: '',
      modifiers: '',
      count: 0,
      name: '',
      description: '',
      script: null,
      value: '',
      submitted: false,
      cursor: 0,
      ui: 'arg',
      tabIndex: 0,
      preview: '',
      keyword: '',
      mode: 'filter',
      multiple: false,
      selected: [],
      action: null,
    } as any;
  }
});
