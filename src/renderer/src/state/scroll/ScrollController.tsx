/**
 * ScrollController - Manages execution of scroll requests
 *
 * This component watches for pending scroll requests and executes them.
 * It should be rendered once in the app root.
 *
 * Performance optimization: Uses fine-grained subscriptions per context
 * instead of iterating over entire Map on any change.
 */

import { useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  choicesListScrollStateAtom,
  choicesGridScrollStateAtom,
  flagsListScrollStateAtom,
  executeScrollAtom,
} from './atoms';

export function ScrollController() {
  const executeScroll = useSetAtom(executeScrollAtom);

  // Fine-grained subscriptions - each context updates independently
  const choicesListState = useAtomValue(choicesListScrollStateAtom);
  const choicesGridState = useAtomValue(choicesGridScrollStateAtom);
  const flagsListState = useAtomValue(flagsListScrollStateAtom);

  // Choices list scroll execution
  useEffect(() => {
    if (choicesListState.pending && !choicesListState.isScrolling) {
      executeScroll('choices-list');
    }
  }, [choicesListState, executeScroll]);

  // Choices grid scroll execution
  useEffect(() => {
    if (choicesGridState.pending && !choicesGridState.isScrolling) {
      executeScroll('choices-grid');
    }
  }, [choicesGridState, executeScroll]);

  // Flags list scroll execution
  useEffect(() => {
    if (flagsListState.pending && !flagsListState.isScrolling) {
      executeScroll('flags-list');
    }
  }, [flagsListState, executeScroll]);

  // This component has no visual output
  return null;
}
