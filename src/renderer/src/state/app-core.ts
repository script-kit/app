// =================================================================================================
// Core application state, configuration, and process management.
// =================================================================================================

import type { UserDb } from '@johnlindquist/kit/core/db';
import { UI } from '@johnlindquist/kit/core/enum';
import type {
  FlagsObject,
  ProcessInfo,
  PromptData,
  Shortcut,
} from '@johnlindquist/kit/types/core';
import { atom } from 'jotai';
import type { ScoredChoice } from '../../../shared/types';


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
export const _pidAtom = atom(0);
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

export const loading = atom<boolean>(false);
export const loadingAtom = atom(
  (g) => g(loading) || g(runningAtom),
  (_g, s, a: boolean) => {
    s(loading, a);
  },
);

export const progressAtom = atom(0);

// --- Application Lifecycle and Visibility ---

export const _open = atom(false);

// openAtom will be properly defined in app-lifecycle.ts to avoid circular dependencies
export const openAtom = atom(
  (g) => g(_open),
  (_g, _s, _a: boolean) => {
    // Implementation will be in app-lifecycle.ts
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
export const isReady = atom(true); // Used primarily for the Splash screen
export const isReadyAtom = atom(
  (g) => g(isReady),
  (_g, s, a: boolean) => {
    s(isReady, a);
  },
);

// --- Caching ---

export const cachedAtom = atom(false);
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