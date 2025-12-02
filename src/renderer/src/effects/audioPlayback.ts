import { Channel } from '@johnlindquist/kit/core/enum';
import { atomEffect } from 'jotai-effect';
import { _audioAtom, channelAtom } from '../jotai';

export const audioPlaybackEffect = atomEffect((get) => {
  const opts = get(_audioAtom);
  const channel = get(channelAtom);

  let audio: HTMLAudioElement | null = document.querySelector('#kit-audio');

  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'kit-audio';
    document.body.appendChild(audio);
  }

  // Clear previous listeners
  audio.onended = audio.onpause = audio.onerror = null;

  if (opts?.filePath) {
    audio.src = opts.filePath;
    audio.playbackRate = opts.playbackRate ?? 1;
    audio.play().catch(() => {});

    audio.onended = () => channel(Channel.PLAY_AUDIO);
  } else {
    audio.pause();
    audio.removeAttribute('src');
  }

  return () => {
    audio?.pause();
    audio.onended = null;
  };
});
