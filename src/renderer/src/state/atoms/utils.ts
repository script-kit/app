/**
 * Utility atoms and helper functions.
 * Miscellaneous utility atoms that don't fit in other categories.
 */

import { atom } from 'jotai';
import { AppChannel } from '../../../../shared/enums';
import type { ResizeData, FilePathBounds } from '../../../../shared/types';

const { ipcRenderer } = window.electron;

// --- Search and UI State ---
export const searchDebounceAtom = atom(true);
export const topRefAtom = atom<null | HTMLDivElement>(null);
export const resetIdAtom = atom(Math.random());
export const mainElementIdAtom = atom<string>('');
export const scrollToAtom = atom<'top' | 'bottom' | 'center' | null>(null);

// --- Mini Shortcuts ---
export const _miniShortcutsHoveredAtom = atom(false);
export const miniShortcutsVisibleAtom = atom((_g) => {
  // This feature was explicitly disabled in the original code
  return false;
});

// --- File Path Bounds ---
const emptyFilePathBounds: FilePathBounds = { 
  bounds: { x: 0, y: 0, width: 0, height: 0 }, 
  filePath: '' 
};
export const filePathBoundsAtom = atom<FilePathBounds>(emptyFilePathBounds);
export const initialResizeAtom = atom<ResizeData | null>(null);

// --- Asset Creation ---
export const createAssetAtom = (...parts: string[]) =>
  atom(() => {
    return new Promise((resolve, _reject) => {
      ipcRenderer.once(AppChannel.GET_ASSET, (_event, { assetPath }) => {
        resolve(assetPath);
      });
      
      ipcRenderer.send(AppChannel.GET_ASSET, { parts });
    });
  });

// --- Process Management ---
export const listProcessesActionAtom = atom(() => null);
export const signInActionAtom = atom(() => null);
export const actionsButtonActionAtom = atom(() => ({} as any));
export const shouldActionButtonShowOnInputAtom = atom(() => false);
export const setFlagByShortcutAtom = atom(null, () => {});