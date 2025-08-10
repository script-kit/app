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
} from "../state";

import { _panelHTML } from "../state/atoms/preview";

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

    // Trigger state update for ResizeController to detect
    const current = get(_mainHeight);
    // By setting the atom to its current value, we force a notification
    // to subscribers (like the ResizeController) without changing the state.
    set(_mainHeight, current);
});
