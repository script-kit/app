/**
 * Bounds and resize state atoms.
 * Manages window bounds, resizing, and layout calculations.
 */

import { atom } from 'jotai';
import type { Rectangle } from 'electron';
import { PROMPT } from '@johnlindquist/kit/core/enum';
import { createLogger } from '../../log-utils';

const log = createLogger('bounds.ts');

// --- Bounds and Position ---
const _boundsAtom = atom<Rectangle>({ x: 0, y: 0, width: 0, height: 0 });
export const boundsAtom = atom(
  (g) => g(_boundsAtom),
  (_g, s, a: Rectangle) => {
    s(_boundsAtom, a);
  },
);

const promptBoundsDefault = {
  id: '',
  width: 0,
  height: 0,
  x: 0,
  y: 0,
};

const _promptBoundsAtom = atom(promptBoundsDefault);
export const promptBoundsAtom = atom(
  (g) => g(_promptBoundsAtom),
  (
    _g,
    s,
    a: {
      id: string;
      width: number;
      height: number;
      x: number;
      y: number;
      human?: boolean;
    },
  ) => {
    if (a?.human) {
      log.info(`😙 Prompt resized by human: ${a.width}x${a.height}`);
    }
    s(_promptBoundsAtom, a);
  },
);

export const appBoundsAtom = atom({
  width: PROMPT.WIDTH.BASE,
  height: PROMPT.HEIGHT.BASE,
});

// --- Resizing State ---
export const promptResizedByHumanAtom = atom(false);
export const resizingAtom = atom(false);

// --- Font Size Atoms (Dynamic based on heights) ---
export const actionsButtonNameFontSizeAtom = atom('text-sm');
export const actionsButtonDescriptionFontSizeAtom = atom('text-xs');
export const actionsInputFontSizeAtom = atom('text-lg');

export const buttonNameFontSizeAtom = atom(() => 'text-base');
export const buttonDescriptionFontSizeAtom = atom(() => 'text-xs');
export const inputFontSizeAtom = atom(() => 'text-2xl');