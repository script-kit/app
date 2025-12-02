/**
 * Media state atoms for audio, speech, microphone, and webcam.
 * These atoms manage multimedia input/output functionality.
 */

import { atom } from 'jotai';
import { createLogger } from '../../log-utils';

const log = createLogger('media.ts');

// --- Audio Playback ---
type AudioOptions = {
  filePath: string;
  playbackRate?: number;
};

export const _audioAtom = atom<AudioOptions | null>(null);
export const audioAtom = atom(
  (g) => g(_audioAtom),
  (_g, s, a: AudioOptions | null) => {
    s(_audioAtom, a);
  },
);
export const audioDotAtom = atom(false);

// --- Speech Synthesis ---
type SpeakOptions = {
  text: string;
  name?: string;
} & Partial<SpeechSynthesisUtterance>;

export const _speechAtom = atom<SpeakOptions | null>(null);
export const speechAtom = atom(
  (g) => g(_speechAtom),
  (_g, s, a: SpeakOptions | null) => {
    s(_speechAtom, a);
  },
);

// --- Microphone ---
const _micIdAtom = atom<string | null>(null);
export const micIdAtom = atom(
  (g) => g(_micIdAtom),
  (_g, s, a: string | null) => {
    log.info('🎙 micIdAtom', { a });
    s(_micIdAtom, a);
  },
);

export const micConfigAtom = atom({
  timeSlice: 200,
  format: 'webm',
  filePath: '',
});

const _micStreamEnabledAtom = atom(false);
export const micStreamEnabledAtom = atom(
  (g) => g(_micStreamEnabledAtom),
  (_g, s, a: boolean) => {
    s(_micStreamEnabledAtom, a);
  },
);

export const micMediaRecorderAtom = atom<any | null>(null);
export const micStateAtom = atom<'idle' | 'recording' | 'stopped'>('idle');

// --- Webcam ---
export const webcamStreamAtom = atom<MediaStream | null>(null);
export const webcamIdAtom = atom<string | null>(null);
export const deviceIdAtom = atom<string | null>(null);

// --- Screen Recording ---
export const screenRecordingStreamAtom = atom<MediaStream | null>(null);
export const screenAreaAtom = atom<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null>(null);
export const screenSourceIdAtom = atom<string | null>(null);
export const screenRecordingStateAtom = atom<'idle' | 'selecting' | 'recording' | 'paused'>('idle');
export const screenRecorderAtom = atom<MediaRecorder | null>(null);
export const screenRecordingChunksAtom = atom<Blob[]>([]);
