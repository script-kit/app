/**
 * Application lifecycle atoms for exit, close, and escape behaviors.
 * These handle the closing and cleanup of the application.
 */

import { atom } from 'jotai';
import { Channel } from '@johnlindquist/kit/core/enum';
import log from 'electron-log';

// Import dependencies from facade to avoid circular deps
import {
  openAtom,
  pidAtom,
  channelAtom,
} from '../facade';

export const _open = atom(false);

// Existing complex openAtom remains in jotai.ts for now due to dependencies

export const resizeCompleteAtom = atom(false);

/**
 * Exit atom - handles closing the app when a specific process exits.
 */
export const exitAtom = atom(
  (g) => g(openAtom),
  (g, s, pid: number) => {
    if (g(pidAtom) === pid) {
      s(openAtom, false);
    }
  },
);

/**
 * Escape atom - handles escape key behavior and speech synthesis cleanup.
 */
export const escapeAtom = atom<any>((g) => {
  const channel = g(channelAtom);
  return () => {
    // Stop any ongoing speech synthesis
    const synth = window.speechSynthesis;
    if (synth.speaking) {
      synth.cancel();
    }

    log.info('👋 Sending Channel.ESCAPE');
    channel(Channel.ESCAPE);
  };
});

/**
 * Blur atom - handles window blur events.
 */
export const blurAtom = atom(null, (g) => {
  if (g(openAtom)) {
    const channel = g(channelAtom);
    channel(Channel.BLUR);
  }
});