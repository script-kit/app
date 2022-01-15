/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/prop-types */
import React, { useCallback, KeyboardEvent, LegacyRef, useEffect } from 'react';
import { motion } from 'framer-motion';

import { Choice } from '@johnlindquist/kit/types/core';
import { Channel } from '@johnlindquist/kit/cjs/enum';
import { useAtom } from 'jotai';

import {
  appStateAtom,
  channelAtom,
  inputAtom,
  isMainScriptAtom,
  modifiers,
  _modifiers,
  pidAtom,
  placeholderAtom,
  processingAtom,
  promptDataAtom,
  resizeEnabledAtom,
  selectionStartAtom,
  submittedAtom,
  submitValueAtom,
  tabIndexAtom,
  _tabs,
  ultraShortCodesAtom,
  unfilteredChoicesAtom,
} from '../jotai';
import {
  useEnter,
  useEscape,
  useFlag,
  useFocus,
  useKeyIndex,
  useTab,
  useOpen,
} from '../hooks';

const remapModifiers = (m: string) => {
  if (m === 'Meta') return ['cmd'];
  if (m === 'Control') return ['control', 'ctrl'];
  if (m === 'Alt') return ['alt', 'option'];
  return m.toLowerCase();
};

export default function Input() {
  const inputRef = useFocus();

  const [pid] = useAtom(pidAtom);
  const [inputValue, setInput] = useAtom(inputAtom);
  const [tabs] = useAtom(_tabs);
  const [, setTabIndex] = useAtom(tabIndexAtom);
  const [unfilteredChoices] = useAtom(unfilteredChoicesAtom);
  const [, setSubmitValue] = useAtom(submitValueAtom);
  const [placeholder] = useAtom(placeholderAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [submitted] = useAtom(submittedAtom);
  const [, setSelectionStart] = useAtom(selectionStartAtom);
  const [, setModifiers] = useAtom(_modifiers);
  const [ultraShortCodes] = useAtom(ultraShortCodesAtom);
  const [processing] = useAtom(processingAtom);
  const [resizeEnabled] = useAtom(resizeEnabledAtom);
  const [channel] = useAtom(channelAtom);

  useEscape();
  useEnter();
  useFlag();
  useTab();
  useKeyIndex();
  // useOpen();

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const target = event.target as HTMLInputElement;
      setSelectionStart(target.selectionStart as number);

      setModifiers(
        modifiers
          .filter((m) => event.getModifierState(m))
          .flatMap(remapModifiers)
      );

      // if ((Object.values(Modifier) as string[]).includes(event.key)) {
      //   setModifier(event.key as Modifier);
      //   return;
      // }

      if (target?.value.length === 0) {
        // console.log(event.key, ultraShortCodes);
        const findCode = ultraShortCodes.find(
          (u) => u.code.toLowerCase() === event.key?.toLowerCase()
        );
        // console.log({ findCode });
        if (findCode) {
          event.preventDefault();
          const findChoice = unfilteredChoices?.find(
            (c) => c.id === findCode?.id
          );
          if (findChoice) {
            if (findChoice.name === findChoice.value) {
              setSubmitValue(findCode.code);
            } else {
              setSubmitValue(findChoice.value);
            }
          } else if (unfilteredChoices?.length === 0) {
            setSubmitValue(findCode.code);
          }
        }
      }

      if (event.key === ' ') {
        const shortcodeChoice = unfilteredChoices?.find((choice: Choice) => {
          const iv = inputValue.trim().toLowerCase();
          if (typeof choice?.shortcode === 'string') {
            return choice.shortcode === iv;
          }
          return choice?.shortcode?.find((sc: string) => sc === iv);
        });
        if (shortcodeChoice) {
          event.preventDefault();
          setSubmitValue(shortcodeChoice.value);
          return;
        }

        if (inputValue?.length > 0) {
          const tab = tabs.find((t) =>
            t.toLowerCase().startsWith(inputValue?.toLowerCase())
          );

          if (tab) {
            event.preventDefault();

            const ti = tabs.indexOf(tab);
            setInput('');
            setTabIndex(ti);
            channel(Channel.TAB);
          }
        }
      }
    },
    [
      setSelectionStart,
      setModifiers,
      unfilteredChoices,
      tabs,
      inputValue,
      setSubmitValue,
      setTabIndex,
      pid,
      ultraShortCodes,
      channel,
    ]
  );

  const onKeyUp = useCallback(
    (event) => {
      setModifiers(
        modifiers
          .filter((m) => event.getModifierState(m))
          .flatMap(remapModifiers)
      );
    },
    [setModifiers]
  );

  const onChange = useCallback(
    (event) => {
      setInput(event.target.value);
    },
    [setInput]
  );

  return (
    <motion.div
      key="input"
      className="flex flex-row"
      initial={{ opacity: 0 }}
      animate={{ opacity: processing ? 0 : 1 }}
      transition={{ duration: 0.2 }}
    >
      <input
        id="input"
        spellCheck="false"
        style={
          {
            WebkitAppRegion: 'no-drag',
            WebkitUserSelect: 'none',
            ...(submitted && { caretColor: 'transparent' }),
          } as any
        }
        disabled={submitted}
        autoFocus
        className={`
      bg-transparent w-full text-black dark:text-white focus:outline-none outline-none
      text-xl dark:placeholder-white dark:placeholder-opacity-40
      placeholder-black placeholder-opacity-40
      ${processing && resizeEnabled ? `h-0` : `h-14`}
      ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 px-4 py-0
      focus:border-none border-none`}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        placeholder={placeholder}
        ref={inputRef as LegacyRef<HTMLInputElement>}
        type={promptData?.secret ? 'password' : promptData?.type || 'text'}
        value={inputValue}
      />
    </motion.div>
  );
}
