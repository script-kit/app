import { observe } from 'jotai-effect';
import {
    mainHeightAtom,
    topHeightAtom,
    footerHiddenAtom,
    previewHTMLAtom,
    previewEnabledAtom,
    uiAtom,
    boundsAtom,
    promptResizedByHumanAtom,
    resize,
} from '../jotai';

// Observe geometry-related atoms and trigger a single debounced resize per batch.
export const unobserveResize = observe((get, set) => {
    // Access dependencies so jotai-effect tracks them.
    get(mainHeightAtom);
    get(topHeightAtom);
    get(footerHiddenAtom);
    get(previewHTMLAtom);
    get(previewEnabledAtom);
    get(uiAtom);
    get(boundsAtom);
    get(promptResizedByHumanAtom);

    // Call existing resize helper once per transaction.
    resize(get as any, set as any, 'EFFECT');
});
