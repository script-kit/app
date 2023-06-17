/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { UI } from '@johnlindquist/kit/cjs/enum';
import React, { useCallback } from 'react';
import {
  _flag,
  _choices,
  uiAtom,
  sendShortcutAtom,
  enterPressedAtom,
  appConfigAtom,
} from '../jotai';

import { Action, bg, textContrast } from './actions';
import { IconSwapper } from './iconswapper';

export function EnterButton(action: Action) {
  const ui = useAtomValue(uiAtom);
  const sendShortcut = useSetAtom(sendShortcutAtom);
  const pressEnter = useSetAtom(enterPressedAtom);
  const setFlag = useSetAtom(_flag);
  const [app] = useAtom(appConfigAtom);
  const m = app?.isMac;

  const onClick = useCallback(
    (event) => {
      if ([UI.mic, UI.webcam].includes(ui)) {
        pressEnter();
        return;
      }
      if (ui === UI.form) {
        event.preventDefault();

        const el = document.querySelector(
          `[type="submit"]`
        ) as HTMLInputElement;

        if (el) {
          el.click();
        }
      } else {
        if (action?.flag) setFlag(action.flag);
        sendShortcut(action.value);
      }
    },
    [
      ui,
      pressEnter,
      action.name,
      action.flag,
      action.value,
      setFlag,
      sendShortcut,
    ]
  );

  return (
    // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
    <button
      type="button"
      disabled={action?.disabled}
      tabIndex={action?.value === 'enter' ? 0 : -1}
      className={`
  flex flex-row items-center justify-center
  outline-none
  py-0.5 px-1.5
  font-medium
  text-sm


  rounded

  h-full
  ${action?.disabled ? `text-primary text-opacity-25` : `${bg} ${textContrast}`}
  `}
      onClick={onClick}
      onMouseOut={(e) => e.currentTarget.blur()}
    >
      <div
        className={`px-2px truncate min-w-0 mr-0.5 hover:cursor-pointer
      `}
      >
        {action.name}
      </div>

      <div className={`${!m && `mt-px`} flex flex-row`}>
        {action.shortcut.split('+').map((k) => {
          return (
            <div
              key={k}
              className={`
              flex items-center justify-center
          w-5 h-5 ml-0.5
          leading-none
          rounded
          bg-ui-bg
          hover:border-opacity-10
          hover:cursor-pointer

          `}
            >
              <IconSwapper text={k} />
            </div>
          );
        })}
      </div>
    </button>
  );
}
