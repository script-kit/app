import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue } from 'jotai';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  actionsConfigAtom,
  actionsInputFocusAtom,
  channelAtom,
  choicesAtom,
  flaggedChoiceValueAtom,
  flagsAtom,
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

import { useCallback, useMemo } from 'react';
import type { HotkeysEvent } from 'react-hotkeys-hook';
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

function isEventShortcut(event: HotkeysEvent, originalShortcutString: string): boolean {
  const eventKeyChar = getKey(event); // This will be '.', ',', '/', or other chars

  const shortcutParts = originalShortcutString.split('+');
  const shortcutKeyDefinitionPart = shortcutParts.pop() as string; // This could be 'period', 'comma', 'slash', or a char like 'o'

  // Normalize the shortcut key part to the expected character using the reverse map
  const expectedCharFromShortcut =
    KEYWORD_TO_CHAR_MAP[shortcutKeyDefinitionPart.toLowerCase()] || shortcutKeyDefinitionPart;

  const modifiersMatch =
    event.mod === (originalShortcutString.includes('mod') || originalShortcutString.includes('cmd')) &&
    event.shift === originalShortcutString.includes('shift') &&
    event.alt === originalShortcutString.includes('alt') &&
    event.ctrl === originalShortcutString.includes('ctrl') &&
    event.meta === originalShortcutString.includes('meta');

  // log.debug(`isEventShortcut: eventKeyChar='${eventKeyChar}', expectedCharFromShortcut='${expectedCharFromShortcut}', modMatch=${modifiersMatch}`);
  return modifiersMatch && eventKeyChar === expectedCharFromShortcut;
}

export default () => {
  const [choices] = useAtom(choicesAtom);
  const [focusedChoice] = useAtom(focusedChoiceAtom);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(indexAtom);
  const [flagValue, setFlagValue] = useAtom(flaggedChoiceValueAtom);
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
  const [actionsConfig, setActionsConfig] = useAtom(actionsConfigAtom);
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
    const flagsArray = Object.entries(flags) as [string, { shortcut: string }][];
    return flagsArray.filter(([_key, value]) => value?.shortcut && value?.shortcut?.toLowerCase() !== 'enter');
  }, [flags]);

  const flagShortcuts = useMemo(() => {
    const shortcuts: string[] = [];
    for (const [, value] of flagsWithShortcuts) {
      if (value?.shortcut) {
        shortcuts.push(convertShortcutToHotkeysFormat(value.shortcut));
      }
    }
    log.info('Flag shortcuts', { shortcuts });
    return shortcuts;
  }, [flagsWithShortcuts]);

  const flagByHandler = useCallback(
    (event: HotkeysEvent) => {
      // log.info('Checking flag shortcuts', { event, flagsWithShortcuts });
      for (const [flag, value] of flagsWithShortcuts) {
        if (isEventShortcut(event, value.shortcut)) {
          // log.info('Flag shortcut matched', { flag, shortcut: value.shortcut });
          return flag;
        }
      }
      return null;
    },
    [flagsWithShortcuts],
  );

  useHotkeys(
    flagShortcuts.length > 0 ? flagShortcuts : ['f19'],
    (event, handler: HotkeysEvent) => {
      log.info('Flag shortcut triggered', { event, handler, flagShortcuts });
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

      const flag = flagByHandler(handler) as string;
      const submitValue = focusedChoice?.value || input;
      log.info('Submitting flagged value', { flag, submitValue });
      setFlag(flag);
      submit(submitValue);
      setFlag('')
    },
    hotkeysOptions,
    [flags, input, inputFocus, choices, index, flagValue, flagShortcuts],
  );

  const onShortcuts = useMemo(() => {
    let onShortcuts = 'f19';
    if (promptShortcuts.length > 0) {
      let keys = '';
      for (const ps of promptShortcuts) {
        if (ps?.key) {
          const k = convertShortcutToHotkeysFormat(ps.key);

          // log.info(`Comparing ${ps.key} to ${flagShortcuts}`);
          if (flagShortcuts.includes(k)) {
            // log.warn('Prompt shortcut is a duplicated of a flag shortcut. Ignoring flag shortcut', { ps });
          } else {
            keys += `${k},`;
          }
        }
      }
      if (keys.length > 0) {
        // Remove the last comma
        onShortcuts = keys.slice(0, -1);
        // log.info('All flags and shortcuts', { flagShortcuts, onShortcuts });
      }
    }
    log.info('On shortcuts', { onShortcuts, promptShortcuts, flagShortcuts });
    return onShortcuts;
  }, [promptShortcuts, flagShortcuts]);

  useHotkeys(
    onShortcuts,
    (event, handler: HotkeysEvent) => {
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

      const found = promptShortcuts.find((ps) => isEventShortcut(handler, ps.key));
      if (found) {
        log.info('Matching prompt shortcut found', { shortcut: found });
        if (found?.flag) {
          setFlag(found.flag);
        }
        if (found.key) {
          log.info('Sending shortcut', { key: found.key });
          sendShortcut(found.key);
        }
      } else {
        log.info('No matching prompt shortcut found');
      }
    },
    hotkeysOptions,
    [flagValue, promptShortcuts, flagShortcuts, promptData, actionsInputFocus],
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
      flagValue,
      channel,
      flagShortcuts,
      promptShortcuts,
      hasRightShortcut,
    ],
  );
  useHotkeys(
    'mod+k,mod+shift+p',
    () => {
      log.info('mod+k or mod+shift+p pressed', { ui, inputFocus, choicesLength: choices.length, flagValue });
      if (ui === UI.arg && !inputFocus) {
        log.info('Ignoring shortcut: UI is arg and input not focused');
        return;
      }

      if (flagValue) {
        log.info('Clearing flag value');
        setFlagValue('');
      } else if (choices.length > 0) {
        log.info('Setting flag value to focused choice', { name: focusedChoice?.name });
        setFlagValue(focusedChoice?.value);
      } else {
        log.info('Setting flag value to input or UI', { input, ui });
        setFlagValue(ui === UI.arg ? input : ui);
      }
    },
    hotkeysOptions,
    [input, inputFocus, choices, index, selectionStart, flagValue, channel, flagShortcuts, promptShortcuts, ui],
  );
};
