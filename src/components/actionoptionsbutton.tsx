/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { useAtom } from 'jotai';
import { motion } from 'framer-motion';
import { Channel } from '@johnlindquist/kit/cjs/enum';
import React, { useCallback } from 'react';
import {
  _flag,
  _choices,
  inputAtom,
  indexAtom,
  channelAtom,
  flagValueAtom,
  appConfigAtom,
} from '../jotai';

import { bg, textContrast } from './actions';
import { IconSwapper } from './iconswapper';

export function OptionsButton() {
  const [choices] = useAtom(_choices);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(indexAtom);
  const [channel] = useAtom(channelAtom);
  const [flagValue, setFlagValue] = useAtom(flagValueAtom);
  const [app] = useAtom(appConfigAtom);
  const m = app?.isMac;

  const onClick = useCallback(() => {
    if (flagValue) {
      setFlagValue('');
      channel(Channel.FORWARD);
    } else {
      setFlagValue(choices.length ? choices[index].value : input);
      channel(Channel.BACK);
    }
  }, [choices, input, index, channel, flagValue, setFlagValue]);

  return (
    // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
    <button
      type="button"
      tabIndex={-1}
      className={`
  flex flex-row items-center justify-center
  outline-none py-0.5 px-1
  font-medium
  text-sm
  ${textContrast}

  ${bg}

  rounded
  `}
      onClick={onClick}
      onMouseOut={(e) => e.currentTarget.blur()}
    >
      <div className="px-0.5 mr-0.5">{flagValue ? 'Back' : 'Actions'}</div>
      <div className={`${!m && `mt-px`} flex flex-row`}>
        <div
          className="
          py-.5 px-1 mx-0.5

          rounded
          bg-ui-bg
          hover:border-opacity-10
          "
        >
          <IconSwapper text={flagValue ? '←' : '→'} />
        </div>
      </div>
    </button>
  );
}
