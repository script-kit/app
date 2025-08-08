import { atomEffect } from 'jotai-effect';
import { previewEnabledAtom, triggerResizeAtom } from "../state";

export const previewEnabledEffect = atomEffect((get, set) => {
  get(previewEnabledAtom);
  set(triggerResizeAtom, 'PREVIEW_ENABLED');
});
