/**
 * Actions and flags state atoms.
 * Manages actions menu, flags, and keyboard shortcuts.
 */

import type { Action, ActionsConfig, Choice, FlagsObject, Shortcut } from '@johnlindquist/kit/types/core';
import { atom, type Getter } from 'jotai';
import { isEqual } from 'lodash-es';
import { unstable_batchedUpdates } from 'react-dom';
import type { ScoredChoice } from '../../../../shared/types';
import { createLogger } from '../../log-utils';
import { MAX_VLIST_HEIGHT } from '../constants';
import { scrollRequestAtom } from '../scroll';
import { calcVirtualListHeight } from '../utils';
import { pidAtom } from './app-core';
import { promptData } from './ui';
import { actionsItemHeightAtom, flagsHeightAtom } from './ui-elements';

const log = createLogger('actions.ts');

type ScopedFlagState = {
  sessionKey: string;
  value: string;
  version: number;
};

const getFlagSessionKey = (g: Getter) => {
  const promptId = g(promptData)?.id ?? '';
  const pid = g(pidAtom) ?? 0;
  return `${promptId}::${pid}`;
};

const emptyFlagState: ScopedFlagState = { sessionKey: '', value: '', version: 0 };

const _consumedFlagState = atom<{ sessionKey: string; version: number }>({
  sessionKey: '',
  version: 0,
});

export const lastConsumedFlagMetaAtom = atom((g) => g(_consumedFlagState));

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
export const resetActionsOverlayStateAtom = atom(null, (g, s) => {
  s(_flaggedValue, '');
  s(focusedFlagValueAtom, '');
  s(focusedActionAtom, {} as any);
  s(_actionsInputAtom, '');
  s(flagsIndex, 0);
  s(
    markFlagConsumedAtom as any,
    {
      sessionKey: getFlagSessionKey(g),
      version: 0,
    } as any,
  );
});

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
      s(resetActionsOverlayStateAtom as any, null);
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
    // Reset selection and ensure list will scroll into view
    const base = g(scoredFlags);
    let firstActionable = base.findIndex((sc) => !sc?.item?.skip);
    if (firstActionable < 0) firstActionable = -1; // none actionable
    if (firstActionable >= 0) {
      const firstChoice = base[firstActionable]?.item;

      // Set the index AND focused atoms (mimics flagsIndexAtom setter behavior)
      s(flagsIndex, firstActionable);

      // Set focused flag and action
      const focusedFlag = (firstChoice as Choice)?.value;
      s(focusedFlagValueAtom, focusedFlag);

      // If it's an action, set focusedActionAtom
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
        s(focusedActionAtom, {} as any);
      }

      // Request scroll
      s(scrollRequestAtom, {
        context: 'flags-list',
        target: firstActionable,
        reason: 'overlay-opened',
      });
    }
  },
);

// Helper setter to close and clear overlay-related state
export const closeActionsOverlayAtom = atom(null, (_g, s) => {
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

    // 2) compute filtered list and reset selection to first actionable
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

    // First actionable index (skip group headers)
    let firstActionable = 0;
    for (let i = 0; i < filtered.length; i++) {
      if (!filtered?.[i]?.item?.skip) {
        firstActionable = i;
        break;
      }
    }

    // 3) Set the index AND focused atoms (mimics flagsIndexAtom setter behavior)
    const firstChoice = filtered[firstActionable]?.item;
    s(flagsIndex, firstActionable);

    // Only update focused flag/action if the overlay is open
    // This prevents the "Actions" button from highlighting when promptDataAtom resets the input
    if (g(actionsOverlayOpenAtom)) {
      // Set focused flag and action
      const focusedFlag = (firstChoice as Choice)?.value;
      s(focusedFlagValueAtom, focusedFlag);

      // If it's an action, set focusedActionAtom
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
        s(focusedActionAtom, {} as any);
      }
    } else {
      // Ensure they are cleared if overlay is closed
      s(focusedFlagValueAtom, '');
      s(focusedActionAtom, {} as any);
    }

    // Request scroll
    s(scrollRequestAtom, {
      context: 'flags-list',
      target: firstActionable,
      reason: 'filter-changed',
    });

    // 4) update Actions list height to match the filtered list
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

const _focusedFlag = atom<ScopedFlagState>(emptyFlagState);
export const focusedFlagValueAtom = atom(
  (g) => {
    const scoped = g(_focusedFlag);
    const currentSessionKey = getFlagSessionKey(g);
    if (!scoped) return '';
    return scoped.sessionKey === currentSessionKey ? scoped.value : '';
  },
  (g, s, a: string) => {
    const currentSessionKey = getFlagSessionKey(g);
    const prev = g(_focusedFlag);
    const nextVersion = a && a.length > 0 ? (prev.sessionKey === currentSessionKey ? prev.version + 1 : 1) : 0;
    s(_focusedFlag, {
      sessionKey: currentSessionKey,
      value: a,
      version: nextVersion,
    });
  },
);
export const focusedActionAtom = atom<Action>({} as Action);

export const focusedFlagMetaAtom = atom((g) => {
  const scoped = g(_focusedFlag);
  const currentSessionKey = getFlagSessionKey(g);
  if (!scoped || scoped.sessionKey !== currentSessionKey) {
    return { sessionKey: currentSessionKey, version: 0 };
  }
  return { sessionKey: scoped.sessionKey, version: scoped.version };
});

export const markFlagConsumedAtom = atom(null, (g, s, meta?: { sessionKey: string; version: number }) => {
  const source = meta ?? g(_focusedFlag);
  s(_consumedFlagState, {
    sessionKey: source?.sessionKey || '',
    version: source?.version || 0,
  });
});

// --- Shortcuts ---
const _shortcuts = atom<Shortcut[]>([]);
export const shortcutsAtom = atom(
  (g) => g(_shortcuts),
  (g, s, a: Shortcut[]) => {
    const prevShortcuts = g(_shortcuts);
    if (isEqual(prevShortcuts, a)) return;
    const shortcutKeys = a.map((sc) => sc?.key).filter(Boolean);
    const hasRight = shortcutKeys.includes('right');
    const hasLeft = shortcutKeys.includes('left');
    log.info(`🔥 Setting shortcuts to ${a.length}`, {
      shortcutKeys,
      hasRight,
      hasLeft,
      names: a.map((sc) => sc?.name),
    });
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
    // Defer to flagsIndexAtom by requesting a scroll/index update to first actionable (or -1 if none)
    const firstActionable = a.findIndex((sc) => !sc?.item?.skip);
    if (firstActionable >= 0) {
      s(scrollRequestAtom, {
        context: 'flags-list',
        target: firstActionable,
        reason: 'flags-updated',
      });
    }
  });
});

export const setFlagsIndexAtom = atom(null, (_g, s, a: number) => {
  s(flagsIndex, a);
});

export const setFlaggedValueAtom = atom(null, (_g, s, a: Choice | string) => {
  s(_flaggedValue, a);
});
