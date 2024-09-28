import { UI } from '@johnlindquist/kit/core/enum';
/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { useCallback } from 'react';
import {
  appConfigAtom,
  actionsConfigAtom,
  focusedFlagValueAtom,
  sendActionAtom,
  sendShortcutAtom,
  uiAtom,
} from '../jotai';
import { type Action, bg, textContrast } from './actions';
import { IconSwapper } from './iconswapper';
import { createLogger } from '../../../shared/log-utils';

const log = createLogger('actionbutton.tsx');

export function ActionButton(action: Action) {
  const ui = useAtomValue(uiAtom);
  const sendShortcut = useSetAtom(sendShortcutAtom);
  const sendAction = useSetAtom(sendActionAtom);
  const [flagValue, setFlagValue] = useAtom(focusedFlagValueAtom);
  const [app] = useAtom(appConfigAtom);
  const m = app?.isMac;
  const flagsOptions = useAtomValue(actionsConfigAtom);

  const onClick = useCallback(
    (event) => {
      if (ui === UI.form) {
        event.preventDefault();

        const el = document.querySelector(`[name="${action.name.toLowerCase()}"]`) as HTMLInputElement;

        if (el) {
          el.click();
        }
      } else {
        if (action?.flag) {
          log.info(`setFlagValue`, action.flag);
          setFlagValue(action.flag);
        }

        log.info(`sendAction`, action);
        sendAction(action);
      }
    },
    [ui, action, setFlagValue, sendAction],
  );

  const isActionActive = flagValue && flagsOptions?.active === action.name;

  return (
    <button
      type="button"
      disabled={action?.disabled}
      tabIndex={action?.value === 'enter' ? 0 : -1}
      className={`
  flex h-full flex-row items-center
  justify-center
  rounded py-0.5
  px-1
  text-sm

  font-medium

  outline-none
  transition-opacity duration-200 ease-out
  ${action?.disabled ? 'text-primary text-opacity-25' : `${bg} ${textContrast}`}
  ${isActionActive ? 'bg-opacity-10' : ''}
  `}
      onClick={action?.onClick ?? onClick}
      // blur on mouse down
      onMouseOut={(e) => e.currentTarget.blur()}
    >
      <div
        className={`mr-0.5 min-w-0 truncate px-2px
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
