import { atomEffect } from 'jotai-effect';
import { micStreamEnabledAtom, channelAtom } from '../jotai';
import { Channel } from '@johnlindquist/kit/core/enum';

export const micStreamEffect = atomEffect((get) => {
  const enabled = get(micStreamEnabledAtom);
  if (enabled) return; // streaming handled elsewhere

  const channel = get(channelAtom);
  channel(Channel.MIC_STREAM, { event: 'end' });
});
