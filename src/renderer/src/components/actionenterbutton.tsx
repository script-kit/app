import { UI } from '@johnlindquist/kit/core/enum';
/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useCallback } from 'react';
import { appConfigAtom, enterPressedAtom, focusedFlagValueAtom, sendShortcutAtom, uiAtom } from '../jotai';

import { type Action, bg, textContrast } from './actions';
import { IconSwapper } from './iconswapper';

export function EnterButton(action: Action) {
  const ui = useAtomValue(uiAtom);
  const sendShortcut = useSetAtom(sendShortcutAtom);
  const pressEnter = useSetAtom(enterPressedAtom);
  const setFlag = useSetAtom(focusedFlagValueAtom);
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

        const el = document.querySelector(`[type="submit"]`) as HTMLInputElement;

        if (el) {
          el.click();
        }
      } else {
        if (action?.flag) {
          setFlag(action.flag);
        }
        sendShortcut(action.value);
      }
    },
    [ui, pressEnter, action.name, action.flag, action.value, setFlag, sendShortcut],
  );

  return (
    // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
    <button
      type="button"
      disabled={action?.disabled}
      tabIndex={action?.value === 'enter' ? 0 : -1}
      className={`
  flex h-full flex-row items-center
  justify-center
  rounded py-0.5
  px-1.5
  text-sm


  font-medium

  outline-none
  ${action?.disabled ? 'text-primary text-opacity-25' : `${bg} ${textContrast}`}
  `}
      onClick={onClick}
      onMouseOut={(e) => e.currentTarget.blur()}
    >
      <div
        className={`mr-0.5 min-w-0 truncate px-2px hover:cursor-pointer
      `}
      >
        {action.name}
      </div>

      <div className={`${!m && 'mt-px'} flex flex-row`}>
        {action.shortcut.split('+').map((k) => {
          return (
            <div
              key={k}
              className={`
              ml-0.5 flex h-5
          w-5 items-center justify-center
          rounded
          bg-ui-bg
          leading-none
          hover:cursor-pointer
          hover:border-opacity-10

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
