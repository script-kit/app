/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { useAtom } from 'jotai';
import { Channel, UI } from '@johnlindquist/kit/core/enum';
import React, { useCallback } from 'react';
import {
  choicesAtom,
  inputAtom,
  indexAtom,
  channelAtom,
  flaggedChoiceValueAtom,
  appConfigAtom,
  uiAtom,
  actionsButtonActionAtom,
} from '../jotai';

import { ActionButton } from './actionbutton';

export function OptionsButton() {
  const [choices] = useAtom(choicesAtom);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(indexAtom);
  const [channel] = useAtom(channelAtom);
  const [flagValue, setFlagValue] = useAtom(flaggedChoiceValueAtom);
  const [app] = useAtom(appConfigAtom);
  const [ui] = useAtom(uiAtom);
  const m = app?.isMac;
  const [actionsAction] = useAtom(actionsButtonActionAtom);

  const onClick = useCallback(() => {
    if (flagValue) {
      setFlagValue('');
      channel(Channel.FORWARD);
    } else {
      setFlagValue(choices.length ? choices[index].value : input || ui);
      channel(Channel.BACK);
    }
  }, [choices, input, index, channel, flagValue, setFlagValue]);

  return (
    <ActionButton
      {...actionsAction}
      extraClassName={flagValue ? 'bg-opacity-10' : ''}
      onClick={onClick}
    />
  );
}
