/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/prop-types */
import React, {
  useCallback,
  KeyboardEvent,
  LegacyRef,
  useRef,
  useEffect,
} from 'react';
import { motion } from 'framer-motion';
import { UI, PROMPT } from '@johnlindquist/kit/cjs/enum';
import { Choice } from '@johnlindquist/kit/types/core';
import { useAtom } from 'jotai';

import {
  inputAtom,
  modifiers,
  _modifiers,
  placeholderAtom,
  promptDataAtom,
  selectionStartAtom,
  submittedAtom,
  submitValueAtom,
  tabIndexAtom,
  ultraShortCodesAtom,
  unfilteredChoicesAtom,
  onInputSubmitAtom,
  inputFocusAtom,
  uiAtom,
  inputFontSizeAtom,
} from '../jotai';
import { useFocus, useKeyIndex, useTab } from '../hooks';
import { IconButton } from './icon';

const remapModifiers = (m: string) => {
  if (m === 'Meta') return ['cmd'];
  if (m === 'Control') return ['control', 'ctrl'];
  if (m === 'Alt') return ['alt', 'option'];
  return m.toLowerCase();
};

export default function Input() {
  const inputRef = useRef<HTMLInputElement>(null);
  useFocus(inputRef);

  const [inputValue, setInput] = useAtom(inputAtom);
  const [, setTabIndex] = useAtom(tabIndexAtom);
  const [unfilteredChoices] = useAtom(unfilteredChoicesAtom);
  const [, setSubmitValue] = useAtom(submitValueAtom);
  const [placeholder] = useAtom(placeholderAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [submitted] = useAtom(submittedAtom);
  const [, setSelectionStart] = useAtom(selectionStartAtom);
  const [, setModifiers] = useAtom(_modifiers);
  const [ultraShortCodes] = useAtom(ultraShortCodesAtom);
  const [onInputSubmit] = useAtom(onInputSubmitAtom);
  const [, setInputFocus] = useAtom(inputFocusAtom);
  const [ui] = useAtom(uiAtom);
  const [fontSize] = useAtom(inputFontSizeAtom);

  useEffect(() => {
    setInputFocus(true);

    return () => {
      setInputFocus(false);
    };
  }, []);

  useTab();
  useKeyIndex();

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
        const findCode = ultraShortCodes.find(
          (u) => u.code.toLowerCase() === event.key?.toLowerCase()
        );
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
          } else {
            setSubmitValue(findCode.code);
          }
        }
      }

      if (event.key === ' ' && ui !== UI.hotkey) {
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
        }
      }
    },
    [
      setSelectionStart,
      setModifiers,
      ui,
      ultraShortCodes,
      unfilteredChoices,
      setSubmitValue,
      inputValue,
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
      if (onInputSubmit[event.target.value]) {
        setSubmitValue(onInputSubmit[event.target.value]);
      } else {
        setInput(event.target.value);
      }
    },
    [setInput, onInputSubmit]
  );

  return (
    <motion.div
      key="input"
      className="flex flex-row"
      style={{
        height: promptData?.inputHeight || PROMPT.INPUT.HEIGHT.BASE,
      }}
      // initial={{ opacity: 0 }}
      // animate={{ opacity: processing ? 0 : 1 }}
      // transition={{ duration: 0.2 }}
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
      bg-transparent w-full text-text-base focus:outline-none outline-none
      placeholder-text-base placeholder-opacity-25
      tracking-normal
      placeholder:tracking-normal
      ${fontSize}
      h-full
      ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 px-4 py-0
      focus:border-none border-none
      ${promptData?.inputClassName || ''}
      `}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        placeholder={placeholder}
        ref={inputRef as LegacyRef<HTMLInputElement>}
        type={promptData?.secret ? 'password' : promptData?.type || 'text'}
        value={inputValue}
      />
      {promptData?.footerClassName?.includes('hidden') && (
        <div className="h-full w-12 flex justify-center items-center">
          <IconButton />
        </div>
      )}
    </motion.div>
  );
}
