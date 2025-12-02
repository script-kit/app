/**
 * Bounds and resize state atoms.
 * Manages window bounds, resizing, and layout calculations.
 */

import { atom } from 'jotai';

// Using Rectangle type from shared types to avoid electron import
type Rectangle = { x: number; y: number; width: number; height: number };

import { PROMPT } from '@johnlindquist/kit/core/enum';
import { createLogger } from '../../log-utils';
import { inputHeightAtom, itemHeightAtom } from './ui-elements';

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

export const buttonNameFontSizeAtom = atom((g) => {
  const itemHeight = g(itemHeightAtom);
  switch (itemHeight) {
    case PROMPT.ITEM.HEIGHT.XXS:
      return 'text-xxs';
    case PROMPT.ITEM.HEIGHT.XS:
      return 'text-xs';
    case PROMPT.ITEM.HEIGHT.SM:
      return 'text-sm';
    case PROMPT.ITEM.HEIGHT.BASE:
      return 'text-base';
    case PROMPT.ITEM.HEIGHT.LG:
      return 'text-lg';
    case PROMPT.ITEM.HEIGHT.XL:
      return 'text-xl';
    default:
      return 'text-base';
  }
});

export const buttonDescriptionFontSizeAtom = atom((g) => {
  const itemHeight = g(itemHeightAtom);
  switch (itemHeight) {
    case PROMPT.ITEM.HEIGHT.XXS:
      return 'text-xxs';
    case PROMPT.ITEM.HEIGHT.XS:
      return 'text-xxs';
    case PROMPT.ITEM.HEIGHT.SM:
      return 'text-xs';
    case PROMPT.ITEM.HEIGHT.BASE:
      return 'text-xs';
    case PROMPT.ITEM.HEIGHT.LG:
      return 'text-sm';
    case PROMPT.ITEM.HEIGHT.XL:
      return 'text-base';
    default:
      return 'text-xs';
  }
});

export const inputFontSizeAtom = atom((g) => {
  const inputHeight = g(inputHeightAtom);
  switch (inputHeight) {
    case PROMPT.INPUT.HEIGHT.XXS:
      return 'text-sm';
    case PROMPT.INPUT.HEIGHT.XS:
      return 'text-base';
    case PROMPT.INPUT.HEIGHT.SM:
      return 'text-xl';
    case PROMPT.INPUT.HEIGHT.BASE:
      return 'text-2xl';
    case PROMPT.INPUT.HEIGHT.LG:
      return 'text-3xl';
    case PROMPT.INPUT.HEIGHT.XL:
      return 'text-4xl';
    default:
      return 'text-2xl';
  }
});
