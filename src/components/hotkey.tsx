/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react/prop-types */
import React, { KeyboardEvent, useCallback, useEffect, useRef } from 'react';
import { KeyData } from '@johnlindquist/kit/types/kitapp';

import { useAtom } from 'jotai';
import {
  placeholderAtom,
  panelHTMLAtom,
  hintAtom,
  unfilteredChoicesAtom,
} from '../jotai';
import { useEscape, useFocus } from '../hooks';

interface HotkeyProps {
  submit(data: any): void;
  onHotkeyHeightChanged: (height: number) => void;
}

const DEFAULT_PLACEHOLDER = 'Press a combination of keys';

const keyFromCode = (code: string) => {
  console.log(`keyFromCode: ${code}`);
  const keyCode = code.replace(/Key|Digit/, '').toLowerCase();
  const replaceAlts = (k: string) => {
    const map: any = {
      backslash: '\\',
      slash: '/',
      quote: `'`,
      backquote: '`',
      equal: `=`,
      minus: `-`,
      period: `.`,
      comma: `,`,
      bracketleft: `[`,
      bracketright: `]`,
      space: ' ',
      semicolon: ';',
    };

    if (map[k]) return map[k];

    return k;
  };

  return replaceAlts(keyCode);
};
const getModifierString = (event: KeyboardEvent<HTMLInputElement>) => {
  const superKey = event.getModifierState('Super');

  const {
    metaKey: command,
    shiftKey: shift,
    ctrlKey: control,
    altKey: option,
  } = event;
  return `${command ? `command ` : ``}${shift ? `shift ` : ``}${
    option ? `option ` : ``
  }${control ? `control ` : ``}${superKey ? `super ` : ``}`;
};

const getKeyData = (
  event: KeyboardEvent<HTMLInputElement>
): { modifierString: string; keyData: KeyData } => {
  const {
    key,
    code,
    metaKey: command,
    shiftKey: shift,
    ctrlKey: control,
    altKey: option,
  } = event;
  const superKey = event.getModifierState('Super');
  let normalKey = option ? keyFromCode(code) : key;
  if (normalKey === ' ') normalKey = 'Space';

  const modifierString = getModifierString(event);

  const keyData: KeyData = {
    key: normalKey,
    command,
    shift,
    option,
    control,
    fn: event.getModifierState('Fn'),
    // fnLock: event.getModifierState('FnLock'),
    // numLock: event.getModifierState('NumLock'),
    hyper: event.getModifierState('Hyper'),
    os: event.getModifierState('OS'),
    super: superKey,
    win: event.getModifierState('Win'),
    // scrollLock: event.getModifierState('ScrollLock'),
    // scroll: event.getModifierState('Scroll'),
    // capsLock: event.getModifierState('CapsLock'),
    shortcut: `${modifierString}${normalKey}`,
    keyCode: code,
  };

  return { modifierString, keyData };
};

const prose = (html: string) => {
  return `<div class="p-5 prose">
  ${html}
  </div>`;
};

const hotkeyProse = (modifierString: string) => {
  return modifierString.trim().replace(/\s/g, '+');
};

const WAITING = `Waiting for keypress...`;

export default function Hotkey({ submit, onHotkeyHeightChanged }: HotkeyProps) {
  const [placeholder, setPlaceholder] = useAtom(placeholderAtom);
  const [choices, setChoices] = useAtom(unfilteredChoicesAtom);
  const [, setHint] = useAtom(hintAtom);

  const hotkeyRef = useRef<HTMLInputElement>(null);
  useFocus(hotkeyRef);

  const setChoice = useCallback(
    (name: string) => {
      setChoices([
        {
          name,
          info: true,
        },
      ]);
    },
    [setChoices]
  );

  useEffect(() => {
    setChoice(WAITING);
  }, [setChoice]);

  const onKeyUp = useCallback(
    (event) => {
      event.preventDefault();
      const modifierString = getModifierString(event);
      let choiceName = ``;
      if (modifierString) {
        choiceName = hotkeyProse(modifierString);
      } else {
        choiceName = WAITING;
      }

      setChoice(choiceName);
    },
    [setChoice]
  );

  const onKeyDown = useCallback(
    (event) => {
      event.preventDefault();

      const { keyData, modifierString } = getKeyData(event);

      const choiceName = hotkeyProse(modifierString);

      setChoice(choiceName);

      if (event.key === 'Escape') {
        return;
      }

      if (
        event.key.length === 1 ||
        ['Shift', 'Control', 'Alt', 'Meta'].every((m) => !event.key.includes(m))
      ) {
        submit(keyData);
      }
    },
    [setChoice, submit]
  );

  return (
    <input
      key="hotkey"
      ref={hotkeyRef}
      style={
        {
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
          minHeight: '4rem',
          caretColor: 'transparent',
        } as any
      }
      autoFocus
      className={`
      hotkey-component
      bg-transparent w-full text-text-base  focus:outline-none outline-none text-xl   placeholder-text-base placeholder-opacity-40 h-16
  ring-0 ring-opacity-0 focus:ring-0 focus:ring-opacity-0 pl-4 py-0
  focus:border-none border-none`}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      placeholder={placeholder || DEFAULT_PLACEHOLDER}
    />
  );
}
