/**
 * Actions and flags state atoms.
 * Manages actions menu, flags, and keyboard shortcuts.
 */

import type { Action, FlagsObject, Shortcut, ActionsConfig, Choice } from '@johnlindquist/kit/types/core';
import type { ScoredChoice } from '../../../../shared/types';
import { atom } from 'jotai';
import { isEqual } from 'lodash-es';
import { unstable_batchedUpdates } from 'react-dom';
import { createLogger } from '../../log-utils';
import { flagsRequiresScrollAtom } from './scrolling';
import { actionsItemHeightAtom, flagsHeightAtom } from './ui-elements';
import { calcVirtualListHeight } from '../utils';
import { MAX_VLIST_HEIGHT } from '../constants';

const log = createLogger('actions.ts');

// --- Flags Configuration ---
const _flagsAtom = atom<FlagsObject>({});
export const flagsAtom = atom(
  (g) => {
    // Exclude internal properties when reading flags
    const { sortChoicesKey, order, ...flags } = g(_flagsAtom) as any;
    return flags as FlagsObject;
  },
  (_g, s, a: FlagsObject) => {
    log.info(`👀 flagsAtom: ${Object.keys(a)}`);
    s(_flagsAtom, a);
  },
);

// --- Actions Menu State ---
export const _flaggedValue = atom<Choice | string>('');
// export const flaggedChoiceValueAtom = atom((g) => g(_flaggedValue)); // Complex version with computed properties is in jotai.ts

/**
 * Actions Overlay — explicit, readable atoms
 *
 * Historically the project used a single "flaggedChoiceValueAtom" (string | Choice)
 * both to indicate that the overlay is open (truthy) and to carry a payload
 * that might later be submitted as a flag. This conflation made the flow hard
 * to reason about. The atoms below separate visibility from payload and provide
 * clear intents for opening/closing the overlay.
 */

// True when the Actions overlay is visible
export const actionsOverlayOpenAtom = atom(
  (g) => Boolean(g(_flaggedValue)),
  (g, s, open: boolean) => {
    const currentlyOpen = Boolean(g(_flaggedValue));
    if (open === currentlyOpen) return;
    if (open) {
      // Preserve any existing payload, otherwise use a sentinel string
      const existing = g(_flaggedValue);
      const value = existing || 'actions-open';
      s(_flaggedValue, value);
    } else {
      // Closing must fully reset selection state to avoid stray submits
      s(_flaggedValue, '');
      s(focusedFlagValueAtom, '');
      s(focusedActionAtom, {} as any);
      s(_actionsInputAtom, '');
    }
  },
);

// Human-friendly reason for why/where the overlay was opened
export const actionsOverlaySourceAtom = atom<'choice' | 'input' | 'ui' | ''>('');

// Pending flag payload associated with the overlay (stringy form)
export const pendingFlagAtom = atom(
  (g) => {
    const v = g(_flaggedValue);
    if (typeof v === 'string') return v;
    return (v as any)?.value ?? '';
  },
  (_g, s, flag: string) => {
    s(_flaggedValue, flag);
  },
);

// Helper setter to open the overlay with optional source + preset flag
export const openActionsOverlayAtom = atom(
  null,
  (g, s, payload: { source?: 'choice' | 'input' | 'ui'; flag?: string } = {}) => {
    const { source = '', flag } = payload;
    s(actionsOverlaySourceAtom, source);
    if (typeof flag === 'string') s(_flaggedValue, flag);
    s(actionsOverlayOpenAtom, true);
    // Reset selection to top and ensure list will scroll into view
    s(flagsIndex, 0);
    s(flagsRequiresScrollAtom, -1);
  },
);

// Helper setter to close and clear overlay-related state
export const closeActionsOverlayAtom = atom(null, (g, s) => {
  s(actionsOverlayOpenAtom, false);
  s(actionsOverlaySourceAtom, '');
});

// --- Actions Input ---
export const _actionsInputAtom = atom('');
export const actionsInputAtom = atom(
  (g) => g(_actionsInputAtom),
  (g, s, a: string) => {
    // 1) store new filter
    s(_actionsInputAtom, a);

    // 2) reset selection to the top of the (newly filtered) list
    s(flagsIndex, 0);

    // 3) request scroll so the first item is visible
    s(flagsRequiresScrollAtom, -1);

    // 4) update Actions list height to match the filtered list
    const base = g(scoredFlags);
    const q = (a || '').toLowerCase().trim();
    const filtered = !q
      ? base
      : base.filter((sc) => {
        const it: any = sc?.item || {};
        const name = (it.name || '').toLowerCase();
        const desc = (it.description || '').toLowerCase();
        const id = (it.id || '').toLowerCase();
        const val = (typeof it.value === 'string' ? it.value : '').toLowerCase();
        return name.includes(q) || desc.includes(q) || id.includes(q) || val.includes(q);
      });
    const h = calcVirtualListHeight(filtered as any, g(actionsItemHeightAtom), MAX_VLIST_HEIGHT);
    s(flagsHeightAtom, h);
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

// --- Scored Flags/Actions ---
export const defaultActionsIdAtom = atom('');
export const scoredFlags = atom([] as ScoredChoice[]);
// export const scoredFlagsAtom = atom((g) => g(scoredFlags)); // Complex version with computed properties is in jotai.ts

// --- Actions Indexing and Focus ---
export const flagsIndex = atom(0);
// export const flagsIndexAtom = atom((g) => g(flagsIndex)); // Complex version with computed properties is in jotai.ts

const _focusedFlag = atom('');
export const focusedFlagValueAtom = atom(
  (g) => g(_focusedFlag),
  (_g, s, a: string) => {
    s(_focusedFlag, a);
  },
);
export const focusedActionAtom = atom<Action>({} as Action);

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

// --- Actions Configuration ---
const _actionsConfigAtom = atom<ActionsConfig>({});
export const actionsConfigAtom = atom(
  (g) => g(_actionsConfigAtom),
  (g, s, a: ActionsConfig) => {
    s(_actionsConfigAtom, { ...g(_actionsConfigAtom), ...a });
  },
);

// Derived atoms defined in jotai.ts
// export const hasActionsAtom = atom(() => false);
// export const actionsAtom = atom(() => [] as Action[]);
// export const preventSubmitWithoutActionAtom = atom(() => false);
// export const actionsPlaceholderAtom = atom(() => 'Actions');

// Setter atoms for later wiring
export const setScoredFlagsAtom = atom(null, (_g, s, a: ScoredChoice[]) => {
  unstable_batchedUpdates(() => {
    s(scoredFlags, a);
    s(flagsIndex, 0);
  });
});

export const setFlagsIndexAtom = atom(null, (_g, s, a: number) => {
  s(flagsIndex, a);
});

export const setFlaggedValueAtom = atom(null, (_g, s, a: Choice | string) => {
  s(_flaggedValue, a);
});
