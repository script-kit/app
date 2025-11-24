/**
 * Unified scroll system atoms
 *
 * This file provides the Jotai atom-based API for the consolidated scroll service.
 * All scroll operations should go through these atoms.
 *
 * Performance optimizations:
 * - Fine-grained atoms per context (eliminates Map copying)
 * - Performance measurement integration
 * - Conditional timing strategy (useLayoutEffect + fallback double-rAF)
 */

import { atom } from 'jotai';
import type {
  ScrollContext,
  ScrollRequest,
  ScrollState,
  GridScrollParams,
} from './types';
import { createLogger } from '../../log-utils';

// v2 compatible scroll interface - works with wrappers created by components
interface ScrollableRef {
  scrollToItem: (indexOrParams: number | { rowIndex: number; columnIndex: number; align?: string }, align?: string) => void;
}

const log = createLogger('scroll');

// Performance measurement helpers
const PERF_ENABLED = typeof performance !== 'undefined' && performance.mark;

function markScrollStart(context: ScrollContext, reason: string) {
  if (PERF_ENABLED) {
    performance.mark(`scroll-start-${context}-${reason}`);
  }
}

function markScrollEnd(context: ScrollContext, reason: string) {
  if (PERF_ENABLED) {
    const startMark = `scroll-start-${context}-${reason}`;
    const endMark = `scroll-end-${context}-${reason}`;
    const measureName = `scroll-${context}-${reason}`;

    performance.mark(endMark);

    try {
      performance.measure(measureName, startMark, endMark);
      const measure = performance.getEntriesByName(measureName)[0];
      if (measure) {
        log.verbose(`⚡ [ScrollPerf] ${context} (${reason}): ${measure.duration.toFixed(2)}ms`);
      }
    } catch (e) {
      // Mark might not exist if timing is off
    }
  }
}

/**
 * Storage for refs to all scrollable components
 * v2: Uses ScrollableRef wrapper interface instead of specific VariableSizeList/Grid types
 */
export const scrollRefsAtom = atom<{
  'choices-list': ScrollableRef | null;
  'choices-grid': ScrollableRef | null;
  'flags-list': ScrollableRef | null;
}>({
  'choices-list': null,
  'choices-grid': null,
  'flags-list': null,
});

/**
 * Register a ref for a scroll context
 */
export const registerScrollRefAtom = atom(
  null,
  (get, set, payload: { context: ScrollContext; ref: any }) => {
    const refs = get(scrollRefsAtom);
    set(scrollRefsAtom, {
      ...refs,
      [payload.context]: payload.ref,
    });
  }
);

/**
 * Fine-grained scroll state atoms (one per context)
 * This eliminates Map copying overhead - each context updates independently
 */
const initialState: ScrollState = {
  pending: null,
  lastExecuted: null,
  isScrolling: false,
};

export const choicesListScrollStateAtom = atom<ScrollState>(initialState);
export const choicesGridScrollStateAtom = atom<ScrollState>(initialState);
export const flagsListScrollStateAtom = atom<ScrollState>(initialState);

/**
 * Helper to get the appropriate state atom for a context
 */
function getStateAtomForContext(context: ScrollContext) {
  switch (context) {
    case 'choices-list':
      return choicesListScrollStateAtom;
    case 'choices-grid':
      return choicesGridScrollStateAtom;
    case 'flags-list':
      return flagsListScrollStateAtom;
    default:
      return choicesListScrollStateAtom;
  }
}

/**
 * Legacy compatibility: Map-based view of scroll state
 * Derived atom that combines individual states into a Map
 */
export const scrollStateAtom = atom<Map<ScrollContext, ScrollState>>((get) => {
  return new Map([
    ['choices-list', get(choicesListScrollStateAtom)],
    ['choices-grid', get(choicesGridScrollStateAtom)],
    ['flags-list', get(flagsListScrollStateAtom)],
  ]);
});

/**
 * Request a scroll operation (write-only atom)
 *
 * Usage:
 * ```ts
 * set(scrollRequestAtom, {
 *   context: 'choices-list',
 *   target: 5,
 *   reason: 'index-changed'
 * });
 * ```
 */
export const scrollRequestAtom = atom(
  null,
  (get, set, request: ScrollRequest) => {
    // Start performance measurement
    markScrollStart(request.context, request.reason);

    // Get the fine-grained atom for this context
    const stateAtom = getStateAtomForContext(request.context);
    const currentState = get(stateAtom);

    // Update state with pending request (no Map copying!)
    set(stateAtom, {
      ...currentState,
      pending: request,
    });

    log.verbose(
      `📜 [ScrollService] Queued: ${request.context} → index ${request.target} (${request.reason})`
    );

    // Conditional timing strategy:
    // - Navigation needs focus styles to paint first (double rAF)
    // - Other reasons can execute faster (single rAF)
    const needsFocusSync =
      request.reason === 'index-changed' ||
      request.reason === 'user-navigation' ||
      request.reason === 'skip-adjustment';

    if (needsFocusSync) {
      // Double rAF for navigation - ensures focused styles are painted
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          set(executeScrollAtom, request.context);
        });
      });
    } else {
      // Single rAF for non-navigation - faster response
      requestAnimationFrame(() => {
        set(executeScrollAtom, request.context);
      });
    }
  }
);

/**
 * Execute pending scroll for a context (internal use by ScrollController)
 */
export const executeScrollAtom = atom(
  null,
  (get, set, context: ScrollContext) => {
    const stateAtom = getStateAtomForContext(context);
    const state = get(stateAtom);

    if (!state?.pending) {
      return; // No pending scroll
    }

    const request = state.pending;
    const refs = get(scrollRefsAtom);
    const ref = refs[context];

    if (!ref) {
      log.warn(
        `📜 [ScrollService] No ref registered for context: ${context}`
      );
      return;
    }

    try {
      // Execute scroll based on context type
      // v2: Both list and grid use scrollToItem with wrapper interface
      if (context === 'choices-grid') {
        // Grid requires row/column calculation
        const gridDimensions = get(gridDimensionsAtom);
        const columnCount = gridDimensions.columnCount || 1;

        const params = {
          rowIndex: Math.floor(request.target / columnCount),
          columnIndex: request.target % columnCount,
          align: request.align || 'auto',
        };

        ref.scrollToItem(params);

        log.verbose(
          `📜 [ScrollService] Executed: grid → row ${params.rowIndex}, col ${params.columnIndex} (${request.reason})`
        );
      } else {
        // List scrolling
        ref.scrollToItem(request.target, request.align || 'auto');

        log.verbose(
          `📜 [ScrollService] Executed: ${context} → index ${request.target} (${request.reason})`
        );
      }

      // End performance measurement
      markScrollEnd(request.context, request.reason);

      // Update state: mark as executed, clear pending (no Map copying!)
      set(stateAtom, {
        pending: null,
        lastExecuted: request,
        isScrolling: false,
      });
    } catch (error) {
      log.error(
        `📜 [ScrollService] Failed to execute scroll for ${context}:`,
        error
      );
    }
  }
);

/**
 * Track when virtual lists are scrolling (for state updates)
 */
export const setScrollingAtom = atom(
  null,
  (get, set, payload: { context: ScrollContext; isScrolling: boolean }) => {
    const stateAtom = getStateAtomForContext(payload.context);
    const state = get(stateAtom);

    // Update state (no Map copying!)
    set(stateAtom, {
      ...state,
      isScrolling: payload.isScrolling,
    });
  }
);

/**
 * Grid dimensions for calculating row/column from index
 * This will be set by list.tsx when grid is rendered
 */
export const gridDimensionsAtom = atom<{
  columnCount: number;
  rowHeight: number;
  columnWidth: number;
}>({
  columnCount: 1,
  rowHeight: 100,
  columnWidth: 100,
});
