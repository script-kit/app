import { atomEffect } from 'jotai-effect';
import { previewEnabledAtom, triggerResizeAtom } from '../jotai';

export const previewEnabledEffect = atomEffect((get, set) => {
  get(previewEnabledAtom);
  set(triggerResizeAtom, 'PREVIEW_ENABLED');
});
