import { atomEffect } from 'jotai-effect';
import { themeAtom, appearanceAtom } from "../state";

// Synchronize appearanceAtom (light/dark) with the current CSS string in themeAtom.
// This runs eagerly whenever themeAtom changes and is entirely side-effect-free.
export const themeAppearanceEffect = atomEffect((get, set) => {
    const theme = get(themeAtom);
    const match = /--appearance:\s*(\w+)/.exec(theme);
    const appearance = match?.[1] as 'light' | 'dark' | undefined;
    if (appearance) {
        set(appearanceAtom, appearance);
    }
});
