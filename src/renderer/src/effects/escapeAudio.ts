import { atomEffect } from 'jotai-effect';
import { kitStateAtom, audioAtom } from "../state";

export const escapeAudioEffect = atomEffect((get, set) => {
  const { escapePressed } = get(kitStateAtom);
  if (escapePressed) {
    set(audioAtom, null);
    set(kitStateAtom, (state) => ({ ...state, escapePressed: false }));
  }
});
