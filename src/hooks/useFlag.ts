import { Channel } from '@johnlindquist/kit/cjs/enum';
import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  _choices,
  cmdAtom,
  _flag,
  flagsAtom,
  flagValueAtom,
  _index,
  inputAtom,
  inputFocusAtom,
  selectionStartAtom,
  submitValueAtom,
  channelAtom,
  onShortcutSubmitAtom,
  onShortcutAtom,
  sendShortcutAtom,
} from '../jotai';

import { hotkeysOptions } from './shared';

export default () => {
  const [cmd] = useAtom(cmdAtom);
  const [choices] = useAtom(_choices);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(_index);
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);
  const [flags] = useAtom(flagsAtom);
  const [, setFlag] = useAtom(_flag);
  const [, submit] = useAtom(submitValueAtom);
  const [selectionStart] = useAtom(selectionStartAtom);
  const [inputFocus] = useAtom(inputFocusAtom);
  const [channel] = useAtom(channelAtom);
  const [onShortcutSubmit] = useAtom(onShortcutSubmitAtom);
  const [onShortcut] = useAtom(onShortcutAtom);
  const [, sendShortcut] = useAtom(sendShortcutAtom);

  // useHotkeys(
  //   `${cmd}+p`,
  //   (event) => {
  //     setPreviewEnabled(!previewEnabled);
  //   },
  //   hotkeysOptions,
  //   [setPreviewEnabled, previewEnabled, cmd]
  // );

  const flagsArray = Object.entries(flags);

  const flagsWithShortcuts = flagsArray.filter(
    ([key, value]) =>
      value?.shortcut && value?.shortcut?.toLowerCase() !== 'enter'
  );

  const shortcuts = flagsWithShortcuts
    .map(([key, value]) => value.shortcut)
    .join(',');

  const flagKeyByShortcut = (shortcut: string) =>
    flagsWithShortcuts.find(
      ([key, value]) => value.shortcut === shortcut
    )?.[0] as string;

  useHotkeys(
    shortcuts.length ? shortcuts : 'f19',
    (event, handler) => {
      if (!inputFocus) return;
      event.preventDefault();

      setFlag(flagKeyByShortcut(handler.key));
      submit(choices.length ? choices[index].value : input);
    },
    hotkeysOptions,
    [flags, input, inputFocus, choices, index]
  );

  const onShortcutSubmits = Object.keys(onShortcutSubmit).length
    ? Object.keys(onShortcutSubmit).join(',')
    : `f19`;

  const onShortcuts = Object.keys(onShortcut).length
    ? Object.keys(onShortcut).join(',')
    : `f19`;

  useHotkeys(
    onShortcutSubmits,
    (event, handler) => {
      if (!inputFocus) return;
      event.preventDefault();

      const value = onShortcutSubmit[handler.key];
      submit(value);
    },
    hotkeysOptions,
    [onShortcutSubmit]
  );

  useHotkeys(
    onShortcuts,
    (event, handler) => {
      if (!inputFocus) return;
      event.preventDefault();

      sendShortcut(handler.key);
    },
    hotkeysOptions,
    [onShortcutSubmit]
  );

  useHotkeys(
    `right,left,${cmd}+k`,
    (event) => {
      if (!inputFocus) return;
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
      } else if (event.key === 'k') {
        if (flagValue) {
          setFlagValue('');
        } else if (choices.length) {
          setFlagValue(choices[index].value);
        } else {
          setFlagValue(input);
        }
      }
    },
    hotkeysOptions,
    [input, inputFocus, choices, index, selectionStart, flagValue, cmd, channel]
  );
};
