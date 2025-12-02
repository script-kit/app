import { Channel } from '@johnlindquist/kit/core/enum';
import { atomEffect } from 'jotai-effect';
import { channelAtom, speechAtom } from '../jotai';

export const speechEffect = atomEffect((get) => {
  const opts = get(speechAtom);
  const ch = get(channelAtom);

  if (!opts) return;

  const synth = window.speechSynthesis;
  synth.cancel();

  const u = new SpeechSynthesisUtterance(opts.text);
  // Apply optional attributes safely
  Object.assign(u, {
    rate: (opts as any).rate ?? 1.3,
    pitch: (opts as any).pitch ?? 1,
    lang: (opts as any).lang ?? 'en-US',
  });

  const match = synth.getVoices().find((v) => v.name === (opts as any).name);
  if (match) u.voice = match;

  u.onend = () => ch(Channel.SPEAK_TEXT);
  synth.speak(u);

  return () => synth.cancel();
});
