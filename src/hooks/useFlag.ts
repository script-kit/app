import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  choicesAtom,
  flagAtom,
  flagsAtom,
  flagValueAtom,
  indexAtom,
  inputAtom,
  openAtom,
  selectionStartAtom,
  submitValueAtom,
} from '../jotai';

import { hotkeysOptions } from './shared';

export default () => {
  const [choices] = useAtom(choicesAtom);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(indexAtom);
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);
  const [flags] = useAtom(flagsAtom);
  const [, setFlag] = useAtom(flagAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [selectionStart] = useAtom(selectionStartAtom);
  const [open, setOpen] = useAtom(openAtom);

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
      event.preventDefault();
      setFlag(flagKeyByShortcut(handler.key));
      submit(choices.length ? choices[index].value : input);
    },
    hotkeysOptions,
    [flags, input, choices, index]
  );

  useHotkeys(
    flagsArray.length ? 'right' : 'f18',
    (event) => {
      if (selectionStart === input.length) {
        event.preventDefault();
        if (!flagValue)
          setFlagValue(choices.length ? choices[index].value : input);
      }
    },
    hotkeysOptions,
    [input, choices, index, selectionStart, flagValue]
  );

  useHotkeys(
    flagsArray.length ? 'left' : 'f17',
    (event) => {
      if (selectionStart === 0) {
        event.preventDefault();
        if (flagValue) {
          setFlagValue('');
        } else {
          setOpen(false);
        }
      }
    },
    hotkeysOptions,
    [input, choices, index, selectionStart, flagValue]
  );
};
