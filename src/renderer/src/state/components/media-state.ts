// =================================================================================================
// State for audio, speech, microphone, and webcam.
// =================================================================================================

import { atom } from 'jotai';

// Stub implementations - these need to be properly extracted from jotai.ts
export const audioDotAtom = atom(false);
export const webcamStreamAtom = atom<MediaStream | null>(null);

// Add other media related atoms here