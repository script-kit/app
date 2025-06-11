/**
 * Jotai effects for optimized state management
 * This file contains effects to handle batched updates and reduce re-renders
 */

import { atomEffect } from 'jotai-effect';
import { atom } from 'jotai';
import type { ScoredChoice } from '../../shared/types';
import {
  flagsAtom,
  scoredFlags as scoredFlagsBaseAtom,
  flagsIndexAtom,
  flagsHeightAtom,
  actionsItemHeightAtom,
} from './jotai';

/**
 * Effect for batching scored flags updates
 * This ensures all related atoms update in a single transaction
 */
export const scoredFlagsUpdateEffect = atomEffect((get, set) => {
  // Monitor flags changes
  const flags = get(flagsAtom);
  
  // Skip if no flags
  if (!flags || Object.keys(flags).length === 0) {
    return;
  }

  // Calculate scored flags (this would normally be done by search logic)
  // For now, we're just converting flags to scored choices
  const scoredChoices: ScoredChoice[] = Object.entries(flags).map(([key, flag]) => ({
    item: {
      id: key,
      name: flag.name || key,
      value: key,
      description: flag.description,
      height: flag.height,
      ...flag,
    },
    score: 1,
    matches: {},
  }));

  // Batch all updates together
  requestAnimationFrame(() => {
    // Update scored flags
    set(scoredFlagsBaseAtom, scoredChoices);
    
    // Reset index
    set(flagsIndexAtom, 0);
    
    // Calculate height efficiently
    const itemHeight = get(actionsItemHeightAtom);
    let totalHeight = 0;
    
    for (const choice of scoredChoices) {
      totalHeight += choice.item.height || itemHeight;
      // Cap at max height for performance
      if (totalHeight > 1920) {
        totalHeight = 1920;
        break;
      }
    }
    
    set(flagsHeightAtom, totalHeight);
  });
});

/**
 * Atom that includes the effect
 * Components should use this instead of direct flagsAtom updates
 */
export const flagsWithEffectAtom = atom(
  (get) => get(flagsAtom),
  (get, set, newFlags) => {
    set(flagsAtom, newFlags);
    // Effect will automatically trigger
  }
);