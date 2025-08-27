import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  actionsConfigAtom,
  actionsInputFocusAtom,
  channelAtom,
  choicesAtom,
  actionsOverlayOpenAtom,
  openActionsOverlayAtom,
  closeActionsOverlayAtom,
  flagsAtom,
  focusedActionAtom,
  focusedChoiceAtom,
  focusedFlagValueAtom,
  gridReadyAtom,
  hasRightShortcutAtom,
  indexAtom,
  inputAtom,
  inputFocusAtom,
  previewEnabledAtom,
  promptDataAtom,
  selectionStartAtom,
  sendShortcutAtom,
  shortcutsAtom,
  submitValueAtom,
  uiAtom,
} from '../jotai';
import { createLogger } from '../log-utils';

import { useCallback, useEffect, useMemo } from 'react';
import type { HotkeysEvent } from 'react-hotkeys-hook/dist/types';
import { hotkeysOptions } from './shared';

const log = createLogger('useShortcuts');

// Map of characters to react-hotkeys-hook keywords
const KEY_REPLACEMENT_MAP: Record<string, string> = {
  '.': 'period',
  '/': 'slash',
  ',': 'comma',
  // Add more character mappings here as needed
  // '?': 'question',
  // '!': 'exclamation',
  // ';': 'semicolon',
};

// Reverse map for converting keywords back to characters
const KEYWORD_TO_CHAR_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(KEY_REPLACEMENT_MAP).map(([char, keyword]) => [keyword, char]),
);

function convertShortcutToHotkeysFormat(shortcut: string): string {
  // Replace cmd with mod first
  const converted = shortcut.replace('cmd', 'mod');

  // Replace characters with react-hotkeys-hook keywords
  const parts = converted.split('+');
  const lastPart = parts.pop();

  // Use the replacement map to convert characters to keywords
  const newLastPart = lastPart && KEY_REPLACEMENT_MAP[lastPart] ? KEY_REPLACEMENT_MAP[lastPart] : lastPart;

  return parts.length > 0 ? `${parts.join('+')}+${newLastPart}` : newLastPart || '';
}

function getKey(event: HotkeysEvent) {
  const key = event?.keys?.[0];
  if (key === 'period') {
    return '.';
  }
  if (key === 'comma') {
    return ',';
  }
  if (key === 'slash') {
    return '/';
  }
  // if (key === 'quote') return '"';

  return key;
}

function normalizeEventToKey(domEvent: KeyboardEvent): string {
  const parts: string[] = [];
  // treat mod = meta on mac or ctrl on others
  if (domEvent.metaKey || domEvent.ctrlKey) parts.push('mod');
  if (domEvent.shiftKey) parts.push('shift');
  if (domEvent.altKey) parts.push('alt');
  const rawKey = (domEvent.key || '').toLowerCase();
  // Convert punctuation characters to react-hotkeys keywords so they
  // match keys produced by convertShortcutToHotkeysFormat (e.g. comma, period, slash)
  const keyPart = KEY_REPLACEMENT_MAP[rawKey] ? KEY_REPLACEMENT_MAP[rawKey] : rawKey;
  parts.push(keyPart);
  return parts.join('+');
}

export default () => {
  const [choices] = useAtom(choicesAtom);
  const [focusedChoice] = useAtom(focusedChoiceAtom);
  const [, setFocusedAction] = useAtom(focusedActionAtom);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(indexAtom);
  const overlayOpen = useAtomValue(actionsOverlayOpenAtom);
  const openOverlay = useSetAtom(openActionsOverlayAtom);
  const closeOverlay = useSetAtom(closeActionsOverlayAtom);
  const [flags] = useAtom(flagsAtom);
  const [, setFlag] = useAtom(focusedFlagValueAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [selectionStart] = useAtom(selectionStartAtom);
  const [inputFocus] = useAtom(inputFocusAtom);
  const [channel] = useAtom(channelAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [promptShortcuts] = useAtom(shortcutsAtom);
  const [, sendShortcut] = useAtom(sendShortcutAtom);
  const [ui] = useAtom(uiAtom);
  const [previewEnabled, setPreviewEnabled] = useAtom(previewEnabledAtom);
  const [, setActionsConfig] = useAtom(actionsConfigAtom);
  const hasRightShortcut = useAtomValue(hasRightShortcutAtom);
  const actionsInputFocus = useAtomValue(actionsInputFocusAtom);
  const gridReady = useAtomValue(gridReadyAtom);

  useHotkeys(
    'mod+shift+w',
    (_event) => {
      log.info('Shortcut triggered: mod+shift+w', { previewEnabled });
      setPreviewEnabled(!previewEnabled);
    },
    hotkeysOptions,
    [setPreviewEnabled, previewEnabled],
  );

  const flagsWithShortcuts = useMemo(() => {
    log.info('Processing flags for shortcuts', { flags });
    const flagsArray = Object.entries(flags) as [string, { shortcut: string }][];
    const filtered = flagsArray.filter(([_key, value]) => value?.shortcut && value?.shortcut?.toLowerCase() !== 'enter');
    log.info('Flags with shortcuts', { filtered });
    return filtered;
  }, [flags]);

  const flagShortcuts = useMemo(() => {
    const shortcuts: string[] = [];
    for (const [key, value] of flagsWithShortcuts) {
      if (value?.shortcut) {
        const converted = convertShortcutToHotkeysFormat(value.shortcut);
        shortcuts.push(converted);
        log.info('Registered flag shortcut', {
          flag: key,
          original: value.shortcut,
          converted,
          hasAction: (value as any)?.hasAction
        });
      }
    }
    log.info('All flag shortcuts', { shortcuts, flagsWithShortcuts });
    return shortcuts;
  }, [flagsWithShortcuts]);

  const promptMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const ps of promptShortcuts) {
      if (ps?.key) {
        const k = convertShortcutToHotkeysFormat(ps.key).toLowerCase();
        m.set(k, ps);
      }
    }
    return m;
  }, [promptShortcuts]);

  const flagByEvent = useCallback(
    (evt: KeyboardEvent) => {
      for (const [flag, value] of flagsWithShortcuts) {
        if (value?.shortcut) {
          const evKey = normalizeEventToKey(evt);
          const expected = convertShortcutToHotkeysFormat(value.shortcut).toLowerCase();
          if (evKey === expected) return flag;
        }
      }
      return null;
    },
    [flagsWithShortcuts],
  );

  // Fallback: capture meta/ctrl shortcut keys at the document level to ensure reliability
  // Guard: if we have prompt or flag shortcuts registered via useHotkeys, skip the fallback
  useEffect(() => {
    if ((promptShortcuts?.length || 0) > 0 || flagsWithShortcuts.length > 0) {
      return; // useHotkeys will handle all configured shortcuts
    }
    const flagsMap = new Map<string, string>();
    for (const [flag, value] of flagsWithShortcuts) {
      if (value?.shortcut) {
        flagsMap.set(convertShortcutToHotkeysFormat(value.shortcut).toLowerCase(), flag);
      }
    }

    const onKeyDown = (ev: KeyboardEvent) => {
      // Only handle modifier shortcuts to avoid interfering with typing
      if (!(ev.metaKey || ev.ctrlKey)) return;
      const evKey = normalizeEventToKey(ev);

      // Prompt-level shortcut takes precedence
      const foundPrompt = promptMap.get(evKey);
      if (foundPrompt) {
        ev.preventDefault();
        // Use same behavior as the prompt shortcut handler
        if ((foundPrompt as any)?.hasAction) {
          setFocusedAction(foundPrompt as any);
          submit(focusedChoice?.value || input);
          return;
        }
        if ((foundPrompt as any)?.flag) {
          setFlag((foundPrompt as any).flag);
          // Do not clear the flag here. The IPC outbox merges state at send time,
          // and submitValueAtom will clear flags after sending.
          submit(focusedChoice?.value || input);
          return;
        }
        // Otherwise send as regular prompt shortcut
        sendShortcut(foundPrompt.key);
        return;
      }

      // Flag-level shortcut (if not shadowed by prompt shortcut)
      const flag = flagsMap.get(evKey);
      if (flag) {
        ev.preventDefault();
        // Normal flag behavior: set flag and submit current value
        // Do not clear the flag here; submitValueAtom will clear it post-send.
        setFlag(flag);
        submit(focusedChoice?.value || input);
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [flagsWithShortcuts, promptMap, focusedChoice, input, setFocusedAction, setFlag, submit, promptShortcuts]);

  // Prompt shortcuts should take precedence over flag shortcuts when keys collide
  const promptConverted = useMemo(() => new Set(
    (promptShortcuts || [])
      .filter(ps => ps?.key)
      .map(ps => convertShortcutToHotkeysFormat(ps.key))
  ), [promptShortcuts]);

  const filteredFlagShortcuts = useMemo(
    () => flagShortcuts.filter(k => !promptConverted.has(k)),
    [flagShortcuts, promptConverted]
  );

  const shortcutsToRegister = filteredFlagShortcuts.length > 0 ? filteredFlagShortcuts.join(',') : 'f19';
  log.info('Registering flag shortcuts with useHotkeys', { shortcutsToRegister, flagShortcuts });

  useHotkeys(
    shortcutsToRegister,
    (event, handler: HotkeysEvent) => {
      const matchedFlag = flagByEvent(event as unknown as KeyboardEvent);
      log.info('Flag shortcut triggered', {
        event,
        handler,
        flagShortcuts,
        matchedFlag,
        keys: handler?.keys,
        flags
      });
      event.preventDefault();

      // A shortcut clears the active because a new one is incoming
      setActionsConfig({
        active: '',
      });

      const key = handler?.keys?.[0];
      if (!key) {
        log.info('No key found in handler');
        return;
      }

      const flag = matchedFlag as string;
      const submitValue = focusedChoice?.value || input;

      // Check if this flag has an onAction handler
      const flagData = flags?.[flag];
      log.info('Flag shortcut handler', { flag, flagData, hasAction: (flagData as any)?.hasAction });

      if (flagData && (flagData as any)?.hasAction) {
        // This is an action with an onAction handler
        const action = {
          name: flagData?.name ?? flag,
          flag,
          value: flag,
          hasAction: true,
          shortcut: flagData?.shortcut,
        };
        log.info('Setting focusedAction for hasAction flag', { action });
        console.log('[useShortcuts] Flag action triggered via shortcut', { flag, action, submitValue });
        setFocusedAction(action as any);
        // Don't set flaggedValue - let the action be triggered directly
        submit(submitValue);
        return;
      }

      // Normal flag behavior
      log.info('Submitting flagged value', { flag, submitValue });
      // Do not clear the flag immediately; the queued IPC message needs it.
      // submitValueAtom will clear focusedFlagValueAtom after sending.
      setFlag(flag);
      submit(submitValue);
    },
    hotkeysOptions,
    [flags, input, inputFocus, choices, index, overlayOpen, filteredFlagShortcuts, focusedChoice, setFocusedAction, setFlag, submit, flagByEvent],
  );

  const onShortcuts = useMemo(() => {
    // Deduplicate and normalize prompt shortcuts, to avoid repeated keys breaking registration
    const keys = Array.from(
      new Set(
        (promptShortcuts || [])
          .filter(ps => ps?.key)
          .map(ps => convertShortcutToHotkeysFormat(ps.key))
      )
    );
    const result = keys.length > 0 ? keys.join(',') : 'f19';
    log.info('On shortcuts', { result, promptShortcutsCount: promptShortcuts.length });
    return result;
  }, [promptShortcuts]);

  useHotkeys(
    onShortcuts,
    (event, handler: HotkeysEvent) => {
      console.log('[useShortcuts] Prompt shortcut triggered', {
        key: handler?.keys?.[0],
        onShortcuts,
        promptShortcuts: promptShortcuts.map(s => ({ key: s.key, name: s.name }))
      });
      log.info('Prompt shortcut triggered', { event, handler, promptShortcuts });
      event.preventDefault();

      // A shortcut clears the active because a new one is incoming
      setActionsConfig({
        active: '',
      });

      const key = handler?.keys?.[0];
      if (!key) {
        log.info('No key found in handler');
        return;
      }

      if (key === 'escape' && actionsInputFocus) {
        log.info('Escape pressed while actions input is focused');
        return;
      }

      const evKey = normalizeEventToKey(event as unknown as KeyboardEvent);
      const found = promptMap.get(evKey);

      console.log('[useShortcuts] Checking prompt shortcuts', {
        key: handler?.keys?.[0],
        found: found ? { key: found.key, name: (found as any).name, hasAction: (found as any).hasAction } : null,
        allShortcuts: promptShortcuts.map(s => ({ key: s.key, name: (s as any).name }))
      });

      if (found) {
        log.info('Matching prompt shortcut found', { shortcut: found });

        // Check if this is an action with hasAction
        if ((found as any)?.hasAction) {
          console.log('[useShortcuts] Found action with hasAction, triggering', {
            name: (found as any).name,
            value: (found as any).value,
            flag: (found as any).flag
          });
          setFocusedAction(found as any);
          // Don't set flaggedValue - let the action be triggered directly
          submit(focusedChoice?.value || input);
        } else if (found?.flag) {
          console.log('[useShortcuts] Setting flag', { flag: found.flag });
          setFlag(found.flag);
        } else if (found.key) {
          console.log('[useShortcuts] Sending regular shortcut', { key: found.key });
          log.info('Sending shortcut', { key: found.key });
          sendShortcut(found.key);
        }
      } else {
        console.log('[useShortcuts] No matching prompt shortcut found');
        log.info('No matching prompt shortcut found');
      }
    },
    hotkeysOptions,
    [overlayOpen, promptShortcuts, flagShortcuts, promptData, actionsInputFocus, setFocusedAction, submit, focusedChoice, input, setFlag, promptMap],
  );

  useHotkeys(
    'right,left',
    (event) => {
      if (gridReady) {
        return;
      }
      log.info('Arrow key pressed', { event, inputFocus, hasRightShortcut, selectionStart, input });
      if (!inputFocus) {
        log.info('Input not focused, ignoring arrow key');
        return;
      }
      if (hasRightShortcut) {
        log.info('Has right shortcut, ignoring arrow key');
        return;
      }
      if (selectionStart === input.length && (event as KeyboardEvent).key !== 'ArrowLeft') {
        log.info('Cursor at end, moving forward');
        event.preventDefault();
        channel(Channel.FORWARD);
      } else if (selectionStart === 0 && (event as KeyboardEvent).key !== 'ArrowRight') {
        log.info('Cursor at start, moving backward');
        event.preventDefault();
        channel(Channel.BACK);
      }
    },
    hotkeysOptions,
    [
      input,
      inputFocus,
      choices,
      index,
      selectionStart,
      overlayOpen,
      channel,
      flagShortcuts,
      promptShortcuts,
      hasRightShortcut,
    ],
  );
  useHotkeys(
    'mod+k,mod+shift+p',
    () => {
      log.info('mod+k or mod+shift+p pressed', { ui, inputFocus, choicesLength: choices.length, overlayOpen });
      if (ui === UI.arg && !inputFocus) {
        log.info('Ignoring shortcut: UI is arg and input not focused');
        return;
      }

      if (overlayOpen) {
        log.info('Closing actions overlay');
        closeOverlay();
      } else if (choices.length > 0) {
        log.info('Opening actions overlay for focused choice', { name: focusedChoice?.name });
        openOverlay({ source: 'choice', flag: (focusedChoice?.value as any) });
      } else {
        log.info('Opening actions overlay for input/ui', { input, ui });
        openOverlay({ source: ui === UI.arg ? 'input' : 'ui', flag: (ui === UI.arg ? input : ui) as any });
      }
    },
    hotkeysOptions,
    [input, inputFocus, choices, index, selectionStart, overlayOpen, channel, flagShortcuts, promptShortcuts, ui, openOverlay, closeOverlay, focusedChoice],
  );
};
