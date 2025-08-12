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
  shortcutsAtom,
  enterLastPressedAtom,
  editorHistory,
} from '../shared-dependencies';
import { pushIpcMessageAtom } from '../selectors/ipcOutbound';

/**
 * Send shortcut atom - handles keyboard shortcut events.
 */
export const sendShortcutAtom = atom(null, (g, s, shortcut: string) => {
  const hasEnterShortcut = g(shortcutsAtom).find((s) => s.key === 'enter');
  log.info('<� Send shortcut', { shortcut, hasEnterShortcut });

  // If 'enter' is pressed and not defined as a specific shortcut, treat it as a submission trigger (tracked via time)
  if (shortcut === 'enter' && !hasEnterShortcut) {
    s(enterLastPressedAtom, new Date());
  } else {
    // Otherwise, send it as a shortcut event.
    s(pushIpcMessageAtom, { channel: Channel.SHORTCUT, state: { shortcut } });
  }
});

/**
 * Send action atom - handles action button clicks.
 */
export const sendActionAtom = atom(null, (g, s, action: Action) => {
  log.info(`=I Sending action: ${action.name}`);
  // Send as state override
  // (Main process expects AppMessage with `state.action` set)
  s(pushIpcMessageAtom, { channel: Channel.ACTION, state: { action } });
});

/**
 * Trigger keyword atom - handles keyword-triggered actions.
 */
export const triggerKeywordAtom = atom(
  (_g) => { },
  (
    g,
    s,
    { keyword, choice }: { keyword: string; choice: Choice },
  ) => {
    s(pushIpcMessageAtom, {
      channel: Channel.KEYWORD_TRIGGERED,
      state: { keyword, focused: choice, value: choice?.value },
    });
  },
);

/**
 * Get editor history atom - retrieves editor history.
 */
export const getEditorHistoryAtom = atom(null, (g, s) => {
  // Send state override with history
  s(pushIpcMessageAtom, {
    channel: Channel.GET_EDITOR_HISTORY,
    state: { editorHistory: g(editorHistory) },
  });
});