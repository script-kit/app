import { atomEffect } from 'jotai-effect';
import { micStreamEnabledAtom, channelAtom } from '../jotai';
import { Channel } from '@johnlindquist/kit/core/enum';

export const micStreamEffect = atomEffect((get) => {
  const enabled = get(micStreamEnabledAtom);
  const channel = get(channelAtom);

  if (enabled) {
    channel(Channel.MIC_STREAM, { event: 'start' });
  } else {
    channel(Channel.MIC_STREAM, { event: 'end' });
  }
});
