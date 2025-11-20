import { observe } from 'jotai-effect';
import {
    // Existing atoms being tracked:
    mainHeightAtom,
    topHeightAtom,
    footerHiddenAtom,
    previewHTMLAtom,
    previewEnabledAtom,
    uiAtom,
    promptDataAtom, // Tracks changes to prompt properties like height, grid, mode
    boundsAtom,
    promptResizedByHumanAtom,
    _mainHeight,
    // CRITICAL: Add missing dependencies identified in the ResizeController logic:
    logHTMLAtom,      // Log visibility/content affects height
    scriptAtom,       // Script properties (e.g., 'log: false') affect layout
    gridReadyAtom,    // Grid state affects layout
    isWindowAtom,     // Window mode affects height calculation
    choicesReadyAtom, // Affects the timing of the resize calculation
    scoredChoicesAtom,// Affects placeholderOnly calculation
    choicesHeightAtom,// Affects height calculations
} from '../jotai';

import { _panelHTML } from "../state/atoms/preview";
import { scheduleResizeAtom } from '../state/resize/scheduler';
import { ResizeReason } from '../state/resize/reasons';

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
