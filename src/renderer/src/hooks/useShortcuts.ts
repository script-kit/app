import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import type { HotkeysEvent } from 'react-hotkeys-hook/dist/types';
import {
  KEY_REPLACEMENT_MAP,
  KEYWORD_TO_CHAR_MAP,
  normalizeEventToHotkeysKey,
  toHotkeysFormat,
} from '../../../shared/shortcuts';
import {
  actionsConfigAtom,
  actionsInputFocusAtom,
  actionsOverlayOpenAtom,
  channelAtom,
  choicesAtom,
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
  openActionsOverlayAtom,
  previewEnabledAtom,
  promptDataAtom,
  selectionStartAtom,
  sendShortcutAtom,
  shortcutsAtom,
  submitValueAtom,
  uiAtom,
} from '../jotai';
import { createLogger } from '../log-utils';
import { hotkeysOptions } from './shared';

const log = createLogger('useShortcuts');

/**
 * Convert a shortcut to react-hotkeys format.
 * Uses the shared module's toHotkeysFormat for consistency.
 */
function convertShortcutToHotkeysFormat(shortcut: string): string {
  return toHotkeysFormat(shortcut);
}

function getKey(event: HotkeysEvent) {
  const key = event?.keys?.[0];
  // Convert hotkeys keywords back to characters using the shared map
  return KEYWORD_TO_CHAR_MAP[key] || key;
}

/**
 * Normalize a keyboard event to a hotkeys-format string for matching.
 * Uses the shared module for consistency.
 */
function normalizeEventToKey(domEvent: KeyboardEvent): string {
  return normalizeEventToHotkeysKey(domEvent);
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
    const filtered = flagsArray.filter(
      ([_key, value]) => value?.shortcut && value?.shortcut?.toLowerCase() !== 'enter',
    );
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
          hasAction: (value as any)?.hasAction,
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

  // NOTE: Previously there was a document-level keydown listener here as a "fallback"
  // It was removed because it was dead code - it only activated when there were NO shortcuts,
  // but then tried to handle shortcuts (which would be empty). The useHotkeys handlers above
  // handle all shortcut cases correctly.

  // Prompt shortcuts should take precedence over flag shortcuts when keys collide
  const promptConverted = useMemo(
    () => new Set((promptShortcuts || []).filter((ps) => ps?.key).map((ps) => convertShortcutToHotkeysFormat(ps.key))),
    [promptShortcuts],
  );

  const filteredFlagShortcuts = useMemo(
    () => flagShortcuts.filter((k) => !promptConverted.has(k)),
    [flagShortcuts, promptConverted],
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
        flags,
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
        setFocusedAction(action as any);
        // Don't set flaggedValue - let the action be triggered directly
        submit(submitValue);
        return;
      }

      // Normal flag behavior
      log.info('Submitting flagged value', { flag, submitValue });
      // Do not clear the flag immediately; the queued IPC message needs it.
      // submitValueAtom will clear focusedFlagValueAtom after sending.
      setFocusedAction({} as any);
      setFlag(flag);
      submit(submitValue);
    },
    hotkeysOptions,
    [
      flags,
      input,
      inputFocus,
      choices,
      index,
      overlayOpen,
      filteredFlagShortcuts,
      focusedChoice,
      setFocusedAction,
      setFlag,
      submit,
      flagByEvent,
    ],
  );

  const onShortcuts = useMemo(() => {
    // Deduplicate and normalize prompt shortcuts, to avoid repeated keys breaking registration
    const keys = Array.from(
      new Set((promptShortcuts || []).filter((ps) => ps?.key).map((ps) => convertShortcutToHotkeysFormat(ps.key))),
    );
    // Always include arrow navigation keys to prevent state desync between hasRightShortcut
    // and the actual registered hotkeys. This ensures we always catch arrow keys and handle
    // them appropriately (either as shortcuts or as navigation fallback).
    const navKeys = ['right', 'left'];
    const allKeys = Array.from(new Set([...keys, ...navKeys]));
    const result = allKeys.join(',');
    log.info('On shortcuts', { result, promptShortcutsCount: promptShortcuts.length });
    return result;
  }, [promptShortcuts]);

  useHotkeys(
    onShortcuts,
    (event, handler: HotkeysEvent) => {
      const domEvent = event as unknown as KeyboardEvent;
      const isArrowKey = domEvent.key === 'ArrowRight' || domEvent.key === 'ArrowLeft';

      // Debug logging for ALL shortcut key presses to diagnose timing issues
      log.info('🎹 useHotkeys callback triggered', {
        key: domEvent.key,
        code: domEvent.code,
        metaKey: domEvent.metaKey,
        shiftKey: domEvent.shiftKey,
        ctrlKey: domEvent.ctrlKey,
        altKey: domEvent.altKey,
        handlerKeys: handler?.keys,
        registeredShortcuts: onShortcuts,
        promptShortcutsCount: promptShortcuts.length,
        overlayOpen,
      });

      // Debug logging for arrow keys
      if (isArrowKey) {
        log.info('Arrow key pressed in useShortcuts', {
          key: domEvent.key,
          promptShortcutsCount: promptShortcuts.length,
          promptShortcutKeys: promptShortcuts.map(s => s?.key).filter(Boolean),
          hasLeftInMap: promptMap.has('left'),
          hasRightInMap: promptMap.has('right'),
        });
      }

      // Check if this is an arrow key - don't preventDefault yet, handle specially below

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

      log.info('Looking up shortcut in promptMap', {
        evKey,
        found: !!found,
        promptMapKeys: Array.from(promptMap.keys()),
        promptShortcutsCount: promptShortcuts.length,
        promptShortcutKeys: promptShortcuts.map(s => s?.key)
      });

      if (found) {
        log.info('Matching prompt shortcut found', { shortcut: found, key: found?.key, name: (found as any)?.name });
        // Note: Don't call event.preventDefault() here - the original code didn't prevent default
        // for shortcuts, and doing so can interfere with other handlers like useKeyIndex.ts

        // Check if this is an action with hasAction
        if ((found as any)?.hasAction) {
          log.info('Found action with hasAction, triggering', { name: (found as any).name, flag: (found as any).flag });
          setFocusedAction(found as any);
          // Don't set flaggedValue - let the action be triggered directly
          submit(focusedChoice?.value || input);
        } else if (found?.flag) {
          log.info('Setting flag from prompt shortcut', { flag: found.flag });
          setFocusedAction({} as any);
          setFlag(found.flag);
        } else if (found.key) {
          log.info('Calling sendShortcut NOW', { key: found.key, shortcutName: (found as any)?.name });
          sendShortcut(found.key);
          log.info('sendShortcut called successfully', { key: found.key });
        }
      } else if (isArrowKey) {
        // No shortcut found - handle fallback navigation for arrow keys
        // This prevents state desync where hasRightShortcut is true but no shortcut exists
        log.warn('FALLBACK PATH: Arrow key shortcut NOT found in promptMap!', {
          key: domEvent.key,
          evKey,
          promptMapKeys: Array.from(promptMap.keys()),
        });

        const isArrowRight = domEvent.key === 'ArrowRight';
        const isArrowLeft = domEvent.key === 'ArrowLeft';

        // Read selection directly from the input element for accurate cursor position
        const target = domEvent.target as HTMLInputElement;
        const currentSelectionStart = target?.selectionStart ?? selectionStart;
        const currentValue = target?.value ?? input;

        log.info('Arrow key fallback details', {
          key: domEvent.key,
          isArrowRight,
          isArrowLeft,
          inputFocus,
          gridReady,
          currentSelectionStart,
          inputLength: currentValue.length
        });

        if (!inputFocus || gridReady) {
          log.info('Arrow key fallback: input not focused or grid ready, ignoring');
          return;
        }

        if (isArrowRight && currentSelectionStart === currentValue.length) {
          log.info('Arrow key fallback: cursor at end, moving forward');
          event.preventDefault();
          channel(Channel.FORWARD);
        } else if (isArrowLeft && currentSelectionStart === 0) {
          log.info('Arrow key fallback: cursor at start, moving backward');
          event.preventDefault();
          channel(Channel.BACK);
        } else {
          log.info('Arrow key fallback: cursor not at boundary, allowing default cursor movement');
          // Don't preventDefault - let the cursor move naturally
        }
      } else {
        // Non-arrow key with no matching shortcut
        log.info('No matching prompt shortcut found');
        event.preventDefault(); // Prevent default for other unhandled shortcuts
      }
    },
    hotkeysOptions,
    [
      overlayOpen,
      promptShortcuts,
      flagShortcuts,
      promptData,
      actionsInputFocus,
      setFocusedAction,
      submit,
      focusedChoice,
      input,
      setFlag,
      promptMap,
      inputFocus,
      selectionStart,
      gridReady,
      channel,
    ],
  );

  // NOTE: Arrow key navigation is now handled in the onShortcuts handler above.
  // This handler is kept as a safety net but defers to onShortcuts for all arrow handling.
  // The onShortcuts handler always includes 'right' and 'left' to prevent state desync
  // that was causing the "right arrow stops working after left" bug.
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
        openOverlay({ source: 'choice', flag: focusedChoice?.value as any });
      } else {
        log.info('Opening actions overlay for input/ui', { input, ui });
        openOverlay({ source: ui === UI.arg ? 'input' : 'ui', flag: (ui === UI.arg ? input : ui) as any });
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
      ui,
      openOverlay,
      closeOverlay,
      focusedChoice,
    ],
  );
};
