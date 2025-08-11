import { atomEffect } from 'jotai-effect';
import { micStreamEnabledAtom, channelAtom } from '../jotai';
import { Channel } from '@johnlindquist/kit/core/enum';

export const micStreamEffect = atomEffect((get) => {
  const enabled = get(micStreamEnabledAtom);
  const channel = get(channelAtom);

  // No side-effect when disabled; we defer cleanup logic.

  return () => {
    if (enabled) {
      // Only fires when we EXIT an enabled state ↦ disabled
      channel(Channel.MIC_STREAM, { event: 'end' });
    }
  };
});
