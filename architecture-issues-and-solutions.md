# Architecture Issue: Focused Choice Race Condition

## Executive Summary

A critical race condition exists in the Script Kit app's state management where the visually focused choice can differ from the choice that gets submitted when the user presses Enter. This occurs because `setIndex()` updates multiple atoms asynchronously (index → scroll → focusedChoice), while `submit()` immediately reads `focusedChoiceAtom` before it has been updated.

**Impact**: Users experience unexpected behavior where selecting and submitting the first choice can submit the wrong item, particularly when acting quickly before typing or taking other actions.

**Root Cause**: Asynchronous atom updates in Jotai combined with temporal coupling between state setters and readers.

**Recommended Solution**: Convert `focusedChoiceAtom` to a derived atom that synchronously computes from `indexAtom`, eliminating race conditions and ensuring single source of truth.

---

## Problem Analysis

### The Race Condition

The bug manifests in this sequence:

1. User opens a prompt or performs an action that should focus the first choice
2. Code finds the first actionable choice: `scoredChoices.findIndex(c => !c.skip && !c.info)`
3. Code calls `setIndex(firstIdx)` to update the focused choice
4. **Immediately** calls `submit()` which reads `focusedChoiceAtom`
5. But `indexAtom`'s setter is asynchronous and must:
   - Update `_indexAtom`
   - Handle skip logic
   - Trigger scroll requests via `scrollRequestAtom`
   - **Finally** update `focusedChoiceAtom` (lines 858-863 in jotai.ts)
6. `submit()` reads `focusedChoiceAtom` **before** step 5 completes
7. Result: Submits the OLD focused choice instead of the intended one

### Code References

**Location 1: useEnter.ts (lines 72-82, 138-149)**
```typescript
// Fallback when no focused choice exists but we have results
const firstIdx = scoredChoices.findIndex(c => !c.skip && !c.info);
if (firstIdx >= 0) {
  const first = scoredChoices[firstIdx]?.item;
  setIndex(firstIdx);  // ❌ ASYNC - focusedChoiceAtom not updated yet
  submit(first?.value); // ❌ Reads stale focusedChoiceAtom
}
```

**Location 2: indexAtom setter (jotai.ts lines 792-864)**
```typescript
export const indexAtom = atom(
  (g) => g(_indexAtom),
  (g, s, a: number) => {
    // ... skip logic, clamping, etc ...

    // Calculate final index after skip handling
    if (choice?.skip) {
      calcIndex = advanceIndexSkipping(clampedIndex, direction, cs);
      choice = cs[calcIndex]?.item;
    }

    // Update internal index
    if (g(_indexAtom) !== calcIndex) {
      s(_indexAtom, calcIndex);
    }

    // Trigger scroll request (async IPC)
    if (list || gridReady) {
      s(scrollRequestAtom, { context, target: calcIndex, reason });
    }

    // FINALLY update focusedChoiceAtom (lines 858-863)
    const id = choice?.id;
    if (id) {
      s(focusedChoiceAtom, choice); // ⚠️ Too late - submit already ran
    }
  }
);
```

**Location 3: flagsIndexAtom setter (jotai.ts lines 1015-1104)**

Similar pattern exists for the actions overlay:
```typescript
export const flagsIndexAtom = atom(
  (g) => g(flagsIndex),
  (g, s, a: number) => {
    // ... skip logic ...

    s(flagsIndex, calcIndex);

    // Scroll request
    if (list) {
      s(scrollRequestAtom, { context: 'flags-list', target: calcIndex });
    }

    // FINALLY update focused atoms
    s(focusedFlagValueAtom, focusedFlag);
    s(focusedActionAtom, action);
  }
);
```

### Current Workarounds (Staged Changes)

**Workaround 1: Direct submission in useEnter.ts**
```typescript
// Instead of:
setIndex(firstIdx);
submit(first?.value);

// Do:
// Don't call setIndex - it's async and causes race condition
// Just submit the value directly since we already have it
submit(first?.scriptlet ? first : first?.value);
```

**Workaround 2: Manual atom updates in actions.ts**

Instead of relying on `flagsIndexAtom` setter to update focused atoms, manually set them:

```typescript
// Set the index AND focused atoms (mimics flagsIndexAtom setter behavior)
const firstChoice = base[firstActionable]?.item;
s(flagsIndex, firstActionable);

// Manually set focused flag and action
const focusedFlag = (firstChoice as Choice)?.value;
s(focusedFlagValueAtom, focusedFlag);

// If it's an action, set focusedActionAtom
const flags = g(flagsAtom);
const flagData = flags?.[focusedFlag];
if (flagData?.hasAction) {
  s(focusedActionAtom, { name, flag, value, hasAction: true, shortcut });
} else {
  s(focusedActionAtom, {} as any);
}

// Request scroll
s(scrollRequestAtom, { context: 'flags-list', target: firstActionable });
```

**Problems with workarounds:**
- Duplicates complex logic across multiple files
- Violates DRY principle
- Doesn't solve the architectural issue
- Fragile - easy to forget in new code paths
- Increases maintenance burden

---

## Solution Options

### Solution 1: Direct Submission (Current Approach)

**Approach**: Remove `setIndex()` calls and submit the choice we already have directly.

**Implementation**:
```typescript
// useEnter.ts
const firstIdx = scoredChoices.findIndex(c => !c.skip && !c.info);
if (firstIdx >= 0) {
  const first = scoredChoices[firstIdx]?.item;
  // Skip setIndex entirely
  submit(first?.scriptlet ? first : first?.value);
}
```

**Pros**:
- Simple implementation
- Fixes the immediate race condition
- Minimal code changes
- Low risk

**Cons**:
- Doesn't fix the architectural issue - race condition still exists elsewhere
- Duplicates logic (finding first choice, determining what to submit)
- Visual focus doesn't update (may confuse users)
- Doesn't prevent future bugs in other code paths
- Violates single source of truth principle
- Doesn't solve the problem for `flagsIndexAtom`

**Assessment**: ⚠️ Quick fix, not a proper solution

---

### Solution 2: Synchronous Index Updates

**Approach**: Make `indexAtom` and `flagsIndexAtom` setters completely synchronous by removing async operations or guaranteeing execution order.

**Implementation**:
```typescript
export const indexAtom = atom(
  (g) => g(_indexAtom),
  (g, s, a: number) => {
    const cs = g(choices);
    const calcIndex = /* calculate with skip logic */;
    const choice = cs[calcIndex]?.item;

    // Update everything synchronously in guaranteed order
    s(_indexAtom, calcIndex);
    s(focusedChoiceAtom, choice); // BEFORE any async operations

    // Now trigger async side effects
    s(scrollRequestAtom, { target: calcIndex });
    if (choice?.preview) {
      s(previewHTMLAtom, choice.preview);
    }
  }
);
```

**Pros**:
- Preserves single source of truth (`indexAtom` controls focus)
- Guarantees focusedChoiceAtom is updated before async operations
- Minimal API changes

**Cons**:
- Hard to enforce in Jotai's async model
- Atom setters can still trigger async effects
- Requires careful audit of all dependent atoms
- Doesn't solve temporal coupling - code can still call `setIndex(); submit();`
- Complex refactoring with risk of breaking other features
- May conflict with React's batching and concurrent mode

**Assessment**: ⚠️ Difficult to implement correctly, high risk

---

### Solution 3: Combined "setIndexAndSubmit" Atom

**Approach**: Create an atomic operation that sets index and submits in one transaction.

**Implementation**:
```typescript
export const setIndexAndSubmitAtom = atom(
  null,
  (g, s, { index, choice }: { index: number; choice: Choice }) => {
    // Atomically update both index and focused choice
    s(_indexAtom, index);
    s(focusedChoiceAtom, choice);

    // Then submit
    s(submitValueAtom, choice?.scriptlet ? choice : choice?.value);
  }
);

// Usage in useEnter.ts
const firstIdx = scoredChoices.findIndex(c => !c.skip && !c.info);
if (firstIdx >= 0) {
  const first = scoredChoices[firstIdx]?.item;
  setIndexAndSubmit({ index: firstIdx, choice: first });
}
```

**Pros**:
- Guarantees atomicity for this specific operation
- Clear intent in code
- Eliminates race condition for this use case

**Cons**:
- Couples two separate concerns (navigation and submission)
- Narrow solution - doesn't help other code paths
- Still doesn't prevent `setIndex(); submit();` pattern elsewhere
- Doesn't solve the general problem of index/focus synchronization
- Increases API surface with specialized functions
- What about "setIndexAndOpenOverlay"? "setIndexAndShowPreview"? (Combinatorial explosion)

**Assessment**: ⚠️ Band-aid solution, doesn't address root cause

---

### Solution 4: Explicit Choice Parameter

**Approach**: Change `submitValueAtom` to accept an optional explicit choice parameter, bypassing `focusedChoiceAtom` when provided.

**Implementation**:
```typescript
export const submitValueAtom = atom(
  (g) => g(_submitValue),
  (g, s, submission: any | { explicit: true; choice: Choice }) => {
    let value;

    if (submission?.explicit) {
      // Explicit choice provided - use it directly
      const choice = submission.choice;
      value = choice?.scriptlet ? choice : choice?.value;
    } else {
      // Normal path - read from focusedChoiceAtom
      const focusedChoice = g(focusedChoiceAtom);
      value = focusedChoice?.scriptlet ? focusedChoice : focusedChoice?.value;
    }

    // ... rest of submit logic
  }
);

// Usage
submit({ explicit: true, choice: first });
```

**Pros**:
- Provides escape hatch for race condition
- Explicit intent when bypassing focused choice
- Backward compatible

**Cons**:
- **Critical flaw**: How do we know when the "explicit" choice is correct vs stale?
  - If user navigates away before submit executes, we submit the wrong choice
  - Doesn't solve race condition, just moves it
- Adds complexity to submit logic
- Creates two submission paths that can diverge
- Doesn't update visual focus
- Band-aid that acknowledges the problem but doesn't fix it

**Assessment**: ❌ Doesn't actually solve the race condition

---

### Solution 5: Deferred Submission with Effect Hook

**Approach**: Set index, watch `focusedChoiceAtom` in a `useEffect`, submit when it changes.

**Implementation**:
```typescript
// useEnter.ts
const [pendingSubmit, setPendingSubmit] = useState(false);

const handleEnter = () => {
  const firstIdx = scoredChoices.findIndex(c => !c.skip && !c.info);
  if (firstIdx >= 0) {
    setIndex(firstIdx);
    setPendingSubmit(true); // Flag that we want to submit
  }
};

useEffect(() => {
  if (pendingSubmit && focusedChoice?.id) {
    submit(focusedChoice?.value);
    setPendingSubmit(false);
  }
}, [focusedChoice, pendingSubmit]);
```

**Pros**:
- Respects React's async rendering model
- Waits for focusedChoiceAtom to update
- Visual focus and submission are consistent

**Cons**:
- Complex timing dependencies
- Hard to debug (when does the effect run?)
- May submit unexpectedly if focusedChoice changes for other reasons
- Race conditions between user actions and pending submissions
- Requires state management for "pending submit" flags
- Doesn't scale to multiple submission triggers
- What if user presses Enter twice quickly?
- Effect cleanup is complex

**Assessment**: ⚠️ Overly complex, introduces new timing issues

---

## Recommended Solution: Derived Focused Choice Atom

### Concept

Make `focusedChoiceAtom` a **derived atom** that synchronously computes from `indexAtom`. This ensures they're always in sync with no race conditions.

### Implementation

```typescript
// src/renderer/src/state/atoms/choices.ts

// Internal index state
export const _indexAtom = atom(0);

// Derived focused choice - ALWAYS in sync with index
export const focusedChoiceAtom = atom((g) => {
  const choices = g(scoredChoicesAtom);
  const index = g(_indexAtom);

  // Handle edge cases
  if (choices.length === 0) return noChoice;
  if (index < 0 || index >= choices.length) return noChoice;

  const choice = choices[index]?.item;
  return choice || noChoice;
});

// Separate write-only atom for side effects when focus changes
export const onFocusChangeAtom = atom(
  null,
  (g, s, choice: Choice) => {
    // Update preview HTML
    if (typeof choice?.preview === 'string') {
      s(previewHTMLAtom, choice.preview);
    } else if (!choice?.hasPreview && !g(promptDataAtom)?.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    // Send IPC message for focus change
    s(pushIpcMessageAtom, {
      channel: Channel.FOCUSED_CHOICE,
      state: { focused: choice }
    });

    // Any other side effects...
  }
);

// Index setter triggers side effects
export const indexAtom = atom(
  (g) => g(_indexAtom),
  (g, s, a: number) => {
    if (g(actionsOverlayOpenAtom) || g(submittedAtom)) return;

    const cs = g(scoredChoicesAtom);
    if (cs.length === 0) {
      s(_indexAtom, 0);
      return;
    }

    // Calculate final index with skip logic
    const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a;
    let calcIndex = clampedIndex;
    let choice = cs[calcIndex]?.item;

    if (choice?.skip) {
      calcIndex = advanceIndexSkipping(clampedIndex, g(directionAtom), cs);
      choice = cs[calcIndex]?.item;
    }

    // Update internal index
    if (g(_indexAtom) !== calcIndex) {
      s(_indexAtom, calcIndex);
    }

    // focusedChoiceAtom is now derived, so it's already updated!
    // Just trigger side effects
    const focusedChoice = g(focusedChoiceAtom); // Reads derived value
    s(onFocusChangeAtom, focusedChoice);

    // Trigger scroll
    if (g(listAtom) || g(gridReadyAtom)) {
      s(scrollRequestAtom, {
        context: g(gridReadyAtom) ? 'choices-grid' : 'choices-list',
        target: calcIndex,
        reason: 'navigation',
      });
    }
  }
);
```

### Why This is the Best Solution

#### 1. Eliminates Race Conditions
Derived atoms compute synchronously when read. Any code that reads `focusedChoiceAtom` gets the current choice based on the current index - no async delay.

```typescript
// This now works correctly
setIndex(firstIdx);
submit(focusedChoice?.value); // Reads the NEW focused choice immediately
```

#### 2. Single Source of Truth
`_indexAtom` is the single source of truth. `focusedChoiceAtom` is always derived from it. Impossible for them to be out of sync.

```typescript
// Before (two sources of truth):
s(_indexAtom, 5);
s(focusedChoiceAtom, choice); // Could be wrong choice!

// After (one source of truth):
s(_indexAtom, 5);
const focused = g(focusedChoiceAtom); // Automatically correct
```

#### 3. No Fallback Guessing
Current code has fallback logic like:
```typescript
if (hasFocusedChoice) {
  value = focusedChoice?.value;
} else {
  value = input; // Guess what user wants
}
```

With derived atoms, `hasFocusedChoice` is always accurate. No guessing needed.

#### 4. Cleaner Code
Remove all the complex `!hasFocusedChoice` conditions and fallback logic in `useEnter.ts`. The focused choice is always correct.

```typescript
// Before (lines 126-151 in useEnter.ts)
if (promptData?.strict && panelHTML?.length === 0) {
  if (choices.length > 0) {
    if (hasFocusedChoice) {
      submit(focusedChoice?.value);
    } else {
      // Fallback: find first choice manually
      const firstIdx = scoredChoices.findIndex(c => !c.skip && !c.info);
      if (firstIdx >= 0) {
        const first = scoredChoices[firstIdx]?.item;
        submit(first?.value); // Direct submission workaround
      }
    }
  }
}

// After (much simpler)
if (promptData?.strict && panelHTML?.length === 0 && choices.length > 0) {
  submit(focusedChoice?.value); // Always correct
}
```

#### 5. Applies to Flags/Actions Too
Same pattern can be applied to `focusedFlagValueAtom` and `focusedActionAtom`:

```typescript
export const focusedFlagValueAtom = atom((g) => {
  if (!g(actionsOverlayOpenAtom)) return '';

  const flags = g(scoredFlagsAtom);
  const index = g(flagsIndex);

  if (flags.length === 0 || index < 0 || index >= flags.length) return '';

  const choice = flags[index]?.item;
  return (choice as Choice)?.value || '';
});

export const focusedActionAtom = atom((g) => {
  const focusedFlag = g(focusedFlagValueAtom);
  if (!focusedFlag) return {} as Action;

  const flags = g(flagsAtom);
  const flagData = flags[focusedFlag];

  if (flagData?.hasAction) {
    return {
      name: flagData.name ?? focusedFlag,
      flag: focusedFlag,
      value: focusedFlag,
      hasAction: true,
      shortcut: flagData.shortcut,
    } as Action;
  }

  return {} as Action;
});
```

#### 6. Maintains Performance
Jotai's derived atoms use dependency tracking. They only recompute when dependencies change, with efficient memoization.

#### 7. Easier Testing
Test index changes, and focusedChoice updates automatically. No need to test synchronization logic.

```typescript
// Test
store.set(indexAtom, 3);
expect(store.get(focusedChoiceAtom)).toBe(choices[3].item);

store.set(indexAtom, 5);
expect(store.get(focusedChoiceAtom)).toBe(choices[5].item);
```

### Potential Concerns & Mitigations

**Concern**: "Derived atoms might recompute too often"
- **Mitigation**: Jotai's dependency tracking only recomputes when `scoredChoicesAtom` or `_indexAtom` change. This is exactly when we want it to update.

**Concern**: "We lose control over when focusedChoice updates"
- **Mitigation**: We gain precise control - it updates exactly when index changes, nothing more, nothing less. Side effects go in `onFocusChangeAtom`.

**Concern**: "What about side effects like preview updates?"
- **Mitigation**: Move side effects to `onFocusChangeAtom` (shown above). Call it from `indexAtom` setter after updating `_indexAtom`.

**Concern**: "Breaking changes to existing code"
- **Mitigation**: `focusedChoiceAtom` API remains the same for reads. Only writes change (which shouldn't exist anyway for a derived value).

---

## Migration Guide

### Step 1: Convert focusedChoiceAtom to Derived

**File**: `src/renderer/src/state/atoms/choices.ts`

```typescript
// OLD
export const _focused = atom<Choice | null>(noChoice as Choice);
export const focusedChoiceAtom = atom(
  (g) => g(_focused),
  (g, s, choice: Choice) => {
    s(_focused, choice || noChoice);
  }
);

// NEW
export const focusedChoiceAtom = atom((g) => {
  const choices = g(scoredChoicesAtom);
  const index = g(_indexAtom);

  if (choices.length === 0) return noChoice;
  if (index < 0 || index >= choices.length) return noChoice;

  return choices[index]?.item || noChoice;
});

// Remove _focused entirely - no longer needed
```

### Step 2: Create onFocusChangeAtom for Side Effects

**File**: `src/renderer/src/state/atoms/choices.ts`

```typescript
export const onFocusChangeAtom = atom(
  null,
  (g, s, choice: Choice) => {
    // Preview update
    if (typeof choice?.preview === 'string') {
      s(previewHTMLAtom, choice.preview);
    } else if (!choice?.hasPreview && !g(promptDataAtom)?.preview) {
      s(previewHTMLAtom, closedDiv);
    }

    // IPC notification (if needed)
    s(pushIpcMessageAtom, {
      channel: Channel.FOCUSED_CHOICE,
      state: { focused: choice }
    });
  }
);
```

### Step 3: Update indexAtom Setter

**File**: `src/renderer/src/jotai.ts`

```typescript
export const indexAtom = atom(
  (g) => g(_indexAtom),
  (g, s, a: number) => {
    if (g(actionsOverlayOpenAtom) || g(submittedAtom)) return;

    const cs = g(scoredChoicesAtom);
    if (cs.length === 0) {
      s(_indexAtom, 0);
      return;
    }

    const clampedIndex = a < 0 ? cs.length - 1 : a >= cs.length ? 0 : a;
    let calcIndex = clampedIndex;
    let choice = cs[calcIndex]?.item;

    if (choice?.skip) {
      calcIndex = advanceIndexSkipping(clampedIndex, g(directionAtom), cs);
      choice = cs[calcIndex]?.item;
    }

    if (g(_indexAtom) !== calcIndex) {
      s(_indexAtom, calcIndex);
    }

    // focusedChoiceAtom is now automatically updated!
    // Just trigger side effects
    const focusedChoice = g(focusedChoiceAtom);
    s(onFocusChangeAtom, focusedChoice);

    // Scroll logic
    if (g(listAtom) || g(gridReadyAtom)) {
      s(scrollRequestAtom, {
        context: g(gridReadyAtom) ? 'choices-grid' : 'choices-list',
        target: calcIndex,
        reason: 'navigation',
      });
    }
  }
);
```

### Step 4: Remove focusedChoiceAtom Direct Writes

**Search for**: `s(focusedChoiceAtom,`

**Replace with**: Nothing - these should be removed. Index changes drive focus changes.

**Exceptions**:
- `s(focusedChoiceAtom, noChoice)` when clearing state - replace with `s(_indexAtom, 0)` and ensure `scoredChoicesAtom` is empty
- Special case in `promptDataAtom` (line 370): `if (a.ui !== UI.arg) s(focusedChoiceAtom, noChoice);` - replace with clearing index/choices

### Step 5: Simplify useEnter.ts

**File**: `src/renderer/src/hooks/useEnter.ts`

Remove the entire fallback block (lines 126-151):

```typescript
// REMOVE THIS ENTIRE BLOCK
if (promptData?.strict && panelHTML?.length === 0) {
  if (overlayOpen) {
    // ...
  } else if (choices.length > 0) {
    if (hasFocusedChoice) {
      submit(focusedChoice?.value);
      return;
    }

    // Fallback: find first choice manually
    try {
      const firstIdx = scoredChoices.findIndex(c => !c.skip && !c.info);
      if (firstIdx >= 0) {
        const first = scoredChoices[firstIdx]?.item;
        submit(first?.scriptlet ? first : first?.value);
        return;
      }
    } catch {}
  }
}

// REPLACE WITH
if (promptData?.strict && panelHTML?.length === 0 && !overlayOpen) {
  if (choices.length > 0) {
    // focusedChoice is always correct now
    submit(focusedChoice?.value);
    return;
  }
}
```

Similarly simplify lines 62-85 (the `enterButtonDisabled` fallback).

### Step 6: Apply Same Pattern to Flags/Actions

**File**: `src/renderer/src/state/atoms/actions.ts`

```typescript
// Convert focusedFlagValueAtom to derived
export const focusedFlagValueAtom = atom((g) => {
  if (!g(actionsOverlayOpenAtom)) return '';

  const flags = g(scoredFlagsAtom);
  const index = g(flagsIndex);

  if (flags.length === 0 || index < 0 || index >= flags.length) return '';

  return (flags[index]?.item as Choice)?.value || '';
});

// Convert focusedActionAtom to derived
export const focusedActionAtom = atom((g) => {
  const focusedFlag = g(focusedFlagValueAtom);
  if (!focusedFlag) return {} as Action;

  const flags = g(flagsAtom);
  const flagData = flags[focusedFlag];

  if (flagData?.hasAction) {
    return {
      name: flagData.name ?? focusedFlag,
      flag: focusedFlag,
      value: focusedFlag,
      hasAction: true,
      shortcut: flagData.shortcut,
    } as Action;
  }

  return {} as Action;
});

// Update flagsIndexAtom setter
export const flagsIndexAtom = atom(
  (g) => g(flagsIndex),
  (g, s, a: number) => {
    if (!g(actionsOverlayOpenAtom)) return;

    const cs = g(scoredFlagsAtom);
    if (cs.length === 0) {
      s(flagsIndex, 0);
      return;
    }

    // ... skip logic ...

    s(flagsIndex, calcIndex);

    // focusedFlagValueAtom and focusedActionAtom now automatically updated!

    // Just trigger scroll
    if (g(flagsListAtom)) {
      s(scrollRequestAtom, {
        context: 'flags-list',
        target: calcIndex,
        reason: 'navigation',
      });
    }
  }
);
```

### Step 7: Remove Manual Focus Updates in actions.ts

**Remove duplicated focus logic from**:
- `openActionsOverlayAtom` (lines 95-119 in current staged version)
- `actionsInputAtom` setter (lines 168-192 in current staged version)

These manually set `focusedFlagValueAtom` and `focusedActionAtom` - no longer needed.

### Step 8: Testing

**Unit Tests**:
```typescript
describe('focusedChoiceAtom derived from index', () => {
  it('updates when index changes', () => {
    const store = createStore();

    store.set(scoredChoicesAtom, mockChoices);
    store.set(indexAtom, 0);
    expect(store.get(focusedChoiceAtom)).toBe(mockChoices[0].item);

    store.set(indexAtom, 2);
    expect(store.get(focusedChoiceAtom)).toBe(mockChoices[2].item);
  });

  it('returns noChoice when index out of bounds', () => {
    const store = createStore();

    store.set(scoredChoicesAtom, mockChoices);
    store.set(indexAtom, 999);
    expect(store.get(focusedChoiceAtom)).toBe(noChoice);
  });

  it('returns noChoice when choices empty', () => {
    const store = createStore();

    store.set(scoredChoicesAtom, []);
    store.set(indexAtom, 0);
    expect(store.get(focusedChoiceAtom)).toBe(noChoice);
  });
});
```

**Integration Tests**:
- Test rapid Enter presses (the original bug scenario)
- Test opening actions overlay and immediately selecting
- Test filtering actions and immediately submitting

### Step 9: Rollout Plan

1. **Phase 1**: Implement derived atoms in feature branch
2. **Phase 2**: Comprehensive testing (unit + integration)
3. **Phase 3**: Manual QA of common workflows:
   - Opening main menu and immediately hitting Enter
   - Quick navigation and selection
   - Actions overlay workflows
   - Tab switching with immediate actions
4. **Phase 4**: Staged rollout to beta users
5. **Phase 5**: Production release with monitoring

---

## Future Considerations

### 1. Other Potential Race Conditions

Apply this pattern to other state management issues:
- `loadingAtom` and `processingAtom` coordination
- `submittedAtom` and `promptActiveAtom` consistency
- Tab index and tab content synchronization

### 2. State Management Audit

Audit all atom setters for temporal coupling:
```bash
# Find places where we set multiple related atoms
grep -r "s(_.*Atom" src/renderer/src/jotai.ts | grep -A1 "s(_.*Atom"
```

### 3. Documentation

Add architectural guidelines:
- Prefer derived atoms over manual synchronization
- Document which atoms are sources of truth vs derived
- Add JSDoc explaining derivation relationships

Example:
```typescript
/**
 * Focused choice - DERIVED from indexAtom.
 * Always returns the choice at the current index.
 *
 * @derived_from indexAtom, scoredChoicesAtom
 * @read_only Do not set this atom directly. Set indexAtom instead.
 */
export const focusedChoiceAtom = atom((g) => {
  // ...
});
```

### 4. Type Safety for Derived Atoms

Create TypeScript utility types to enforce derived atoms are read-only:

```typescript
type ReadOnlyAtom<T> = Atom<T> & { _readonly: true };

export const focusedChoiceAtom: ReadOnlyAtom<Choice> = atom((g) => {
  // ...
}) as any;
```

### 5. Monitoring & Alerts

Add development-time warnings for anti-patterns:

```typescript
if (process.env.NODE_ENV === 'development') {
  // Warn if trying to set a derived atom
  const originalSet = store.set;
  store.set = (atom, value) => {
    if (atom === focusedChoiceAtom) {
      console.error('❌ Cannot set focusedChoiceAtom - it is derived. Set indexAtom instead.');
    }
    return originalSet(atom, value);
  };
}
```

### 6. Performance Profiling

Monitor derived atom recomputation frequency:
- Add instrumentation to track derivation calls
- Identify unnecessary recomputations
- Optimize dependency chains if needed

### 7. Similar Patterns in Other Frameworks

This is a well-known pattern:
- **Redux**: Selectors (derived state from reducers)
- **MobX**: Computed values
- **Recoil**: Selector atoms
- **Vue**: Computed properties
- **Solid.js**: Memos

Study their implementations for additional insights.

---

## Conclusion

The derived atom approach is the most architecturally sound solution:

✅ **Eliminates race conditions** - synchronous derivation
✅ **Single source of truth** - index drives focus
✅ **No fallback guessing** - always accurate
✅ **Cleaner code** - removes complex conditionals
✅ **Applies broadly** - works for flags/actions too
✅ **Maintains performance** - efficient memoization
✅ **Easier testing** - deterministic behavior
✅ **Well-established pattern** - proven in other frameworks

While the current workarounds (Solution 1) fix the immediate bug, they don't address the underlying architectural issue. Implementing derived atoms will:
1. Fix the current bug
2. Prevent similar bugs in the future
3. Simplify code and reduce maintenance burden
4. Make the codebase more robust and easier to reason about

**Recommendation**: Implement the derived atom solution for both `focusedChoiceAtom` and `focusedFlagValueAtom`/`focusedActionAtom` as outlined in this document.

---

## References

- **Current Bug**: Race condition in `useEnter.ts` and `actions.ts`
- **Root Cause**: Asynchronous atom updates in `indexAtom` and `flagsIndexAtom` setters
- **Workarounds**: Staged changes in commit (direct submission, manual atom updates)
- **Recommended Solution**: Derived atoms (this document)

**Files to Modify**:
- `/Users/johnlindquist/dev/kit-container/app/src/renderer/src/state/atoms/choices.ts` - Convert focusedChoiceAtom to derived
- `/Users/johnlindquist/dev/kit-container/app/src/renderer/src/jotai.ts` - Update indexAtom setter
- `/Users/johnlindquist/dev/kit-container/app/src/renderer/src/state/atoms/actions.ts` - Convert flag/action atoms to derived
- `/Users/johnlindquist/dev/kit-container/app/src/renderer/src/hooks/useEnter.ts` - Simplify submit logic

**Estimated Effort**: 4-6 hours implementation + 4 hours testing = 1-2 days

**Risk Level**: Medium (core state management changes, but well-isolated)

**Impact**: High (fixes critical bug, improves architecture, reduces future maintenance)
