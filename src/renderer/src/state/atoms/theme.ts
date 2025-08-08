/**
 * Theme and appearance atoms.
 * These atoms manage the application's visual theme and color scheme.
 */

import { atom } from 'jotai';

type Appearance = 'light' | 'dark' | 'auto';

export const appearanceAtom = atom<Appearance>('dark');
export const darkAtom = atom((g) => g(appearanceAtom) === 'dark');

const _themeAtom = atom('');
export const _tempThemeAtom = atom('');

export const themeAtom = atom(
  (g) => g(_themeAtom),
  (_g, s, theme: string) => {
    s(_themeAtom, theme);
    s(_tempThemeAtom, theme);
  },
);

export const tempThemeAtom = atom(
  (g) => g(_tempThemeAtom),
  (_g, s, theme: string) => {
    s(_tempThemeAtom, theme);
  },
);

export const isDefaultTheme = atom(true);

export const lightenUIAtom = atom((g) => {
  const theme: any = g(themeAtom);
  const temporaryTheme: any = g(tempThemeAtom);
  const isLightened = theme['--color-secondary'] === 'lighten' || temporaryTheme['--color-secondary'] === 'lighten';
  return isLightened;
});