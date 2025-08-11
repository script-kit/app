import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'jotai';
import type { ScoredChoice } from '../../../../../shared/types';
// Import from the single source of truth (jotai.ts) for these atoms
import {
  scoredFlagsAtom,
  flagsIndexAtom,
  preventSubmitWithoutActionAtom,
} from '../../../jotai';
// Import from actions.ts for these atoms
import {
  flagsAtom,
  actionsInputAtom,
  focusedFlagValueAtom,
  focusedActionAtom,
  _flaggedValue,
} from '../actions';

describe('Actions menu behavior', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    // Ensure hasActionsAtom is true (it checks flags entries or focused choice actions)
    store.set(flagsAtom as any, { test: { name: 'Test' } } as any);
  });

  it('filters actions by actionsInputAtom', () => {
    const base: ScoredChoice[] = [
      { item: { id: 'a1', name: 'Build Project', value: 'build' }, score: 100, matches: {} },
      { item: { id: 'a2', name: 'Deploy Service', value: 'deploy' }, score: 95, matches: {} },
      { item: { id: 'a3', name: 'Open Logs', value: 'logs' }, score: 90, matches: {} },
    ];
    // Seed the base list via the scoredFlagsAtom setter
    store.set(scoredFlagsAtom as any, base);

    // No filter → all items visible
    expect(store.get(scoredFlagsAtom as any).map((s: any) => s.item.name)).toEqual([
      'Build Project',
      'Deploy Service',
      'Open Logs',
    ]);

    // Filter "dep" → only Deploy Service
    store.set(actionsInputAtom as any, 'dep');
    expect(store.get(scoredFlagsAtom as any).map((s: any) => s.item.name)).toEqual([
      'Deploy Service',
    ]);

    // Filter "log" → only Open Logs
    store.set(actionsInputAtom as any, 'log');
    expect(store.get(scoredFlagsAtom as any).map((s: any) => s.item.name)).toEqual([
      'Open Logs',
    ]);
  });

  it('sets focusedActionAtom when selecting an action so Enter can submit', () => {
    const base: ScoredChoice[] = [
      { item: { id: 'a1', name: 'Build Project', value: 'build' }, score: 100, matches: {} },
      { item: { id: 'a2', name: 'Deploy Service', value: 'deploy' }, score: 95, matches: {} },
    ];
    store.set(scoredFlagsAtom as any, base);

    // Mark the actions menu as open without triggering side-effects from flaggedChoiceValueAtom
    store.set(_flaggedValue as any, 'actions-open');

    // Select first action
    store.set(flagsIndexAtom as any, 0);
    expect(store.get(focusedFlagValueAtom as any)).toBe('build');
    expect(store.get(focusedActionAtom as any)).toEqual(
      expect.objectContaining({ hasAction: true, flag: 'build' })
    );

    // With a selected action, submit should not be prevented
    expect(store.get(preventSubmitWithoutActionAtom as any)).toBe(false);
  });
});