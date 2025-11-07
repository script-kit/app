import * as React from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

// Import from facade for gradual migration
import {
  scoredChoicesAtom,         // ScoredChoice[] (sorted for relevance)
  focusedChoiceAtom,         // Choice | undefined
  inputAtom,                 // string
} from '../../jotai';

import {
  _indexAtom,
  defaultValueAtom,
  defaultChoiceIdAtom,
  prevIndexAtom,
  selectedAtom
} from '../atoms/choices';
import { scrollRequestAtom } from '../scroll';
import { advanceIndexSkipping } from '../skip-nav';
import type { Choice, ScoredChoice } from '../../../../shared/types';

// Get wereChoicesPreloaded from jotai module
// This is a module variable, not an atom, so we'll access it through a helper
const getWereChoicesPreloaded = () => {
  // For now, default to false - this can be improved by accessing the actual variable
  return false;
};

// ----- Helpers -----
const isActionable = (c?: Choice) => !!c && !c.skip && !c.info;

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const firstActionableIndex = (cs: ScoredChoice[]) => {
  for (let i = 0; i < cs.length; i++) if (isActionable(cs[i]?.item)) return i;
  return -1;
};

const findDefaultIndex = (
  cs: ScoredChoice[],
  defaultChoiceId?: string,
  defaultValue?: any
) => {
  if (defaultChoiceId == null && defaultValue == null) return -1;
  return cs.findIndex((c) => {
    const it = c.item;
    if (!it) return false;
    return (
      (defaultChoiceId != null && it.id === defaultChoiceId) ||
      (defaultValue != null && (it.value === defaultValue || it.name === defaultValue))
    );
  });
};

const indexOfChoiceId = (ids: string[], id?: string) =>
  id ? ids.indexOf(id) : -1;

const nearestActionableIndexFrom = (start: number, cs: ScoredChoice[]) => {
  // If already actionable, keep it.
  if (start >= 0 && start < cs.length && isActionable(cs[start]?.item)) return start;

  // Try forward, then backward using skip navigation where possible.
  // forward
  let forward = start;
  for (let i = 0; i < cs.length; i++) {
    forward = advanceIndexSkipping(forward, +1, cs.map((x) => ({ item: x.item })));
    if (forward >= 0 && forward < cs.length && isActionable(cs[forward]?.item)) return forward;
    if (forward === -1) break;
  }

  // backward
  let backward = start;
  for (let i = 0; i < cs.length; i++) {
    backward = advanceIndexSkipping(backward, -1, cs.map((x) => ({ item: x.item })));
    if (backward >= 0 && backward < cs.length && isActionable(cs[backward]?.item)) return backward;
    if (backward === -1) break;
  }

  return firstActionableIndex(cs);
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// ----- Pure decision function (exported for unit tests) -----
export type FocusInputs = {
  choices: ScoredChoice[];
  ids: string[];
  prevIds: string[];
  input: string;
  defaultValue: any;
  defaultChoiceId?: string;
  prevIndex: number | undefined;
  selected: boolean;
  wereChoicesPreloaded: boolean;
  currentIndex: number;
  prevFocusedChoiceId?: string;
};

export type FocusDecision = {
  nextIndex: number;        // -1 means "no focus"
  scrollTo: number;         // -1 means "do not trigger scroll"
  reason: string;           // for debugging
};

export function computeFocusDecision(i: FocusInputs): FocusDecision {
  const {
    choices,
    ids,
    prevIds,
    input,
    defaultValue,
    defaultChoiceId,
    prevIndex,
    selected,
    wereChoicesPreloaded,
    currentIndex,
    prevFocusedChoiceId,
  } = i;

  const haveActionable = choices.some((c) => isActionable(c.item));
  if (!haveActionable) {
    return { nextIndex: -1, scrollTo: -1, reason: 'no-actionable' };
  }

  const listChanged = !arraysEqual(prevIds, ids);
  const inputHasText = !!input && input.length > 0;

  // 1) Default match (only when user hasn't typed)
  if (!inputHasText && (defaultChoiceId != null || defaultValue != null)) {
    const idx = findDefaultIndex(choices, defaultChoiceId, defaultValue);
    if (idx !== -1) {
      const next = nearestActionableIndexFrom(idx, choices);
      return { nextIndex: next, scrollTo: next, reason: 'default-match' };
    }
  }

  // 2) User typing: keep current actionable if still visible; else first actionable
  if (inputHasText) {
    // Try to keep focus on the previously focused item if it still exists & is actionable
    if (!listChanged && currentIndex >= 0 && isActionable(choices[currentIndex]?.item)) {
      return { nextIndex: currentIndex, scrollTo: -1, reason: 'typing-keep' };
    }

    // If list changed, try to keep focus by id
    if (listChanged && prevFocusedChoiceId) {
      const keepIdx = indexOfChoiceId(ids, prevFocusedChoiceId);
      if (keepIdx !== -1 && isActionable(choices[keepIdx]?.item)) {
        return { nextIndex: keepIdx, scrollTo: keepIdx, reason: 'typing-keep-by-id' };
      }
    }

    // Otherwise go to first actionable (best-scored) choice
    const fa = firstActionableIndex(choices);
    return { nextIndex: fa, scrollTo: fa, reason: 'typing-reset-first-actionable' };
  }

  // 3) No input text: restore previous position (if the user hasn't "selected" yet)
  if (!selected && typeof prevIndex === 'number' && prevIndex >= 0) {
    let idx = prevIndex;
    // Group adjustment: if the item before prevIndex is a header/skip, nudge up
    if (choices?.[prevIndex - 1]?.item?.skip) idx = prevIndex - 1;

    idx = clamp(idx, 0, choices.length - 1);
    const next = nearestActionableIndexFrom(idx, choices);
    const scrollTo = wereChoicesPreloaded ? -1 : next;
    return { nextIndex: next, scrollTo, reason: 'restore-prev' };
  }

  // 4) Fallback: keep current if it's valid, else first actionable
  if (currentIndex >= 0 && isActionable(choices[currentIndex]?.item)) {
    return { nextIndex: currentIndex, scrollTo: -1, reason: 'keep-current' };
  }

  const fa = firstActionableIndex(choices);
  return { nextIndex: fa, scrollTo: fa, reason: 'fallback-first-actionable' };
}

// ----- The controller component -----
export function FocusController() {
  const choices = useAtomValue(scoredChoicesAtom) as ScoredChoice[];
  const ids = React.useMemo(
    () => choices.map((c, i) => c.item?.id ?? `@idx:${i}`),
    [choices]
  );

  const input = useAtomValue(inputAtom);
  const defaultValue = useAtomValue(defaultValueAtom);
  const defaultChoiceId = useAtomValue(defaultChoiceIdAtom);
  const prevIndex = useAtomValue(prevIndexAtom);
  const selected = useAtomValue(selectedAtom);
  const wereChoicesPreloaded = getWereChoicesPreloaded();

  const setScrollRequest = useSetAtom(scrollRequestAtom);
  const setFocusedChoice = useSetAtom(focusedChoiceAtom);
  const [index, setIndex] = useAtom(_indexAtom);
  const prevIdsRef = React.useRef<string[]>(ids);

  // For "keep focus by id" when lists change under typing
  const prevFocusedChoice = useAtomValue(focusedChoiceAtom);
  const prevFocusedChoiceId = prevFocusedChoice?.id;

  React.useEffect(() => {
    const listChanged = !arraysEqual(prevIdsRef.current, ids);

    // Only intervene when the choice list changes, not when index changes due to navigation
    if (!listChanged) {
      prevIdsRef.current = ids;
      return;
    }

    // Fast-path: first population from empty → non-empty while typing
    // If there was no previous list and we have actionable choices now, but no valid index yet,
    // anchor focus to the first actionable row. This avoids a visual highlight without a functional selection.
    if ((prevIdsRef.current?.length || 0) === 0 && ids.length > 0 && (index == null || index < 0)) {
      const fa = firstActionableIndex(choices);
      const next = fa < 0 ? 0 : fa;
      setIndex(next);
      if (next >= 0 && next < choices.length) {
        const choice = choices[next]?.item;
        if (choice) setFocusedChoice(choice);
      } else {
        setFocusedChoice(undefined as any);
      }
      // Ensure the first item is in view on initial population
      if (next >= 0) {
        setScrollRequest({
          context: 'choices-list',
          target: next,
          reason: 'default-value',
        });
      }
      prevIdsRef.current = ids;
      if ((window as any).DEBUG_FOCUS) {
        console.log('[FocusController]', {
          reason: 'initial-population',
          nextIndex: next,
        });
      }
      return;
    }

    const decision = computeFocusDecision({
      choices,
      ids,
      prevIds: prevIdsRef.current,
      input,
      defaultValue,
      defaultChoiceId,
      prevIndex,
      selected,
      wereChoicesPreloaded,
      currentIndex: index ?? -1,
      prevFocusedChoiceId,
    });

    const nextIndex = decision.nextIndex;
    const scrollTo = decision.scrollTo;

    // Short-circuit if nothing is changing
    if (nextIndex === (index ?? -1)) {
      // When user types, ensure the top is in view
      if ((input?.length ?? 0) > 0 && nextIndex >= 0) {
        setScrollRequest({
          context: 'choices-list',
          target: 0,
          reason: 'user-navigation',
        });
      }
      prevIdsRef.current = ids;
      return;
    }

    // Update index and focused choice atom safely
    setIndex(nextIndex);

    if (nextIndex >= 0 && nextIndex < choices.length) {
      const choice = choices[nextIndex]?.item;
      if (choice) setFocusedChoice(choice);
    } else {
      setFocusedChoice(undefined as any);
    }

    // Coordinate scroll via unified scroll service
    if (scrollTo >= 0) {
      setScrollRequest({
        context: 'choices-list',
        target: scrollTo,
        reason: 'focus-decision',
      });
    }

    // Keep last seen list signature
    prevIdsRef.current = ids;

    // DEBUG (optional): uncomment during bring-up
    if ((window as any).DEBUG_FOCUS) {
      console.log('[FocusController]', {
        reason: decision.reason,
        nextIndex,
        scrollTo,
        input,
        defaultChoiceId,
        defaultValue,
      });
    }
  }, [
    choices,
    ids,
    input,
    defaultValue,
    defaultChoiceId,
    prevIndex,
    selected,
    wereChoicesPreloaded,
    index,
    setIndex,
    setFocusedChoice,
    setScrollRequest,
    prevFocusedChoiceId,
  ]);

  // Separate effect: Keep focusedChoiceAtom in sync with index changes (for manual navigation)
  React.useEffect(() => {
    if (index >= 0 && index < choices.length) {
      const choice = choices[index]?.item;
      if (choice && choice.id !== prevFocusedChoiceId) {
        setFocusedChoice(choice);
      }
    }
  }, [index, choices, setFocusedChoice, prevFocusedChoiceId]);

  return null;
}

export default FocusController;
