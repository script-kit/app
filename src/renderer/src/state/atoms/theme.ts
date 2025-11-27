/**
 * Theme and appearance atoms.
 * These atoms manage the application's visual theme and color scheme.
 *
 * ## Architecture
 * - **themeAtom**: Persistent theme CSS (writing also updates tempThemeAtom)
 * - **tempThemeAtom**: Preview theme CSS (for hover previews during selection)
 *
 * @module theme-atoms
 */

import { atom } from 'jotai';

/** Appearance mode: light, dark, or auto (follow system) */
export type Appearance = 'light' | 'dark' | 'auto';

/** Current appearance mode, synced from theme CSS via themeAppearanceEffect */
export const appearanceAtom = atom<Appearance>('dark');

/** Derived: true if appearance is 'dark' */
export const darkAtom = atom((g) => g(appearanceAtom) === 'dark');

/** @internal Persistent theme storage */
const _themeAtom = atom('');

/** @internal Preview theme storage */
export const _tempThemeAtom = atom('');

/**
 * Persistent theme CSS. Writing updates both _themeAtom AND _tempThemeAtom.
 * @see tempThemeAtom for preview-only updates
 */
export const themeAtom = atom(
  (g) => g(_themeAtom),
  (_g, s, theme: string) => {
    s(_themeAtom, theme);
    s(_tempThemeAtom, theme);
  },
);

/**
 * Temporary preview theme CSS. Only updates _tempThemeAtom.
 * Use for hover previews; reset to themeAtom value on cancel.
 */
export const tempThemeAtom = atom(
  (g) => g(_tempThemeAtom),
  (_g, s, theme: string) => {
    s(_tempThemeAtom, theme);
  },
);

/** Whether using the default Script Kit theme */
export const isDefaultTheme = atom(true);

/** Derived: true if theme uses lightened secondary colors */
export const lightenUIAtom = atom((g) => {
  const theme = g(themeAtom) as string;
  const temporaryTheme = g(tempThemeAtom) as string;
  const isLightened = theme.includes('--color-secondary: lighten') || temporaryTheme.includes('--color-secondary: lighten');
  return isLightened;
});