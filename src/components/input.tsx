/* eslint-disable jsx-a11y/mouse-events-have-key-events */
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
import { PROMPT } from '@johnlindquist/kit/cjs/enum';
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
  choicesConfigAtom,
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
  inputHeightAtom,
  headerHiddenAtom,
  loadingAtom,
  typingAtom,
  shortcutsAtom,
  logAtom,
  userAtom,
  kitStateAtom,
  hasRightShortcutAtom,
  descriptionAtom,
  nameAtom,
  signInActionAtom,
} from '../jotai';
import { useFocus, useKeyIndex, useTab } from '../hooks';
import { IconButton } from './icon';
import { ActionButton } from './actionbutton';
import { ActionSeparator } from './actionseparator';
import { EnterButton } from './actionenterbutton';
import { OptionsButton } from './actionoptionsbutton';
import { LoginButton } from './loginbutton';
import TopBar from './TopBar';

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
  const [unfilteredChoices] = useAtom(choicesConfigAtom);
  const [, setSubmitValue] = useAtom(submitValueAtom);
  const [placeholder] = useAtom(placeholderAtom);
  const [promptData] = useAtom(promptDataAtom);
  const [submitted] = useAtom(submittedAtom);
  const [, setSelectionStart] = useAtom(selectionStartAtom);
  const [currentModifiers, setModifiers] = useAtom(_modifiers);
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
  const loading = useAtomValue(loadingAtom);
  const headerHidden = useAtomValue(headerHiddenAtom);
  const footerHidden = useAtomValue(footerHiddenAtom);
  const inputHeight = useAtomValue(inputHeightAtom);

  const setLastKeyDownWasModifier = useSetAtom(lastKeyDownWasModifierAtom);
  const setTyping = useSetAtom(typingAtom);
  const [shortcuts] = useAtom(shortcutsAtom);
  const [log] = useAtom(logAtom);
  const user = useAtomValue(userAtom);
  const kitState = useAtomValue(kitStateAtom);
  const hasRightShortcut = useAtomValue(hasRightShortcutAtom);
  const name = useAtomValue(nameAtom);
  const description = useAtomValue(descriptionAtom);
  const signInAction = useAtomValue(signInActionAtom);

  useEffect(() => {
    setInputFocus(Math.random());
    setMiniShortcutsHovered(false);
    setModifiers([]);

    return () => {
      setInputFocus(0);
    };
  }, [setInputFocus, setMiniShortcutsHovered, setModifiers]);

  useTab();
  useKeyIndex();

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      // if command is pressed
      if (event.metaKey) {
        const shortcut = shortcuts.find((s) => (s?.key || '')?.includes('cmd'));
        const key = shortcut?.key || '';
        if (key) {
          const shortcutKey = key?.split('+').pop();
          const cmd = key?.includes('cmd');

          if (shortcutKey === event.key && cmd) {
            event.preventDefault();
            return;
          }
        }
      }

      if (event.ctrlKey) {
        const shortcut = shortcuts.find((s) =>
          (s?.key || '')?.includes('ctrl')
        );
        const key = shortcut?.key || '';

        if (key) {
          const shortcutKey = key.split('+').pop();
          const ctrl = key?.includes('ctrl');

          if (shortcutKey === event.key && ctrl) {
            event.preventDefault();
            return;
          }
        }
      }

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

      // If not Enter, Tab, or a modifier, setTyping to true
      if (event.key !== 'Enter' && event.key !== 'Tab' && !modifiers.length) {
        setTyping(true);
      }
    },
    [
      setSelectionStart,
      setModifiers,
      setLastKeyDownWasModifier,
      setTyping,
      shortcuts,
      flags,
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
      if (onInputSubmit[event.target.value] && !submitted) {
        const submitValue = onInputSubmit[event.target.value];
        setSubmitValue(submitValue);
      } else {
        setInput(event.target.value);
      }
    },
    [onInputSubmit, submitted, setSubmitValue, setInput]
  );

  return (
    <div
      key="input"
      className={`flex flex-row ${footerHidden && '-mt-px'} relative`}
      style={{
        height: inputHeight || PROMPT.INPUT.HEIGHT.SM,
      }}
      onMouseEnter={setInputFocus}
      // initial={{ opacity: 0 }}
      // animate={{ opacity: processing ? 0 : 1 }}
      // transition={{ duration: 0.2 }}
    >
      {headerHidden && loading && <TopBar />}
      {/* "Hello World" text */}
      {/* <div className="absolute top-0.5 left-1/2 -translate-x-1/2 transform font-native text-xxs text-primary">
        {name} - {description}
      </div> */}
      <div
        className="max-w-full flex-1"
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
      flex-1 bg-transparent tracking-normal text-text-base placeholder-text-base
      placeholder-opacity-25 outline-none
      placeholder:tracking-normal
      focus:outline-none
      ${fontSize}
      h-full
      max-w-full border-none px-4 py-0 ring-0 ring-opacity-0
      focus:border-none focus:ring-0
      focus:ring-opacity-0
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
          className={`${fontSize} px-4 tracking-normal`}
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
        <div
          className="flex flex-row items-center justify-end overflow-x-clip"
          style={{
            maxWidth: '80%',
          }}
        >
          <div
            onMouseOver={() => setMiniShortcutsHovered(true)}
            onMouseLeave={() => setMiniShortcutsHovered(false)}
            style={{
              height: inputHeight || PROMPT.INPUT.HEIGHT.BASE,
            }}
            className={`right-container
      flex min-w-fit flex-grow flex-row items-center justify-end overflow-hidden ${
        inputHeight === PROMPT.INPUT.HEIGHT.XS && `origin-right scale-95`
      }`}
          >
            {miniShortcutsVisible && (
              <>
                <div className="flex flex-grow-0 flex-row items-center overflow-hidden">
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

            <div className="enter-container flex min-w-fit flex-row items-center">
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
              <ActionSeparator key="options-separator" />
            </div>

            {hasFlags && !hasRightShortcut && (
              <>
                <div className="options-container flex flex-row">
                  <OptionsButton key="options-button" />
                  <ActionSeparator key="login-separator" />
                </div>
              </>
            )}

            {kitState.isSponsor ? (
              <span className="relative pl-1.5 pr-0.5">
                <img
                  alt="avatar"
                  src={user.avatar_url}
                  className="z-0 w-[22px] rounded-full"
                />
                <svg
                  height="24"
                  width="24"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  className="absolute right-[-7px] top-[-5px] z-10 h-[15px] text-primary opacity-90"
                >
                  <g fill="currentColor">
                    <path
                      d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z"
                      fill="currentColor"
                    />
                  </g>
                </svg>
              </span>
            ) : (
              <>
                <LoginButton key="login-button" />
                <ActionSeparator key="close-login-separator" />
              </>
            )}

            <div className="mx-2 flex min-w-0">
              <IconButton />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
