/**
 * Preview and panel state atoms.
 * Manages preview panel content and visibility.
 */

import { atom } from 'jotai';
import DOMPurify from 'dompurify';
import { closedDiv } from '../../../../shared/defaults';
import { promptData } from './ui';
import { mainHeightAtom } from './ui-elements';
import { loadingAtom } from './app-core';
import { ID_PANEL, ID_LIST } from '../dom-ids';

// --- Preview HTML ---
export const _previewHTML = atom('');
export const previewEnabledAtom = atom<boolean>(true);

export const previewHTMLAtom = atom(
  (g) => {
    const rawHTML = g(_previewHTML) || '';
    // Sanitize HTML content, allowing iframes and unknown protocols
    return DOMPurify.sanitize(rawHTML, {
      ADD_TAGS: ['iframe'],
      ALLOW_UNKNOWN_PROTOCOLS: true,
    });
  },
  (_g, s, a: string) => {
    s(_previewHTML, a);
  },
);

export const hasPreviewAtom = atom<boolean>((g) => {
  return Boolean(g(_previewHTML) || '');
});

// Check if the preview should be visible
export const previewCheckAtom = atom((g) => {
  const previewHTML = g(previewHTMLAtom);
  const enabled = g(previewEnabledAtom);
  return Boolean(previewHTML && enabled);
});

// --- Panel HTML ---
export const _panelHTML = atom<string>('');

export const panelHTMLAtom = atom(
  (g) =>
    DOMPurify.sanitize(g(_panelHTML), {
      ADD_TAGS: ['iframe'],
      ALLOW_UNKNOWN_PROTOCOLS: true,
    }),
  (g, s, a: string) => {
    if (g(_panelHTML) === a) return;
    s(_panelHTML, a);
    
    // If panel is set, ensure preview is closed unless explicitly defined in prompt data
    if (a && !g(promptData)?.preview) {
      s(_previewHTML, closedDiv);
    }
    
    // Adjust main height if the panel is cleared and no list is present
    if (a === '' && document.getElementById(ID_PANEL) && !document.getElementById(ID_LIST)) {
      s(mainHeightAtom, 0);
    }
    
    if (a) {
      s(loadingAtom, false);
    }
  },
);