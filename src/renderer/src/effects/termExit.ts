import { atomEffect } from 'jotai-effect';
import {
  termExitAtom,
  uiAtom,
  submittedAtom,
  termConfigAtom,
  promptDataAtom,
  termOutputAtom,
  submitValueAtom,
} from '../jotai';
import { UI } from '@johnlindquist/kit/core/enum';

export const termExitEffect = atomEffect((get, set) => {
  const exitFlag = get(termExitAtom);
  if (exitFlag === null) return;

  const ui = get(uiAtom);
  if (ui !== UI.term) return;

  if (get(submittedAtom)) return;

  const cfg = get(termConfigAtom);
  const pd = get(promptDataAtom);
  if (cfg.promptId !== pd?.id) return;

  set(submitValueAtom, get(termOutputAtom));

  // reset flag
  set(termExitAtom, null);
});
