import { atomEffect } from 'jotai-effect';
import { isWindowAtom, triggerResizeAtom } from "../state";

export const windowModeEffect = atomEffect((get, set) => {
  const win = get(isWindowAtom);

  document.body.style.paddingTop = win ? '24px' : '';

  // Trigger single resize pulse
  set(triggerResizeAtom, 'WINDOW_MODE');
});
