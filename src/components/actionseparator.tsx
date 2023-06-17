/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import React from 'react';
import { useAtom } from 'jotai';
import { _flag, _choices, indexAtom, appConfigAtom } from '../jotai';

export function ActionSeparator() {
  const [app] = useAtom(appConfigAtom);
  const m = app?.isMac;
  return (
    <div
      className={`
      ${!m && `mt-px`}
      flex items-center justify-center
      font-mono
      leading-none
      text-sm font-medium
      text-primary  text-opacity-10
      bg-opacity-0
      p-0.5
      text-center
`}
    >
      |
    </div>
  );
}
