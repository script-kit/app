/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/prop-types */
import React, {
  useCallback,
  KeyboardEvent,
  LegacyRef,
  useRef,
  useEffect,
  useState,
} from 'react';
import { motion } from 'framer-motion';
import { UI, PROMPT } from '@johnlindquist/kit/cjs/enum';
import { Choice } from '@johnlindquist/kit/types/core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

import useResizeObserver from '@react-hook/resize-observer';
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
  actionsAtom,
  appDbAtom,
  enterButtonNameAtom,
  flagsAtom,
  enterButtonDisabledAtom,
  miniShortcutsVisibleAtom,
  miniShortcutsHoveredAtom,
  lastKeyDownWasModifierAtom,
  footerHiddenAtom,
} from '../jotai';
import { useFocus, useKeyIndex, useTab } from '../hooks';
import { IconButton } from './icon';
import { ActionButton } from './actionbutton';
import { ActionSeparator } from './actionseparator';
import { EnterButton } from './actionenterbutton';
import { OptionsButton } from './actionoptionsbutton';

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
  const [currentModifiers, setModifiers] = useAtom(_modifiers);
  const [ultraShortCodes] = useAtom(ultraShortCodesAtom);
  const [onInputSubmit] = useAtom(onInputSubmitAtom);
  const [, setInputFocus] = useAtom(inputFocusAtom);
  const [ui] = useAtom(uiAtom);
  const [fontSize] = useAtom(inputFontSizeAtom);
  const actions = useAtomValue(actionsAtom);
  const appDb = useAtomValue(appDbAtom);
  const enterButtonName = useAtomValue(enterButtonNameAtom);
  const enterButtonDisabled = useAtomValue(enterButtonDisabledAtom);
  const flags = useAtomValue(flagsAtom);
  const hasFlags = Object.keys(flags)?.length > 0;
  const miniShortcutsVisible = useAtomValue(miniShortcutsVisibleAtom);
  const [miniShortcutsHovered, setMiniShortcutsHovered] = useAtom(
    miniShortcutsHoveredAtom
  );
  const footerHidden = useAtomValue(footerHiddenAtom);

  const setLastKeyDownWasModifier = useSetAtom(lastKeyDownWasModifierAtom);

  useEffect(() => {
    setInputFocus(true);
    setMiniShortcutsHovered(false);
    setModifiers([]);

    return () => {
      setInputFocus(false);
    };
  }, [setInputFocus, setMiniShortcutsHovered, setModifiers]);

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

      // if the key is a modifier that isn't shift, return

      setLastKeyDownWasModifier(
        modifiers.includes(event.key) && event.key !== 'Shift'
      );

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

  const minWidth = 128; // Set a minimum width for the input
  const [hiddenInputMeasurerWidth, setHiddenInputMeasurerWidth] = useState(0);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useResizeObserver(hiddenInputRef, (entry) => {
    const newWidth = Math.ceil(hiddenInputRef?.current?.offsetWidth + 1); // Adding 1px for better accuracy
    setHiddenInputMeasurerWidth(Math.max(newWidth, minWidth));
  });

  const onChange = useCallback(
    (event) => {
      if (onInputSubmit[event.target.value]) {
        setSubmitValue(onInputSubmit[event.target.value]);
      } else {
        setInput(event.target.value);
      }
    },
    [onInputSubmit, setSubmitValue, setInput]
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
      <div
        className="flex-1 max-w-full"
        style={{
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
        }}
      >
        <input
          id="input"
          spellCheck="false"
          style={
            {
              width: `${hiddenInputMeasurerWidth}px`,
              WebkitAppRegion: 'no-drag',
              WebkitUserSelect: 'none',
              ...(submitted && { caretColor: 'transparent' }),
            } as any
          }
          disabled={submitted}
          autoFocus
          className={`
      bg-transparent flex-1 text-text-base focus:outline-none outline-none
      placeholder-text-base placeholder-opacity-25
      tracking-normal
      placeholder:tracking-normal
      ${fontSize}
      h-full
      ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 px-4 py-0
      focus:border-none border-none
      max-w-full
      ${promptData?.inputClassName || ''}
      `}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onKeyUpCapture={onKeyUp}
          placeholder={placeholder}
          ref={inputRef as LegacyRef<HTMLInputElement>}
          type={promptData?.secret ? 'password' : promptData?.type || 'text'}
          value={inputValue}
        />
        <span
          ref={hiddenInputRef}
          id="hidden-input-measurer"
          className={`${fontSize} tracking-normal px-4`}
          style={{
            position: 'absolute',
            visibility: 'hidden',
            // don't break on any lines
            whiteSpace: 'nowrap',
          }}
        >
          {`${inputValue || placeholder}-pr`}
        </span>
      </div>
      {footerHidden && (
        // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
        <div
          onMouseOver={() => setMiniShortcutsHovered(true)}
          onMouseLeave={() => setMiniShortcutsHovered(false)}
          className={`justify-center
      right-container flex flex-row items-center pb-px overflow-hidden`}
        >
          {miniShortcutsVisible && (
            <>
              <div className="enter-container flex flex-row min-w-fit items-center">
                {enterButtonName ? (
                  <EnterButton
                    key="enter-button"
                    name={enterButtonName}
                    position="right"
                    shortcut="⏎"
                    value="enter"
                    flag=""
                    disabled={enterButtonDisabled}
                  />
                ) : null}
              </div>
              <ActionSeparator />
              <div className="options-container flex flex-row">
                {hasFlags && [
                  <OptionsButton key="options-button" />,
                  <ActionSeparator key="options-separator" />,
                ]}
              </div>
              <div className="flex flex-row flex-grow-0 items-center overflow-hidden">
                {actions
                  .filter(
                    (action) => action.position === 'right' && !appDb?.mini
                  )
                  .flatMap((action, i, array) => [
                    // eslint-disable-next-line react/jsx-key
                    <ActionButton {...action} />,
                    // eslint-disable-next-line no-nested-ternary
                    i < array.length - 1 ? (
                      <ActionSeparator key={`${action?.key}-separator`} />
                    ) : enterButtonName ? (
                      <ActionSeparator key={`${action?.key}-separator`} />
                    ) : null,
                  ])}
              </div>
            </>
          )}

          <div className="flex px-2 items-center justify-center pt-px">
            <IconButton />
          </div>
        </div>
      )}
    </motion.div>
  );
}
