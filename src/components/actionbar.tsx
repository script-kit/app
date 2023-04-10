/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { useAtomValue, useAtom } from 'jotai';
import { motion } from 'framer-motion';
import { UI } from '@johnlindquist/kit/cjs/enum';
import React from 'react';
import { IconButton } from './icon';
import { ActionButton } from './actionbutton';
import { EnterButton } from './actionenterbutton';
import {
  flagsAtom,
  _flag,
  _choices,
  _index,
  footerAtom,
  uiAtom,
  enterButtonNameAtom,
  enterButtonDisabledAtom,
  appDbAtom,
  actionsAtom,
} from '../jotai';

import { Action, textContrast, transition } from './actions';
import { ActionSeparator } from './actionseparator';
import { OptionsButton } from './actionoptionsbutton';

export default function ActionBar() {
  const [flags] = useAtom(flagsAtom);
  const [footer] = useAtom(footerAtom);

  const [enterButtonName] = useAtom(enterButtonNameAtom);
  const [enterButtonDisabled] = useAtom(enterButtonDisabledAtom);
  const [ui] = useAtom(uiAtom);
  const [appDb] = useAtom(appDbAtom);

  const actions: Action[] = useAtomValue(actionsAtom);

  const hasFlags = Object.keys(flags)?.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1] }}
      transition={transition}
      className={`
      flex flex-row
      ${
        ui === UI.splash
          ? ``
          : `border-t
          border-secondary border-opacity-75`
      }
      bg-secondary
    ${
      ui === UI.splash
        ? `
    bg-opacity-0
    `
        : `
        bg-opacity-60
    `
    }

    px-4
    justify-center items-center
    overflow-hidden
    h-7 max-h-7`}
    >
      <IconButton />

      <div className="left-container flex flex-row justify-center items-center pb-px">
        {actions
          .filter((action) => action.position === 'left' && !appDb?.mini)
          .flatMap((action, i, array) => [
            // eslint-disable-next-line react/jsx-key
            <ActionButton {...action} />,
            i < array.length - 1 ? (
              <ActionSeparator key={`${action?.key}-separator`} />
            ) : null,
            i === array.length - 1 && footer?.length ? (
              <ActionSeparator key={`${action?.key}-separator`} />
            ) : null,
          ])}
      </div>
      {footer?.length ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1] }}
          transition={transition}
          className={`flex flex-1 max-h-full h-full
        px-2
        items-center justify-left
text-sm font-medium
${textContrast}
text-opacity-75
truncate
      `}
        >
          <div
            className="truncate min-w-0 pb-px"
            dangerouslySetInnerHTML={{ __html: footer }}
          />
        </motion.div>
      ) : (
        <div className="flex-1 max-h-full" />
      )}

      <div
        className={`
      ${appDb?.mini ? `w-full justify-between` : `justify-center`}
      right-container flex flex-row items-center pb-px overflow-hidden`}
      >
        <div className="options-container flex flex-row">
          {hasFlags && [
            <OptionsButton key="options-button" />,
            <ActionSeparator key="options-separator" />,
          ]}
        </div>
        <div className="flex flex-row flex-grow-0 items-center overflow-hidden">
          {actions
            .filter((action) => action.position === 'right' && !appDb?.mini)
            .flatMap((action, i, array) => [
              // eslint-disable-next-line react/jsx-key
              <ActionButton {...action} />,
              // eslint-disable-next-line no-nested-ternary
              i < array.length - 1 ? (
                <ActionSeparator key={`${action?.key}-separator`} />
              ) : enterButtonName ? (
                <ActionSeparator key={`${action?.key}-separator`} />
              ) : null,
            ])}
        </div>
        <div className="enter-container flex flex-row min-w-fit items-center">
          {enterButtonName ? (
            <EnterButton
              key="enter-button"
              name={enterButtonName}
              position="right"
              shortcut="⏎"
              value="enter"
              flag=""
              disabled={enterButtonDisabled}
            />
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
