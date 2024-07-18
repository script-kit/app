import { Channel, PROMPT } from '@johnlindquist/kit/core/enum';
import log from 'electron-log';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type LegacyRef,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import useResizeObserver from '@react-hook/resize-observer';
import { debounce } from 'lodash-es';
import { useFocus, useKeyIndex, useTab } from '../hooks';
import {
  _lastKeyDownWasModifierAtom,
  _modifiers,
  actionsAtom,
  cachedAtom,
  channelAtom,
  choiceInputsAtom,
  enterButtonDisabledAtom,
  enterButtonNameAtom,
  flagsAtom,
  focusedChoiceAtom,
  footerHiddenAtom,
  inputAtom,
  inputFocusAtom,
  inputFontSizeAtom,
  inputHeightAtom,
  invalidateChoiceInputsAtom,
  kitStateAtom,
  lastKeyDownWasModifierAtom,
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
  typingAtom,
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

const debouncedFocus = debounce(
  (inputRef: RefObject<HTMLInputElement>) => {
    inputRef.current?.focus();
  },
  100,
  { leading: true, trailing: false },
);

const minWidth = 24;
function ResizableInput({ placeholder, className, index }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hiddenInputRef = useRef<HTMLSpanElement>(null);
  const [inputWidth, setInputWidth] = useState(minWidth); // Minimum width
  const [currentInput, setCurrentInput] = useState('');
  const [choiceInputs, setChoiceInputs] = useAtom(choiceInputsAtom);
  const [invalidateChoiceInputs, setInvalidateChoiceInputs] = useAtom(invalidateChoiceInputsAtom);
  const [submitted] = useAtom(submittedAtom);

  const [promptData] = useAtom(promptDataAtom);

  useEffect(() => {
    if (promptData?.scriptlet) {
      // focus
      debouncedFocus(inputRef);
    }
  }, [promptData]);

  useResizeObserver(hiddenInputRef, () => {
    const newWidth = Math.ceil((hiddenInputRef?.current?.offsetWidth || minWidth) + 9);
    const inputWidth = Math.max(newWidth, minWidth);
    setInputWidth(inputWidth); // Using 128 as minimum width
  });

  useEffect(() => {
    choiceInputs[index] = currentInput;
    if (currentInput) {
      setInvalidateChoiceInputs(false);
    }
  }, [currentInput]);

  useEffect(() => {
    if (invalidateChoiceInputs && currentInput === '') {
      // focus the input
      debouncedFocus(inputRef);
    }
  }, [invalidateChoiceInputs, currentInput]);

  const hiddenInputString = (placeholder.length > currentInput.length ? placeholder : currentInput).replaceAll(
    ' ',
    '.',
  );

  return (
    <>
      <span
        ref={hiddenInputRef}
        style={{
          position: 'absolute',
          visibility: 'hidden',
          // don't break on any lines
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
        }}
        className={'px-2 tracking-normal absolute bg-red-500'}
      >
        {hiddenInputString}
      </span>
      <input
        ref={inputRef}
        onChange={(e) => setCurrentInput(e.target.value)}
        placeholder={placeholder}
        className={`
ring-0 focus:ring-0 outline-none


outline-offset-0
outline-1
focus:outline-1
focus:outline-offset-0

${currentInput === '' && invalidateChoiceInputs ? 'outline-primary/50 focus:outline-primary/90' : 'outline-secondary/20 focus:outline-primary/50'}
border-none
overflow-hidden
tracking-normal
text-text-base placeholder-text-base
placeholder-opacity-25
placeholder:tracking-normal
bg-secondary/5
rounded-md
text-md
${submitted && 'text-opacity-50'}
outline-none
outline-hidden pr-1
mx-1
        `}
        style={{
          minWidth: `${inputWidth}px`,
          width: `${inputWidth}px`,
          height: '60%',
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
        }}
      />
    </>
  );
}

function QuickInputs() {
  const focusedChoice = useAtomValue(focusedChoiceAtom);
  const [fontSize] = useAtom(inputFontSizeAtom);
  const [submitted] = useAtom(submittedAtom);
  const [promptData] = useAtom(promptDataAtom);
  const setChoiceInputs = useSetAtom(choiceInputsAtom);

  useEffect(() => {
    if (Array.isArray(focusedChoice?.inputs)) {
      setChoiceInputs(focusedChoice?.inputs?.map(() => ''));
    }
  }, [focusedChoice]);

  if (!focusedChoice?.inputs) {
    return null;
  }

  return focusedChoice.inputs.map((placeholder, i) => (
    <ResizableInput key={placeholder} index={i} placeholder={placeholder} />
  ));
}

function MainInput() {
  const inputRef = useRef<HTMLInputElement>(null);

  useFocus(inputRef);

  const minWidth = 96; // Set a minimum width for the input
  const [hiddenInputMeasurerWidth, setHiddenInputMeasurerWidth] = useState(0);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useResizeObserver(hiddenInputRef, () => {
    const newWidth = Math.ceil((hiddenInputRef?.current?.offsetWidth || 0) + 1); // Adding 1px for better accuracy
    setHiddenInputMeasurerWidth(Math.max(newWidth, minWidth));
  });

  const [inputValue, setInput] = useAtom(inputAtom);
  const [fontSize] = useAtom(inputFontSizeAtom);
  const [onInputSubmit] = useAtom(onInputSubmitAtom);
  const [, setSubmitValue] = useAtom(submitValueAtom);
  const setLastKeyDownWasModifier = debounce(useSetAtom(lastKeyDownWasModifierAtom), 300);
  const _setLastKeyDownWasModifier = useSetAtom(_lastKeyDownWasModifierAtom);
  const setTyping = useSetAtom(typingAtom);
  const [shortcuts] = useAtom(shortcutsAtom);
  const channel = useAtomValue(channelAtom);
  const shortcodes = useAtomValue(shortcodesAtom);

  const [promptData] = useAtom(promptDataAtom);
  const [submitted] = useAtom(submittedAtom);
  const [, setSelectionStart] = useAtom(selectionStartAtom);
  const [currentModifiers, setModifiers] = useAtom(_modifiers);
  const [inputFocus, setInputFocus] = useAtom(inputFocusAtom);

  const [miniShortcutsHovered, setMiniShortcutsHovered] = useAtom(miniShortcutsHoveredAtom);
  const flags = useAtomValue(flagsAtom);

  const [pendingInput, setPendingInput] = useState('');
  const cached = useAtomValue(cachedAtom);
  const focusedChoice = useAtomValue(focusedChoiceAtom);

  let [placeholder] = useAtom(placeholderAtom);
  if (focusedChoice && focusedChoice?.inputs?.length > 0) {
    placeholder = focusedChoice.name;
  }
  useEffect(() => {
    setInputFocus(Math.random());
    setMiniShortcutsHovered(false);
    setModifiers([]);

    return () => {
      setInputFocus(0);
    };
  }, [setInputFocus, setMiniShortcutsHovered, setModifiers]);

  useEffect(() => {
    if (!cached && pendingInput) {
      setInput(pendingInput);
      setPendingInput('');
    }
  }, [cached, pendingInput, setInput]);

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

  return (
    <>
      <span
        ref={hiddenInputRef}
        id="hidden-input-measurer"
        className={`${fontSize} p-1 tracking-normal absolute`}
        style={{
          position: 'absolute',
          visibility: 'hidden',
          // don't break on any lines
          whiteSpace: 'nowrap',
        }}
      >
        {`${inputValue || placeholder}-pr`}
      </span>
      <input
        id="input"
        spellCheck="false"
        style={
          {
            width: `${hiddenInputMeasurerWidth}px`,
            // WebkitAppRegion: 'no-drag',
            // WebkitUserSelect: 'none',
            ...(submitted && { caretColor: 'transparent' }),
          } as any
        }
        disabled={submitted || promptData?.scriptlet}
        className={`

bg-transparent tracking-normal text-text-base placeholder-text-base
placeholder-opacity-25
placeholder:tracking-normal
outline-none
focus:outline-none
focus:border-none
border-none
${fontSize}
${submitted && 'text-opacity-50'}

max-w-full  pl-4 pr-0 py-0 ring-0 ring-opacity-0
focus:ring-0
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
    </>
  );
}

export default function Input() {
  const [inputFocus, setInputFocus] = useAtom(inputFocusAtom);

  const [fontSize] = useAtom(inputFontSizeAtom);
  const actions = useAtomValue(actionsAtom);
  const enterButtonName = useAtomValue(enterButtonNameAtom);
  const enterButtonDisabled = useAtomValue(enterButtonDisabledAtom);
  const shouldActionButtonShowOnInput = useAtomValue(shouldActionButtonShowOnInputAtom);
  const miniShortcutsVisible = useAtomValue(miniShortcutsVisibleAtom);
  const [miniShortcutsHovered, setMiniShortcutsHovered] = useAtom(miniShortcutsHoveredAtom);

  const footerHidden = useAtomValue(footerHiddenAtom);
  const inputHeight = useAtomValue(inputHeightAtom);

  const user = useAtomValue(userAtom);
  const kitState = useAtomValue(kitStateAtom);
  const focusedChoice = useAtomValue(focusedChoiceAtom);
  const sendShortcut = useSetAtom(sendShortcutAtom);
  const action = useAtomValue(signInActionAtom);
  const channel = useAtomValue(channelAtom);

  const onClick = useCallback(
    (event) => {
      if (action) {
        channel(Channel.ACTION, { action });
      }
    },
    [action, sendShortcut],
  );

  useTab();
  useKeyIndex();

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (document.activeElement === document.body) {
        log.info('🔍 Clicked on the document, so focusing input');
        setInputFocus(Math.random());
      }
    };

    document.addEventListener('click', handleDocumentClick);

    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  return (
    <div
      key="input"
      ref={inputRef}
      className={`flex flex-row justify-between ${footerHidden && '-mt-px'} max-w-screen relative overflow-x-hidden`}
      style={{
        height: inputHeight || PROMPT.INPUT.HEIGHT.SM,
      }}
      // initial={{ opacity: 0 }}
      // animate={{ opacity: processing ? 0 : 1 }}
      // transition={{ duration: 0.2 }}
    >
      {/* "Hello World" text */}
      {/* <div className="absolute top-0.5 left-1/2 -translate-x-1/2 transform font-native text-xxs text-primary">
        {name} - {description}
      </div> */}
      <div
        className="max-w-screen flex-1 flex flex-nowrap items-center max-h-full mt-0.5"
        style={
          {
            // WebkitAppRegion: 'drag',
            // WebkitUserSelect: 'none',
          }
        }
      >
        <MainInput />
        <QuickInputs />
      </div>
      {footerHidden && (
        <div
          className="flex flex-row items-center justify-end overflow-x-clip mt-0.5"
          style={{
            maxWidth: '80%',
          }}
        >
          {/* biome-ignore lint/a11y/useKeyWithMouseEvents: <explanation> */}
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
                      <ActionButton key={`${action?.key}-button`} {...action} />,
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
                className={`relative ${inputHeight === PROMPT.INPUT.HEIGHT.XS ? 'w-[28px]' : 'w-[30px]'} pl-1 pr-1 mr-1`}
              >
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
                {user.avatar_url ? (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
                  <img
                    onClick={onClick}
                    alt="avatar"
                    src={user.avatar_url}
                    className="z-0 w-[22px] cursor-pointer rounded-full hover:opacity-75 -mt-[2px]"
                  />
                ) : (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
                  <div
                    onClick={onClick}
                    className="z-0 w-[22px] h-[22px] cursor-pointer rounded-full hover:opacity-75 bg-current"
                  />
                )}

                {/* biome-ignore lint/a11y/noSvgWithoutTitle: <explanation> */}
                <svg
                  height="24"
                  width="24"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  className="absolute right-[-7px] top-[-7px] z-10 h-[15px] text-primary opacity-90"
                >
                  <g fill="currentColor">
                    <path
                      d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z"
                      fill="current"
                      fillOpacity="0.9"
                    />
                  </g>
                </svg>
              </span>
            ) : (
              <div className="pr-1.5 pl-1">
                {/* <span className="text-xxs">
                  Process: {pid}
                  Choices: {scoredChoices.length}
                  Count: {count}
                </span> */}

                <LoginButton key="login-button" />
              </div>
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
