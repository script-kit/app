# Search and Focus Behavior Restoration Report

## Issue Summary

After the circular dependency refactoring, there are critical issues with search behavior and choice focusing:

1. **Group Header Selection Bug**: When typing in search text, group headers (which should be non-selectable) can become the focused choice
2. **Incorrect Focus Logic**: The proper choice based on current input text is not being focused correctly
3. **Search State Issues**: The interaction between search filtering and choice focus has been disrupted

## Background

The refactoring successfully eliminated circular dependencies and fixed the "focused undefined" error, but broke the sophisticated search and focus behavior that was working correctly on the main branch.

## Root Cause Analysis

### Issue 1: Simplified FocusController Logic

The current `FocusController.tsx` has overly simplified logic:

```typescript
// Current (broken) - Always resets to index 0
if (!arraysEqual(prevIdsRef.current, ids)) {
  if (prevIdsRef.current.length > 0 || ids.length > 0) {
    setIndex(0); // ❌ This is too simplistic!
  }
}
```

### Issue 2: Missing Complex Choice Selection Logic

The original `main` branch had sophisticated logic in `scoredChoicesAtom` that handled:

1. **Default Value Matching**: Finding the correct choice based on `defaultValue` or `defaultChoiceId`
2. **Input-Based Focus**: When user has typed input, it should focus the most relevant choice
3. **Group Header Skipping**: Properly handling `skip` and `info` choices that shouldn't be selectable
4. **Previous Index Restoration**: Smart restoration of previous choice position

### Issue 3: Lost State Coordination

The main branch had coordinated logic between:
- `scoredChoicesAtom` setter (choice list processing)
- `indexAtom` setter (focus management with skip logic)
- Skip navigation helpers (`advanceIndexSkipping`)

This coordination has been broken by moving focus logic to a separate controller.

## Detailed Analysis of Lost Logic

### Main Branch Choice Focus Logic (Working)

```typescript
// From main branch scoredChoicesAtom setter
if (hasActionableChoices) {
  s(panelHTMLAtom, '');

  const defaultValue: any = g(defaultValueAtom);
  const defaultChoiceId = g(defaultChoiceIdAtom);
  const prevIndex = g(prevIndexAtom);
  const input = g(inputAtom);

  if (defaultValue || defaultChoiceId) {
    // Find matching choice by ID, value, or name
    const i = cs.findIndex(
      (c) => c.item?.id === defaultChoiceId || 
             c.item?.value === defaultValue || 
             c.item?.name === defaultValue,
    );
    
    if (i !== -1) {
      const foundChoice = cs[i].item;
      if (foundChoice?.id) {
        s(indexAtom, i);           // ✅ Set to found choice index
        s(focusedChoiceAtom, foundChoice);
        s(requiresScrollAtom, i);
      }
    }
  } else if (input.length > 0) {
    // User is typing - keep current focus or reset to 0
    s(requiresScrollAtom, g(requiresScrollAtom) > 0 ? 0 : -1);
    if (changed) {
      s(indexAtom, 0);  // ✅ Reset to first actionable choice
    }
  } else if (prevIndex && !g(selectedAtom)) {
    // Restore previous position, adjusting for skip items
    let adjustForGroup = prevIndex;
    if (cs?.[prevIndex - 1]?.item?.skip) {
      adjustForGroup -= 1;
    }
    s(requiresScrollAtom, wereChoicesPreloaded ? -1 : adjustForGroup);
  }
}
```

### Current Branch Logic (Broken)

```typescript
// Current FocusController - too simplistic
if (!arraysEqual(prevIdsRef.current, ids)) {
  setIndex(0);  // ❌ Always 0, ignores context completely!
}
```

## Problem Scenarios

### Scenario 1: Group Headers Get Focused
1. User types search text
2. Choice list updates with grouped results
3. `FocusController` sets index to 0
4. Index 0 might be a group header with `skip: true`
5. Group header becomes "focused" (should be impossible)

### Scenario 2: Wrong Choice Focused
1. User types "test" 
2. First real choice might be at index 1 or 2 (after group headers)
3. `FocusController` sets index to 0 
4. Wrong item is focused instead of best match

### Scenario 3: Lost Focus Context
1. User navigates to choice at index 5
2. User types more text to refine search  
3. New results include their previous choice at index 3
4. Focus goes to index 0 instead of maintaining context at index 3

## Skip Logic Integration

The main branch `indexAtom` has sophisticated skip handling:

```typescript
if (choice?.skip) {
  calcIndex = advanceIndexSkipping(clampedIndex, direction, cs as any);
  choice = cs[calcIndex]?.item;
}
```

This ensures that non-selectable items (group headers with `skip: true`) are never focused.

## Required Fix Strategy

### 1. Enhance FocusController with Main Branch Logic

The `FocusController` needs to implement the full logic from main branch:

```typescript
// Should handle:
- defaultValue/defaultChoiceId matching
- Input-based choice selection  
- Skip/info item avoidance
- Previous index restoration with group adjustment
- Scroll position coordination
```

### 2. Integrate Skip Navigation

The controller must use `advanceIndexSkipping` to ensure group headers never get focused.

### 3. Context-Aware Focus

The focus logic should consider:
- User input content
- Previous user position
- Choice relevance/scoring  
- Skip/info item types

### 4. State Coordination

Restore coordination between:
- Choice list changes
- Input changes
- Focus/index updates
- Scroll behavior

## Files Requiring Updates

### Primary Files:
- `src/renderer/src/state/controllers/FocusController.tsx` - Needs complete rewrite with main branch logic
- `src/renderer/src/jotai.ts` - `scoredChoicesAtom` setter should coordinate with new controller
- `src/renderer/src/state/skip-nav.ts` - Integration needed in controller

### Supporting Files:  
- Choice-related atoms that provide context to the controller
- Search/filter logic integration points

## Success Criteria

### ✅ Working Behavior Should Include:
1. **Group headers never get focused** - Skip logic prevents selection of `skip: true` items
2. **Input-driven focus** - Typing updates focus to most relevant choice
3. **Smart index restoration** - Previous position maintained when possible
4. **Scroll coordination** - Focus changes properly update scroll position  
5. **Context awareness** - Focus decisions consider user input and previous state

### ❌ Current Broken Behavior:
1. Group headers can be selected/focused
2. Focus always goes to index 0 regardless of context
3. User input doesn't influence focus selection
4. Lost previous position context

## Implementation Approach

The solution should:
1. **Port the main branch choice focus logic** from `scoredChoicesAtom` to `FocusController`
2. **Maintain architectural separation** - Keep controller pattern but with correct logic
3. **Preserve circular dependency fixes** - Don't reintroduce atom interdependencies
4. **Add comprehensive skip handling** - Ensure group headers are never focused

## Testing Scenarios

After fix, these should work correctly:
1. Type search text → First actionable (non-skip) choice gets focused
2. Group headers present → Never get focused, always skipped
3. Navigate to choice, refine search → Maintains focus context when possible  
4. Clear search → Restores previous position appropriately
5. Default values → Correct choice gets focused based on matching logic

The goal is to restore the sophisticated search and focus behavior from main while maintaining the architectural improvements from the refactoring.