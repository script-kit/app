import React, { useEffect, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { throttle } from 'lodash-es';

import { Channel } from '@johnlindquist/kit/core/enum';
import type { Choice } from '@johnlindquist/kit/types/core';
import { closedDiv, noChoice } from '../../../../shared/defaults';

import { 
  _focused,
  choiceInputsAtom,
  submittedAtom,
  previewHTMLAtom,
  channelAtom
} from '../../jotai';

import { SCROLL_THROTTLE_MS } from '../constants';
import { createLogger } from '../../log-utils';

const log = createLogger('ChoicesController');

/**
 * Controller for managing choice focus and related side effects.
 * Handles throttled focus changes, preview updates, and IPC communication.
 */
export const ChoicesController: React.FC = () => {
  const store = useStore();
  const prevFocusedChoiceIdRef = useRef<string>('prevFocusedChoiceId');
  
  const setFocused = useSetAtom(_focused);
  const setChoiceInputs = useSetAtom(choiceInputsAtom);
  const setPreviewHTML = useSetAtom(previewHTMLAtom);
  
  const submitted = useAtomValue(submittedAtom);
  const channel = useAtomValue(channelAtom);
  const focusedChoice = useAtomValue(_focused);

  // Throttled handler for choice focus changes
  const handleChoiceFocus = useCallback(
    throttle(
      (choice: Choice) => {
        // Clear choice inputs
        setChoiceInputs([]);
        
        // Skip if choice is marked as skip
        if (choice?.skip) return;
        
        // Skip if same choice is already focused
        if (choice?.id === prevFocusedChoiceIdRef.current) return;
        
        // Skip if already submitted
        if (submitted) return;

        // Update the previous focused choice ID
        prevFocusedChoiceIdRef.current = choice?.id || 'prevFocusedChoiceId';
        
        // Update the focused choice atom
        setFocused(choice || noChoice);

        // Handle preview updates
        if (choice?.id || (choice?.name && choice?.name !== noChoice.name)) {
          if (typeof choice?.preview === 'string') {
            setPreviewHTML(choice.preview);
          } else if (!choice?.hasPreview) {
            setPreviewHTML(closedDiv);
          }

          // Send IPC message for valid choices
          if (choice?.name !== noChoice.name) {
            channel(Channel.CHOICE_FOCUSED);
          }
        }
      },
      SCROLL_THROTTLE_MS,
      { leading: true, trailing: true }
    ),
    [submitted, channel, setFocused, setChoiceInputs, setPreviewHTML]
  );

  // Subscribe to focused choice changes
  useEffect(() => {
    if (focusedChoice) {
      handleChoiceFocus(focusedChoice);
    }
  }, [focusedChoice, handleChoiceFocus]);

  return null;
};

// Export the throttled handler for use in atoms if needed
export const createThrottledChoiceFocusHandler = (
  setFocused: (choice: Choice) => void,
  setChoiceInputs: (inputs: any[]) => void,
  setPreviewHTML: (html: string) => void,
  channel: (channelName: string) => void
) => {
  let prevFocusedChoiceId = 'prevFocusedChoiceId';
  
  return throttle(
    (choice: Choice, submitted: boolean) => {
      setChoiceInputs([]);
      if (choice?.skip) return;
      if (choice?.id === prevFocusedChoiceId) return;
      if (submitted) return;

      prevFocusedChoiceId = choice?.id || 'prevFocusedChoiceId';
      setFocused(choice || noChoice);

      if (choice?.id || (choice?.name && choice?.name !== noChoice.name)) {
        if (typeof choice?.preview === 'string') {
          setPreviewHTML(choice.preview);
        } else if (!choice?.hasPreview) {
          setPreviewHTML(closedDiv);
        }

        if (choice?.name !== noChoice.name) {
          channel(Channel.CHOICE_FOCUSED);
        }
      }
    },
    SCROLL_THROTTLE_MS,
    { leading: true, trailing: true }
  );
};