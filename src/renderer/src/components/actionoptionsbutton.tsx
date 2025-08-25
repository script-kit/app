import { Channel, UI } from '@johnlindquist/kit/core/enum';
/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react/jsx-props-no-spreading */
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import React, { useCallback } from 'react';
import {
  actionsButtonActionAtom,
  appConfigAtom,
  channelAtom,
  choicesAtom,
  actionsOverlayOpenAtom,
  openActionsOverlayAtom,
  closeActionsOverlayAtom,
  indexAtom,
  inputAtom,
  uiAtom,
} from '../jotai';

import { ActionButton } from './actionbutton';

export function OptionsButton() {
  const [choices] = useAtom(choicesAtom);
  const [input] = useAtom(inputAtom);
  const [index] = useAtom(indexAtom);
  const [channel] = useAtom(channelAtom);
  const overlayOpen = useAtomValue(actionsOverlayOpenAtom);
  const openOverlay = useSetAtom(openActionsOverlayAtom);
  const closeOverlay = useSetAtom(closeActionsOverlayAtom);
  const [app] = useAtom(appConfigAtom);
  const [ui] = useAtom(uiAtom);
  const m = app?.isMac;
  const [actionsAction] = useAtom(actionsButtonActionAtom);

  const onClick = useCallback(() => {
    if (overlayOpen) {
      closeOverlay();
      channel(Channel.FORWARD);
    } else {
      const flag = choices.length ? choices[index].value : input || ui;
      openOverlay({ source: 'input', flag });
      channel(Channel.BACK);
    }
  }, [choices, input, index, channel, overlayOpen, openOverlay, closeOverlay, ui]);

  return <ActionButton {...actionsAction} onClick={onClick} />;
}
