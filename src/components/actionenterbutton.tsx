/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { useAtomValue, useSetAtom } from 'jotai';
import { motion } from 'framer-motion';
import { UI } from '@johnlindquist/kit/cjs/enum';
import React, { useCallback } from 'react';
import {
  _flag,
  _choices,
  _index,
  uiAtom,
  sendShortcutAtom,
  enterPressedAtom,
} from '../jotai';

import { Action, bg, textContrast, transition } from './actions';
import { IconSwapper } from './iconswapper';

export function EnterButton(action: Action) {
  const ui = useAtomValue(uiAtom);
  const sendShortcut = useSetAtom(sendShortcutAtom);
  const pressEnter = useSetAtom(enterPressedAtom);
  const setFlag = useSetAtom(_flag);

  const onClick = useCallback(
    (event) => {
      if ([UI.mic, UI.webcam].includes(ui)) {
        pressEnter();
        return;
      }
      if (ui === UI.form) {
        event.preventDefault();

        const el = document.querySelector(
          `[name="${action.name.toLowerCase()}"]`
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
    <motion.button
      type="button"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={transition}
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
  transition-all duration-200 ease-out
  ${action?.disabled ? `text-primary text-opacity-25` : `${bg} ${textContrast}`}
  `}
      onClick={onClick}
    >
      <div
        className={`px-2px truncate min-w-0 mr-0.5 hover:cursor-pointer
      `}
      >
        {action.name}
      </div>

      <div className=" flex flex-row">
        {action.shortcut.split('+').map((k) => {
          return (
            <div
              key={k}
              className={`
              flex items-center justify-center
          w-5 h-5 ml-0.5
          leading-none
          rounded
          bg-secondary/15
          hover:border-opacity-10
          hover:cursor-pointer

          `}
            >
              <IconSwapper text={k} />
            </div>
          );
        })}
      </div>
    </motion.button>
  );
}
