import { observe } from 'jotai-effect';
import {
  _mainHeight,
  boundsAtom,
  choicesHeightAtom, // Affects height calculations
  choicesReadyAtom, // Affects the timing of the resize calculation
  footerHiddenAtom,
  gridReadyAtom, // Grid state affects layout
  isWindowAtom, // Window mode affects height calculation
  // CRITICAL: Add missing dependencies identified in the ResizeController logic:
  logHTMLAtom, // Log visibility/content affects height
  // Existing atoms being tracked:
  mainHeightAtom,
  previewEnabledAtom,
  previewHTMLAtom,
  promptDataAtom, // Tracks changes to prompt properties like height, grid, mode
  promptResizedByHumanAtom,
  scoredChoicesAtom, // Affects placeholderOnly calculation
  scriptAtom, // Script properties (e.g., 'log: false') affect layout
  topHeightAtom,
  uiAtom,
} from '../jotai';

import { _panelHTML } from '../state/atoms/preview';
import { ResizeReason } from '../state/resize/reasons';
import { scheduleResizeAtom } from '../state/resize/scheduler';

// Observe geometry-related atoms and trigger a state update for ResizeController.
export const unobserveResize = observe((get, set) => {
  // Access dependencies so jotai-effect tracks them.
  get(mainHeightAtom);
  get(topHeightAtom);
  get(footerHiddenAtom);
  get(previewHTMLAtom);
  get(previewEnabledAtom);
  get(uiAtom);
  get(promptDataAtom);
  get(boundsAtom);
  get(promptResizedByHumanAtom);
  get(choicesReadyAtom);
  get(scoredChoicesAtom);
  get(choicesHeightAtom);
  get(_panelHTML);

  // Track additional dependencies
  get(logHTMLAtom);
  get(scriptAtom);
  get(gridReadyAtom);
  get(isWindowAtom);

  // Nudge the ResizeController by bumping the resize tick whenever any observed
  // dependency changes. This avoids relying on setting _mainHeight to the same
  // value (which may not notify) and ensures the controller runs at least once
  // after choice swaps and readiness flips.
  set(scheduleResizeAtom, ResizeReason.DOM);
});
