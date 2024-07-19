import { Channel, UI } from '@johnlindquist/kit/core/enum';
import log from 'electron-log';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { type ChangeEvent, type KeyboardEvent, type LegacyRef, useCallback, useEffect, useRef, useState } from 'react';

import { useActionsKeyIndex, useFocus, useTab } from '../hooks';
import {
  _modifiers,
  actionsInputAtom,
  actionsInputFocusAtom,
  actionsInputFontSizeAtom,
  actionsInputHeightAtom,
  actionsPlaceholderAtom,
  cachedAtom,
  channelAtom,
  flagsAtom,
  flagsOptionsAtom,
  focusedChoiceAtom,
  modifiers,
  shortcodesAtom,
  shortcutsAtom,
  submittedAtom,
  typingAtom,
  uiAtom,
} from '../jotai';

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

export default function ActionsInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  useFocus(inputRef);

  const shortcodes = useAtomValue(shortcodesAtom);
  const [inputValue, setInput] = useAtom(actionsInputAtom);
  const [submitted] = useAtom(submittedAtom);

  const [, setInputFocus] = useAtom(actionsInputFocusAtom);
  const [fontSize] = useAtom(actionsInputFontSizeAtom);

  const flags = useAtomValue(flagsAtom);

  const inputHeight = useAtomValue(actionsInputHeightAtom);

  const setTyping = useSetAtom(typingAtom);
  const [shortcuts] = useAtom(shortcutsAtom);

  const channel = useAtomValue(channelAtom);

  useEffect(() => {
    setInputFocus(Math.random());

    return () => {
      setInputFocus(0);
    };
  }, [setInputFocus]);

  useTab();
  useActionsKeyIndex();

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
        event.preventDefault();
        channel(Channel.ACTIONS_INPUT || 'ACTIONS_INPUT', {
          input,
        });
      }

      // if the key is a modifier that isn't shift, return

      // If not Enter, Tab, or a modifier, setTyping to true
      if (event.key !== 'Enter' && event.key !== 'Tab' && !modifiers.length) {
        setTyping(true);
      }

      // If key was delete and the value is empty, clear setInput
      if (event.key === 'Backspace' && target.value === '') {
        log.info('Clearing input');
        channel(Channel.ACTIONS_INPUT || 'ACTIONS_INPUT', {
          input: '',
        });
      }
    },
    [setTyping, shortcuts, flags, setInput, shortcodes],
  );

  const cached = useAtomValue(cachedAtom);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      // log.info(event.target.value, { cached: cached ? 'true' : 'false' });

      setInput(event.target.value);
    },
    [setInput],
  );

  const [pendingInput, setPendingInput] = useState('');

  useEffect(() => {
    if (!cached && pendingInput) {
      setInput(pendingInput);
      setPendingInput('');
    }
  }, [cached, pendingInput, setInput]);

  const focusedChoice = useAtomValue(focusedChoiceAtom);
  const ui = useAtomValue(uiAtom);
  const flagsOptions = useAtomValue(flagsOptionsAtom);

  return (
    <div
      key="input"
      className={'flex flex-col max-w-screen border-b border-ui-border px-0.5'}
      style={{
        height: inputHeight,
        minHeight: inputHeight,
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

      <div className="max-w-screen flex-1 relative">
        <input
          id="actions-input"
          spellCheck="false"
          style={
            {
              width: '100%',
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
      h-full
      max-w-full border-none px-4 py-0 ring-0 ring-opacity-0
      focus:border-none focus:ring-0
      focus:ring-opacity-0
      `}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={flagsOptions.placeholder}
          ref={inputRef as LegacyRef<HTMLInputElement>}
          type={'text'}
          value={inputValue}
        />

        {flagsOptions.name && (
          <div className="text-primary/90 text-xs absolute right-[8px] top-[5px] font-normal-medium">
            {flagsOptions.name}
          </div>
        )}
      </div>
    </div>
  );
}
