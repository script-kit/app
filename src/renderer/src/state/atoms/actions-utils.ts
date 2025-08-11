/**
 * Action and shortcut utility atoms.
 * Handles keyboard shortcuts, actions, and related functionality.
 */

import { atom } from 'jotai';
import { Channel } from '@johnlindquist/kit/core/enum';
import type { Action, Choice } from '@johnlindquist/kit/types/core';
import log from 'electron-log';

// Import dependencies from shared-dependencies to avoid circular imports
import {
  channelAtom,
  shortcutsAtom,
  enterLastPressedAtom,
  editorHistory,
} from '../shared-dependencies';

/**
 * Send shortcut atom - handles keyboard shortcut events.
 */
export const sendShortcutAtom = atom(null, (g, s, shortcut: string) => {
  const channel = g(channelAtom);
  const hasEnterShortcut = g(shortcutsAtom).find((s) => s.key === 'enter');
  log.info('<� Send shortcut', { shortcut, hasEnterShortcut });

  // If 'enter' is pressed and not defined as a specific shortcut, treat it as a submission trigger (tracked via time)
  if (shortcut === 'enter' && !hasEnterShortcut) {
    s(enterLastPressedAtom, new Date());
  } else {
    // Otherwise, send it as a shortcut event.
    channel(Channel.SHORTCUT, { shortcut });
  }
});

/**
 * Send action atom - handles action button clicks.
 */
export const sendActionAtom = atom(null, (g, _s, action: Action) => {
  const channel = g(channelAtom);
  log.info(`=I Sending action: ${action.name}`);
  channel(Channel.ACTION, { action });
});

/**
 * Trigger keyword atom - handles keyword-triggered actions.
 */
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

/**
 * Get editor history atom - retrieves editor history.
 */
export const getEditorHistoryAtom = atom((g) => () => {
  const channel = g(channelAtom);
  channel(Channel.GET_EDITOR_HISTORY, { editorHistory: g(editorHistory) });
});