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
} from 'react-icons/bs';
import { MdOutlineKeyboardControlKey } from 'react-icons/md';

import { appConfigAtom } from '../jotai';

export const formatShortcut = (shortcut = '') => {
  return shortcut
    .replace('cmd', '⌘')
    .replace('ctrl', '⌃')
    .replace('shift', '⇧')
    .replace('alt', '⌥')
    .replace('enter', '⏎')
    .replace('return', '⏎')
    .replace('escape', '⎋')
    .replace('up', '↑')
    .replace('down', '↓')
    .replace('left', '←')
    .replace('right', '→')
    .replace('delete', '⌫')
    .replace('backspace', '⌫')

    .toUpperCase();
};

const styles = {
  className: 'h-5 w-3',
  strokeWidth: 1.25,
};

export function IconSwapper({ text }: { text: string }) {
  const [app] = useAtom(appConfigAtom);
  const m = app?.isMac;

  if (m) return <>{text}</>;

  if (text === '⌘')
    return <MdOutlineKeyboardControlKey {...styles} className="hide-outline" />;
  if (text === '⌃')
    return <MdOutlineKeyboardControlKey {...styles} className="hide-outline" />;
  if (text === '⌥') return <BsOption {...styles} />;
  if (text === '⏎') return <BsArrowReturnLeft {...styles} />;
  if (text === '⎋') return <BsEscape {...styles} />;
  if (text === '⌫') return <BsBackspace {...styles} />;
  if (text === '⇧') return <BsShift {...styles} />;
  if (text === '↑') return <BsArrowUp {...styles} />;
  if (text === '↓') return <BsArrowDown {...styles} />;
  if (text === '←') return <BsArrowLeft {...styles} />;
  if (text === '→') return <BsArrowRight {...styles} />;

  return <>{text}</>;
}
