/* eslint-disable react/jsx-props-no-spreading */
import React from 'react';
import { useAtom } from 'jotai';
import {
  BsArrowReturnLeft,
  BsEscape,
  BsBackspace,
  BsShift,
  BsArrowUp,
  BsArrowDown,
  BsArrowLeft,
  BsArrowRight,
  BsOption,
  BsCheck2,
} from 'react-icons/bs';
import {
  MdOutlineKeyboardControlKey,
  MdSpaceBar,
  MdKeyboardTab,
} from 'react-icons/md';

import { appConfigAtom } from '../jotai';

const styles = {
  className: 'h-5 w-3 mt-px',
  strokeWidth: 1.25,
};

type IconSwapperProps = {
  text: string;
  className?: string;
};
IconSwapper.defaultProps = {
  className: '',
};

export function IconSwapper({ text, className }: IconSwapperProps) {
  const [app] = useAtom(appConfigAtom);
  const m = app?.isMac;

  if (className) styles.className = className;

  if (text === 'selected') return <BsCheck2 {...styles} />;

  if (m) return <>{text}</>;

  if (text === '⌘')
    return (
      <MdOutlineKeyboardControlKey
        {...styles}
        className="hide-outline icon-top-padding"
      />
    );
  if (text === '⌃')
    return (
      <MdOutlineKeyboardControlKey
        {...styles}
        className="hide-outline icon-top-padding "
      />
    );
  if (text === '⌥') return <BsOption {...styles} />;
  if (text === '⏎') return <BsArrowReturnLeft {...styles} />;
  if (text === '⎋') return <BsEscape {...styles} />;
  if (text === '⌫') return <BsBackspace {...styles} />;
  if (text === '⇧') return <BsShift {...styles} />;
  if (text === '↑') return <BsArrowUp {...styles} />;
  if (text === '↓') return <BsArrowDown {...styles} />;
  if (text === '←') return <BsArrowLeft {...styles} />;
  if (text === '→') return <BsArrowRight {...styles} />;
  if (text === '␣') return <MdSpaceBar {...styles} />;
  if (text === '⇥') return <MdKeyboardTab {...styles} />;

  return <>{text}</>;
}
