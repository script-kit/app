import log from 'electron-log/renderer';
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import { useAtom, useAtomValue } from 'jotai';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  choicesAtom,
  focusedFlagValueAtom,
  flagsAtom,
  flaggedChoiceValueAtom,
  indexAtom,
  inputAtom,
  inputFocusAtom,
  selectionStartAtom,
  submitValueAtom,
  channelAtom,
  sendShortcutAtom,
  shortcutsAtom,
  promptDataAtom,
  previewEnabledAtom,
  focusedChoiceAtom,
  hasRightShortcutAtom,
  uiAtom,
  actionsInputFocusAtom,
} from '../jotai';

import { hotkeysOptions } from './shared';
import { HotkeysEvent } from 'react-hotkeys-hook/dist/types';

function isEventShortcut(event: HotkeysEvent, shortcut: string): boolean {
  const shortcutEvent = {
    mod: shortcut.includes('mod') || shortcut.includes('cmd'),
    shift: shortcut.includes('shift'),
    alt: shortcut.includes('alt'),
    ctrl: shortcut.includes('ctrl'),
    meta: shortcut.includes('meta'),
    keys: [shortcut.split('+').pop() as string],
  } as HotkeysEvent;

  // log.info({
  //   event,
  //   shortcutEvent,
  // });
  // compare the event with the shortcut
  return (
    event.mod === shortcutEvent.mod &&
    event.shift === shortcutEvent.shift &&
    event.alt === shortcutEvent.alt &&
    event.ctrl === shortcutEvent.ctrl &&
    event.meta === shortcutEvent.meta &&
    event?.keys?.[0] === shortcutEvent?.keys?.[0]
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
  const hasRightShortcut = useAtomValue(hasRightShortcutAtom);
  const actionsInputFocus = useAtomValue(actionsInputFocusAtom);

  useHotkeys(
    `mod+shift+w`,
    (event) => {
      setPreviewEnabled(!previewEnabled);
    },
    hotkeysOptions,
    [setPreviewEnabled, previewEnabled],
  );

  const flagsArray = Object.entries(flags);

  const flagsWithShortcuts = flagsArray.filter(
    ([key, value]) =>
      value?.shortcut && value?.shortcut?.toLowerCase() !== 'enter',
  );

  let flagShortcuts = '';
  for (const [key, value] of flagsWithShortcuts) {
    if (value?.shortcut) {
      flagShortcuts += `${value.shortcut},`;
    }
  }
  // Remove the last comma if flagShortcuts is not empty
  if (flagShortcuts.length > 0) {
    flagShortcuts = flagShortcuts.slice(0, -1);
  }

  const flagByHandler = (event: HotkeysEvent) => {
    for (const [flag, value] of flagsWithShortcuts) {
      if (isEventShortcut(event, value.shortcut)) {
        return flag;
      }
    }
    return null; // Return null if no matching shortcut is found
  };

  useHotkeys(
    flagShortcuts.length ? flagShortcuts.replaceAll('cmd', 'mod') : 'f19',
    (event, handler: HotkeysEvent) => {
      log.info('flag shortcuts', { flagShortcuts, handler });
      event.preventDefault();

      // if (flagValue) return;

      const key = handler?.keys?.[0];
      if (!key) return;

      const flag = flagByHandler(handler) as string;
      const submitValue = focusedChoice?.value || input;
      // log.info('flag shortcut', { flagShortcuts, handler, flag, submitValue });
      setFlag(flag);
      submit(submitValue);
    },
    hotkeysOptions,
    [flags, input, inputFocus, choices, index, flagValue, flagShortcuts],
  );

  let onShortcuts = `f19`;
  if (promptShortcuts.length) {
    let keys = '';
    for (const ps of promptShortcuts) {
      if (ps?.key) {
        keys += `${ps.key},`;
      }
    }
    if (keys.length > 0) {
      // Remove the last comma
      onShortcuts = keys.slice(0, -1);
    }
  }

  useHotkeys(
    onShortcuts.replaceAll('cmd', 'mod'),
    (event, handler: HotkeysEvent) => {
      log.info('prompt shortcuts', { promptShortcuts, handler });
      event.preventDefault();

      // if (flagValue) return;
      const key = handler?.keys?.[0];
      if (!key) return;

      if (key === 'escape' && actionsInputFocus) return;

      log.info(`After escape check: ${key}`);

      const found = promptShortcuts.find((ps) => {
        if (isEventShortcut(handler, ps.key)) {
          return ps;
        }

        return null;
      });
      if (found) {
        if (found?.flag) {
          setFlag(found.flag);
        }
        log.info('sending shortcut', found.key);
        sendShortcut(found.key);
      }
    },
    hotkeysOptions,
    [flagValue, promptShortcuts, flagShortcuts, promptData, actionsInputFocus],
  );

  useHotkeys(
    `right,left`,
    (event) => {
      if (!inputFocus) return;
      if (hasRightShortcut) return;
      if (selectionStart === input.length && event.key !== 'ArrowLeft') {
        event.preventDefault();
        if (
          !flagValue &&
          (flagsArray.length || Boolean(choices?.[index]?.actions))
        ) {
          setFlagValue(choices.length ? choices[index].value : input);
        }
        channel(Channel.FORWARD);
      } else if (selectionStart === 0 && event.key !== 'ArrowRight') {
        event.preventDefault();

        if (flagValue) {
          setFlagValue('');
        }
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
    `mod+k,mod+shift+p`,
    () => {
      log.info('mod+k or mod+shift+p pressed', {
        ui,
        inputFocus,
        length: choices.length,
      });
      if (ui === UI.arg && !inputFocus) return;

      if (flagValue) {
        setFlagValue('');
      } else if (choices.length) {
        setFlagValue(focusedChoice?.value);
      } else {
        log.info('setFlagValue', input || ui);
        setFlagValue(ui === UI.arg ? input : ui);
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
      ui,
    ],
  );
};
