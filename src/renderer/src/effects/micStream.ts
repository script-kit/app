import { Channel } from '@johnlindquist/kit/core/enum';
import { atomEffect } from 'jotai-effect';
import { channelAtom, micStreamEnabledAtom } from '../jotai';

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
