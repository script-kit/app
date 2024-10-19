import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue } from 'jotai';
import { useHotkeys } from 'react-hotkeys-hook';
import { createLogger } from '../../../shared/log-utils';
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

import type { HotkeysEvent } from 'react-hotkeys-hook/dist/types';
import { hotkeysOptions } from './shared';
import { useCallback, useMemo } from 'react';

const log = createLogger('useShortcuts');

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

function isEventShortcut(event: HotkeysEvent, shortcut: string): boolean {
  const shortcutEvent = {
    mod: shortcut.includes('mod') || shortcut.includes('cmd'),
    shift: shortcut.includes('shift'),
    alt: shortcut.includes('alt'),
    ctrl: shortcut.includes('ctrl'),
    meta: shortcut.includes('meta'),
    keys: [shortcut.split('+').pop() as string],
  } as HotkeysEvent;

  const eventKey = getKey(event);
  // compare the event with the shortcut
  return (
    event.mod === shortcutEvent.mod &&
    event.shift === shortcutEvent.shift &&
    event.alt === shortcutEvent.alt &&
    event.ctrl === shortcutEvent.ctrl &&
    event.meta === shortcutEvent.meta &&
    eventKey === shortcutEvent?.keys?.[0]
  );
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
    (event) => {
      log.info('Shortcut triggered: mod+shift+w', { previewEnabled });
      setPreviewEnabled(!previewEnabled);
    },
    hotkeysOptions,
    [setPreviewEnabled, previewEnabled],
  );

  const flagsWithShortcuts = useMemo(() => {
    const flagsArray = Object.entries(flags) as [string, { shortcut: string }][];
    return flagsArray.filter(([key, value]) => value?.shortcut && value?.shortcut?.toLowerCase() !== 'enter');
  }, [flags]);

  const flagShortcuts = useMemo(() => {
    const shortcuts: string[] = [];
    for (const [, value] of flagsWithShortcuts) {
      if (value?.shortcut) {
        shortcuts.push(value.shortcut.replace('cmd', 'mod').replace(',', 'comma'));
      }
    }
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
    flagShortcuts.length ? flagShortcuts : ['f19'],
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
    },
    hotkeysOptions,
    [flags, input, inputFocus, choices, index, flagValue, flagShortcuts],
  );

  const onShortcuts = useMemo(() => {
    let onShortcuts = 'f19';
    if (promptShortcuts.length > 0) {
      const moddedPromptShortcuts = promptShortcuts.map((ps) => ({
        ...ps,
        key: ps?.key?.replace('cmd', 'mod') || undefined,
      }));
      let keys = '';
      for (const ps of moddedPromptShortcuts) {
        if (ps?.key) {
          // log.info(`Comparing ${ps.key} to ${flagShortcuts}`);
          if (flagShortcuts.includes(ps.key)) {
            log.warn('Prompt shortcut is a duplicated of a flag shortcut. Ignoring flag shortcut', { ps });
          } else {
            keys += `${ps.key.replace('+,', '+comma')},`;
          }
        }
      }
      if (keys.length > 0) {
        // Remove the last comma
        onShortcuts = keys.slice(0, -1);
        // log.info('All flags and shortcuts', { flagShortcuts, onShortcuts });
      }
    }
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
      if (selectionStart === input.length && event.key !== 'ArrowLeft') {
        log.info('Cursor at end, moving forward');
        event.preventDefault();
        channel(Channel.FORWARD);
      } else if (selectionStart === 0 && event.key !== 'ArrowRight') {
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
      } else if (choices.length) {
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
