import { atomEffect } from 'jotai-effect';
import { inputAtom, typingAtom } from "../state";

export const typingEffect = atomEffect((get, set) => {
  // Accessing inputAtom makes this effect re-run whenever input changes
  get(inputAtom);

  // Turn typing indicator on
  set(typingAtom, true);

  // Schedule auto-off
  const id = setTimeout(() => set(typingAtom, false), 50);

  // Cleanup if input updates sooner
  return () => clearTimeout(id);
});
