import { Channel, PROMPT } from '@johnlindquist/kit/core/enum';
import log from 'electron-log';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { type ChangeEvent, type KeyboardEvent, type LegacyRef, useCallback, useEffect, useRef, useState } from 'react';

import useResizeObserver from '@react-hook/resize-observer';
import { debounce } from 'lodash-es';
import { useFocus, useKeyIndex, useTab } from '../hooks';
import {
  _lastKeyDownWasModifierAtom,
  _modifiers,
  actionsAtom,
  appendToLogHTMLAtom,
  cachedAtom,
  channelAtom,
  choicesConfigAtom,
  enterButtonDisabledAtom,
  enterButtonNameAtom,
  flagsAtom,
  focusedChoiceAtom,
  footerHiddenAtom,
  headerHiddenAtom,
  inputAtom,
  inputFocusAtom,
  inputFontSizeAtom,
  inputHeightAtom,
  kitStateAtom,
  lastKeyDownWasModifierAtom,
  loadingAtom,
  miniShortcutsHoveredAtom,
  miniShortcutsVisibleAtom,
  modifiers,
  onInputSubmitAtom,
  placeholderAtom,
  promptDataAtom,
  selectionStartAtom,
  sendShortcutAtom,
  shortcodesAtom,
  shortcutsAtom,
  shouldActionButtonShowOnInputAtom,
  signInActionAtom,
  submitValueAtom,
  submittedAtom,
  tabIndexAtom,
  typingAtom,
  uiAtom,
  userAtom,
} from '../jotai';
import { ActionButton } from './actionbutton';
import { EnterButton } from './actionenterbutton';
import { OptionsButton } from './actionoptionsbutton';
import { ActionSeparator } from './actionseparator';
import { IconButton } from './icon';
import { LoginButton } from './loginbutton';

const remapModifiers = (m: string) => {
  if (m === 'Meta') {
    return ['cmd'];
  }
  if (m === 'Control') {
    return ['control', 'ctrl'];
  }
  if (m === 'Alt') {
    return ['alt', 'option'];
  }
  return m.toLowerCase();
};

export default function Input() {
  const inputRef = useRef<HTMLInputElement>(null);
  useFocus(inputRef);

  const shortcodes = useAtomValue(shortcodesAtom);
  const setAppendToLog = useSetAtom(appendToLogHTMLAtom);
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
  const [inputFocus, setInputFocus] = useAtom(inputFocusAtom);
  const [ui] = useAtom(uiAtom);
  const [fontSize] = useAtom(inputFontSizeAtom);
  const actions = useAtomValue(actionsAtom);
  const enterButtonName = useAtomValue(enterButtonNameAtom);
  const enterButtonDisabled = useAtomValue(enterButtonDisabledAtom);
  const flags = useAtomValue(flagsAtom);
  const shouldActionButtonShowOnInput = useAtomValue(shouldActionButtonShowOnInputAtom);
  const miniShortcutsVisible = useAtomValue(miniShortcutsVisibleAtom);
  const [miniShortcutsHovered, setMiniShortcutsHovered] = useAtom(miniShortcutsHoveredAtom);
  const loading = useAtomValue(loadingAtom);
  const headerHidden = useAtomValue(headerHiddenAtom);
  const footerHidden = useAtomValue(footerHiddenAtom);
  const inputHeight = useAtomValue(inputHeightAtom);

  const setLastKeyDownWasModifier = debounce(useSetAtom(lastKeyDownWasModifierAtom), 300);
  const _setLastKeyDownWasModifier = useSetAtom(_lastKeyDownWasModifierAtom);
  const setTyping = useSetAtom(typingAtom);
  const [shortcuts] = useAtom(shortcutsAtom);
  const user = useAtomValue(userAtom);
  const kitState = useAtomValue(kitStateAtom);
  const channel = useAtomValue(channelAtom);
  const focusedChoice = useAtomValue(focusedChoiceAtom);
  const sendShortcut = useSetAtom(sendShortcutAtom);
  const action = useAtomValue(signInActionAtom);

  const onClick = useCallback(
    (event) => {
      if (action) {
        sendShortcut(action.key);
      }
    },
    [action, sendShortcut],
  );

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
        const shortcut = shortcuts.find((s) => (s?.key || '')?.includes('ctrl'));
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

      const input = target.value + event.key;
      // log.info(`${window.pid}: onKeyDown: ${input}`);
      // log.info({
      //   modifiersLength: modifiers.length,
      //   modifiers,
      // });

      const currentModifiers = modifiers.filter((m) => event.getModifierState(m)).flatMap(remapModifiers);

      const modifiersNotShift = currentModifiers.filter((m) => m !== 'shift');
      if (input && shortcodes.includes(input) && modifiersNotShift.length === 0) {
        log.info(`${window.pid}: preventDefault(): found: '${input}'`);
        // setAppendToLog(`${window.pid}: preventDefault(): found: '${input}'`);
        // event.preventDefault();
        channel(Channel.INPUT, {
          input,
        });
      }

      setModifiers(currentModifiers);

      // if the key is a modifier that isn't shift, return

      if (typeof setLastKeyDownWasModifier?.cancel === 'function') {
        setLastKeyDownWasModifier.cancel();
      }
      setLastKeyDownWasModifier(modifiers.includes(event.key) && event.key !== 'Shift');

      // If not Enter, Tab, or a modifier, setTyping to true
      if (event.key !== 'Enter' && event.key !== 'Tab' && !modifiers.length) {
        setTyping(true);
      }

      // If key was delete and the value is empty, clear setInput
      if (event.key === 'Backspace' && target.value === '') {
        log.info('Clearing input');
        channel(Channel.INPUT, {
          input: '',
        });
      }
    },
    [setSelectionStart, setModifiers, setLastKeyDownWasModifier, setTyping, shortcuts, flags, setInput, shortcodes],
  );

  const onKeyUp = useCallback(
    (event) => {
      setModifiers(modifiers.filter((m) => event.getModifierState(m)).flatMap(remapModifiers));

      if (typeof setLastKeyDownWasModifier?.cancel === 'function') {
        setLastKeyDownWasModifier.cancel();
      }
      _setLastKeyDownWasModifier(false);
    },
    [setModifiers],
  );

  const minWidth = 128; // Set a minimum width for the input
  const [hiddenInputMeasurerWidth, setHiddenInputMeasurerWidth] = useState(0);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useResizeObserver(hiddenInputRef, (entry) => {
    const newWidth = Math.ceil(hiddenInputRef?.current?.offsetWidth + 1); // Adding 1px for better accuracy
    setHiddenInputMeasurerWidth(Math.max(newWidth, minWidth));
  });

  const cached = useAtomValue(cachedAtom);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      // log.info(event.target.value, { cached: cached ? 'true' : 'false' });
      if (onInputSubmit[event.target.value] && !submitted) {
        const submitValue = onInputSubmit[event.target.value];
        setSubmitValue(submitValue);
      } else if (cached) {
        setPendingInput(event.target.value);
      } else {
        log.info(`Setting input: ${event.target.value}`);
        setInput(event.target.value);
        setPendingInput('');
      }
    },
    [onInputSubmit, submitted, setSubmitValue, setInput, cached],
  );

  const [pendingInput, setPendingInput] = useState('');

  useEffect(() => {
    if (!cached && pendingInput) {
      setInput(pendingInput);
      setPendingInput('');
    }
  }, [cached, pendingInput, setInput]);

  return (
    <div
      key="input"
      className={`flex flex-row ${footerHidden && '-mt-px'} max-w-screen relative`}
      style={{
        height: inputHeight || PROMPT.INPUT.HEIGHT.SM,
      }}
      onMouseEnter={setInputFocus}
      // initial={{ opacity: 0 }}
      // animate={{ opacity: processing ? 0 : 1 }}
      // transition={{ duration: 0.2 }}
    >
      {/* "Hello World" text */}
      {/* <div className="absolute top-0.5 left-1/2 -translate-x-1/2 transform font-native text-xxs text-primary">
        {name} - {description}
      </div> */}
      <div
        className="max-w-screen flex-1"
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
              width: `${Math.max(hiddenInputMeasurerWidth, inputValue?.length > 12 ? 256 : 128)}px`,
              WebkitAppRegion: 'no-drag',
              WebkitUserSelect: 'none',
              ...(submitted && { caretColor: 'transparent' }),
            } as any
          }
          disabled={submitted}
          className={`
      flex-1 bg-transparent tracking-normal text-text-base placeholder-text-base
      placeholder-opacity-25 outline-none
      placeholder:tracking-normal
      focus:outline-none
      ${fontSize}
      ${submitted && 'text-opacity-50'}
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
        inputHeight === PROMPT.INPUT.HEIGHT.XS && 'origin-right scale-95'
      }`}
          >
            <div className="flex flex-grow-0 flex-row items-center overflow-hidden">
              {actions
                .filter((action) => action.position === 'right')
                .flatMap((action, i, array) => {
                  if (!action?.visible && miniShortcutsVisible) {
                    return [
                      // eslint-disable-next-line react/jsx-key
                      <ActionButton {...action} />,
                      // eslint-disable-next-line no-nested-ternary
                      i < array.length - 1 ? (
                        <ActionSeparator key={`${action?.key}-separator`} />
                      ) : enterButtonName ? (
                        <ActionSeparator key={`${action?.key}-separator`} />
                      ) : null,
                    ];
                  }

                  return null;
                })}
            </div>

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

            <div className="flex flex-grow-0 flex-row items-center overflow-hidden">
              {actions
                .filter((action) => action.position === 'right')
                .flatMap((action, i, array) => {
                  if (action?.visible) {
                    return [
                      // eslint-disable-next-line react/jsx-key
                      <ActionButton {...action} />,
                      // eslint-disable-next-line no-nested-ternary
                      i < array.length - 1 ? (
                        <ActionSeparator key={`${action?.key}-separator`} />
                      ) : enterButtonName ? (
                        <ActionSeparator key={`${action?.key}-separator`} />
                      ) : null,
                    ];
                  }

                  return null;
                })}
            </div>

            {shouldActionButtonShowOnInput && !focusedChoice?.ignoreFlags && (
              <>
                <div className="options-container flex flex-row">
                  <OptionsButton key="options-button" />
                  <ActionSeparator key="login-separator" />
                </div>
              </>
            )}

            {kitState.isSponsor ? (
              <span
                className={`relative ${inputHeight === PROMPT.INPUT.HEIGHT.XS ? 'w-[28px]' : 'w-[30px]'} pl-1 pr-1`}
              >
                <img
                  onClick={onClick}
                  alt="avatar"
                  src={user.avatar_url}
                  className="z-0 w-[22px] cursor-pointer rounded-full hover:opacity-75"
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
                {/* <span className="text-xxs">
                  Process: {pid}
                  Choices: {scoredChoices.length}
                  Count: {count}
                </span> */}

                <LoginButton key="login-button" />
                <ActionSeparator key="close-login-separator" />
              </>
            )}

            <div className="relative mx-2 flex min-w-0">
              <IconButton />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
