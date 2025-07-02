# Renderer-Side Cached Choices and Transition Investigation

## Overview

This investigation examines how the renderer handles the transition from cached (preloaded) choices to fresh data, focusing on potential flickering or visual artifacts during the transition.

## Key Components

### 1. Choice Rendering Pipeline

- **List Component** (`src/renderer/src/components/list.tsx`): Uses react-window for virtualized rendering
- **Button Component** (`src/renderer/src/components/button.tsx`): Individual choice rendering
- **Preview Component** (`src/renderer/src/components/preview.tsx`): Displays preview HTML

### 2. State Management (Jotai Atoms)

#### Key Atoms:
- `scoredChoicesAtom`: Main choices state
- `cachedMainScoredChoicesAtom`: Cached choices from main script
- `preloadedAtom`: Boolean flag indicating if choices are preloaded
- `choicesConfigAtom`: Configuration including `preload` flag
- `previewHTMLAtom`: HTML content for preview pane

#### State Flow:
1. Cached state is received via `SET_CACHED_MAIN_STATE` IPC message
2. `initPromptAtom` applies cached state atomically
3. `choicesConfigAtom` tracks preload status with `wereChoicesPreloaded` flag

### 3. Transition Timing

#### Preload Detection:
```typescript
// In choicesConfigAtom setter
wereChoicesPreloaded = !a?.preload && choicesPreloaded;
choicesPreloaded = a?.preload;
```

#### Choice Update Handling:
```typescript
// In scoredChoicesAtom setter
s(cachedAtom, false);
s(loadingAtom, false);
// ... choice processing
if (changed) {
  s(indexAtom, 0);
}
```

### 4. Visual Transition Issues

#### Potential Flicker Sources:

1. **Preview Update Timing**:
   - Preview HTML is updated immediately when choices change
   - No transition animation or fade effect applied
   - Comment in code: `// This was flashing the preview to the 0 choice, then back to the default choice`

2. **Index Reset**:
   - When choices change, index is reset to 0
   - Uses `wereChoicesPreloaded` flag to determine scroll behavior
   - Scroll adjustment: `s(requiresScrollAtom, wereChoicesPreloaded ? -1 : adjustForGroup);`

3. **Loading State**:
   - `loadingAtom` is set to false when choices are updated
   - No visual loading indicator during transition

4. **CSS Transitions**:
   - Found fade animations in CSS but not applied to choice transitions
   - Opacity transitions exist but mainly for scrollbars and toasts

### 5. Debouncing/Throttling

- `throttleChoiceFocused`: 25ms throttle on choice focus updates
- `onResizeHandleDragging`: 250ms debounce on panel resize
- `SET_THEME`: 50ms debounce on theme changes
- No debouncing/throttling on choice updates themselves

### 6. Key Findings

1. **Atomic Updates**: The renderer does attempt atomic updates via `initPromptAtom`, setting choices, preview, shortcuts, and flags together.

2. **No Transition Animation**: There's no fade or transition effect when switching from cached to fresh choices, which could cause visual "pop" or flicker.

3. **Preview Flashing**: Code comments indicate known issue with preview flashing to index 0 before settling on correct choice.

4. **Immediate State Changes**: State changes happen immediately without visual buffering or transition effects.

5. **React Window Virtualization**: The use of react-window for virtualized lists could contribute to rendering delays or flicker during rapid updates.

## Recommendations

1. **Add Transition Effects**: Implement fade transitions when switching from cached to fresh choices
2. **Preview Buffering**: Delay preview updates or use double-buffering to prevent flashing
3. **Loading Overlay**: Show subtle loading indicator during transition
4. **Debounce Choice Updates**: Add small debounce to choice updates to batch rapid changes
5. **Optimize Virtual List**: Review react-window configuration for smoother updates

## Related Files

- Main entry: `src/renderer/src/App.tsx`
- Choice rendering: `src/renderer/src/components/list.tsx`, `button.tsx`
- State management: `src/renderer/src/jotai.ts`
- Message handling: `src/renderer/src/hooks/useMessages.ts`
- Preview: `src/renderer/src/components/preview.tsx`