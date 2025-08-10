import React, { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';

import { UI } from '@johnlindquist/kit/core/enum';
import { 
  uiAtom,
  justOpenedAtom
} from '../../jotai';

import { 
  JUST_OPENED_MS,
  MAX_TABCHECK_ATTEMPTS 
} from '../constants';

const { ipcRenderer } = window.electron;

/**
 * Controller for UI-related side effects.
 * Handles DOM element checking and IPC communication when UI changes.
 */
export const UIController: React.FC = () => {
  const ui = useAtomValue(uiAtom);
  const justOpened = useAtomValue(justOpenedAtom);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    // Skip if not just opened
    if (!justOpened) return;

    const id = ui === UI.arg ? 'input' : ui;
    
    // Set a timeout to send IPC message if element isn't found quickly
    timeoutRef.current = setTimeout(() => {
      ipcRenderer.send(ui);
    }, JUST_OPENED_MS);

    let attempts = 0;

    // Check for DOM element with requestAnimationFrame
    const checkElement = () => {
      attempts++;
      
      if (document.getElementById(id)) {
        // Element found, clear timeout and send IPC
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        ipcRenderer.send(ui);
      } else if (attempts < MAX_TABCHECK_ATTEMPTS) {
        // Keep checking
        animationFrameRef.current = requestAnimationFrame(checkElement);
      } else {
        // Max attempts reached, clear timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(checkElement);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [ui, justOpened]);

  return null;
};