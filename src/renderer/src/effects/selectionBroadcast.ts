import { atomEffect } from 'jotai-effect';
import { selectedChoicesAtom, channelAtom } from '../jotai';
import { Channel } from '@johnlindquist/kit/core/enum';

export const selectionBroadcastEffect = atomEffect((get) => {
  const choices = get(selectedChoicesAtom);
  const channel = get(channelAtom);
  channel(Channel.SELECTED, { selected: choices.map((c) => c?.value) });
});
