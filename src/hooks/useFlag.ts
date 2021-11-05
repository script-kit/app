import { useAtom } from 'jotai';

import { useHotkeys } from 'react-hotkeys-hook';
import {
  choicesAtom,
  flagAtom,
  flagsAtom,
  flagValueAtom,
  indexAtom,
  inputAtom,
  inputFocusAtom,
  openAtom,
  previewEnabledAtom,
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
  const [inputFocus] = useAtom(inputFocusAtom);
  const [previewEnabled, setPreviewEnabled] = useAtom(previewEnabledAtom);

  useHotkeys(
    'cmd+p',
    (event) => {
      setPreviewEnabled(!previewEnabled);
    },
    hotkeysOptions,
    [setPreviewEnabled, previewEnabled]
  );

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

  useHotkeys(
    flagsArray.length ? 'right,left,cmd+k,ctrl+k' : 'f18',
    (event) => {
      if (!inputFocus) return;
      if (
        selectionStart === input.length &&
        !flagValue &&
        event.key !== 'ArrowLeft'
      ) {
        event.preventDefault();
        setFlagValue(choices.length ? choices[index].value : input);
      } else if (
        selectionStart === 0 &&
        flagValue &&
        event.key !== 'ArrowRight'
      ) {
        event.preventDefault();

        setFlagValue('');
      } else if (event.key === 'k') {
        setFlagValue(
          flagValue ? '' : choices.length ? choices[index].value : input
        );
      }
    },
    hotkeysOptions,
    [input, inputFocus, choices, index, selectionStart, flagValue]
  );
};
