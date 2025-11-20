/**
 * Unified scroll system type definitions
 *
 * This file defines the contracts for Script Kit's consolidated scroll architecture.
 * All scrolling operations go through this type-safe API.
 */

import type { GridOnScrollProps } from 'react-window';

/**
 * Scroll context identifies which scrollable area to target
 */
export type ScrollContext =
  | 'choices-list'   // Main choices list (virtual list)
  | 'choices-grid'   // Grid mode for choices
  | 'flags-list';    // Actions/flags overlay list

/**
 * Scroll alignment determines how the target item is positioned
 */
export type ScrollAlign =
  | 'start'   // Align item to start of viewport
  | 'center'  // Center item in viewport
  | 'end'     // Align item to end of viewport
  | 'auto';   // Smart alignment (scroll minimum distance)

/**
 * Scroll reason provides debugging context for why scroll occurred
 */
export type ScrollReason =
  | 'index-changed'        // Navigation changed the index
  | 'choices-updated'      // Choice list was updated
  | 'focus-decision'       // FocusController decided to scroll
  | 'default-value'        // Default value selected
  | 'user-navigation'      // User keyboard/mouse navigation
  | 'programmatic'         // Programmatic API call
  | 'restore'              // Restoring previous state
  | 'skip-adjustment'      // Adjusted for skip items
  | 'overlay-opened'       // Actions overlay opened
  | 'filter-changed'       // Actions filter changed
  | 'flags-updated';       // Flags list updated

/**
 * Scroll request encapsulates all information needed to perform a scroll
 */
export interface ScrollRequest {
  /** Which scrollable area to target */
  context: ScrollContext;

  /** Index to scroll to */
  target: number;

  /** How to align the target in viewport */
  align?: ScrollAlign;

  /** Why this scroll is happening (for debugging) */
  reason: ScrollReason;

  /** Optional: Override scroll behavior */
  behavior?: 'auto' | 'smooth';
}

/**
 * Scroll state tracks the current scroll status for a context
 */
export interface ScrollState {
  /** Pending scroll request waiting to execute */
  pending: ScrollRequest | null;

  /** Last successfully executed scroll request */
  lastExecuted: ScrollRequest | null;

  /** Whether this context is currently scrolling */
  isScrolling: boolean;

  /** Last scroll position (for debugging) */
  lastScrollOffset?: number;
}

/**
 * Grid scroll props for react-window Grid component
 */
export interface GridScrollParams {
  rowIndex: number;
  columnIndex: number;
  align?: ScrollAlign;
}

/**
 * Scroll event from virtual list (for tracking scroll state)
 */
export interface ScrollEvent {
  scrollDirection: 'forward' | 'backward';
  scrollOffset: number;
  scrollUpdateWasRequested: boolean;
}
