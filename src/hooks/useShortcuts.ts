import { Channel } from '@johnlindquist/kit/cjs/enum';
import { useAtom, useAtomValue } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  choicesAtom,
  cmdAtom,
  focusedFlagValueAtom,
  flagsAtom,
  flagValueAtom,
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
} from '../jotai';

import { hotkeysOptions } from './shared';

export default () => {
  const [cmd] = useAtom(cmdAtom);
  const [choices] = useAtom(choicesAtom);
  const [focusedChoice] = useAtom(focusedChoiceAtom);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(indexAtom);
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);
  const [flags] = useAtom(flagsAtom);
  const [, setFlag] = useAtom(focusedFlagValueAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [selectionStart] = useAtom(selectionStartAtom);
  const [inputFocus] = useAtom(inputFocusAtom);
  const [channel] = useAtom(channelAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [promptShortcuts] = useAtom(shortcutsAtom);
  const [, sendShortcut] = useAtom(sendShortcutAtom);
  const [previewEnabled, setPreviewEnabled] = useAtom(previewEnabledAtom);
  const hasRightShortcut = useAtomValue(hasRightShortcutAtom);

  useHotkeys(
    `${cmd}+shift+w`,
    (event) => {
      setPreviewEnabled(!previewEnabled);
    },
    hotkeysOptions,
    [setPreviewEnabled, previewEnabled, cmd]
  );

  const flagsArray = Object.entries(flags);

  const flagsWithShortcuts = flagsArray.filter(
    ([key, value]) =>
      value?.shortcut && value?.shortcut?.toLowerCase() !== 'enter'
  );

  const flagShortcuts = flagsWithShortcuts
    .filter(([key, value]) => value?.shortcut)

    .map(([key, value]) => value.shortcut)
    .join(',');

  const flagKeyByShortcut = (shortcut: string) =>
    flagsWithShortcuts.find(
      ([key, value]) => value.shortcut === shortcut
    )?.[0] as string;

  useHotkeys(
    flagShortcuts.length ? flagShortcuts : 'f19',
    (event, handler) => {
      if (!inputFocus) return;
      event.preventDefault();

      if (flagValue) return;

      setFlag(flagKeyByShortcut(handler.key));
      submit(focusedChoice?.value || input);
    },
    hotkeysOptions,
    [flags, input, inputFocus, choices, index, flagValue, flagShortcuts]
  );

  const onShortcuts = promptShortcuts.length
    ? promptShortcuts
        .filter((ps) => ps?.key)
        .map((ps) => ps.key)
        .join(',')
    : `f19`;

  useHotkeys(
    onShortcuts,
    (event, handler) => {
      event.preventDefault();

      if (flagValue) return;

      const found = promptShortcuts.find((ps) => ps.key === handler.key);
      if (found && found?.flag) {
        setFlag(found.flag);
      }
      sendShortcut(handler.key);
    },
    hotkeysOptions,
    [
      flagValue,
      inputFocus,
      promptShortcuts,
      flagShortcuts,
      promptData,
      sendShortcut,
      setFlag,
    ]
  );

  useHotkeys(
    `right,left`,
    (event) => {
      if (!inputFocus) return;
      if (hasRightShortcut) return;
      if (selectionStart === input.length && event.key !== 'ArrowLeft') {
        event.preventDefault();
        if (!flagValue && flagsArray.length) {
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
      cmd,
      channel,
      flagShortcuts,
      promptShortcuts,
      hasRightShortcut,
    ]
  );
  useHotkeys(
    `${cmd}+k`,
    (event) => {
      if (!inputFocus) return;

      if (flagValue) {
        setFlagValue('');
      } else if (choices.length) {
        setFlagValue(focusedChoice?.value);
      } else {
        setFlagValue(input);
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
      cmd,
      channel,
      flagShortcuts,
      promptShortcuts,
    ]
  );
};
