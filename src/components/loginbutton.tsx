/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useCallback } from 'react';
import {
  focusedFlagValueAtom,
  uiAtom,
  sendShortcutAtom,
  appConfigAtom,
  signInActionAtom,
} from '../jotai';
import { bg, textContrast } from './actions';
import { GithubIcon } from './icons';

export function LoginButton() {
  const sendShortcut = useSetAtom(sendShortcutAtom);
  const [app] = useAtom(appConfigAtom);
  const action = useAtomValue(signInActionAtom);

  const onClick = useCallback(
    (event) => {
      if (action) sendShortcut(action.key);
    },
    [action, sendShortcut]
  );

  return (
    // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
    <button
      type="button"
      tabIndex={-1}
      className={`
  flex h-6 flex-row
  items-center
  justify-center rounded
  py-0.5
  px-1.5

  text-sm

  font-medium
  text-primary text-opacity-25 outline-none
  transition-opacity duration-200 ease-out ${bg}  ${textContrast}`}
      onClick={onClick}
      // blur on mouse down
      onMouseOut={(e) => e.currentTarget.blur()}
    >
      <div
        className={`mr-0.5 min-w-0 truncate px-2px
      `}
      >
        Sign-In
      </div>
      <GithubIcon className="-mt-3px ml-1 scale-90" />
    </button>
  );
}
