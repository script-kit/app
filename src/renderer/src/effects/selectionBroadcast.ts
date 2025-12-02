import { Channel } from '@johnlindquist/kit/core/enum';
import { atomEffect } from 'jotai-effect';
import { channelAtom, selectedChoicesAtom } from '../jotai';

export const selectionBroadcastEffect = atomEffect((get) => {
  const choices = get(selectedChoicesAtom);
  const channel = get(channelAtom);
  channel(Channel.SELECTED, { selected: choices.map((c) => c?.value) });
});
