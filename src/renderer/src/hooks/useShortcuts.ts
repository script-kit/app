import log from 'electron-log'
import { Channel } from '@johnlindquist/kit/core/enum';
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
} from '../jotai';

import { hotkeysOptions } from './shared';
import { HotkeysEvent } from 'react-hotkeys-hook/dist/types';

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
  const [previewEnabled, setPreviewEnabled] = useAtom(previewEnabledAtom);
  const hasRightShortcut = useAtomValue(hasRightShortcutAtom);

  useHotkeys(
    `mod+shift+w`,
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

  const flagKeyByShortcut = (shortcut: string) => {
    for (const [key, value] of flagsWithShortcuts) {
      if (value.shortcut === shortcut) {
        return key;
      }
    }
    return null; // Return null if no matching shortcut is found
  };

  useHotkeys(
    flagShortcuts.length ? flagShortcuts.replaceAll('cmd', 'mod') : 'f19',
    (event, handler:HotkeysEvent) => {
      if (!inputFocus) return;
      event.preventDefault();

      if (flagValue) return;

      const key = handler?.keys?.[0];
      if(!key) return;

      // setFlag(flagKeyByShortcut(key));
      // submit(focusedChoice?.value || input);
    },
    hotkeysOptions,
    [flags, input, inputFocus, choices, index, flagValue, flagShortcuts]
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
    (event, handler:HotkeysEvent) => {
      event.preventDefault();

      if (flagValue) return;
      const key = handler?.keys?.[0];
      if (!key) return;

      const found = promptShortcuts.find((ps) => {
        const [shortcutKey, ...modifiers] = ps?.key?.split('+')?.reverse();
        const hasKey = shortcutKey === key;
        const hasModifiers = modifiers.every((modifier) =>{
          if(modifier === 'cmd'){
            return handler?.mod || handler?.meta
          }

          return handler[modifier];
        });

        return hasKey && hasModifiers;
      });
      if (found) {
        if(found?.flag){
          setFlag(found.flag);
        }
        log.info('sending shortcut', found.key);
        sendShortcut(found.key);
      }
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
    ]
  );
  useHotkeys(
    `mod+k`,
    () => {
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
      channel,
      flagShortcuts,
      promptShortcuts,
    ]
  );
};
