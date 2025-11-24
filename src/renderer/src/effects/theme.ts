import { atomEffect } from 'jotai-effect';
import { themeAtom, appearanceAtom } from '../jotai';
import { appConfigAtom } from '../state/atoms/app-core';

// Synchronize appearanceAtom (light/dark) with the current CSS string in themeAtom.
// Also sets --opacity based on platform from the theme's platform-specific opacity values.
export const themeAppearanceEffect = atomEffect((get, set) => {
    const theme = get(themeAtom);
    const appConfig = get(appConfigAtom);

    // Extract appearance
    const match = /--appearance:\s*(\w+)/.exec(theme);
    const appearance = match?.[1] as 'light' | 'dark' | undefined;
    if (appearance) {
        set(appearanceAtom, appearance);
    }

    // Extract platform-specific opacity and set --opacity
    const opacityKey = appConfig.isMac ? '--opacity-mac' : appConfig.isWin ? '--opacity-win' : '--opacity-other';
    const opacityMatch = new RegExp(`${opacityKey}:\\s*([\\d.]+)`).exec(theme);
    const opacity = opacityMatch?.[1] ?? '0.5';
    document.documentElement.style.setProperty('--opacity', opacity);
});
